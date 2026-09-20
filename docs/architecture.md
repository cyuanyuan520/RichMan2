# 架构设计（RichMan2）

## 目标

现代网页版大富翁：TypeScript + Next.js（App Router）+ React + Tailwind CSS，
PeerJS 实时联机，Vercel 部署。核心原则：**游戏逻辑、UI、网络、内容（地图/卡牌/角色/规则）
四层解耦**，未来新增地图、模式、角色、卡牌、规则时只加数据或独立模块。

## 分层与依赖方向

```
src/
  app/        Next.js 路由与页面外壳（薄层，只做装配）
  ui/         React 组件（界面、棋盘、HUD、弹窗、特效）
  store/      Zustand 状态绑定：本地对局驱动 / 联机驱动
  net/        PeerJS 传输、协议（zod 校验、版本化）、主机权威循环
  game/       纯 TypeScript 引擎（不依赖 React / DOM / 网络）
    core/     状态机、reducer、RNG、事件、类型契约
    rules/    移动、经济、收租、落地结算
    systems/  卡牌、道具、角色技能、AI（P2 起）
    selectors/ 派生视图（净资产、可购买性等）
  data/       内容层（数据驱动）
    maps/     3 套地图（蓝图 + 具名数据 + 坐标）
    content/  经济参数、卡牌、道具、角色、代币皮肤
  audio/      BGM（素材 mp3）与 WebAudio 合成音效
  i18n/       文案字典（zh-CN，结构上支持未来多语言）
  lib/        通用工具
```

依赖规则：

1. `game/` 不 import `ui/`、`net/`、`store/`、`data/`；内容通过
   `GameContent`（地图定义 + 牌堆 id）注入，引擎只认 `GameState`。
2. `data/` 只依赖 `game/core/types` 与 zod，不依赖 React。
3. `net/` 只传 `GameState`、`GameAction`、事件与聊天消息，宿主为唯一权威。
4. `ui/` 通过 `store/` 读取状态、派发动作；不直接修改引擎状态。

## 引擎契约

- `createGameState(setup, content): GameState`：生成可 JSON 序列化的完整对局状态。
- `reduce(state, action): { state, events }`：纯函数（结构化克隆 + 返回新状态），
  非法动作抛 `EngineError(code)`。
- `GameEvent[]`：UI/动画/日志的唯一信息源（骰子、移动路径、金钱变化、购买、收租…）。
- 随机性全部来自可序列化 RNG（mulberry32 + 字符串种子），保证同种子同结果、
  联机可回放、断线可重算。
- 状态自包含：`GameState.tileDefs` 携带本局地图静态数据，宿主快照即可完整复算。

## 内容数据驱动

- `MapDef` = 8 个地产组 + 40 格（22 地产 / 4 交通 / 2 公用 / 2 机遇 / 2 命运 /
  2 税 / 商店 / 彩票 / 4 角），格子类型与定价、租金、升级成本全部数据化。
- `china-journey` 为 `layout: "path"`（画卷坐标路径），其余地图为 `layout: "ring"`，
  渲染层按布局策略负责坐标换算。
- 卡牌/道具效果使用声明式 DSL（`CardEffect` 联合类型），引擎解释执行，
  新增卡牌无需改逻辑（目标是 P2 完成后达到 100% 声明式覆盖）。
- `validateContent()` / `assertMapStructure()` 在启动与测试中对全部内容做
  zod 校验与结构断言（40 格、类型计数、组引用、经济字段完整性）。

## 联机模型（P3 实施）

- 主机权威：主机运行引擎，客户端只发送意图（roll / buy / use-item / chat…）。
- 协议：zod 校验 + 版本号 + 单调 seq；状态快照 + 事件流用于重连与动画对齐。
- 断线重连：玩家令牌（本地存储）映射座位；座位保留，重连续玩。
- PeerJS broker 默认公共云，`NEXT_PUBLIC_PEERJS_*` 可切换到自建服务器；
  ICE 服务器可配置（STUN/TURN）。

## 阶段路线

P1 基础与架构（当前）→ P2 完整玩法（卡牌/道具/技能/AI）→ P3 联机 →
P4 UI/UX 与动画 → P5 集成与部署。
