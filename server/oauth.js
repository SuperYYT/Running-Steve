const AUTHORIZE = process.env.MINEBBS_AUTHORIZE_URL || 'https://www.minebbs.com/oauth2/authorize';
const TOKEN = process.env.MINEBBS_TOKEN_URL || 'https://www.minebbs.com/api/oauth2/token';
const ME = process.env.MINEBBS_ME_URL || 'https://www.minebbs.com/api/me';

export function buildAuthorizeUrl({ clientId, redirectUri, state, scope = 'user:read' }) {
  const url = new URL(AUTHORIZE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', scope);
  return url.toString();
}

export async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function fetchMe(accessToken) {
  const res = await fetch(ME, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fetch me failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  // XenForo: { me: { user_id, username, avatar_urls... } } or flat user
  const me = json.me ?? json;
  const xfUserId = me.user_id ?? me.id;
  const username = me.username ?? me.name;
  if (!xfUserId || !username) throw new Error('unexpected /api/me shape');
  const avatarUrl =
    me.avatar_urls?.['192'] ??
    me.avatar_urls?.['96'] ??
    me.avatar_urls?.['48'] ??
    me.avatar_url ??
    null;
  return { xfUserId: Number(xfUserId), username: String(username), avatarUrl };
}
