# Current UI delivery

The current Stitch UI, build steps, real-data behavior and verified limitations are documented in [STITCH_UI_VERIFICATION.md](./STITCH_UI_VERIFICATION.md). Current wallet/AA backend and BOT Testnet verification are documented in [BACKEND_V2.md](./BACKEND_V2.md). The older EOA-entry notes below are retained as historical implementation context; the current delivery documents take precedence.

# Backend v2

后端已增加 Fastify、智能账户/ERC-4337、有限额 Paymaster、RingSBT、Echo、授权任务、私密 Vault 与 SSE。完整接口、配置、验证与当前限制见 [BACKEND_V2.md](./BACKEND_V2.md)。下面说明保留的 EOA Web 入口。

# Consensus Bell · Wallet-connected App

此入口连接真实钱包、真实服务器与真实合约；不使用 Alice/Sophie 固定身份、随机演示签名、本地模拟余额或伪造 Proof。

## 启动

需要 Node.js ≥22.13。此电脑已经安装了依赖。

```powershell
cd C:\Users\llwxy\Downloads\keyanglove\live
npm install
npm start
```

打开 http://127.0.0.1:52203。两个用户请使用不同浏览器配置文件或设备，分别连接自己的 EVM 浏览器钱包。浏览器 cookie 会话在同一配置文件内共享，不提供假的角色切换。当前只监听本机；供远程用户使用时需部署 HTTPS 服务并配置实际 APP_ORIGIN。

只想先看界面：直接打开 http://127.0.0.1:52203/?preview=1，或在启动页选择「先逛逛 · 跳过钱包」。Ring 页的「查看完整使用路径」可进入四步身份、寻找/绑定、共鸣雷达、邀请、签名说明、仪式、故事、誓言、共同目标、仓库、见证和隐私设置。访客可填写当前页面的未上传草稿，但不读取真实账号数据、不上传保存、不定位匹配、不创建邀请或交易。刷新即清除草稿。真实签名登录后，只有新账户的身份草稿会转入最后一步供本人确认；不会覆盖已有资料，记忆与目标草稿不会自动上传。

## 配置链

复制 `.env.example` 为 `.env`，填入公开 RPC、对应链 ID、本版合约的部署地址与真实 Explorer URL。然后使用 `node --env-file=.env server.mjs` 启动。服务端不接收或保存钱包私钥、助记词。没有配置时，仍可真实签名登录和编辑资料、保存私人加密记忆；链上页面会明确显示尚未读取状态，不生成模拟数据。

必须部署包含 endingRequester、pendingInvitee、invitationExpiresAt、cancelInvitation、declineInvitation、proposePrivateVow 的本版合约。没有部署、没有 gas 或用户拒签时，操作失败并保留真实状态。修正不能改变已部署不可升级合约，旧地址需要替换为新部署地址。

## 真实数据流

- 登录：服务器生成五分钟一次性挑战 → 钱包个人签名 → 服务端恢复地址并验证 → HttpOnly / SameSite 会话。错误签名与重放被拒绝。
- 资料：按钱包地址保存到 SQLite，可编辑昵称、城市、年龄、性别、兴趣、意向、爱情宣言。发现页只显示同意公开资料的真实注册用户，没有预置人物。
- 私人记忆：本机 P-256 密钥 → 钱包签名绑定公钥 → P-256 ECDH + AES-256-GCM。服务器只收密文；按本人或链上关系成员授权读取。可新增照片、文字及 MP4/WebM 短视频（单个媒体最大 1MB），修改自己的记录。故事按日期分组，支持照片/视频/文字筛选和详情；视频播放仍需真实浏览器媒体文件验收。
- 共同目标：标题、主题、预算和正文作为加密规划保存，可修改自己的未归档记录。无法解密时拒绝覆盖。规划预算不是余额，也不代表目标已筹款；现有 EOA 合约没有按目标分账或共同支出功能。
- 誓言：正文先加密保存，链上只调用 proposePrivateVow(contentHash)。对方解密后核对 keccak256(text) 与合约哈希，再使用自己的钱包调用 confirmVow。人数与计数来自合约。
- Echo 连接与聊天：连接请求、接受与拒绝是真实后端记录。双方同意后，聊天在本机用 P-256 ECDH + AES-256-GCM 加密正文再发送，服务器只保存密文信封，按连接参与者授权读取；新消息通过鉴权 SSE 实时推送，并配有轮询兜底。「阅后即焚空间」的消息由服务器强制 24 小时过期删除，界面如实显示焚毁时限。一方屏蔽连接后，对话立即对双方关闭。
- 合约中并行添加的公开正文接口 proposeVow(string) 被保留。新 App 不使用它；若其他客户端使用公开接口，正文已经永久公开，界面会如实标注，不会称为加密誓言。
- 邀请、接受、取消、拒绝、存入、结束、归档、取回：均是实际钱包交易。合约约束单一邀请、24 小时有效期、单一 Active Ring、双方誓言确认、双方结束或七天超时、本人贡献取回。
- Proof：等待两次区块确认，服务端重新读取交易和回执，校验链、合约、发送人、执行结果与事件。不会接受前端自己声称“已上链”。

