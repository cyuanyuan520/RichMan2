# 部署与联机运维

应用是纯前端静态站点：游戏逻辑、AI、主机权威循环全部跑在浏览器里，
PeerJS 只负责点对点传输。因此**不需要任何服务端代码或数据库**，可直接部署到 Vercel。

## 1. 本地生产验证

```bash
nvm use
npm install
npm run verify     # 类型检查 + lint + 测试
npm run build      # 生产构建
npm run start      # 本地预览 http://localhost:3000
```

## 2. 部署到 Vercel

### 方式 A：命令行（推荐）

```bash
npx vercel login      # 首次登录
npx vercel            # 预览部署
npx vercel --prod     # 生产部署
```

### 方式 B：Git 集成

1. 在 Vercel 新建项目并导入 `RichMan2` 仓库；
2. Framework Preset 会自动识别为 **Next.js**，Build Command / Output 保持默认；
3. 如需自定义信令服务器，在 Project → Settings → Environment Variables 中按下表配置后重新部署。

> 部署完成后是纯静态资源 + 浏览器 P2P，Vercel 不参与对局流量。

## 3. 环境变量

全部为构建期内联的 `NEXT_PUBLIC_*`，改动后必须重新部署。默认值为空即使用 PeerJS 公共信令云。

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_PEERJS_HOST` | 自建 PeerJS 信令服务器域名/IP；留空使用公共云 |
| `NEXT_PUBLIC_PEERJS_PORT` | 信令端口，默认 `443` |
| `NEXT_PUBLIC_PEERJS_PATH` | 信令路径，默认 `/` |
| `NEXT_PUBLIC_PEERJS_SECURE` | `false` 时使用 ws://（仅本地调试），默认 https/wss |
| `NEXT_PUBLIC_PEERJS_KEY` | 自建服务器的 `key`，与服务端 `--key` 一致 |
| `NEXT_PUBLIC_ICE_SERVERS` | 覆盖 PeerJS 默认 ICE 配置的 JSON 数组，需自行包含 STUN：`[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com","username":"u","credential":"p"}]` |

> 注意：设置 `NEXT_PUBLIC_ICE_SERVERS` 会**替换**而不是合并 PeerJS 内置 ICE 列表，
> 所以 JSON 里必须同时写回你需要的公共 STUN 服务器，否则只剩你列出的 TURN。

复制 `.env.example` 为 `.env.local` 即可本地调试。

```bash
# .env.local 示例（自建信令 + 自建 TURN）
NEXT_PUBLIC_PEERJS_HOST=peer.example.com
NEXT_PUBLIC_PEERJS_PORT=443
NEXT_PUBLIC_PEERJS_PATH=/peer
NEXT_PUBLIC_PEERJS_KEY=my-peer-key
NEXT_PUBLIC_ICE_SERVERS=[{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]
```

## 4. 联机行为与限制

- 房间码为 5 位（去混淆字符集），对应 PeerJS id `richman2-<房间码小写>`。
- **主机权威**：房主浏览器运行引擎；客户端只发意图，主机校验后广播脱敏快照与事件。
- 开局后拒绝新玩家加入（无观战席），空位自动由 AI 补位。
- 断线重连：客户端把令牌存到 `localStorage`（键 `richman2.token.<房间码>`），
  刷新或断网后自动重连并恢复座位；重连等待期内 AI 代打。连续失败 5 次后转为手动重连。
- 主机关闭页面即对局结束（客户端显示与主机断开），这是当前唯一不可恢复的失败模式。
- 公共 PeerJS 云适合体验与好友小局；跨运营商/对称 NAT 场景建议自建信令 + TURN。

### 自建 PeerJS 服务器（可选）

```bash
# server 包名是 peer（提供 peerjs 可执行文件）；无需全局安装
npx --yes peer --port 9000 --path /peer --key my-peer-key
```

生产环境请置于 HTTPS 反向代理之后，并把上表变量指向该域名（`secure` 留默认即可）。

## 5. 数据与持久化

| 存储 | 键 | 内容 |
| --- | --- | --- |
| localStorage | `richman2.settings.v1` | 昵称、默认地图、AI 难度、动画速度、音量 |
| localStorage | `richman2.token.<房间码>` | 重连令牌 |

没有服务端存储：对局状态只存在于运行中的浏览器里。本地对局刷新即结束；
联机对局刷新后由上述令牌 + 主机快照恢复。

## 6. 故障排查

| 现象 | 排查 |
| --- | --- |
| 卡在「连接信令服务器…」 | 信令地址/端口/key 是否正确、是否需要代理或 TURN；公共云偶发限流可重试 |
| 房间码加入失败/房间号冲突 | 确认房间码 5 位、房主仍在等待；重开房间会生成新码 |
| 双方能看到棋盘但动不了 | 只有当前行动者（或决策归属者）可以操作；等待回合轮转或对方决策 |
| 提示「游戏内容与主机不一致」 | 双方部署版本不同，刷新两人页面到同一构建 |
| 断线后提示多次重连失败 | 点界面上的「重连」手动重试（会重置重试次数）；仍失败则返回主菜单重新加入房间 |
| 提示「联机模块加载失败」 | 进入联机时才会按需加载 P2P 模块，弱网/拦截环境下可能失败；刷新页面或检查网络后重试 |
| 移动端无法操作 | 当前版本仅面向 PC 桌面浏览器 |

## 7. 性能备忘

- 联机模块（peerjs）已通过动态 `import()` 拆分，进入房间时才加载；首屏不含 P2P 代码。
- 棋盘背景使用 WebP（8.5MB PNG → 811KB），由 `sharp` 压缩后替换，原始 PNG 保留在 git 历史中。
- 引擎状态每步 `structuredClone`，40 格 + 4 人的规模下开销可忽略。
