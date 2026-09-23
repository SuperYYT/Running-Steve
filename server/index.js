import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './db.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${PORT}`;
const REDIRECT_URI =
  process.env.MINEBBS_REDIRECT_URI || `${PUBLIC_ORIGIN.replace(/\/$/, '')}/auth/callback`;

const db = await createStore();
const app = createApp(db, {
  clientId: process.env.MINEBBS_CLIENT_ID || '',
  clientSecret: process.env.MINEBBS_CLIENT_SECRET || '',
  redirectUri: REDIRECT_URI,
  root,
});

app.listen(PORT, () => {
  const driver = process.env.DB_DRIVER || (process.env.MYSQL_URL ? 'mysql' : 'memory');
  console.log(`[server] ${PUBLIC_ORIGIN} (port ${PORT}, db=${driver})`);
  if (!process.env.MINEBBS_CLIENT_ID) {
    console.warn('[server] MINEBBS_CLIENT_ID missing — OAuth disabled');
  }
  if (driver !== 'mysql') {
    console.warn('[server] using in-memory DB — set MYSQL_URL for production');
  }
});
