import { rankRows } from './db-shape.js';

/**
 * In-process driver for tests / local dev without MySQL.
 */
export function createMemoryDb() {
  let nextUser = 1;
  let nextRun = 1;
  const users = new Map();
  const runs = [];

  function upsertUser({ xfUserId, username, avatarUrl }) {
    for (const u of users.values()) {
      if (u.xf_user_id === xfUserId) {
        u.username = username;
        if (avatarUrl) u.avatar_url = avatarUrl;
        u.updated_at = new Date().toISOString();
        return { ...u };
      }
    }
    const row = {
      id: nextUser++,
      xf_user_id: xfUserId,
      username,
      avatar_url: avatarUrl ?? null,
      best_distance: 0,
      best_combo: 0,
      last_distance: 0,
      last_combo: 0,
      run_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    users.set(row.id, row);
    return { ...row };
  }

  function getUserByXfId(xfUserId) {
    for (const u of users.values()) {
      if (u.xf_user_id === xfUserId) return { ...u };
    }
    return null;
  }

  function getUserById(id) {
    const u = users.get(id);
    return u ? { ...u } : null;
  }

  function insertRun(userId, payload) {
    const id = nextRun++;
    runs.push({
      id,
      user_id: userId,
      distance: payload.distance,
      max_combo: payload.maxCombo ?? 0,
      duration_ms: payload.durationMs ?? 0,
      cookies: payload.cookies ?? 0,
      cakes: payload.cakes ?? 0,
      fail_reason: payload.failReason ?? null,
      created_at: new Date().toISOString(),
    });
    return id;
  }

  function mergeBest(userId, payload) {
    const u = users.get(userId);
    if (!u) return null;
    const combo = payload.maxCombo ?? 0;
    const improved = {
      distance: payload.distance > u.best_distance,
      combo: combo > u.best_combo,
    };
    if (improved.distance || improved.combo) u.updated_at = new Date().toISOString();
    if (improved.distance) u.best_distance = payload.distance;
    if (improved.combo) u.best_combo = combo;
    u.last_distance = payload.distance;
    u.last_combo = combo;
    u.run_count += 1;
    const runId = insertRun(userId, payload);
    return {
      runId,
      bestDistance: u.best_distance,
      bestCombo: u.best_combo,
      improved,
    };
  }

  function topBy(column, limit = 50) {
    const key = column === 'combo' ? 'best_combo' : 'best_distance';
    const rows = [...users.values()]
      .filter((u) => u[key] > 0)
      .sort((a, b) => b[key] - a[key] || a.updated_at.localeCompare(b.updated_at))
      .slice(0, limit)
      .map((u) => ({
        username: u.username,
        avatar_url: u.avatar_url,
        value: u[key],
      }));
    return rankRows(rows);
  }

  function listRuns(userId, limit = 20) {
    return runs
      .filter((r) => r.user_id === userId)
      .slice(-limit)
      .reverse()
      .map((r) => ({ ...r }));
  }

  async function close() {}

  return {
    upsertUser,
    getUserByXfId,
    getUserById,
    mergeBest,
    topBy,
    listRuns,
    close,
  };
}
