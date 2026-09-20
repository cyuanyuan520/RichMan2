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
  lib/        通用工具（含 event-text 文案层，未来可替换为多语言字典）
```

依赖规则：

1. `game/` 不 import `ui/`、`net/`、`store/`、`data/`；内容通过
   `GameContent`（地图定义 + 卡牌/道具/角色注册表 + contentHash）注入，
   引擎签名 `reduce(state, action, content)`，引擎只认 `GameState`。
2. `data/` 只依赖 `game/core/types` 与 zod，不依赖 React。
3. `net/` 只传 `GameState`、`GameAction`、事件与聊天消息，宿主为唯一权威。
4. `ui/` 通过 `store/` 读取状态、派发动作；不直接修改引擎状态。

## 引擎契约

- `bootstrapGame(setup, content): { state, events }`：生成初始状态与开局事件
  （含 `game-started` / `turn-started`，并初始化技能充能与冷却）。
- `reduce(state, action, content): { state, seq, events }`：纯函数（结构化克隆 +
  返回新状态），非法动作抛 `EngineError(code)`。
- `GameEvent[]`：UI/动画/日志的唯一信息源（骰子、移动路径、金钱变化、购买、
  收租、卡牌、道具、技能、彩票、破产…），`seq` 标记该批事件的版本。
- 随机性全部来自可序列化 RNG（mulberry32 + 字符串种子），保证同种子同结果、
  联机可回放、断线可重算。
- 状态自包含：`GameState.tileDefs` 携带本局地图静态数据，`contentHash` 用于
  联机内容一致性校验；牌堆按权重展开后洗牌（`expandDeck`）。

## 结算模型（P2）

- **解析栈**：`GameState.queue: ResolutionTask[]`，pump 循环依次执行
  `landing`（逐格结算）与 `effects`（卡牌/道具/技能效果）。
  效果可再推入移动后的落地结算，实现「前进 3 格 → 结算新格子」等链式行为；
  出现 `pending` 决策时暂停，决策完成后继续 pump，最后 `settlePhase`
  决定回到 `await-roll` 或 `action-window`。
- **决策**：`PendingDecision` 覆盖购买、筹集欠款、道具目标、卡牌目标、遥控骰子；
  `allowedWhilePending` 强制执行每个决策只接受合法动作，`decision-requested` /
  `decision-resolved` 事件驱动 UI。
- **欠款**：现金可为负；`payMoney` 在无法覆盖时进入「筹集欠款」决策，
  变卖/抵押后自动结清，资产变卖完仍不足则自动破产。
- **目标选择**：目标型道具/卡牌先进入 `item-target` / `card-target` 决策，
  `targetOptions`（selectors）统一供 UI 与 AI 使用；取消不消耗道具。
- **技能**：触发器 `pass-start` / `buy-discount` / `upgrade-discount` /
  `rent-discount` / `rent-bonus` / `negative-card-mitigation` /
  `hospital-reduce` / `jail-reduce` / `active`（充能 + 冷却）全部生效。
- **AI**：`chooseAiAction(state, content, playerId)` 基于 `getLegalActions`
  选择合法动作（简单/普通/困难三档保守度），使用由 `state.seq` 派生的
  确定性 RNG，不污染牌堆骰子流；完整对局回放可复现。

## 内容数据驱动

- `MapDef` = 8 个地产组 + 40 格（22 地产 / 4 交通 / 2 公用 / 2 机遇 / 2 命运 /
  2 税 / 商店 / 彩票 / 4 角），格子类型与定价、租金、升级成本全部数据化。
- `china-journey` 为 `layout: "path"`（画卷坐标路径），其余地图为 `layout: "ring"`，
  渲染层按布局策略负责坐标换算。
- 卡牌/道具效果使用声明式 DSL（`CardEffect` 联合类型，23 种），引擎
  `systems/effects.ts` 解释执行，落地格行为由 `rules/landing.ts` 的
  `TILE_HANDLERS` 注册表按 `TileKind` 分派；新增卡牌/道具/角色无需改逻辑。
- `validateContent()` / `assertMapStructure()` 在开发启动与测试中对全部内容做
  zod 校验与结构断言（40 格、类型计数、组引用、租金表长度、id 唯一性、
  道具引用完整性）；生产构建不重复执行（测试是内容质量的把关点）。
- `buildGameContent(mapId)` 组装注册表并计算 `contentHash`，供引擎与联机校验使用。

## 联机模型（P3 已实现）

- 目录：`src/net/protocol.ts`（消息/意图 zod 校验、`PROTOCOL_VERSION`、快照脱敏）、
  `src/net/transport.ts`（`Transport` 抽象 + 内存对，用于测试）、
  `src/net/peer-transport.ts`（PeerJS 适配：房间号 → peer id、数据通道、超时与错误）、
  `src/net/host.ts`（`HostSession` 主机权威循环）、`src/net/client.ts`（`ClientSession`）。
- 主机权威：主机持有完整 `GameState` 并运行引擎；客户端只发送 `ClientIntent`
  （无 `forcedDice`、无 `playerId` 等服务端字段，zod 解析时剥离未知字段）。
  每次意图先经 `getLegalActions` 白名单核对 `actionKey`，非法即 rejected。
- 消息：`hello`（协议版本 + 可选 contentHash + 可选 token 重连 + 昵称/角色/棋子/机器人难度）
  → `welcome`（座位、令牌、`mapId`、`contentHash`、`resumeSeq` 意图序号、大厅状态、聊天记录、最近事件）；
  加入者不必预先知道地图：客户端拿到 `welcome.mapId` 后本地组装内容并校验 `contentHash`，
  不一致立即断开并提示刷新（`PROTOCOL_VERSION = 3`，旧版本被版本门拒绝）；
  `update`（`{seq, snapshot, events, players}`，每步广播，客户端按 seq 幂等应用）；
  `intent`（每客户端递增 seq，主机去重）；`chat`/`emote`（主机限流后广播）；
  `seat-update`；`ping`/`pong` 保活；`rejected`（version/content/started/full/invalid）。
- 快照脱敏：`sanitizeState` 按 `HIDDEN_STATE_KEYS` 抹去 `rng`/`seed`/牌堆与弃牌堆，
  客户端无法预知骰子与牌序；座位连接状态只从 `SeatInfo` 读取（引擎状态不含网络字段）。
- 断线重连：座位令牌由 CSPRNG 生成；大厅重连保留原令牌，对局中重连换发新令牌。
  `welcome.resumeSeq` 让客户端从主机已处理的意图序号继续编号，避免刷新后意图被
  去重逻辑静默丢弃。开局后无 token 的连接被拒绝（不做观战者）。
- 保活与防滥用：主机每 5s 对已连接座位发 `ping`，若发出的探测连续 12s 无人应答则
  判为断线并交给 AI 接管（大厅等待期间也保持保活）；令牌校验失败/畸形/超长消息
  累计 5 次直接断开该连接；聊天 8 条/分钟、表情 12 条/分钟；字符串字段均有长度上限。
- AI 补位：`HostSession.tick()` 在轮到机器人座位或断线超过宽限期的人类座位时，
  用 `chooseAiAction` 自动行动；`autoPlayUntil` 支持测试与单机全自动对局。
- 房间：`peer-transport.ts` 生成 5 位房间号（去除易混字符）映射到
  `richman2-<code>` PeerJS id；`NEXT_PUBLIC_PEERJS_*` 可切换自建 broker。

### 主机循环接口

```ts
const host = new HostSession(setup, content, { now, disconnectGraceMs, hostSeat });
host.connect(transport);            // 接受 PeerJS 或内存传输
host.begin();                       // 开局（未认领的人类座位自动转为 AI）
host.submitIntent(playerId, intent) // 本地玩家/中继意图，返回 { ok, error? }
host.tick(now);                     // 保活 + 机器人/断线座位行动一步（浏览器定时调用）
```

### 安全与一致性

- 客户端消息全部经 zod 校验（意图 id/令牌/昵称等均有长度上限）；非法消息回 `rejected`
  并计一次警告，累计 5 次断开该连接。
- 意图幂等：`seq <= lastIntentSeq` 直接丢弃，避免重连重传重复执行；重连时通过
  `welcome.resumeSeq` 恢复编号。
- 座位防劫持：令牌 32 位十六进制随机数；非当前连接无法替换已认领座位；猜测令牌
  不影响在位连接。
- 内容一致性：`contentHash` 覆盖地图/卡牌/道具/角色全部数值，握手不一致拒绝加入。
- 事件批次 `{seq, events}` 供 UI 动画对齐；快照与事件同一批次原子下发；
  `welcome.recentEvents` 供重连后重建日志面板（不重播动画）。

## 表现层（P4）

- `src/store/game-store.ts`：Zustand 唯一状态源。单机模式用 `bootstrapGame` + `reduce`
  驱动，并按 `aiDelayMs` 定时调用 `chooseAiAction` 自动行动机器人座位；联机模式
  （`src/store/net-store.ts`）把主机快照/事件或客户端 `update` 原子写入同一 store，
  UI 无需区分模式；`setOnlineDispatcher` 让 `dispatch` 在联机模式下转发为意图
  （`toIntent` 剥离 `playerId`/`forcedDice`）。
- `src/ui/fx/use-director.ts`：事件驱动导演。消费 `fxQueue`，按类型播放骰子摇动、
  逐格棋子行进、卡牌翻开、金钱飘字、入狱/住院/破产横幅，并在动画期间阻塞弹窗，
  保证「状态先行、表现随后」且不出现动画与状态错位。
- `src/ui/board/`：`geometry.ts` 把 40 格映射为 11×11 环形棋盘（每边 10 格，
  四角为起点/监狱/医院/进监狱）；`layout: "path"` 的地图按 `coord` 百分比定位并
  以 spring 相机跟随当前行动者（画卷式平移缩放）。`Board` 负责主题背景、格子、
  棋子、飘字与悬停信息卡。
- `src/ui/dialogs/`：购买、筹集欠款（含资产管理）、目标选择、遥控骰子、道具店、
  彩票行、地产管理、玩家详情、结算与提示，全部由 `pending` 决策驱动。
- `src/ui/screens/`：主菜单、单机设置、联机大厅（房间号/座位/聊天表情）、规则、设置。
- `src/audio/`：WebAudio 合成音效（`sfx.ts`，无外部素材）与 BGM（`bgm.ts`，
  使用 `public/assets/audio/bgm` 的两首曲子），音量跟随设置实时生效。
- `src/lib/event-text.ts`：把 `GameEvent` 翻译为中文日志文案（tone/icon），
  日志面板与文本层未来可直接替换为多语言字典。

## 阶段路线

P1 基础与架构 → P2 完整玩法（卡牌/道具/技能/AI）→ P3 联机 →
P4 UI/UX 与动画（当前阶段）→ P5 集成与部署。
