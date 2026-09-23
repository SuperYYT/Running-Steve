/** Shared row shapes for both drivers. */

export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: row.username,
    avatarUrl: row.avatar_url ?? null,
    bestDistance: Number(row.best_distance),
    bestCombo: Number(row.best_combo ?? row.max_combo ?? 0),
    lastDistance: Number(row.last_distance ?? 0),
    lastCombo: Number(row.last_combo ?? 0),
    runCount: Number(row.run_count ?? 0),
  };
}

export function rankRows(rows) {
  return rows.map((r, i) => ({
    rank: i + 1,
    username: r.username,
    avatarUrl: r.avatar_url ?? null,
    value: Number(r.value),
  }));
}
