import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './db.js';
import { createCache } from './cache.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .env if present (does not override real env)
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i <= 0) continue;
    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
  console.log('[server] loaded .env');
} else {
  console.warn('[server] no .env file — using process env only');
}
if (!process.env.REDIS_URL) {
  console.warn('[server] REDIS_URL missing — cache stays in memory (set REDIS_URL=redis://127.0.0.1:6379)');
}

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${PORT}`;
const REDIRECT_URI =
  process.env.MINEBBS_REDIRECT_URI || `${PUBLIC_ORIGIN.replace(/\/$/, '')}/auth/callback`;

const db = await createStore();
const cache = await createCache();
const app = createApp(db, {
  clientId: process.env.MINEBBS_CLIENT_ID || '',
  clientSecret: process.env.MINEBBS_CLIENT_SECRET || '',
  redirectUri: REDIRECT_URI,
  root,
  cache,
});

app.listen(PORT, () => {
  const driver = process.env.DB_DRIVER || (process.env.MYSQL_URL ? 'mysql' : 'memory');
  console.log(`[server] ${PUBLIC_ORIGIN} (port ${PORT}, db=${driver}, cache=${cache.kind})`);
  if (!process.env.MINEBBS_CLIENT_ID) {
    console.warn('[server] MINEBBS_CLIENT_ID missing — OAuth disabled');
  }
  if (driver !== 'mysql') {
    console.warn('[server] using in-memory DB — set MYSQL_URL for production');
  }
});
