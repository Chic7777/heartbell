let loading;
export function loadWalletSDK(){
  if(window.ethers)return Promise.resolve(window.ethers);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/ethers.js';script.async=true;
    script.onload=()=>resolve(window.ethers);
    script.onerror=()=>{loading=undefined;script.remove();reject(new Error('钱包组件加载失败，请检查网络后重试。'));};
    document.head.append(script);
  });
  return loading;
}
