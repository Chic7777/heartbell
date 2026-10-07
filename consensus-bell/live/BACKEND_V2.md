# Consensus Bell 后端 v2 实现与接入

已补充 Privy / permissionless SDK 和 BOT 测试网适配，详见 [WALLET_STARTER.md](./WALLET_STARTER.md)。

本次将方案中的第一阶段能力写入可执行后端：Fastify、应用身份、智能账户、ERC-4337 v0.7、有限额 Paymaster、双方 Ring SBT、链上回执、Echo、授权草稿任务、私密密文 Vault 和 SSE。现有资料、雷达、EOA 登录与交易入口继续工作。

## 运行

需要 Node >=22.13。在 live 执行 `npm install`，将 `.env.example` 复制为 `.env`，然后 `node --env-file=.env server.mjs`。默认监听 `http://127.0.0.1:52203`。远程部署需 HTTPS 和真实 APP_ORIGIN。密文及 SQLite 文件在 data 内，不通过静态资源路由发布。

后端启动不要求私钥或公开链部署地址；缺少配置的链操作会返回错误，不生成成功记录。不要将测试账号、测试 Gas 估算或本地 Anvil 的结果当作 BOT 主网证明。

## 模块

| 模块 | 实现 |
|---|---|
| Fastify 入口、会话、Origin 检查 | server.mjs |
| 身份提供商 JWT / 钱包控制权分别验证 | auth-provider.mjs、auth.mjs |
| 账户工厂预测、Owner 证明、不可静默重绑 | aa.mjs |
| v0.7 编码、Hash、RPC | aa-protocol.mjs |
| 回执、区块与执行事件核验、镜像 | aa-receipts.mjs |
| Gas 授权、金额上限、持久化每日额度 | sponsor.mjs |
| Echo、多连接、屏蔽、授权、可编辑草稿 | domain-v2.mjs、domain-migrations.sql |
| 加密文件、校验、收件人信封、私密读取 | vault-v2.mjs |
| 业务 API | v2-router.mjs |
| 唯一 Ring、双凭证、验证型 Paymaster | ../contracts/src |
| PostgreSQL 生产 Schema | ../services/database/migrations/001_backend_v2.sql |

## 应用身份和钱包

1. 邮箱/Passkey 由配置的身份服务完成认证，客户端取得短时 JWT。配置 AUTH_ISSUER、AUTH_AUDIENCE、AUTH_JWKS_URL；只接受 RS256/ES256，核验签名、issuer、audience、sub、iat、exp。
2. `POST /api/auth/challenge {address}` 取得一次性签名挑战。Embedded Wallet SDK 在客户端提供 secp256k1 Owner，签署挑战。
3. `POST /auth/session {token,id,signature}` 验证身份服务及 Owner 控制权，建立 app_users/auth_identities 和 HttpOnly 会话。邮箱重新登录不能换绑 Owner。既有 EOA 用户仍可通过 `/api/auth/verify` 登录。
4. `POST /api/wallets/challenge {salt:"0"}`，由 Owner 签名，再 `POST /api/wallets/initialize {id,signature}`。服务器读取 Factory.getAddress，核验链、Bundler、Factory、EntryPoint；已部署账户核验 owner()/entryPoint()。
5. `GET /api/wallets/me` 返回 Owner、sender、工厂、salt。sender 是 Smart Account。这里只存公开地址和引用，不接收用户私钥。

没有选定或配置 Embedded Wallet SDK 时，本后端不会假装替用户创建外部托管签名器。OIDC 身份服务也需真实配置。Passkey 的 P-256 签名不能替代 SimpleAccount 的 secp256k1 Owner 签名。正式版需要另行完成钱包和记忆密钥恢复。

## 业务交易与 Proof

所有接口在 `/api` 下；方案中的 `/wallets`、`/relationships`、`/stories`、`/connections`、`/vows`、`/bonds`、`/user-operations` 等路径也接受不带 `/api` 的请求。

