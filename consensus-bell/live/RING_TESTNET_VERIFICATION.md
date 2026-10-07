# Ring 公共测试网真实执行结果

链：BOT Testnet 968。完成时间：2026-10-07T03:49:41.777Z。

合约：[0x74aAC8f21131c5655d3A904696AB1B99Fa8C88Fa](https://scan.bohr.life/address/0x74aAC8f21131c5655d3A904696AB1B99Fa8C88Fa)。RingSBT：[0xF700977320C50EcE4c22E72ec80a8596Dec8E20D](https://scan.bohr.life/address/0xF700977320C50EcE4c22E72ec80a8596Dec8E20D)。

两个独立测试签名钱包通过现有后端、permissionless SDK、官方 Bundler 和 EntryPoint v0.7 完成八步；参与者并非两位 Privy 邮箱用户。

| 操作 | 状态 | 真实交易 | 区块 |
|---|---|---|---|
| invite | CONFIRMED | [0x4efae55884…](https://scan.bohr.life/tx/0x4efae558844ecd698cafd5688a3e7fb97d92103ab27a77432b8a1153346dabc5) | 25980012 |
| accept | CONFIRMED | [0x91b41e1ca8…](https://scan.bohr.life/tx/0x91b41e1ca8c191bc48848e34c6ed6572eea58ac42b1888edd3dccbcec8af497f) | 25980025 |
| vow | CONFIRMED | [0xe456e59710…](https://scan.bohr.life/tx/0xe456e597106b18cb8669cb73ce3e67b73c1d95b6d86d1a5e69ae5668045d40fe) | 25980358 |
| confirm-vow | CONFIRMED | [0xa469eeb066…](https://scan.bohr.life/tx/0xa469eeb066a336c41e83f34f49e809130c36f5bf749791e02d834ff8b326e939) | 25980585 |
| bond | CONFIRMED | [0xd0f27e297a…](https://scan.bohr.life/tx/0xd0f27e297ad99f984683ea8c8a43b9f7a84fab3ae4e14fd2feb6746134b9acb3) | 25980598 |
| request-end | CONFIRMED | [0x16eeaaa8c2…](https://scan.bohr.life/tx/0x16eeaaa8c29233b37e7401a57e1a114ecc482a13a193677f0a58a8ce4d206c48) | 25980612 |
| confirm-end | CONFIRMED | [0x852418b5a8…](https://scan.bohr.life/tx/0x852418b5a8eabc24143547e02506fce337db3b96cac4a96c473c5740ded06a84) | 25980626 |
| withdraw | CONFIRMED | [0x47e18a2800…](https://scan.bohr.life/tx/0x47e18a28002edd3ad7ac1907586a6dfa9fc07c377bf50f459a4b8ea8c7a5a4f6) | 25980639 |

Ring #1 已归档；双方 activeRelation=0，Vow 共识计数=1，双方 Bond 余额=0，双方 SBT 各保留1枚。唯一绑定以公共 RPC eth_call 的实际回退验证。每个成功 UserOperation 至少两次确认，userOpHash 与交易哈希分别保存。主网677未广播。

实际兼容性修复：BOT RPC 不支持 EIP-1559 费用报价时，部署与充值使用 gasPrice 的 legacy 交易；部署广播回包中断时从真实区块恢复交易，后续先持久化签名交易哈希再广播；对已部署账户，用 eth_estimateGas 补足 Bundler 低估的 callGas；为真实签名验证增加20%与10000 Gas余量。失败 Vow 的链上回执及 AA26 的提交拒绝均保留在公共证据中，没有算入八笔成功操作。

后端完整回归59/59通过；Foundry测试通过。产品 .env 已指向上述测试网合约。原部署与运行证据在 data/ring-testnet/evidence.json；供查看的无私钥版本在 .omo/evidence/ring-testnet/public-verification.json。
