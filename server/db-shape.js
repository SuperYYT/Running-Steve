/** Shared row shapes for both drivers. */

export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: row.username,
    avatarUrl: row.avatar_url ?? null,
    bestDistance: Number(row.best_distance),
    bestScore: Number(row.best_score),
    lastDistance: Number(row.last_distance ?? 0),
    lastScore: Number(row.last_score ?? 0),
    runCount: Number(row.run_count ?? 0),
    maxCombo: Number(row.max_combo ?? 0),
  };
}

export function rankRows(rows, limit, mapValue) {
  return rows.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    username: r.username,
    avatarUrl: r.avatar_url ?? null,
    value: mapValue(r),
  }));
}
