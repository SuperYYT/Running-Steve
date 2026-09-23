import { deepStrictEqual, strictEqual } from 'node:assert';
import { issueSession, parseSession } from './session.js';

process.env.SESSION_SECRET = 'test-secret';
const s = issueSession(42, 60);
strictEqual(parseSession(s.value), 42);
strictEqual(parseSession('bad'), null);
strictEqual(parseSession(`${s.value}x`), null);

const expired = issueSession(7, -1);
// maxAge negative already expired in parse by exp timestamp
strictEqual(parseSession(expired.value), null);

console.log('session tests ok');