| API | 请求 |
|---|---|
| POST /api/relationships/invitations/prepare | `{invitee: SmartAccountAddress, sponsor: true}` |
| POST /api/relationships/invitations/:inviterAddress/accept/prepare | `{sponsor:true}`；校验实际邀请发起者 |
| GET /api/relationships/current | 当前登录用户 Smart Account 的实时链上关系；`?id=1` 可读归档关系 |
| POST /api/vows/prepare | `{contentHash:bytes32, sponsor:true}`，正文不上链 |
| POST /api/vows/:index/confirm/prepare | `{sponsor:true}`，index 是当前关系内 vowIndex |
| POST /api/bonds/:relationId/deposit/prepare | `{amountWei:"10000000000000000",sponsor:false}` |
| POST /api/userops/prepare | 类型化 action：invite / accept / cancel / decline / privateVow / confirm / deposit / end / withdraw |
| POST /api/user-operations/track | `{id,userOperation}`，仅签名可以与已准备操作不同 |
| POST /api/bonds/:relationId/withdraw/prepare | `{}`；本人归档关系中的贡献取回 |
| GET /api/user-operations/:id | 本人的状态、userOpHash、真实 txHash / 确认结果 |
| GET /api/proof/user-operation/:id | 同样经过后端核验的交易证明 |
| GET /api/notifications/stream | HttpOnly 会话鉴权的 SSE |

prepare 返回 userOperation、userOpHash、EntryPoint 和签名提示。用户对 Hash 的 **32 字节内容**作 EIP-191 personal_sign；不是对十六进制文本签名。客户端只填写真实签名再提交，后端禁止修改任何交易字段，禁止任意目标合约/calldata 代签。首次操作含 factory/factoryData，已部署账户省略。

UserOperation 和 txHash 分开记录。交易进度显示 AWAITING_SIGNATURE、SUBMITTED、INCLUDED、CONFIRMED、FAILED。Worker 每五秒跟踪回执；重启继续读取未结算任务。Receipt.success、实际 EntryPoint UserOperationEvent、独立链 RPC 回执、规范区块 Hash、确认数、目标 Bell 事件及参与者全部匹配才写镜像。外层交易成功但 UserOperation 失败不会激活 Ring。事件按链/tx/logIndex 去重；通知本人及关系另一方刷新。用户读取当前关系和资金时仍以链上为准。

默认 RPC 不用 eth_getLogs。当前重启重试及确认前规范区块核验已实现；最终确认后的深度重组回滚、全链历史重建仍需正式 Indexer。本地 SQLite 的镜像不提供普通写 API。

## Gas 赞助

`BellPaymaster.sol` 基于官方 v0.7 BasePaymaster。backend SponsorService 绑定链、EntryPoint、Paymaster、sender、nonce、账户部署参数、完整 execute calldata、Gas 和费用、有效期及最大成本。估算阶段使用占位签名，正式 BOT Bundler 对 Paymaster 估算的兼容性仍需在实际部署后验证。Sponsor Key 只签 Gas 授权，不能作为用户 Owner。

配置 BELL_PAYMASTER_ADDRESS 和 BELL_SPONSOR_KEY 启用本地授权，或配置 BELL_SPONSOR_URL / TOKEN 接外部授权服务。Paymaster 必须实际部署、充值 EntryPoint deposit，按 Bundler 规则管理 stake。默认单次 Gas 成本上限为 0.01 BOT，每个 Owner 每日五次；生产赞助要求该 Owner 已绑定验证过的邮箱/Passkey 身份。初次上线仍需进一步身份反滥用和全局预算监控。Bond 可赞助 Gas，存入的 BOT 必须在用户账户中。

部署脚本 `../contracts/script/DeployV2.s.sol` 部署新 Bell（自动创建 RingSBT）和 Paymaster，配置 sponsorSigner 与可选 deposit。原合约不可升级，需新部署地址。原有 Bond 记账沿用 Bell.deposit/withdrawFrom，尚未拆成独立按目标 CommitmentVault。Witness 铸造与履约不在本阶段。

## Echo、Radar 和 Agent

