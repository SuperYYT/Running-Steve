import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { createMemoryDb } from './db-memory.js';

const db = createMemoryDb();
const a = await db.upsertUser({ xfUserId: 1, username: 'Alice', avatarUrl: null });
const b = await db.upsertUser({ xfUserId: 2, username: 'Bob', avatarUrl: null });

let r = await db.mergeBest(a.id, {
  distance: 100,
  maxCombo: 4,
  durationMs: 30000,
  cookies: 8,
  cakes: 1,
});
strictEqual(r.bestDistance, 100);
strictEqual(r.bestCombo, 4);

r = await db.mergeBest(a.id, {
  distance: 50,
  maxCombo: 7,
  durationMs: 20000,
  cookies: 4,
  cakes: 2,
});
strictEqual(r.bestDistance, 100);
strictEqual(r.bestCombo, 7);
strictEqual(r.improved.distance, false);
strictEqual(r.improved.combo, true);

await db.mergeBest(b.id, { distance: 200, maxCombo: 2, durationMs: 40000, cookies: 5, cakes: 0 });

const dist = await db.topBy('distance', 10);
deepStrictEqual(dist.map((x) => x.username), ['Bob', 'Alice']);
const comboBoard = await db.topBy('combo', 10);
deepStrictEqual(comboBoard.map((x) => x.username), ['Alice', 'Bob']);
deepStrictEqual(comboBoard.map((x) => x.value), [7, 2]);

console.log('db tests ok');
