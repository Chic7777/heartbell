import { Contract, JsonRpcProvider, isAddress, ZeroAddress } from 'ethers';
export const ABI = [
  'function relationOf(address) view returns(uint256,address,address,uint64,uint64,uint8,uint32)',
  'function relations(uint256) view returns(address,address,uint64,uint64,uint8,uint32)',
  'function pendingInviter(address) view returns(address)',
  'function pendingInvitee(address) view returns(address)',
  'function invitationExpiresAt(address) view returns(uint64)',
  'function endingRequester(uint256) view returns(address)',
  'function vowTotal(uint256) view returns(uint256)',
  'function vowAt(uint256,uint256) view returns(string,bytes32,address,uint64,uint64,bool)',
  'function bondOf(uint256,address) view returns(uint256)',
  'function createInvitation(address)', 'function acceptInvitation()',
  'function cancelInvitation()', 'function declineInvitation()',
  'function proposePrivateVow(bytes32)', 'function confirmVow(uint256)',
  'function deposit() payable', 'function requestEnd()', 'function confirmEnd()',
  'function finalizeEnd(uint256)', 'function withdrawFrom(uint256)',
  'event InvitationCreated(address indexed inviter,address indexed invitee)',
  'event InvitationCancelled(address indexed inviter,address indexed invitee)',
  'event RelationCreated(uint256 indexed relationId,address indexed a,address indexed b,uint64 at)',
  'event VowProposed(uint256 indexed relationId,uint256 indexed vowIndex,address indexed proposer,bytes32 contentHash)',
  'event VowConfirmed(uint256 indexed relationId,uint256 indexed vowIndex,address indexed confirmer,uint32 vowCount)',
  'event EndRequested(uint256 indexed relationId,address indexed by,uint64 endingAt)',
  'event RelationArchived(uint256 indexed relationId,address indexed by,bool mutual)',
  'event Deposited(uint256 indexed relationId,address indexed person,uint256 amount,uint256 total)',
  'event Withdrawn(uint256 indexed relationId,address indexed person,uint256 amount)'
];
export function createChain(config) {
  const enabled = !!config.rpc && isAddress(config.contract);
  const provider = enabled ? new JsonRpcProvider(config.rpc) : null;
  const bell = enabled ? new Contract(config.contract,ABI,provider) : null;
  async function ready() {
    if (!bell) throw new Error('BOT RPC and deployed contract are not configured');
    if ((await provider.getNetwork()).chainId !== BigInt(config.chainId)) throw new Error('RPC chain ID mismatch');
    if (await provider.getCode(config.contract) === '0x') throw new Error('No contract at the configured address');
  }
  return {
    enabled, bell, provider, ready,
    async member(address,id) {
      await ready(); const r = await bell.relations(id);
      if (![r[0],r[1]].some(p=>p.toLowerCase()===address.toLowerCase())) throw new Error('This Ring is not yours');
      return r;
    },
    async snapshot(address,archivedId='0') {
      await ready();
      const current = await bell.relationOf(address);
      const id = archivedId !== '0' ? BigInt(archivedId) : current[0];
      const inviter = await bell.pendingInviter(address);
      if (id === 0n) {
        const outgoing=await bell.pendingInvitee(address),block=await provider.getBlock('latest');
        if(inviter!==ZeroAddress){const expires=Number(await bell.invitationExpiresAt(address));if(expires>block.timestamp)return {id:'0',status:'INVITED',inviter,expires};}
        if(outgoing!==ZeroAddress){const expires=Number(await bell.invitationExpiresAt(outgoing));if(expires>block.timestamp)return {id:'0',status:'WAITING',invitee:outgoing,expires};}
        return {id:'0',status:'NONE'};
      }
      const r = await this.member(address,id);
      const total = Number(await bell.vowTotal(id));
      const vows = [];
      for(let i=0;i<total;i++){const v=await bell.vowAt(id,i);vows.push({index:i,text:v[0],hash:v[1],by:v[2],at:Number(v[3]),confirmedAt:Number(v[4]),confirmed:v[5]});}
      return {id:id.toString(),a:r[0],b:r[1],createdAt:Number(r[2]),endingAt:Number(r[3]),status:['ACTIVE','ENDING','ARCHIVED'][Number(r[4])],vowCount:Number(r[5]),requester:await bell.endingRequester(id),balances:{[r[0]]:(await bell.bondOf(id,r[0])).toString(),[r[1]]:(await bell.bondOf(id,r[1])).toString()},vows,block:await provider.getBlockNumber()};
    }
  };
}
