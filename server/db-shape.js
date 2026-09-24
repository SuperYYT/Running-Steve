/** Shared row shapes for both drivers. */

/** Local midnight (00:00:00.000) for the calendar day of `now`. */
export function dayStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 'YYYY-MM-DD HH:MM:SS' in local time for MySQL DATETIME compares. */
export function toSqlDateTime(date) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

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

