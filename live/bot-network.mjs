import {defineChain} from 'viem';

const entryPoint='0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const factory='0xBC88d6012b3bf8426C2851d3798cEB5257658332';
export const BOT_NETWORKS=Object.freeze({
  677:Object.freeze({chainId:677,name:'BOT Chain Mainnet',rpc:'https://rpc.botchain.ai',bundler:'https://bundler.botchain.ai/rpc/',explorer:'https://scan.botchain.ai',entryPoint,factory}),
  968:Object.freeze({chainId:968,name:'BOT Chain Testnet',rpc:'https://rpc.bohr.life',bundler:'https://bundler.bohr.life/rpc/',explorer:'https://scan.bohr.life',entryPoint,factory})
});
export function botChain(config){
  return defineChain({id:config.chainId,name:config.name??'Consensus Bell chain',nativeCurrency:{name:'BOT',symbol:'BOT',decimals:18},rpcUrls:{default:{http:[config.rpc]}},...(config.explorer?{blockExplorers:{default:{name:'BOT Explorer',url:config.explorer}}}:{}),testnet:config.chainId===968});
}
