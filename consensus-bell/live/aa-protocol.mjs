import { AbiCoder, Interface, ZeroAddress, concat, getAddress, isAddress, keccak256, toBeHex, toQuantity, zeroPadValue } from 'ethers';
import { z } from 'zod';
import { ABI } from './chain.mjs';

export const AA_DEFAULTS = Object.freeze({chainId:677,rpc:'https://rpc.botchain.ai',bundler:'https://bundler.botchain.ai/rpc',entryPoint:'0x0000000071727De22E5E9d8BAf0edAc6f37da032',factory:'0xBC88d6012b3bf8426C2851d3798cEB5257658332'});
export const factoryABI = new Interface(['function getAddress(address,uint256) view returns(address)','function createAccount(address,uint256) returns(address)']);
export const accountABI = new Interface(['function execute(address,uint256,bytes)','function owner() view returns(address)','function entryPoint() view returns(address)']);
export const entryABI = new Interface(['function getNonce(address,uint192) view returns(uint256)','event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
export const bellABI = new Interface(ABI);
export const addressSchema = z.string().refine(isAddress).transform(getAddress);
export const hashSchema = z.string().regex(/^0x[\da-fA-F]{64}$/).transform(v=>v.toLowerCase());
const bytes = z.string().max(20000).regex(/^0x(?:[\da-fA-F]{2})*$/).transform(v=>v.toLowerCase());
const quantity = z.string().regex(/^0x(?:0|[1-9a-fA-F][\da-fA-F]*)$/).refine(v=>BigInt(v)<2n**256n);
export const sponsorSchema = z.object({paymaster:addressSchema.refine(v=>v!==ZeroAddress),paymasterVerificationGasLimit:quantity,paymasterPostOpGasLimit:quantity,paymasterData:bytes}).strict();
export const opSchema = z.object({sender:addressSchema,nonce:quantity,factory:addressSchema.optional(),factoryData:bytes.optional(),callData:bytes,callGasLimit:quantity,verificationGasLimit:quantity,preVerificationGas:quantity,maxFeePerGas:quantity,maxPriorityFeePerGas:quantity,paymaster:addressSchema.optional(),paymasterVerificationGasLimit:quantity.optional(),paymasterPostOpGasLimit:quantity.optional(),paymasterData:bytes.optional(),signature:bytes}).strict().superRefine((v,c)=>{
  if (!!v.factory !== (v.factoryData!==undefined)) c.addIssue({code:'custom',message:'Factory fields must be paired'});
  const fields=[v.paymasterVerificationGasLimit,v.paymasterPostOpGasLimit,v.paymasterData];
  if (v.paymaster ? fields.some(f=>f===undefined)||v.paymaster===ZeroAddress : fields.some(f=>f!==undefined)) c.addIssue({code:'custom',message:'Paymaster fields must be complete'});
  for(const key of ['callGasLimit','verificationGasLimit','maxFeePerGas','maxPriorityFeePerGas','paymasterVerificationGasLimit','paymasterPostOpGasLimit']) if(v[key] && BigInt(v[key])>=2n**128n)c.addIssue({code:'custom',message:`${key} exceeds uint128`});
  if(BigInt(v.maxPriorityFeePerGas)>BigInt(v.maxFeePerGas))c.addIssue({code:'custom',message:'Priority fee exceeds maximum fee'});
});
const uint = z.string().regex(/^(0|[1-9]\d*)$/).max(78).refine(v=>BigInt(v)<2n**256n);
export const actionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('invite'),invitee:addressSchema}).strict(),
  z.object({action:z.literal('accept')}).strict(),
  z.object({action:z.literal('privateVow'),contentHash:hashSchema.refine(v=>BigInt(v)!==0n)}).strict(),
  z.object({action:z.literal('confirm'),vowIndex:uint}).strict(),
  z.object({action:z.literal('deposit'),value:uint.refine(v=>BigInt(v)>0n)}).strict(),
  z.object({action:z.literal('withdraw'),relationId:uint.refine(v=>BigInt(v)>0n)}).strict(),
  z.object({action:z.literal('cancel')}).strict(),
  z.object({action:z.literal('decline')}).strict(),
  z.object({action:z.literal('end'),mode:z.enum(['request','confirm','finalize']),relationId:uint.optional()}).strict().refine(v=>v.mode==='finalize'?v.relationId!==undefined&&BigInt(v.relationId)>0n:v.relationId===undefined,{message:'Only finalize requires relationId'})
]);
export function encodeAction(input,contract,sender){
  const action=actionSchema.parse(input);let name,args=[],value=0n;
  switch(action.action){
    case 'invite': if(action.invitee===sender)throw new Error('Cannot invite your own account');name='createInvitation';args=[action.invitee];break;
    case 'accept':name='acceptInvitation';break;
    case 'privateVow':name='proposePrivateVow';args=[action.contentHash];break;
    case 'confirm':name='confirmVow';args=[action.vowIndex];break;
    case 'deposit':name='deposit';value=BigInt(action.value);break;
    case 'withdraw':name='withdrawFrom';args=[action.relationId];break;
    case 'cancel':name='cancelInvitation';break;
    case 'decline':name='declineInvitation';break;
    case 'end':name={request:'requestEnd',confirm:'confirmEnd',finalize:'finalizeEnd'}[action.mode];if(action.mode==='finalize')args=[action.relationId];break;
  }
  return {action,callData:accountABI.encodeFunctionData('execute',[contract,value,bellABI.encodeFunctionData(name,args)])};
}
const packedPair=(high,low)=>zeroPadValue(toBeHex((BigInt(high)<<128n)|BigInt(low)),32);
export function userOpHash(input,entryPoint,chainId){
  const op=opSchema.parse(input),coder=AbiCoder.defaultAbiCoder();
  const initCode=op.factory?concat([op.factory,op.factoryData]):'0x';
  const paymaster=op.paymaster?concat([op.paymaster,zeroPadValue(toBeHex(BigInt(op.paymasterVerificationGasLimit)),16),zeroPadValue(toBeHex(BigInt(op.paymasterPostOpGasLimit)),16),op.paymasterData]):'0x';
  const hash=keccak256(coder.encode(['address','uint256','bytes32','bytes32','bytes32','uint256','bytes32','bytes32'],[op.sender,op.nonce,keccak256(initCode),keccak256(op.callData),packedPair(op.verificationGasLimit,op.callGasLimit),op.preVerificationGas,packedPair(op.maxPriorityFeePerGas,op.maxFeePerGas),keccak256(paymaster)]));
  return keccak256(coder.encode(['bytes32','address','uint256'],[hash,entryPoint,chainId]));
}
export function sameOperation(a,b){
  a=opSchema.parse(a);b=opSchema.parse(b);
  return Object.keys(a).filter(k=>k!=='signature').every(k=>a[k]?.toLowerCase()===b[k]?.toLowerCase())&&Object.keys(b).filter(k=>k!=='signature').every(k=>a[k]?.toLowerCase()===b[k]?.toLowerCase());
}
export function createRpc(url){
  let id=0;
  return async(method,params=[])=>{
    const requestId=++id;
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
    const data=await response.json();
    if(data.jsonrpc!=='2.0'||data.id!==requestId)throw new Error(`RPC ${method} returned an invalid response`);
    if(data.error&&Number.isInteger(data.error.code))throw new RpcError(method,data.error.code,data.error.message||'RPC rejected request');
    if(data.error||!Object.hasOwn(data,'result'))throw new Error(`RPC ${method} returned no valid result`);
    return data.result;
  };
}
export class RpcError extends Error{
  constructor(method,code,message){super(`RPC ${method} failed: ${message}`);this.name='RpcError';this.method=method;this.code=code;}
}
export async function readContract(rpc,address,abi,name,args=[]){
  const result=await rpc('eth_call',[{to:address,data:abi.encodeFunctionData(name,args)},'latest']);
  return abi.decodeFunctionResult(name,result)[0];
}
export { toQuantity };
