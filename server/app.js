import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { toPublicUser } from './db.js';
import { buildAuthorizeUrl, exchangeCode, fetchMe } from './oauth.js';
import {
  clearSessionCookie,
  issueSession,
  parseSession,
  sessionCookie,
} from './session.js';

const MAX_DISTANCE = 1_000_000;
const MAX_COMBO = 9999;
const MAX_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_PICKUPS = 100_000;
const SCORE_COOLDOWN_MS = 2_500;
const RUN_TTL_MS = 30 * 60 * 1000;
// Anti-cheat ceilings: generous vs real play (incl. long combo lines)
const MAX_SPEED = 22;
const MAX_PICKUPS_PER_SEC = 12;
const MAX_COMBO_PER_SEC = 10;

export function createApp(db, options = {}) {
  const {
    clientId = process.env.MINEBBS_CLIENT_ID || '',
    clientSecret = process.env.MINEBBS_CLIENT_SECRET || '',
    redirectUri = '',
    root = join(import.meta.dirname, '..'),
    runSecret = process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  } = options;

  const app = express();
  app.use(express.json({ limit: '16kb' }));

  const oauthStates = new Map();
  const scoreStamps = new Map();
  /** token -> { userId, runId, exp, used } */
  const runTokens = new Map();

  function getCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
  }

  function safeReturnTo(value) {
    return typeof value === 'string' &&
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !value.includes('\\')
      ? value
      : '/';
  }

  function intField(value, { min = 0, max } = {}) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < min) return null;
    if (max != null && n > max) return null;
    return n;
  }

  async function requireUser(req) {
    const sid = parseSession(getCookie(req, 'rs_session'));
    if (!sid) return null;
    return db.getUserById(sid);
  }

  function signRun(userId, runId, exp) {
    return createHmac('sha256', runSecret).update(`${userId}.${runId}.${exp}`).digest('base64url');
  }

  function issueRunToken(userId, runId) {
    const exp = Date.now() + RUN_TTL_MS;
    const sig = signRun(userId, runId, exp);
    const token = `${userId}.${runId}.${exp}.${sig}`;
    runTokens.set(token, { userId, runId, exp, used: false });
    // opportunistic GC
    if (runTokens.size > 5000) {
      for (const [k, v] of runTokens) {
        if (v.used || v.exp < Date.now()) runTokens.delete(k);
      }
    }
    return token;
  }

  function peekRunToken(token, userId) {
    const entry = runTokens.get(token);
    if (!entry || entry.used || entry.exp < Date.now()) return null;
    const parts = String(token).split('.');
    if (parts.length !== 4) return null;
    const [uid, rid, exp, sig] = parts;
    const expected = signRun(Number(uid), Number(rid), Number(exp));
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Number(uid) !== Number(userId)) return null;
    return entry;
  }

  function consumeRunToken(token, userId) {
    const entry = peekRunToken(token, userId);
    if (!entry) return null;
    entry.used = true;
    runTokens.delete(token);
    return entry;
  }

  function plausible({ distance, maxCombo, durationMs, cookies, cakes }) {
    const sec = durationMs / 1000;
    if (durationMs < 800 || durationMs > MAX_DURATION_MS) return false;
    // speedhack / teleports
    if (distance > MAX_SPEED * sec * 1.6 + 80) return false;
    if (maxCombo > 20 + sec * MAX_COMBO_PER_SEC) return false;
    if (cookies + cakes > 15 + sec * MAX_PICKUPS_PER_SEC) return false;
    // combo can jump +5 on cake; allow cookies + 5*cakes
    if (maxCombo > cookies + cakes * 5 + 2) return false;
    return true;
  }

  app.get('/api/me', async (req, res) => {
    const user = await requireUser(req);
    res.json({ user: toPublicUser(user) });
  });

  app.get('/auth/login', (req, res) => {
    if (!clientId) {
      res.status(503).json({ error: 'oauth_not_configured' });
      return;
    }
    const returnTo = safeReturnTo(req.query.returnTo);
    const state = randomBytes(16).toString('base64url');
    oauthStates.set(state, { returnTo, exp: Date.now() + 10 * 60 * 1000 });
    for (const [k, v] of oauthStates) {
      if (v.exp < Date.now()) oauthStates.delete(k);
    }
    res.redirect(buildAuthorizeUrl({ clientId, redirectUri, state }));
  });

  app.get('/auth/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const saved = oauthStates.get(state);
    oauthStates.delete(state);
    const returnTo = saved?.returnTo || '/';
    if (!code || !saved) {
      res.redirect('/?authError=1');
      return;
    }
    try {
      const token = await exchangeCode({ clientId, clientSecret, code, redirectUri });
      const profile = await fetchMe(token.access_token);
      const user = await db.upsertUser(profile);
      const session = issueSession(Number(user.id));
      res.setHeader('Set-Cookie', sessionCookie(session.value, session.maxAgeSec));
      res.redirect(returnTo);
    } catch (err) {
      console.error('[auth]', err);
      res.redirect('/?authError=1');
    }
  });

  app.post('/api/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.json({ ok: true });
  });

  app.post('/api/runs/start', async (req, res) => {
    const user = await requireUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const runId = Date.now();
    const token = issueRunToken(Number(user.id), runId);
    res.json({ runId, token });
  });

  app.post('/api/scores', async (req, res) => {
    const user = await requireUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const distance = intField(req.body?.distance, { max: MAX_DISTANCE });
    const maxCombo = intField(req.body?.maxCombo, { max: MAX_COMBO });
    const durationMs = intField(req.body?.durationMs, { max: MAX_DURATION_MS });
    const cookies = intField(req.body?.cookies, { max: MAX_PICKUPS });
    const cakes = intField(req.body?.cakes, { max: MAX_PICKUPS });
    if (
      distance == null ||
      maxCombo == null ||
      durationMs == null ||
      cookies == null ||
      cakes == null
    ) {
      res.status(400).json({ error: 'invalid_score' });
      return;
    }
    const runToken = typeof req.body?.runToken === 'string' ? req.body.runToken : '';
    if (!peekRunToken(runToken, user.id)) {
      res.status(403).json({ error: 'invalid_run_token' });
      return;
    }
    if (!plausible({ distance, maxCombo, durationMs, cookies, cakes })) {
      // do not burn the token — allow a corrected resubmit
      res.status(403).json({ error: 'implausible_run' });
      return;
    }
    const failReason =
      typeof req.body?.failReason === 'string' ? req.body.failReason.slice(0, 120) : null;

    const key = `u:${user.id}`;
    const now = Date.now();
    const last = scoreStamps.get(key) || 0;
    if (now - last < SCORE_COOLDOWN_MS) {
      res.status(429).json({ error: 'too_many_requests' });
      return;
    }
    scoreStamps.set(key, now);
    consumeRunToken(runToken, user.id);

    const result = await db.mergeBest(Number(user.id), {
      distance,
      maxCombo,
      durationMs,
      cookies,
      cakes,
      failReason,
    });
    res.json(result);
  });

  app.get('/api/leaderboard', async (req, res) => {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.floor(raw))) : 50;
    const [distance, combo, runs] = await Promise.all([
      db.topBy('distance', limit),
      db.topBy('combo', limit),
      db.topBy('runs', limit),
    ]);
    res.json({ distance, combo, runs });
  });

  app.get('/api/runs', async (req, res) => {
    const user = await requireUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const rows = await db.listRuns(Number(user.id), 20);
    res.json({
      runs: rows.map((r) => ({
        id: Number(r.id),
        distance: Number(r.distance),
        maxCombo: Number(r.max_combo ?? 0),
        durationMs: Number(r.duration_ms ?? 0),
        cookies: Number(r.cookies ?? 0),
        cakes: Number(r.cakes ?? 0),
        failReason: r.fail_reason ?? null,
        createdAt: r.created_at,
      })),
    });
  });

  const dist = join(root, 'dist');
  if (existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/auth')) {
        next();
        return;
      }
      res.sendFile(join(dist, 'index.html'));
    });
  }

  return app;
}
