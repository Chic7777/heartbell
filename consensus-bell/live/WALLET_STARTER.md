# Privy / permissionless Starter 参考落地

已参考 privy-io/permissionless-example 的三个入口：PrivyProvider 应用认证、SmartAccountContext 的 EIP-1193 signer 适配、dashboard 的账户操作。原仓库于 2026-01-07 归档，实际使用 Base Sepolia + Safe，而我们的后端使用 BOT SimpleAccount v0.7。因此保留认证、Signer、Smart Account 分层，按当前 SDK 实现独立适配，不复制旧 Safe 工厂、赞助服务和类型逃逸。

参考：[仓库](https://github.com/privy-io/permissionless-example)、[账户上下文](https://github.com/privy-io/permissionless-example/blob/main/hooks/SmartAccountContext.tsx)、[当前 SimpleAccount API](https://docs.pimlico.io/references/permissionless/reference/accounts/toSimpleSmartAccount)。锁定依赖 permissionless 0.4.1、viem 2.57.3，完整版本见 package-lock.json。

## 实际代码

- bot-network.mjs：968 / 677 独立配置与 viem chain 定义。
- wallet-adapter.mjs：Privy ConnectedWallet → EIP-1193 → 显式 Owner signer → SimpleAccount；生成 SDK 签名；连接后端会话和钱包绑定。
- auth-provider.mjs：Privy ES256 access token、issuer=privy.io、audience=App ID、有效期与公开 PEM 验证。仍需独立一次性 Owner 签名证明；登录不能换绑旧钱包。
- network-check.mjs：RPC/Bundler/EntryPoint/Factory 与 SDK 账户预测的只读兼容性检查。
- .env.testnet.example：明确的 968 测试网配置；现有服务默认 677 保留。切换网络时显式使用对应配置，不混用 Bundler。
- ../contracts/script/DeployTestnet.s.sol：仅允许 968 / 31337，部署已有双签 Bell 和自动配对 RingSBT，无 Paymaster 前置依赖。

## 配置与接入

在 Privy 中创建自己的应用，配置真实网站 Origin 与 BOT 自定义链，开启 Ethereum Embedded Wallet。邮箱/Google/Passkey 的交互认证由 Privy 客户端 SDK 完成；现有界面已接入真实邮箱登录与嵌入式钱包，同时保留浏览器钱包登录。

复制 `.env.testnet.example` 为 `.env`。配置 PRIVY_APP_ID 即可通过该应用的公开 JWKS 验证令牌；可选 PRIVY_VERIFICATION_KEY 必须是公开 ES256 PEM；无需将 Privy App Secret、用户私钥或助记词传给浏览器/后端。Privy token 的正常生命周期约一小时，因此 Privy 模式支持 1h 的 token age，不沿用通用 OIDC 的 10m 限制。

```sh
npm run check:bot                         # 默认只读检查测试网968，无交易
node --env-file=.env network-check.mjs    # 显式使用配置中的网络
node --env-file=.env server.mjs
```

实际需要链上部署时，使用自己测试网充值过的部署账户；以下命令由操作人自行执行，本次未广播：

```sh
# 在 contracts 中，BOT_RPC_URL 指向测试网968；DEPLOYER_KEY 只在本机环境中配置
forge script script/DeployTestnet.s.sol --rpc-url bot --broadcast --slow
```

将输出的 ConsensusBell 地址填入 CONSENSUS_BELL_ADDRESS。现有正式合约已包含邀请、唯一 Ring、超时/取消/拒绝、双向结束、Vow、Bond 和 SBT，直接承载 Mini Ring 流程，不另建一个缺少退出机制的教学合约。

前端构建环境中调用共享适配器（浏览器打包器需解析 viem/permissionless/zod/ethers；这不是可直接用裸模块 URL 加载的静态脚本）：

```js
import { BOT_NETWORKS } from './bot-network.mjs';
import { connectPrivySession } from './wallet-adapter.mjs';

// wallet 来自 useWallets() 中 walletClientType === 'privy' 的已认证钱包。
// getAccessToken 来自 usePrivy()。api 是同源 POST、credentials:'include'，
// 非2xx抛错，并返回解析后的 JSON；不手动保存 cb_session 或私钥。
const connection = await connectPrivySession({
  wallet, getAccessToken, api, config: BOT_NETWORKS[968], salt: '0'
});
const prepared = await api('/api/relationships/invitations/prepare', {
  invitee: bobSmartAccount, sponsor: false
});
const signed = await connection.adapter.signPrepared(prepared);
const submitted = await api('/api/user-operations/track', signed);
```

Alice 的 invitee 必须是 Bob 的 **Smart Account**，不是 Owner。Bob 对自己的 prepare 调用 accept，使用自己的 adapter 签名，再由既有后端提交/核验。签名前检查 Provider 当前账户/链、prepared 的 chainId、EntryPoint、sender、Hash；SDK Factory 预测必须等于后台绑定。客户端仍由用户发起签名，未复制旧示例的免确认签名配置。

第一轮无需 Paymaster：向双方的预测 Smart Account 地址或 EntryPoint deposit 充值测试 BOT 后，以 sponsor:false 准备操作。充值使用真实钱包，后端不创造余额或资金。两笔操作成功后 GET /api/relationships/current 显示 ACTIVE；继续邀请第三人的实际 UserOperation 执行失败，Ring 仍保持原关系。正式比赛需在677另行部署和执行，测试网结果不能替代主网证明。

## SDK 兼容点

本版 permissionless 默认 v0.7 Factory 为 0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985；BOT 官方 Factory 为 0xBC88d6012b3bf8426C2851d3798cEB5257658332。本适配器始终传入 factoryAddress 和 EntryPoint.version='0.7'，不依赖 SDK 默认值。

另一个已实际复现的坑：SDK 的 Owner 转换对含 request 方法的对象会请求账户列表。如果 Provider 包含多个账户，直接传 WalletClient 可能改用首个账户。适配器用显式 toAccount signer 固定选定 Owner，签名仍交给 EIP-1193 Provider。真实双账户测试证明 Bob 的地址与签名不会变成 Alice。

官方网络依据：[BOT 网络与部署地址](https://dev-docs.botchain.ai/docs/Account-Abstraction/network-and-endpoints/)、[官方 v0.7 示例](https://dev-docs.botchain.ai/docs/Account-Abstraction/erc-4337/bundler-rpc/)、[Privy token 验证](https://docs.privy.io/authentication/user-authentication/access-tokens)。

## 已观察到的结果与边界

官方 968 RPC/Bundler 的链 ID、EntryPoint 支持、Factory 字节码检查通过；SDK 对公开 Owner 0x000000000000000000000000000000000000dEaD、salt0 计算 0x8a98b15f5470e9eE12071eF5F7A3f823Df7be07f，等于官方 Factory.getAddress。检查只用 eth_call，无广播或资金操作。

本地真实 EntryPoint 测试覆盖有赞助/自付费两种完整八步交易链路，双方 SDK 签名、Ring SBT、Vow、Bond、结束与提现。Privy-shaped ES256 JWT + Owner 控制权 + HttpOnly 会话的实际 HTTP 链路已测试；测试 JWT 由隔离测试签名密钥生成，EIP-1193 Provider 为本地 Anvil，不把它称为实际 Privy 云端登录。

2026-10-07 已通过真实 Privy 邮箱验证码、Owner 控制签名、677 智能账户绑定和加密公钥登记，浏览器进入资料创建流程。业务合约地址仍未配置，未广播 BOT Ring 操作，不能视为测试网或主网业务交易已通过。

## 浏览器构建

在 live 执行 npm ci；在 live/privy-client 执行 npm ci；返回 live 执行 npm run build 与 npm start。Privy React SDK 的 permissionless 0.2.x peer dependency 独立安装；业务适配器继续使用已经验证的 permissionless 0.4.1。公开 App ID 保存在忽略提交的 .env；不需要 App Secret。
