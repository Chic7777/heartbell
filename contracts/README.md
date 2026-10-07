# 智能合约工作区

## HeartbellCommitmentRegistry.sol（V2，本轮新增）

链上只登记带独立随机秘密的内容承诺（bytes32）。受控 writer 专用 `record`；拒绝零承诺与重复登记；`recordedAt` 只增不改；管理员可暂停与轮换 writer（两步式转移）；无资金接口。交易输入、存储与事件不含用户钱包、普通签名、关系类型或链下关系 ID。

- 编译：`npm run contracts:compile`（solc 0.8.37，EVM paris，产物在 `contracts/artifacts/`，不提交）。
- 行为测试：`node scripts/contract-check.mjs`（本地 EVM 真实执行编译产物：权限/零承诺/重复/暂停/轮换/两步转移/无身份数据断言，26 项）。
- 部署：constructor(initialAdmin, initialWriter)；建议先测试网（968）。部署后将地址填入 `.env.local` 的 `NEXT_PUBLIC_COMMITMENT_REGISTRY_ADDRESS`，并配置 `CHAIN_RPC_URL` 与 `CHAIN_WRITER_PRIVATE_KEY`（仅服务端）。**当前未部署、未发送真实交易。**

## HeartbellMemories.sol（V1，保留兼容）

双人链上确认纪念（公开双方地址）。保留源码与旧记录只读解释；V2 使用独立 ABI 与地址，不与 V2 承诺协议混用。详见 docs/WEB3.md。

BOT Chain 参数与部署交接清单见 docs/WEB3.md。主网部署由团队明确安排，私钥不得写入仓库。编译通过不等于安全审计通过。
