/* Consensus Bell · chain adapter
   demo mode（默认）完全不受影响；?chain=1 或 ?anvil=1 时启用真交易。 */
(function () {
  'use strict';
  const CFG = window.CB_CONFIG || { on: false };
  if (!CFG.on || typeof ethers === 'undefined') { window.Chain = { on: () => false }; return; }

  const ABI = [
    'function createInvitation(address invitee)',
    'function acceptInvitation()',
    'function relationOf(address person) view returns (uint256 id,address a,address b,uint64 createdAt,uint64 endingAt,uint8 status,uint32 vowCount)',
    'function pendingInviter(address) view returns (address)',
    'function proposeVow(string text)',
    'function confirmVow(uint256 vowIndex)',
    'function vowTotal(uint256 relationId) view returns (uint256)',
    'function vowAt(uint256 relationId,uint256 idx) view returns (string text,bytes32 contentHash,address proposer,uint64 proposedAt,uint64 confirmedAt,bool confirmed)',
    'function deposit() payable',
    'function bondOf(uint256,address) view returns (uint256)',
    'function requestEnd()',
    'function confirmEnd()',
    'function relations(uint256) view returns (address,address,uint64,uint64,uint8,uint32)',
    'function withdrawFrom(uint256)',
  ];

  // anvil 默认账户（仅本地演练用；主网一律走 MetaMask）
  const ANVIL_KEYS = [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // alice
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // sophie
  ];

  const Chain = {
    on: () => true,
    anvil: !!CFG.anvil,
    address: null,
    signer: null,
    contract: null,
    role: new URLSearchParams(location.search).get('as') || 'alice',
    lastTx: {},

    short() { return this.address ? this.address.slice(0, 6) + '…' + this.address.slice(-4) : ''; },
    explorerTx(hash) { return CFG.explorer ? CFG.explorer + '/tx/' + hash : ''; },

    async connect() {
      if (CFG.anvil) {
        const provider = new ethers.JsonRpcProvider(CFG.rpc);
        const key = ANVIL_KEYS[this.role === 'sophie' ? 1 : 0];
        const wallet = new ethers.Wallet(key, provider);
        this.signer = wallet;
        this.address = wallet.address;
        this._readProvider = provider;
      } else {
        if (!window.ethereum) throw new Error('MetaMask not found');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const net = await provider.getNetwork();
        if (Number(net.chainId) !== Number(CFG.chainId)) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x' + Number(CFG.chainId).toString(16),
                chainName: CFG.chainName,
                rpcUrls: [CFG.rpc],
                nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
              }],
            });
          } catch (e) { throw new Error('请切换到 ' + CFG.chainName + ' (ID ' + CFG.chainId + ')'); }
        }
        this.signer = await provider.getSigner();
        this.address = await this.signer.getAddress();
        this._readProvider = provider;
      }
      if (!CFG.contract) throw new Error('contract address missing in chain-config');
      this.contract = new ethers.Contract(CFG.contract, ABI, this.signer);
      // anvil 演练：sophie 地址自动取第二账号
      if (CFG.anvil && !CFG.sophieAddress) {
        const w2 = new ethers.Wallet(ANVIL_KEYS[1]).address;
        CFG.sophieAddress = this.role === 'sophie' ? new ethers.Wallet(ANVIL_KEYS[0]).address : w2;
      }
      return this.address;
    },

    peerAddress() { return CFG.sophieAddress; },

    async send(fn, args, value) {
      const tx = await this.contract[fn](...(args || []), value ? { value } : {});
      this.lastTx[fn] = tx.hash;
      await tx.wait(1);
      return tx.hash;
    },

    async call(fn, ...args) {
      return this.contract[fn](...args);
    },

    // read helpers -------------------------------------------------------
    async myRelation() {
      const r = await this.call('relationOf', this.address);
      return { id: r[0], a: r[1], b: r[2], createdAt: Number(r[3]), endingAt: Number(r[4]), status: Number(r[5]), vowCount: Number(r[6]) };
    },
    async pendingInviterFor(addr) { return this.call('pendingInviter', addr); },
    async bondSum(id) {
      const rel = await this.myRelation();
      const peer = rel.a.toLowerCase() === this.address.toLowerCase() ? rel.b : rel.a;
      const mine = await this.call('bondOf', id, this.address);
      const theirs = await this.call('bondOf', id, peer);
      return Number(mine + theirs) / 1e18;
    },
    async vows(id) {
      const total = Number(await this.call('vowTotal', id));
      const out = [];
      for (let i = 0; i < total; i++) {
        const v = await this.call('vowAt', id, i);
        out.push({ idx: i, text: v[0], hash: v[1], proposer: v[2], proposedAt: Number(v[3]), confirmedAt: Number(v[4]), confirmed: v[5] });
      }
      return out;
    },
  };

  window.Chain = Chain;
})();
