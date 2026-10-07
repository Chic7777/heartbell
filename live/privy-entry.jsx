import React, {useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {PrivyProvider, usePrivy, useWallets, useLogin} from '@privy-io/react-auth';
import {connectPrivySession} from './wallet-adapter.mjs';
import {botChain} from './bot-network.mjs';

let bridge;
export function mountPrivy(config) {
  if(bridge)return bridge;
  if(!config.privy?.appId)throw new Error('Privy 邮箱登录尚未配置。');
  const walletConfig=config.wallet;
  if(!walletConfig?.rpc)throw new Error('智能账户网络尚未配置。');
  const mount=document.createElement('div');mount.id='privy-root';document.body.append(mount);
  bridge=new Promise((resolve,reject)=>{
    const root=createRoot(mount);
    const timeout=setTimeout(()=>{root.unmount();mount.remove();bridge=null;reject(new Error('Privy 服务尚未就绪，请检查网络及控制台允许的登录域名后重试。'));},30000);
    root.render(<PrivyProvider appId={config.privy.appId} config={{loginMethods:['email'],appearance:{theme:'light'},embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'}},defaultChain:botChain(walletConfig),supportedChains:[botChain(walletConfig)]}}><Bridge resolve={value=>{clearTimeout(timeout);resolve(value);}} config={walletConfig}/></PrivyProvider>);
  });
  return bridge;
}
function Bridge({resolve,config}) {
  const auth=usePrivy(),wallets=useWallets(),latest=useRef({auth,wallets}),pending=useRef(null);
  latest.current={auth,wallets};
  const {login}=useLogin({onError:error=>{pending.current?.reject(new Error('Privy 登录未完成：'+error));pending.current=null;}});
  useEffect(()=>{
    if(!auth.ready||!wallets.ready)return;
    resolve({
      async connect(api){
        if(pending.current)throw new Error('邮箱登录正在进行中。');
        if(!latest.current.auth.authenticated){
          await new Promise((accept,reject)=>{
            const timeout=setTimeout(()=>{pending.current=null;reject(new Error('登录超时，请重新打开邮箱登录。'));},180000);
            pending.current={accept:()=>{clearTimeout(timeout);accept();},reject:error=>{clearTimeout(timeout);reject(error);}};
            login();
          });
        }
        const embedded=latest.current.wallets.wallets.find(wallet=>wallet.walletClientType==='privy');
        if(!embedded)throw new Error('尚未创建嵌入式钱包，请在 Privy 控制台启用 Ethereum 自动创建钱包后重试。');
        const result=await connectPrivySession({wallet:embedded,config,getAccessToken:()=>latest.current.auth.getAccessToken(),api:(url,body)=>api(url,{method:'POST',body})});
        return {...result,provider:await embedded.getEthereumProvider()};
      },
      async logout(){pending.current?.reject(new Error('登录已退出。'));pending.current=null;await latest.current.auth.logout();}
    });
  },[auth.ready,wallets.ready,resolve,config,login]);
  useEffect(()=>{if(auth.authenticated&&wallets.ready&&wallets.wallets.some(wallet=>wallet.walletClientType==='privy')){pending.current?.accept();pending.current=null;}},[auth.authenticated,wallets.ready,wallets.wallets]);
  return null;
}
