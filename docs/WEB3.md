# 钱包、承诺登记与上链接入说明

## 模式矩阵

```text
APP_MODE=demo|live                  默认 demo
CHAIN_MODE=preview|bot_testnet|bot_mainnet   默认 preview（无需钱包/密钥即可演示）
REWARD_MODE=demo|partner            默认 demo
CLAIM_VERIFIER_MODE=demo|manual|provider    默认 demo
```

- `preview`：存证任务保留**本地承诺指纹**（commitment + salt 私有保存），状态 `unconfigured`。不生成假交易哈希、假区块高度或伪浏览器链接。
- 真实链模式要求同时配置 `CHAIN_RPC_URL` 与 `NEXT_PUBLIC_COMMITMENT_REGISTRY_ADDRESS`，否则启动时报配置错误，不自动降级假成功。
- 模式由服务端环境变量决定，客户端 query 参数不能切换奖励/审核模式。

## V2 承诺登记合约（本轮新增，未部署）

`contracts/HeartbellCommitmentRegistry.sol`：

```solidity
event CommitmentRecorded(bytes32 indexed commitment, uint64 recordedAt);
function record(bytes32 commitment) external;          // 仅受控 writer，拒绝零承诺/重复
function recordedAt(bytes32) external view returns (uint64);  // 只增不改
function rotateWriter(address) external;               // 仅管理员
function setPaused(bool) external;                     // 仅管理员
function transferAdmin(address) / acceptAdmin()        // 两步式转移
```

- 交易输入、存储与事件**不含**用户钱包、普通签名、关系类型或链下关系 ID（本地 EVM 测试断言 record calldata 仅 36 字节、事件 topic 仅承诺哈希）。
- 不提供删除、修改历史、资金接收或转账接口；合约不保存关系、分数或保险余额。
- 编译：`npm run contracts:compile`（solc 0.8.37，EVM paris，与 V1 一致）。行为测试：`node scripts/contract-check.mjs`（@ethereumjs/evm 真实执行编译产物，26 项）。
- 旧 `HeartbellMemories.sol` 保留为 V1 兼容只读；V2 使用独立 ABI 与地址，旧公开双地址历史不可通过新方案消除。

## V2 承诺计算协议（`src/lib/chain/commitment.ts`）

```text
payload = { schema:"heartbell.record.v2", recordType, recordId, version,
            relationshipId, businessOccurredAt, previousVersionCommitment,
            participants, content, attachmentHashes, rulesVersion }
payloadBytes = UTF8(JCS(payload))            // RFC 8785 风格键排序；整数-only
contentDigest = SHA256(payloadBytes)
commitment = SHA256( UTF8("HEARTBELL_V2"||0x00) || salt(32B) || contentDigest(32B) )
```

- salt 为每次登记独立生成的 32 字节密码学随机秘密，不写入公开链、不用公开编号替代。
- 字节串拼接（非十六进制文本）；字符串以用户确认时的确切 Unicode 内容冻结。
- recordId / relationshipId / previousVersionCommitment / recordType 仅在私有 payload 中，不作为事件参数。
- 独立复算验证（verify:v2 T13）：同一 payload+salt 重算一致；改一个字、换一张图、改一个 salt 字节均不匹配。
- 证据包导出：`GET /api/v2/export?recordId=`（payload + salt + anchor 信息 + 验证说明），仅记录参与者可导出。

## 存证任务流（`src/lib/server/v2/services/anchor.ts`）

```text
冻结 payload → 生成 salt/commitment → 服务端校验授权 → outbox 入队（幂等：
同一 (recordId, version) 只有一个任务）→ 按模式处理 → 失败保留任务可重试
（恢复同一任务，不换承诺）
```

关系建立/结束、双方确认的日记版本、计划条款、审核结论与结算结果会自动生成存证任务。UI 区分**业务确认状态**与**存证状态**（未存证 / 预览·本地指纹 / 链上已核验 / 写入失败）。

## 真实链接入（待办，本轮未执行）

以下条件齐备后方可启用 `CHAIN_MODE=bot_testnet|bot_mainnet`：

1. 部署 `HeartbellCommitmentRegistry`（建议先测试网 968），记录网络、合约地址、部署 tx、编译参数（solc 0.8.37 / paris）、writer 地址。
2. 配置 `.env.local`：`CHAIN_RPC_URL`、`NEXT_PUBLIC_COMMITMENT_REGISTRY_ADDRESS`、`CHAIN_WRITER_PRIVATE_KEY`（仅服务端，禁止 NEXT_PUBLIC_）。
3. 在 `anchor.ts` 的 `submitToRegistry` 完成真实提交链路：viem `createPublicClient` 模拟执行 `record(commitment)` → 受控 writer 发送 → `waitForTransactionReceipt`（CONFIRMATIONS=2，按目标链调整）→ 服务端核验链 ID、回执 status、to 合约、`CommitmentRecorded(commitment)` 事件来源与（必要时）`recordedAt` 读数对照。客户端上报的哈希不可直接采信。
4. outbox 以 (chainId, contract, commitment) 唯一；进程崩溃后先查已有哈希与链上记录再考虑重发；重查发现重组时退回待核验。
5. BOT Chain 参数（2026-10-07 核对官方文档）：主网 677 `https://rpc.botchain.ai` / `https://scan.botchain.ai`；测试网 968 `https://rpc.bohr.life` / `https://scan.bohr.life`。部署前重查。

## 钱包

`src/lib/wallet/client.ts` + 我的抽屉内 WalletPanel：真实浏览器钱包连接与网络切换。钱包仅用于真实存证签名（preview 模式无需钱包）；钱包断开只影响签名，不影响已保存日记。双窗口真实双钱包演示请使用不同浏览器或隔离配置。

## ZK（未接入）

`src/lib/zk/adapter.ts` 保持 fail-closed：验证器未配置时拒绝，不返回伪造成功。演示成年声明不经过该接口。接入任务不变（Semaphore 身份/群组/nullifier 原子存储等）。

## 验证边界

本轮实际完成：合约编译、本地 EVM 行为测试（权限/零承诺/重复/暂停/轮换/两步转移/无身份数据断言）、承诺协议独立复算（含篡改检测）、preview 模式端到端演示、链故障模拟与恢复。
**未做**：真实网络部署、真实交易、回执核验联调、Semaphore。以上待办不能用伪造链接代替。
