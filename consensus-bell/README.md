# Consensus Bell

后端 v2 的实际实现、API、运行配置和主网接入条件见 [live/BACKEND_V2.md](live/BACKEND_V2.md)。

> Two signatures. One ring. A shared history.
> 恋爱产品在上，协议在底层：链上只保存双方都无法否认的关系事实。

**已验证网络**: BOT 公共测试网 · Chain ID **968**；主网 **677** 尚未部署。真实交易见 [完整验证记录](live/RING_TESTNET_VERIFICATION.md)。

---

## 一、项目介绍

| 项 | 内容 |
|---|---|
| 项目名 | Consensus Bell |
| 目标用户 | 将要开始、或正在走向"在一起"的人 |
| 解决问题 | 一段关系从开始到结束，缺少双方都无法否认的记录 |
| 核心功能 | 三层唯一性（唯一邀请 / 唯一 Ring / 誓言只有对方签名才生效）+ 关系状态机（Active → Ending → Archived，历史不删除）+ 共同时间轴（Vow / Bond）+ 铸造持有物（Witness） |
| **比赛期间完成的工作** | 全部代码为比赛期间新写，无沿用：`ConsensusBell.sol`（11 个外部函数）、Foundry 测试与部署脚本、可交互前端（24 屏）。**认知复用声明**：「主动陪伴」的产品概念源自我们之前的 Mira 项目；多 Agent 协作经验源自 AgentCorp 项目——两者仅作为经验输入，未复用任何代码 |

## 二、代码与运行说明

### 环境依赖

- Node.js ≥ 20（前端本地服务）
- Foundry（`forge` / `forge script`，安装：`curl -L https://foundry.paradigm.xyz | bash && foundryup`）
- 浏览器（Chrome/Edge；钱包交互用 MetaMask 或内置演示钱包）

### 启动步骤

```bash
# 1. 合约
cd contracts
cp .env.example .env          # 填入 BOT_RPC_URL 与已注资的 DEPLOYER_KEY
                             # 固定版本依赖源码已随项目提供
forge build                    # 编译
forge test -vvv                # 全部测试

# 2. 部署到 BOT Chain 主网 (677)
forge script script/Deploy.s.sol --rpc-url bot --broadcast --slow -vvvv

# 3. 前端
cd ../ui
python -m http.server 8765     # 或任意静态服务器
# 打开 http://127.0.0.1:8765
```

### 使用方法（双窗口演示）

1. **窗口 A（Alice）**：Begin → 连接钱包 A → 创建身份 → Choose Path「Find Someone」→ Discover → Ring → Send Invitation
2. **窗口 B（Sophie）**：打开同一地址，连接钱包 B → 收到邀请 → Accept → Sign & Accept（双方签名，Ring 诞生）
3. 窗口 A 发 Vow → 窗口 B Confirm（`vowCount` 只在此刻 +1）→ 双方 Deposit → 任一方 Request End → 对方 Confirm End → Archived → 各自 Withdraw

### 沿用组件来源

- 合约：v2 的 RingSBT / BellPaymaster 使用固定版本 OpenZeppelin 与官方 ERC-4337 v0.7，版本、SHA 和许可证见 `contracts/DEPENDENCIES.md`；ConsensusBell 负责双签关系与 Bond 记账
- 前端（CDN）：Tailwind CSS（cdn.tailwindcss.com）、Phosphor Icons 2.1.2、GSAP 3.x、Noto Serif SC / Inter（Google Fonts）

## 三、部署补充材料（手册 5.3）

| 项 | 链接 |
|---|---|
| 合约地址 | _部署后填写_ |
| 区块浏览器 | `https://scan.botchain.ai/address/<合约地址>` |
| 源码验证 | _部署后在 Explorer 验证并贴链接_ |
| 交易记录（≥5 笔） | ① createInvitation ② acceptInvitation ③ proposeVow+confirmVow ④ deposit ×2 ⑤ requestEnd/confirmEnd |

## 四、路线图

Arcived 不等于消失 —— `Some things end. That doesn't mean they never existed.`

- Ring SBT：不可转移的关系凭证（每端一枚、同 relationId）
- Bell Vault：客户端加密（X25519 + AES-256-GCM）的私密记忆库，链上只有哈希
- Witness：从关系指纹铸造数字/实体持有物

## 五、红线自查

- [ ] Chain ID 677 **主网**部署（非测试网）
- [ ] ≥ 5 笔真实交易，均贴 Explorer 链接
- [ ] Explorer 上源码可读（已验证）
- [ ] 演示视频 3 分钟（每笔关键交易展开到 Explorer）
