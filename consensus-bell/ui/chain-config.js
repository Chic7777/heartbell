/* Consensus Bell · chain configuration
   部署主网后只需要改这一个文件（或用 URL 参数覆盖做本地演练）。

   URL 参数优先级最高：
     ?chain=1                     开启链上模式
     ?anvil=1                     连本地 Anvil (127.0.0.1:8545, chainId 31337) 做全流程演练
     ?as=alice|sophie             多窗口身份（本地演练用不同 anvil 私钥；主网用各自 MetaMask）
     ?contract=0x...              覆盖合约地址
     ?rpc=https://...             覆盖 RPC
*/
(function () {
  const q = new URLSearchParams(location.search);
  const anvil = q.get('anvil') === '1';
  const cfg = {
    on: q.get('chain') === '1' || anvil,
    anvil: anvil,
    chainId: anvil ? 31337 : 677,
    chainName: anvil ? 'Anvil Local (rehearsal)' : 'BOT Chain',
    rpc: anvil ? 'http://127.0.0.1:8545' : (q.get('rpc') || ''),
    contract: q.get('contract') || '',
    explorer: anvil ? '' : 'https://scan.botchain.ai',
    // 主网演示：Sophie 的钱包地址（窗口 B 登录的地址）。本地演练自动用 anvil 第二账号。
    sophieAddress: q.get('sophie') || '',
  };
  window.CB_CONFIG = cfg;
})();
