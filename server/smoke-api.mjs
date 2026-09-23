import { strictEqual, ok } from 'node:assert';
import { createMemoryDb } from './db-memory.js';
import { createApp } from './app.js';
import { issueSession, sessionCookie } from './session.js';

process.env.SESSION_SECRET = 'smoke-secret';
const db = createMemoryDb();
const app = createApp(db, {
  clientId: '',
  clientSecret: '',
  redirectUri: '',
  root: '.',
  runSecret: 'smoke-secret',
});
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const unauth = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distance: 1, maxCombo: 1 }),
  });
  strictEqual(unauth.status, 401);

  const user = await db.upsertUser({ xfUserId: 7, username: 'Smoke7', avatarUrl: null });
  const sess = issueSession(Number(user.id));
  const cookie = sessionCookie(sess.value, sess.maxAgeSec).split(';')[0];

  const noTok = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ distance: 80, maxCombo: 3, durationMs: 10000, cookies: 4, cakes: 0 }),
  });
  strictEqual(noTok.status, 403);

  const started = await (
    await fetch(`${base}/api/runs/start`, { method: 'POST', headers: { Cookie: cookie } })
  ).json();
  ok(started.token);

  const cheat = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      runToken: started.token,
      distance: 99999,
      maxCombo: 3,
      durationMs: 5000,
      cookies: 1,
      cakes: 0,
    }),
  });
  strictEqual(cheat.status, 403, 'speedhack distance rejected');

  const started2 = await (
    await fetch(`${base}/api/runs/start`, { method: 'POST', headers: { Cookie: cookie } })
  ).json();
  const okRes = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      runToken: started2.token,
      distance: 88,
      maxCombo: 4,
      durationMs: 12000,
      cookies: 6,
      cakes: 1,
      failReason: 'hit',
    }),
  });
  const okJson = await okRes.json();
  strictEqual(okRes.status, 200);
  strictEqual(okJson.bestDistance, 88);
  strictEqual(okJson.bestCombo, 4);

  const reuse = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      runToken: started2.token,
      distance: 10,
      maxCombo: 1,
      durationMs: 3000,
      cookies: 1,
      cakes: 0,
    }),
  });
  strictEqual(reuse.status, 403, 'token single-use');

  const zeroStart = await (
    await fetch(`${base}/api/runs/start`, { method: 'POST', headers: { Cookie: cookie } })
  ).json();
  await new Promise((r) => setTimeout(r, 5100));
  const zero = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      runToken: zeroStart.token,
      distance: 30,
      maxCombo: 0,
      durationMs: 4000,
      cookies: 0,
      cakes: 0,
    }),
  });
  strictEqual(zero.status, 200, 'zero-pickup run accepted');

  const lb = await (await fetch(`${base}/api/leaderboard`)).json();
  ok(lb.distance?.length && lb.combo?.length);
  console.log('api smoke ok');
} finally {
  server.close();
}
