import {createPublicClient,createWalletClient,custom,http,getAddress,parseAbi} from 'viem';
import {toAccount} from 'viem/accounts';
import {getUserOperationHash} from 'viem/account-abstraction';
import {toSimpleSmartAccount} from 'permissionless/accounts';
import {z} from 'zod';
import {botChain} from './bot-network.mjs';
import {addressSchema,opSchema} from './aa-protocol.mjs';

const configSchema=z.object({chainId:z.number().int().positive(),rpc:z.url(),entryPoint:addressSchema,factory:addressSchema}).passthrough();
const factoryAbi=parseAbi(['function getAddress(address,uint256) view returns(address)']);
const accountAbi=parseAbi(['function owner() view returns(address)','function entryPoint() view returns(address)']);
const integerFields=['nonce','callGasLimit','verificationGasLimit','preVerificationGas','maxFeePerGas','maxPriorityFeePerGas','paymasterVerificationGasLimit','paymasterPostOpGasLimit'];
const fail=message=>{throw new Error(message);};
export function sdkOperation(input){
  const parsed=opSchema.parse(input);
  return Object.fromEntries(Object.entries(parsed).map(([key,value])=>[key,integerFields.includes(key)?BigInt(value):value]));
}
export async function createWalletAdapter({provider,ownerAddress,config,salt='0'}){
  config=configSchema.parse(config);
  const owner=addressSchema.parse(ownerAddress),index=BigInt(z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(v=>BigInt(v)<2n**256n).parse(salt));
  const chain=botChain(config),publicClient=createPublicClient({chain,transport:http(config.rpc,{retryCount:0,timeout:10000})});
  async function assertProvider(){
    const [accounts,chainId]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
    if(!Array.isArray(accounts)||!accounts.some(value=>typeof value==='string'&&getAddress(value)===owner))fail('Embedded signer does not control the selected Owner');
    if(BigInt(chainId)!==BigInt(config.chainId))fail('Embedded signer is on another chain; switch its network first');
  }
  await assertProvider();
  if(await publicClient.getChainId()!==config.chainId)fail('Public RPC chain ID mismatch');
  const codes=await Promise.all([config.factory,config.entryPoint].map(address=>publicClient.getCode({address})));
  if(codes.some(code=>!code||code==='0x'))fail('Configured Factory or EntryPoint is not deployed');
  const ownerClient=createWalletClient({account:owner,chain,transport:custom(provider)});
  const signer=toAccount({address:owner,signMessage:async({message})=>{await assertProvider();return ownerClient.signMessage({message});},signTypedData:async()=>fail('SimpleAccount v0.7 signs UserOperation messages'),signTransaction:async()=>fail('This adapter does not sign EOA transactions')});
  const account=await toSimpleSmartAccount({client:publicClient,owner:signer,entryPoint:{address:config.entryPoint,version:'0.7'},factoryAddress:config.factory,index});
  const predicted=await publicClient.readContract({address:config.factory,abi:factoryAbi,functionName:'getAddress',args:[owner,index]});
  if(getAddress(account.address)!==getAddress(predicted))fail('SDK account differs from the configured Factory prediction');
  const code=await publicClient.getCode({address:account.address});
  if(code&&code!=='0x'){
    const [actualOwner,actualEntryPoint]=await Promise.all(['owner','entryPoint'].map(functionName=>publicClient.readContract({address:account.address,abi:accountAbi,functionName})));
    if(getAddress(actualOwner)!==owner||getAddress(actualEntryPoint)!==config.entryPoint)fail('Deployed smart account binding does not match');
  }
  return {
    owner,address:account.address,chainId:config.chainId,account,
    async signChallenge(message){await assertProvider();return ownerClient.signMessage({message});},
    async signPrepared(prepared){
      await assertProvider();
      if(prepared.chainId!==config.chainId||getAddress(prepared.entryPoint)!==config.entryPoint)fail('Prepared operation belongs to another network or EntryPoint');
      const operation=sdkOperation(prepared.userOperation);
      if(getAddress(operation.sender)!==getAddress(account.address))fail('Prepared sender is not your smart account');
      const hash=getUserOperationHash({chainId:config.chainId,entryPointAddress:config.entryPoint,entryPointVersion:'0.7',userOperation:operation});
      if(hash.toLowerCase()!==prepared.userOpHash.toLowerCase())fail('Prepared operation hash does not match its fields');
      const signature=await account.signUserOperation({...operation,chainId:config.chainId});
      return {id:prepared.id,userOperation:{...prepared.userOperation,signature},userOpHash:hash};
    }
  };
}
export async function createPrivyAdapter({wallet,config,salt}){
  if(wallet?.walletClientType!=='privy')fail('Choose the authenticated Privy embedded wallet');
  await wallet.switchChain(config.chainId);
  return createWalletAdapter({provider:await wallet.getEthereumProvider(),ownerAddress:wallet.address,config,salt});
}

export async function connectPrivySession({wallet,config,salt='0',getAccessToken,api}){
  const token=await getAccessToken();
  if(typeof token!=='string'||!token)fail('Privy login is required before connecting a Bell session');
  const adapter=await createPrivyAdapter({wallet,config,salt});
  const challenge=await api('/api/auth/challenge',{address:adapter.owner});
  const session=await api('/auth/session',{token,id:challenge.id,signature:await adapter.signChallenge(challenge.message)});
  const ownership=await api('/api/wallets/challenge',{salt});
  const binding=await api('/api/wallets/initialize',{id:ownership.id,signature:await adapter.signChallenge(ownership.message)});
  if(getAddress(binding.sender)!==getAddress(adapter.address)||getAddress(binding.owner)!==adapter.owner)fail('Backend and SDK smart-account bindings differ');
  return {adapter,session,binding};
}
