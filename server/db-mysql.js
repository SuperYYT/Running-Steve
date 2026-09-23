import mysql from 'mysql2/promise';
import { rankRows } from './db-shape.js';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  xf_user_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(80) NOT NULL,
  avatar_url VARCHAR(512) NULL,
  best_distance INT NOT NULL DEFAULT 0,
  best_combo INT NOT NULL DEFAULT 0,
  last_distance INT NOT NULL DEFAULT 0,
  last_combo INT NOT NULL DEFAULT 0,
  run_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_best_distance (best_distance),
  KEY idx_best_combo (best_combo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  distance INT NOT NULL,
  max_combo INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  cookies INT NOT NULL DEFAULT 0,
  cakes INT NOT NULL DEFAULT 0,
  fail_reason VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_created (user_id, created_at),
  CONSTRAINT fk_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

export async function createMysqlDb(url) {
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    waitForConnections: true,
    charset: 'utf8mb4',
  });
  for (const stmt of SCHEMA_STATEMENTS) {
    await pool.query(stmt);
  }
  // migrate older installs that still have best_score / max_combo
  try {
    await pool.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS best_combo INT NOT NULL DEFAULT 0`,
    );
  } catch {
    // MySQL 5.7 lacks IF NOT EXISTS on columns — ignore if present
  }

  async function upsertUser({ xfUserId, username, avatarUrl }) {
    await pool.query(
      `INSERT INTO users (xf_user_id, username, avatar_url)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         avatar_url = COALESCE(VALUES(avatar_url), avatar_url),
         updated_at = CURRENT_TIMESTAMP`,
      [xfUserId, username, avatarUrl ?? null],
    );
    return getUserByXfId(xfUserId);
  }

  async function getUserByXfId(xfUserId) {
    const [rows] = await pool.query('SELECT * FROM users WHERE xf_user_id = ?', [xfUserId]);
    return rows[0] ?? null;
  }

  async function getUserById(id) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async function insertRun(conn, userId, payload) {
    const [result] = await conn.query(
      `INSERT INTO runs (user_id, distance, max_combo, duration_ms, cookies, cakes, fail_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        payload.distance,
        payload.maxCombo ?? 0,
        payload.durationMs ?? 0,
        payload.cookies ?? 0,
        payload.cakes ?? 0,
        payload.failReason ?? null,
      ],
    );
    return Number(result.insertId);
  }

  async function mergeBest(userId, payload) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
      const row = rows[0];
      if (!row) {
        await conn.rollback();
        return null;
      }
      const combo = payload.maxCombo ?? 0;
      const improved = {
        distance: payload.distance > Number(row.best_distance),
        combo: combo > Number(row.best_combo ?? 0),
      };
      if (improved.distance || improved.combo) {
        await conn.query(
          `UPDATE users SET
             best_distance = GREATEST(best_distance, ?),
             best_combo = GREATEST(best_combo, ?),
             last_distance = ?,
             last_combo = ?,
             run_count = run_count + 1,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [payload.distance, combo, payload.distance, combo, userId],
        );
      } else {
        await conn.query(
          `UPDATE users SET
             last_distance = ?,
             last_combo = ?,
             run_count = run_count + 1
           WHERE id = ?`,
          [payload.distance, combo, userId],
        );
      }
      const runId = await insertRun(conn, userId, payload);
      const [nextRows] = await conn.query('SELECT * FROM users WHERE id = ?', [userId]);
      await conn.commit();
      const next = nextRows[0];
      return {
        runId,
        bestDistance: Number(next.best_distance),
        bestCombo: Number(next.best_combo ?? 0),
        improved,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async function topBy(column, limit = 50) {
    const col = column === 'combo' ? 'best_combo' : 'best_distance';
    const [rows] = await pool.query(
      `SELECT username, avatar_url, ${col} AS value
       FROM users
       WHERE ${col} > 0
       ORDER BY ${col} DESC, updated_at ASC
       LIMIT ?`,
      [Number(limit)],
    );
    return rankRows(rows);
  }

  async function listRuns(userId, limit = 20) {
    const [rows] = await pool.query(`SELECT * FROM runs WHERE user_id = ? ORDER BY id DESC LIMIT ?`, [
      userId,
      Number(limit),
    ]);
    return rows;
  }

  async function close() {
    await pool.end();
  }

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
