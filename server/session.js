import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.warn('[session] SESSION_SECRET missing — refusing to run in production');
  process.exit(1);
}

function sign(payload) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueSession(userId, maxAgeSec = 60 * 60 * 24 * 30) {
  const exp = Date.now() + maxAgeSec * 1000;
  const body = `${userId}.${exp}`;
  const sig = sign(body);
  return { value: `${body}.${sig}`, maxAgeSec };
}

export function parseSession(cookieValue) {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const body = `${userId}.${exp}`;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  const id = Number(userId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function sessionCookie(value, maxAgeSec) {
  const secure = process.env.PUBLIC_ORIGIN?.startsWith('https') ? '; Secure' : '';
  return `rs_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.PUBLIC_ORIGIN?.startsWith('https') ? '; Secure' : '';
  return `rs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
