import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { toPublicUser } from './db.js';
import { buildAuthorizeUrl, exchangeCode, fetchMe } from './oauth.js';
import {
  clearSessionCookie,
  issueSession,
  parseSession,
  sessionCookie,
} from './session.js';

const MAX_DISTANCE = 1_000_000;
const MAX_SCORE = 10_000_000;
const MAX_COMBO = 9999;
const MAX_DURATION_MS = 6 * 60 * 60 * 1000;
const MAX_PICKUPS = 100_000;
const SCORE_COOLDOWN_MS = 5_000;

export function createApp(db, options = {}) {
  const {
    clientId = process.env.MINEBBS_CLIENT_ID || '',
    clientSecret = process.env.MINEBBS_CLIENT_SECRET || '',
    redirectUri = '',
    root = join(import.meta.dirname, '..'),
  } = options;

  const app = express();
  app.use(express.json({ limit: '16kb' }));

  const oauthStates = new Map();
  const scoreStamps = new Map();

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

  function intField(value, { min = 0, max, fallback = 0 } = {}) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < min) return fallback;
    if (max != null && n > max) return null;
    return n;
  }

  async function requireUser(req) {
    const sid = parseSession(getCookie(req, 'rs_session'));
    if (!sid) return null;
    return db.getUserById(sid);
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
    res.redirect(
      buildAuthorizeUrl({ clientId, redirectUri, state }),
    );
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
      const token = await exchangeCode({
        clientId,
        clientSecret,
        code,
        redirectUri,
      });
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

  app.post('/api/scores', async (req, res) => {
    const user = await requireUser(req);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const distance = intField(req.body?.distance, { max: MAX_DISTANCE });
    const score = intField(req.body?.score, { max: MAX_SCORE });
    if (distance == null || score == null) {
      res.status(400).json({ error: 'invalid_score' });
      return;
    }
    const maxCombo = intField(req.body?.maxCombo, { max: MAX_COMBO });
    const durationMs = intField(req.body?.durationMs, { max: MAX_DURATION_MS });
    const cookies = intField(req.body?.cookies, { max: MAX_PICKUPS });
    const cakes = intField(req.body?.cakes, { max: MAX_PICKUPS });
    if (maxCombo == null || durationMs == null || cookies == null || cakes == null) {
      res.status(400).json({ error: 'invalid_score' });
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

    const result = await db.mergeBest(Number(user.id), {
      distance,
      score,
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
    const [distance, score] = await Promise.all([
      db.topBy('distance', limit),
      db.topBy('score', limit),
    ]);
    res.json({ distance, score });
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
        score: Number(r.score),
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
