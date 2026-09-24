---
feature: redis-perf
status: designed
updated: 2026-09-23
branch: feat/v3.1-polish
commits: 
---

# Redis 性能层

## Report

## [S1] Problem

主页每次打开都打 MySQL 查三榜；`runToken`/限流在进程内存里，重启即丢、多实例不一致。服务器已有 Redis 8.4.7，需要接上以提升访问性能与会话类状态可靠性。

## [S2] Design

### 决策

| 轴 | 选择 |
| --- | --- |
| 驱动 | `ioredis`，`REDIS_URL`（如 `redis://127.0.0.1:6379`） |
| 榜缓存 | key `lb:v1`，TTL 3s；`POST /api/scores` 后 `DEL` |
| runToken | `run:{token}` JSON，TTL 30min；消费用 `DEL` 原子拿走 |
| 限流 | `cd:user:{id}` SET NX EX 2.5s |
| OAuth state | `oauth:{state}` TTL 10min |
| 降级 | 无 `REDIS_URL` 或连接失败 → 现有 Map/无缓存，功能不减 |

### 接口不变

`/api/me` `/api/scores` `/api/leaderboard` `/auth/*` 契约保持不变。

## [S3] Out of Scope

- Redis 集群/哨兵、会话 cookie 改 Redis 存储
- 静态资源 CDN

## Tasks

- [ ] T1: cache 抽象 + ioredis / memory 双实现 — acceptance: 无 REDIS_URL 时 npm test 通过 (covers: S2)
- [ ] T2: 榜缓存 + scores 失效 — acceptance: 连续两次 leaderboard 第二次不查库（可测 cache hit） (covers: S2)
- [ ] T3: runToken / 限流 / oauth state 走 cache — acceptance: 契约不变，冒烟通过 (covers: S2)
- [ ] T4: 测试 + build + 文档 env — acceptance: npm test & build PASS (covers: S2)
