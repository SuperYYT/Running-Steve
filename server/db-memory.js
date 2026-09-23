/**
 * In-process driver for tests / local dev without MySQL.
 * Same surface as db-mysql.js.
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
      best_score: 0,
      last_distance: 0,
      last_score: 0,
      run_count: 0,
      max_combo: 0,
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
    const row = {
      id,
      user_id: userId,
      distance: payload.distance,
      score: payload.score,
      max_combo: payload.maxCombo ?? 0,
      duration_ms: payload.durationMs ?? 0,
      cookies: payload.cookies ?? 0,
      cakes: payload.cakes ?? 0,
      fail_reason: payload.failReason ?? null,
      created_at: new Date().toISOString(),
    };
    runs.push(row);
    return id;
  }

  function mergeBest(userId, payload) {
    const u = users.get(userId);
    if (!u) return null;
    const distance = payload.distance;
    const score = payload.score;
    const improved = {
      distance: distance > u.best_distance,
      score: score > u.best_score,
    };
    if (improved.distance) u.best_distance = distance;
    if (improved.score) u.best_score = score;
    if (improved.distance || improved.score) u.updated_at = new Date().toISOString();
    u.last_distance = distance;
    u.last_score = score;
    u.run_count += 1;
    u.max_combo = Math.max(u.max_combo, payload.maxCombo ?? 0);
    const runId = insertRun(userId, payload);
    return {
      runId,
      bestDistance: u.best_distance,
      bestScore: u.best_score,
      improved,
    };
  }

  function topBy(column, limit = 50) {
    const key = column === 'score' ? 'best_score' : 'best_distance';
    const rows = [...users.values()]
      .filter((u) => u[key] > 0)
      .sort((a, b) => b[key] - a[key] || a.updated_at.localeCompare(b.updated_at))
      .slice(0, limit);
    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      avatarUrl: r.avatar_url ?? null,
      value: r[key],
    }));
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
