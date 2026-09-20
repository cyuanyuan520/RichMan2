# 大富翁 · 神州风云（RichMan2）

现代网页版大富翁：纯前端 Next.js 应用，支持单机人机、在线联机（PeerJS 主机权威）、
AI 补位与断线重连。三套主题地图、角色技能、道具与机遇/命运卡全部数据驱动。

- 技术栈：TypeScript + Next.js 16（App Router）+ React 19 + Tailwind CSS 4 + Zustand 5 + Motion + PeerJS + zod
- 引擎：纯函数、可序列化、同种子可复现（`src/game/`）
- 内容：3 地图 / 40 格 / 24 张卡 / 10 件道具 / 6 名角色（`src/data/`）
- 表现：水墨、怀旧、画卷三主题棋盘，逐格移动动画、卡牌翻转、金钱飘字、WebAudio 音效与 BGM

## 快速开始

```bash
nvm use            # 读取 .nvmrc（Node 24）
npm install        # 国内可加 --registry=https://registry.npmmirror.com
npm run dev        # http://localhost:3000
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm run start` | 生产构建 / 生产预览 |
| `npm run verify` | 类型检查 + lint + 全部测试（提交前必跑） |
| `npm run test` | Vitest（引擎 / 联机 / 棋盘 / 商店 / 渲染测试） |

## 玩法

- **单机人机**：1 名真人 + 1–3 名 AI（简单 / 普通 / 困难），可设回合上限。
- **在线联机**：创建房间得到 5 位房间码，好友输入房间码加入；房主开局，空位自动 AI 补位；
  断线后凭本机令牌自动重连，重连期间由 AI 代打，回来后立即接管。
- 规则细节见 [`docs/game-rules.md`](docs/game-rules.md)。

## 架构

分层与依赖方向：

```
src/
  app/        Next.js 页面外壳（仅装配）
  ui/         React 组件（棋盘、HUD、弹窗、动效导演、音效）
  store/      Zustand：本地对局驱动 / 联机驱动、设置与令牌持久化
  net/        PeerJS 传输、协议（zod + 版本 + seq）、主机权威、客户端会话
  game/       纯 TS 引擎（core 状态机 / rules 规则 / systems 卡牌道具技能 AI / selectors）
  data/       内容层：地图、经济参数、卡牌、道具、角色（zod 校验 + 内容哈希）
  audio/      WebAudio 合成音效与 BGM
  lib/        格式化与事件文案
```

- 引擎不依赖 React / DOM / 网络；内容通过 `GameContent` 注入，`reduce(state, action, content)` 为纯函数。
- 联机为**主机权威**：客户端只发送去掉 `playerId`/`forcedDice` 的意图，主机校验合法性后统一执行并广播
  `{seq, 脱敏快照, 事件}`；客户端的 `rng` 与牌堆已清空，无法预测或作弊。
- 新增地图 / 卡牌 / 道具 / 角色原则上只需加数据，详见 [`docs/architecture.md`](docs/architecture.md)。

## 部署

Vercel 一键部署、PeerJS 自建与 TURN 配置、环境变量、故障排查见
[`docs/deployment.md`](docs/deployment.md)。

## 素材

`public/assets/maps/*.webp`（棋盘背景，由原始 PNG 压缩而来）与 `public/assets/audio/bgm/*.mp3`。

## 许可

仅供学习与交流使用。
