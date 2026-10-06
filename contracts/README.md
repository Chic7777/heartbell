# 智能合约工作区

HeartbellMemories.sol 提供同一份纪念的双人链上确认：两个不同钱包各调用一次 approveMemory，两人都批准后产生 MemoryConfirmed 事件。当前未部署。

运行 npm run contracts:compile 检查合约，产物在 contracts/artifacts（忽略，不提交）。合约无构造参数，编译 EVM 目标 Paris。部署后将地址填入 .env.local 的 NEXT_PUBLIC_MEMORY_CONTRACT_ADDRESS，并重新构建网页。正式流程和测试任务详见 docs/WEB3.md。

BOT Chain 网络与合约部署方式需实施时核验。不要假设目标链已部署 EAS。主网部署由团队明确安排，私钥不得写入仓库。

合约只验证钱包同意，不验证现实相遇或单身。钱包地址、关联及交易时间公开，不具备 ZK 隐私。编译通过不等于执行测试或安全审计通过。
