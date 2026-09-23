# 史蒂夫快跑 Running Steve

Minecraft 风格三车道跑酷：史蒂夫在主世界沿海小径上奔跑，变道躲方块、跳过沙堆、蹲下躲幻翼，收集曲奇和蛋糕。支持 MineBBS 登录、MySQL 成绩与双榜排行。

## 开发

```powershell
npm install
npm run dev      # 游戏 :5188（代理 /api /auth → :3001）
npm run server   # API :3001
npm test
npm run build
```

## 部署（服务器 + MySQL）

```powershell
npm ci && npm run build
# 配置 .env.example 中的环境变量
# 必填：MYSQL_URL、SESSION_SECRET、MINEBBS_CLIENT_ID/SECRET、PUBLIC_ORIGIN
node server/index.js
```

MineBBS OAuth2：Confidential，Redirect URI `https://runningsteve.minebbs.com/auth/callback`，作用域 `user:read`。  
本地无 MySQL 可用 `DB_DRIVER=memory`（生产环境会拒绝）。

## 操作

| 按键 | 动作 |
| --- | --- |
| ← → / A D | 变道 |
| 空格 / ↑ / W | 跳跃 |
| ↓ / S / Shift | 蹲下（点按一次短暂下蹲） |
| Esc | 暂停 |
| Enter / 空格 | 开始 |

### 手机

- 左右滑动变道 · 上滑跳跃 · 下滑蹲下
- 或使用屏幕四角按键：◀ 蹲 · 跳 ▶

## Minecraft 元素

- 主角：史蒂夫（经典皮肤 UV，像素最近邻过滤）
- 拾取：曲奇、蛋糕（触碰计分后炸开碎屑；每捡 5 个连击 +×1）
- 障碍：橡木箱、沙块堆、橡木原木、低飞幻翼
- 场景：草方块岸、泥土小径、橡树、营火、信标塔
