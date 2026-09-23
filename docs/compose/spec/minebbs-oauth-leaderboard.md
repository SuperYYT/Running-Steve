---
feature: minebbs-oauth-leaderboard
status: delivered
updated: 2026-09-23
branch: feat/minebbs-oauth-leaderboard
commits: d7447fd..8b6cf71
---

# MineBBS OAuth 登录 · 账号成绩 · 双榜排行

## Report

**What was built** — 同域 Express API + MySQL（`MYSQL_URL`，`mysql2`）承载 MineBBS OAuth 登录、签名会话、按账号最佳成绩与每局 `runs` 历史（距离/掉落物/连击/时长/拾取/失败原因）。前端登录条、双榜（含手机）、局末自动上报。无 MySQL 时可用 `DB_DRIVER=memory` 做本地/测试；生产拒绝 memory。完整工程与 `dist` 已同步到 `C:\Users\Super\Documents\GitHub\Running-Steve`。

**Verification** — `npm test` PASS（memory DB 合并/runs/双榜 + 会话 + API 冒烟）；`npm run build` PASS。评审 critical 已修：MySQL 建表拆成单语句（mysql2 默认拒多语句）；去掉 `ON UPDATE CURRENT_TIMESTAMP` 以免非进步局冲掉并列 tie-break；`mergeBest` 事务化。**注意**：本机未跑真实 MySQL（部署服务器提供），上线请设 `MYSQL_URL` 并确认建表成功。

**Journey log**
- mysql2 默认 `multipleStatements: false`，一个字符串里两条 CREATE 会直接起不来
- MySQL 列上 `ON UPDATE CURRENT_TIMESTAMP` 会覆盖「仅破纪录才刷时间」的并列排序语义
- Windows 上 `dist`/sqlite 句柄会偶发 EPERM，构建前清目录
- PowerShell `Set-Content` 易写入 UTF-8 BOM，弄坏 package.json
- 无共享 DB 时冒烟应 `createApp(memoryDb)` 同进程，而不是跨进程 seed

## [S1] Problem

玩家目前只能在本地 `localStorage` 记最佳成绩，换设备或清缓存就丢。MineBBS（XenForo）账号无法登录游戏，也没有全服排行。需要：用 MineBBS OAuth 登录、按账号保存游玩记录与成绩、主页展示「最远距离」与「掉落物分数」两张排行榜。存储使用 **MySQL**（部署到已有 MySQL 的服务器），并保留每局详细记录。

## [S2] Design

### 已确认决策

| 轴 | 选择 |
| --- | --- |
| 后端 | Node 同域 API（Express），`https://runningsteve.minebbs.com` |
| OAuth | XenForo Confidential，`user:read`；authorize `https://www.minebbs.com/oauth2/authorize`，token `https://www.minebbs.com/api/oauth2/token` |
| 入榜 | 每人最佳 `best_distance` / `best_score`；双榜 Top 50 |
| 存储 | **MySQL**（生产 `MYSQL_URL`），`users` + `runs` 每局历史 |
| 反作弊 | 客户端上报 + 范围/频率基础校验 |
| 交付同步 | 完整工程 + `dist` → `C:\Users\Super\Documents\GitHub\Running-Steve` |

### 架构

```
Browser (Vite game)
  ├─ GET  /api/me
  ├─ GET  /auth/login | /auth/callback | POST /api/logout
  ├─ POST /api/scores   (含每局扩展字段)
  └─ GET  /api/leaderboard

server/
  ├─ cookie session (HttpOnly, SameSite=Lax, HMAC)
  ├─ db-mysql.js  (mysql2/promise, MYSQL_URL)  ← 生产默认
  ├─ db-memory.js (进程内)                      ← 无 MySQL 时本地/测试
  └─ env: MINEBBS_* / SESSION_SECRET / PUBLIC_ORIGIN / MYSQL_URL / DB_DRIVER
```

`DB_DRIVER=mysql`（有 `MYSQL_URL` 时默认）或 `memory`。生产部署必须 mysql。

### 数据（MySQL）

```sql
users(
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  xf_user_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(80) NOT NULL,
  avatar_url VARCHAR(512) NULL,
  best_distance INT NOT NULL DEFAULT 0,
  best_score INT NOT NULL DEFAULT 0,
  last_distance INT NOT NULL DEFAULT 0,
  last_score INT NOT NULL DEFAULT 0,
  run_count INT NOT NULL DEFAULT 0,
  max_combo INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_best_distance (best_distance),
  KEY idx_best_score (best_score)
)

runs(
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  distance INT NOT NULL,
  score INT NOT NULL,
  max_combo INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  cookies INT NOT NULL DEFAULT 0,
  cakes INT NOT NULL DEFAULT 0,
  fail_reason VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_created (user_id, created_at)
)
```

### API 契约

- `GET /api/me` → `{ user: { id, username, avatarUrl, bestDistance, bestScore, lastDistance, lastScore, runCount, maxCombo } | null }`
- `POST /api/scores` body `{ distance, score, maxCombo?, durationMs?, cookies?, cakes?, failReason? }`
  - 401 未登录；400 非法/超上限；429 每用户 5s 冷却
  - 始终 insert `runs`；best 仅增大时更新；刷新 last_* / run_count / max_combo
  - 200 `{ bestDistance, bestScore, improved, runId }`
- `GET /api/leaderboard?limit=50` → 双榜 Top
- OAuth login/callback/logout 同前；`returnTo` 禁止 `//`

### 前端

登录条 + 双榜（含移动端）；gameover 上报 distance/score/maxCombo/durationMs/cookies/cakes/failReason。

### 测试边界

- `DB_DRIVER=memory` 跑单元 + API 冒烟（无 MySQL 也可验逻辑）
- 有 `MYSQL_URL` 时跑同一套 API 冒烟（可选 `npm run test:mysql`）

## [S3] Out of Scope

- 周榜/日榜、回放强校验、多 IdP
- 本机安装/托管生产 MySQL（使用部署服务器已有实例）

## Tasks

- [x] T1: MySQL 数据层 + memory 驱动 + users/runs — acceptance: DB_DRIVER 任选可 upsert/merge/top (covers: S2)
- [x] T2: scores 写 runs + 扩展字段 API — acceptance: 响应含 runId；best 只升 (covers: S2)
- [x] T3: 前端 gameover 扩展上报 — acceptance: POST body 含 combo/时长/拾取/原因 (covers: S2)
- [x] T4: 测试 + build — acceptance: npm test 与 npm run build 通过 (covers: S2; depends: T1, T2)
- [x] T5: 同步 GitHub 文件夹 — acceptance: 目标含 package.json/server/src/dist (covers: S2; depends: T4)
