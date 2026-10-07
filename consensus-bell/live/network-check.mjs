import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {BOT_NETWORKS} from './bot-network.mjs';
import {createRpc,readContract,factoryABI,addressSchema} from './aa-protocol.mjs';
import {createWalletAdapter} from './wallet-adapter.mjs';

export async function checkNetwork(input){
  const network=BOT_NETWORKS[Number(input.chainId??968)];
  if(!network)throw new Error('Choose BOT Testnet968 or Mainnet677');
  const config={...network,...input,chainId:network.chainId};
  const rpc=createRpc(config.rpc),bundler=createRpc(config.bundler);
  const [chainId,bundlerChainId,supported,entryCode,factoryCode]=await Promise.all([rpc('eth_chainId'),bundler('eth_chainId'),bundler('eth_supportedEntryPoints'),rpc('eth_getCode',[config.entryPoint,'latest']),rpc('eth_getCode',[config.factory,'latest'])]);
  if(BigInt(chainId)!==BigInt(config.chainId)||BigInt(bundlerChainId)!==BigInt(config.chainId))throw new Error('RPC/Bundler network mismatch');
  if(!Array.isArray(supported)||!supported.some(address=>address.toLowerCase()===config.entryPoint.toLowerCase()))throw new Error('Bundler does not support the configured EntryPoint');
  if(!entryCode||entryCode==='0x'||!factoryCode||factoryCode==='0x')throw new Error('Missing Factory or EntryPoint bytecode');
  const owner=addressSchema.parse(input.owner??'0x000000000000000000000000000000000000dEaD');
  const adapter=await createWalletAdapter({ownerAddress:owner,config,salt:'0',provider:{request:async({method})=>{
    if(method==='eth_accounts')return [owner];if(method==='eth_chainId')return chainId;
    throw new Error('Read-only network check cannot sign');
  }}});
  const predicted=await readContract(rpc,config.factory,factoryABI,'getAddress',[owner,0]);
  return {chainId:config.chainId,rpc:config.rpc,bundler:config.bundler,entryPoint:config.entryPoint,factory:config.factory,owner,smartAccount:adapter.address,factoryPrediction:predicted,sdkMatchesFactory:adapter.address.toLowerCase()===predicted.toLowerCase(),mode:'read-only',transactionsSubmitted:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const network=BOT_NETWORKS[Number(process.env.BOT_CHAIN_ID||968)];console.log(JSON.stringify(await checkNetwork({chainId:Number(process.env.BOT_CHAIN_ID||968),rpc:process.env.BOT_RPC_URL||network?.rpc,bundler:process.env.BOT_BUNDLER_URL||network?.bundler,entryPoint:process.env.BOT_ENTRYPOINT_ADDRESS||network?.entryPoint,factory:process.env.BOT_ACCOUNT_FACTORY_ADDRESS||network?.factory,owner:process.env.BELL_CHECK_OWNER}),null,2));}
  catch(error){if(error instanceof Error)console.error(error.message);else throw error;process.exitCode=1;}
}