`PUT /api/profiles/me` 保存既有 profile 格式。`POST /api/radar/search {city,intention,radius}` 返回实际公开资料推荐，`GET /api/radar/echoes` 支持同样查询参数。屏蔽会双向排除候选。

`POST /api/connections {recipient:loginOwnerAddress}` 创建链下 Echo；`POST /api/connections/:id/respond {decision:"accept"|"decline"}` 仅收件人可回应；`POST /api/blocks {target}`、`DELETE /api/blocks {target}` 管理本人屏蔽。Echo 可连接多人，不创建 Ring，不占用唯一链上关系。

`POST /api/consents {scope:"agent:vow-draft",resourceId:"profile",expiresAt:毫秒时间戳}`；可用 scope 还有 agent:story-draft、agent:radar-explain。`DELETE /api/consents {id}` 撤回授权。

`POST /api/agent/jobs {skill:"vow-draft",resourceId:"profile",title?,points?}` 返回真实模板草稿。Radar skill 可带 filters。`GET /api/agent/jobs?id=UUID` 只读本人结果。任务必须有未过期的对应授权。当前 engine 是可解释规则/模板，明确 `llm:false`、`editable:true`、`requiresUserApproval:true`；没有冒充外部大模型，不解密 Vault，不自动签名、不执行资金操作。

## 私密记忆 Vault

1. 客户端生成独立 AES-256-GCM 密钥加密内容、为每个收件人封装密钥。
2. `POST /api/stories/upload-intent {scope:"personal"|relationId,ciphertextHash:SHA256,byteLength,encryptionVersion:"AES-256-GCM-v1"}`。
3. `POST /api/stories/uploads/:uploadId {ciphertext:base64}`。服务器检查一次性授权、拥有者、过期时间、大小、规范 base64 和 SHA256，写到私密目录。
4. `POST /api/stories {uploadId,type:"note"|"photo"|"video"|"vow",iv:base64,envelopes:[{recipient,wrappedKey:base64}]}`。个人 recipient 是登录 Owner；共享 recipient 是关系 Smart Account。
5. `GET /api/stories?scope=personal|relationId`、`GET /api/stories/:id` 仅返回有权用户自己的信封和密文。

默认单文件 1 MiB、单用户 100 MiB。共享关系需在授权、上传、提交时均为 Active。归档可读已有内容但不能继续共享；无法收回对方已保存的密文或密钥。平台不持有解密密钥，用户需保管独立加密备份。现有 web 前端尚使用既有 EOA/记忆接口，客户端接入新的 Embedded Wallet/AA API 是后续前端工作。

## 数据库与验证边界

当前可运行入口继续用 SQLite，自动建立各模块表，不把已有数据静默换库。PostgreSQL migration 包含完整实体、整数 Wei、状态和参与者约束、25 张业务表 RLS、事件去重和只读链镜像权限。已在 PGlite PostgreSQL 引擎执行并测试权限；生产 PostgreSQL 连接、迁移旧数据和角色配置尚未接入运行时，详见 services/database/README.md。

`npm test`：真实签名 HTTP、Vault 文件与 AES 密文、Echo/授权、OIDC 验证、AA RPC 边界、真实 Anvil EntryPoint + Paymaster + SmartAccount + 双方 Ring/Vow/Bond。

`forge test`（contracts 中）：双签关系、RingSBT、v0.7 Paymaster、实际 EntryPoint 付费执行、重放、签名篡改与到期。

AA E2E 使用本地 HTTP Bundler 测试适配器，其 Gas 估算为固定保守值；账户部署、用户签名、EntryPoint、Paymaster付费、执行事件和区块回执都是真实本地链执行。本轮没有广播 BOT 主网交易，没有以本地测试替代正式 Bundler/移动端兼容性测试或安全审计。

官方接口依据：[BOT ERC-4337](https://dev-docs.botchain.ai/docs/Account-Abstraction/erc-4337/)、[Bundler RPC](https://dev-docs.botchain.ai/docs/Account-Abstraction/erc-4337/bundler-rpc/)、[Smart Accounts](https://dev-docs.botchain.ai/docs/Account-Abstraction/erc-4337/smart-accounts/)。
