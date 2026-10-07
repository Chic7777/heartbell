# Ring 公共测试网执行

此流程只使用 BOT Testnet 968。主网 677、现有 Privy 用户身份与私人记忆不会被修改。

在 live 目录执行：

```sh
node ring-testnet.mjs
node --env-file-if-exists=.env ring-testnet.mjs --run
```

首个命令生成三个独立测试签名账户，检查官方 RPC、Bundler、EntryPoint、Factory、SDK 预测地址与部署 Gas；默认不广播。私钥保存在忽略提交的 `data/ring-testnet/private-wallets.json`，不会输出。测试账户并非 Privy 邮箱用户。

官方水龙头：https://faucet.botchain.ai/basic 。向检查输出中的 deployer 领取测试 BOT；验证码由操作人完成。2026-10-07 首次检查部署与双方账户充值合计约 0.28400888 测试 BOT，当时余额为 0。该值是当时的预估，执行时重新计算；总预估超过 2 测试 BOT 时停止。

`--run` 依次部署 ConsensusBell 和构造时创建的 RingSBT；充值 Alice/Bob 智能账户；通过现有后端和 permissionless SDK 完成 invite、accept、privateVow、confirm、deposit、requestEnd、confirmEnd、withdraw，共八个 UserOperation。每一步验证真实 EntryPoint 回执、至少两个确认及业务事件；同时检查 SBT、唯一绑定、双方 Vow 共识、归档状态与 Bond 提现余额。

交易广播后先保存哈希，再等待确认。重新运行沿用已保存的哈希和后端操作记录，不重复发送已经记录的交易。签名前的准备记录也会持久化；已过期或实际失败的操作会停止并要求检查，不盲目重复业务动作。

公共证据保存在 `data/ring-testnet/evidence.json`，包含真实交易哈希、userOpHash、区块与浏览器链接。只有全部步骤通过才记录 `complete=true`。部署确认后生成 `data/ring-testnet/server.env`，可用以下命令启动已部署测试网合约的产品界面：

```sh
node --env-file-if-exists=.env --env-file=data/ring-testnet/server.env server.mjs
```

这份测试证明与 Privy 双人产品验证分开：两个真实 Privy 用户仍需各自登录、为自己的智能账户领取或充值测试 BOT，并各自确认邀请与接受签名。测试网证据不能替代主网比赛交易。