## 共鸣雷达

登录后从 Ring 页选择 Find Someone，即进入真实共鸣雷达。O 目前是可解释的资料匹配助手，按照共同兴趣、关系意向和城市排序，不冒充大模型，也不承诺感情匹配成功。人群筛选支持城市、意向、附近范围以及性别与年龄区间；性别与年龄完全来自对方自愿公开的自述，未经核验，自述缺失或与筛选不符的人不会出现在结果里。只有主动允许发现的注册用户会成为候选人；昵称首字作为头像，不预置人物照片。可查看推荐理由、收藏、筛选城市/意向及开启附近定位。收藏归当前钱包所有，修改资料会影响其他用户的下一次探测。

定位由用户确认后调用浏览器权限并提交到服务器；服务器丢弃精确坐标，仅保存 0.1°（纬度约 11km）网格的粗略区域，24 小时后停止使用，可随时撤回并删除。定位每分钟最多更新一次，撤回不会绕过更新冷却期。只返回区域间距离（按 10km 取整）或“同一粗略区域”，不是实际点位距离，也不是匿名或精准导航；其他用户可能从附近结果推断大致区域。范围筛选基于网格中心，边界不精确。要求双方都有有效位置，否则不列为附近候选。位置与资料均为用户提供，尚未做反欺诈核验。正式远程部署须使用 HTTPS，定位依赖浏览器支持。没有候选人、拒绝定位或后台失败均显示真实状态。

匹配与收藏在链下处理，不表示链上认证。发送 Ring 邀请仍进入既有钱包交易流程，必须配置真实 RPC 和合约。不会显示未经核验的 BOT Mainnet / Verified 徽章。

## 明确的未完成接入（链上与设备）

- BOT 主网的 RPC 与部署地址尚未提供；已验证的是临时本地 Anvil 链，不能当作主网记录。
- v2 新合约接受关系时已铸造 RingSBT；此 Web 入口的凭证展示、Witness 铸造、实体履约、按目标分账和共同支出仍需接入。
- 当前使用 EOA 浏览器钱包；移动端 WalletConnect、EIP-1271 智能账户登录尚未接入。
- 私钥仅在首次登记的浏览器 IndexedDB 中以不可导出的 CryptoKey 保存。跨设备加密密钥恢复尚未实现；请保留原浏览器。加密档案导出仅备份密文，不替代密钥恢复。
- 历史关系列表来自本服务验证的创建交易，不是完整全链索引。此 Web 入口每 15 秒重新读取真实数据；新 AA 后端已提供鉴权 SSE 和回执 Worker，旧页面尚未订阅。
- 2026-10-07 已获授权检查本地 App：主要十条路径在 375/768/1280 三种宽度截图、导航和布局检查；四步身份、未上传记忆/目标及材质弹窗也已点验。未连接或签钱包、未提交定位权限，未做手机钱包、主网或 Lighthouse 验收。

## 验证

`npm test` 运行真实签名 HTTP 隔离测试和本地链真实交易闭环，后者需要 Foundry Anvil（可通过 ANVIL_PATH 指定位置）。合约测试位于 `../contracts`，用 `forge test` 运行。

本轮用户路径回归使用 `node --test auth.test.mjs radar.test.mjs journey.test.mjs`，9/9 通过。全量链回归曾被同时接入的 AA 模块 RPC/Bundler 链 ID 配置不一致阻断，因此不声明当前完整后端或主网已全部通过。并行钱包更新新增 aa-action.js 后，已补齐其静态路由并重启本地预览，确认访客页面恢复；新 AA/V2 后端与邮箱钱包登录仍须单独验收。

SQLite 数据保存在 `live/data/app.sqlite`，不会装入交付包。为避免混淆，旧 `ui/index.html` 与 `ui/complete.html` 被保留为历史演示，新入口是本目录中的钱包 App 服务。
