import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { createMemoryDb } from './db-memory.js';

const db = createMemoryDb();

const a = await db.upsertUser({ xfUserId: 1, username: 'Alice', avatarUrl: null });
const b = await db.upsertUser({ xfUserId: 2, username: 'Bob', avatarUrl: null });

let r = await db.mergeBest(a.id, {
  distance: 100,
  score: 10,
  maxCombo: 2,
  durationMs: 30000,
  cookies: 8,
  cakes: 1,
  failReason: 'hit',
});
strictEqual(r.bestDistance, 100);
strictEqual(r.improved.distance, true);
ok(r.runId >= 1);

r = await db.mergeBest(a.id, {
  distance: 50,
  score: 30,
  maxCombo: 3,
  durationMs: 20000,
  cookies: 4,
  cakes: 2,
  failReason: 'hit',
});
strictEqual(r.bestDistance, 100, 'lower distance must not overwrite best');
strictEqual(r.bestScore, 30);
strictEqual(r.improved.distance, false);
strictEqual(r.improved.score, true);

const afterNoImproveBefore = (await db.getUserById(a.id)).updated_at;
await db.mergeBest(a.id, { distance: 10, score: 1, maxCombo: 1 });
const afterNoImprove = (await db.getUserById(a.id)).updated_at;
strictEqual(
  String(afterNoImprove),
  String(afterNoImproveBefore),
  'updated_at must stay when no best improves',
);

await db.mergeBest(b.id, { distance: 200, score: 5, maxCombo: 1 });

const dist = await db.topBy('distance', 10);
deepStrictEqual(dist.map((x) => x.username), ['Bob', 'Alice']);
deepStrictEqual(dist.map((x) => x.value), [200, 100]);

const sc = await db.topBy('score', 10);
deepStrictEqual(sc.map((x) => x.username), ['Alice', 'Bob']);
deepStrictEqual(sc.map((x) => x.value), [30, 5]);

const me = await db.getUserById(a.id);
strictEqual(me.run_count, 3);
strictEqual(me.last_distance, 10);
strictEqual(me.last_score, 1);
strictEqual(me.max_combo, 3);

const runs = await db.listRuns(a.id, 10);
strictEqual(runs.length, 3);
strictEqual(runs[0].distance, 10, 'newest run first');

const a2 = await db.upsertUser({ xfUserId: 1, username: 'Alice2', avatarUrl: 'x' });
strictEqual(a2.id, a.id);
strictEqual(a2.username, 'Alice2');
ok((await db.getUserById(a.id)).best_distance === 100);

console.log('db tests ok');
