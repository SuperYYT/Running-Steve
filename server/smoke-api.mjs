import { strictEqual, ok } from 'node:assert';
import { createMemoryDb } from './db-memory.js';
import { createApp } from './app.js';
import { issueSession, sessionCookie } from './session.js';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'smoke-secret';

const db = createMemoryDb();
const app = createApp(db, { clientId: '', clientSecret: '', redirectUri: '', root: '.' });
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

try {
  const me = await (await fetch(`${base}/api/me`)).json();
  console.log('me', me);

  const unauth = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distance: 1, score: 1 }),
  });
  console.log('unauth', unauth.status);
  strictEqual(unauth.status, 401);

  const user = await db.upsertUser({ xfUserId: 7, username: 'Smoke7', avatarUrl: null });
  const sess = issueSession(Number(user.id));
  const cookie = sessionCookie(sess.value, sess.maxAgeSec).split(';')[0];

  const okRes = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      distance: 88,
      score: 21,
      maxCombo: 4,
      durationMs: 12000,
      cookies: 6,
      cakes: 1,
      failReason: '橡木箱子 — 跳过去或换道',
    }),
  });
  const okJson = await okRes.json();
  console.log('score', okRes.status, okJson);
  strictEqual(okRes.status, 200);
  strictEqual(okJson.bestDistance, 88);
  ok(okJson.runId);

  await new Promise((r) => setTimeout(r, 5100));
  const low = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ distance: 10, score: 5, maxCombo: 1 }),
  });
  const lowJson = await low.json();
  console.log('low', low.status, lowJson);
  strictEqual(lowJson.bestDistance, 88);

  const lb = await (await fetch(`${base}/api/leaderboard`)).json();
  console.log('lb', lb);
  ok(lb.distance?.length);

  const runsRes = await fetch(`${base}/api/runs`, { headers: { Cookie: cookie } });
  const runsJson = await runsRes.json();
  console.log('runs', runsRes.status, runsJson);
  strictEqual(runsRes.status, 200);
  strictEqual(runsJson.runs.length, 2);
  ok(runsJson.runs.some((r) => r.cookies === 6 && r.cakes === 1));

  const me2 = await (await fetch(`${base}/api/me`, { headers: { Cookie: cookie } })).json();
  console.log('me2', me2);
  strictEqual(me2.user.bestDistance, 88);
  strictEqual(me2.user.runCount, 2);
  strictEqual(me2.user.maxCombo, 4);

  console.log('api smoke ok');
} finally {
  server.close();
}
