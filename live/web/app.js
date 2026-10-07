import {view,escape,short,btn,head,input,notice,submit} from './view.js';
import {initializeEncryption,encrypt,decrypt,clearEncryption} from './crypto.js';
import {candidateDetail} from './radar.js';
import {createJourneyActions} from './journey-actions.js';
import {carryIdentityDraft} from './onboarding.js';
import {walletAction,chainIdentity,encryptionPeer} from './aa-action.js';
import {icon,avatar,agentCard,proofSheet,transactionStepper} from './components.js';
import {loadWalletSDK} from './wallet-sdk.js';
let BrowserProvider,Contract,parseEther,formatEther,keccak256,toUtf8Bytes,ZeroAddress,isAddress;
async function walletSDK(){const sdk=await loadWalletSDK();({BrowserProvider,Contract,parseEther,formatEther,keccak256,toUtf8Bytes,ZeroAddress,isAddress}=sdk);state.formatAmount=formatEther;}

const state={user:null,profile:null,journey:null,relation:null,route:'home',memories:[],proofs:[],candidates:[],radar:null,radarFilters:{city:'',intention:'',radius:0},radarError:'',radarScanning:false,radarExpanded:false,history:[],config:null,error:'',balance:'0',formatAmount:()=> '0'};
state.preview=new URLSearchParams(location.search).get('preview')==='1';
Object.assign(state,{identityStep:1,identityDraft:null,previewProfile:null,previewMemories:[],storyFilter:'all',storyQuery:'',vowFilter:'all',witnessKind:'digital',material:'Rose Gold',witnessTab:'digital',witnessDesign:null,chatMessages:[],chatConnection:null,ephemeralRoom:false});
const routeNames=['home','gateway','path','direct-bind','identity','discover','echo-results','echo-detail','echo-chat','invite-page','invitation-preview','waiting','acceptance','ceremony','story','vows','bond','vault','witness','witness-detail','witness-configurator','me','privacy','relationship-settings','archived','proofs','history','journey-index'];
// Lifecycle phases per the UI master spec: before an ACTIVE Romantic Ring the
// experience is linear and the couple navigation does not exist yet.
const PHASE_B_STATUS=['ACTIVE','ENDING','ARCHIVED'];
const PHASE_B_ONLY=['vault','witness','witness-detail','witness-configurator','privacy','relationship-settings','archived','proofs','history'];
const phaseB=()=>PHASE_B_STATUS.includes(state.relation?.status);
const requestedRoute=location.hash.slice(1);if(routeNames.includes(requestedRoute))state.route=requestedRoute;
let provider,signer,privyBridge,privyAdapter,busy=false,epoch=0,radarRevision=0,refreshing=false,selectedArchive='0',focusBeforeDialog;
const app=document.querySelector('#app'),tabs=document.querySelector('#tabs'),dialog=document.querySelector('#sheet');
export async function api(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers},body:options.body?JSON.stringify(options.body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'请求失败');return data;
}
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('on');setTimeout(()=>el.classList.remove('on'),4000);}
function walletDetails(){
  if(!state.user||state.preview||state.authProvider!=='privy'||!['me','proofs'].includes(state.route))return '';
  return `<details class="card"><summary>我的真实钱包 · Privy</summary><p>邮箱签名钱包</p><p class="small">${escape(state.user)}</p><p>Ring 智能账户 · 链 ${escape(state.config.chainId)}</p><p class="small">${escape(state.chainAddress)}</p>${notice('邀请对方时使用智能账户地址。操作由此账户支付 BOT Gas；需要先充值。')}${!privyAdapter?btn('重新连接邮箱签名器','login-privy','','light'):''}${(state.userOperations||[]).map(op=>`<div class="proof-row"><span>${escape(op.action.action)} · ${escape(op.status)}</span><span>${escape(short(op.transactionHash||op.userOpHash))}</span></div>`).join('')}${btn('刷新链上回执','refresh','','light')}</details>`;
}
function navRoute(){if(['path','direct-bind','identity','discover','invite-page','invitation-preview','ceremony','journey-index','echo-results','echo-detail','echo-chat','waiting','acceptance'].includes(state.route))return 'home';if(['vault','witness','witness-detail','witness-configurator','privacy','proofs','history','relationship-settings','archived'].includes(state.route))return 'me';return state.route;}
function tabIcon(route){const paths={home:'M3 10l9-7 9 7v10H3z M9 20v-7h6v7',story:'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h4',vows:'M12 21S2 14 2 7a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 14-10 14z',bond:'M3 8h18v12H3z M8 8V4h8v4 M3 13h18',me:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2'};return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[route]}"></path></svg>`;}
function render(){document.title='Consensus Bell · '+({gateway:'Forever Begins',home:'Our Ring',story:'Our Story',vows:'Our Vows',bond:'Our Bond',me:'Your Space'}[state.route]||state.route);document.body.dataset.shell=(state.user||state.preview)?'app':'gateway';app.dataset.route=state.route;document.body.dataset.route=state.route;const profileControl=document.querySelector('.stitch-account');if(profileControl){const photo=state.profile?.avatarUrl;profileControl.innerHTML=photo&&photo.startsWith('https://')?'<img data-avatar-fallback="'+escape(Array.from(state.profile?.name||'?')[0])+'" src="'+escape(photo)+'" alt="我的头像" referrerpolicy="no-referrer">':icon('user');}app.innerHTML='<div class="page">'+(state.transaction?transactionStepper(state.transaction):'')+view(state)+(['story','vows'].includes(state.route)?(state.agentDraft?agentCard(state.agentDraft.text)+btn('撤回这次授权','agent-revoke','','light'):state.user&&!state.preview?'<div class="actions">'+btn(icon('spark')+' 请 Bell 帮我整理草稿','agent-request','','light')+'</div>':''):'')+walletDetails()+(state.user&&!state.preview&&state.route==='me'?'<div class="actions">'+btn('登记本机加密密钥','setup-keys','','light')+'</div>':'')+'</div>';document.querySelector('#account').textContent=state.preview?'访客浏览 · 未登录':state.user?short(state.user):'尚未登录';document.querySelector('#wallet').textContent=state.user?'退出':'连接钱包';/* NAV DECISION(user,2026-10-07): 登录即显示底部导航；Phase A 用户也要 Story/Vow/Bond/Me 入口，Phase B 页面由 navigate() 诚实守卫。勿改回 &&phaseB()。 */ tabs.innerHTML=(state.user||(state.preview&&['story','vows','bond','me','vault','witness','witness-detail','witness-configurator','privacy','relationship-settings','archived','proofs','history'].includes(state.route)))?['home','story','vows','bond','me'].map((r,i)=>`<button data-action="${r}" class="${navRoute()===r?'active':''}" ${navRoute()===r?'aria-current="page"':''}>${tabIcon(r)}<span>${['Ring','Story','Vow','Bond','Me'][i]}</span></button>`).join(''):'';if(busy)document.querySelectorAll('button').forEach(b=>b.disabled=true);}
function navigate(route){
  // Phase A guard: couple-only pages belong to the post-Ring lifecycle.
  if(!state.preview&&PHASE_B_ONLY.includes(route)&&!phaseB()){toast('先建立你们的 Romantic Ring，这里才会打开。');route='path';}
  if(dialog.open)dialog.close();state.route=route;history.replaceState(null,'','#'+route);render();app.scrollTop=0;app.focus({preventScroll:true});
}
function progress(stage,values={}){state.transaction={...state.transaction,stage,...values};const current=app.querySelector('.bell-transaction');if(current)current.outerHTML=transactionStepper(state.transaction);else app.querySelector('.page')?.insertAdjacentHTML('afterbegin',transactionStepper(state.transaction));}
function modal(title,body){focusBeforeDialog=document.activeElement;dialog.innerHTML=`<div class="dialog-top"><h2 id="sheet-title">${title}</h2><button class="icon" data-action="close" aria-label="关闭">×</button></div>${body}`;dialog.showModal();}
dialog.addEventListener('close',()=>{if(focusBeforeDialog?.isConnected)focusBeforeDialog.focus();});
const journey=createJourneyActions({state,navigate,modal,toast,api,refresh,saveContent,fileMedia,memoryForm,helpers:{escape,short,btn,head,input,notice,submit}});
function resetJourney(){Object.assign(state,{identityStep:1,identityDraft:null,previewProfile:null,previewMemories:[],storyFilter:'all',storyQuery:'',vowFilter:'all',material:'Rose Gold',witnessKind:'digital',witnessTab:'digital',witnessDesign:null,echoAddress:null,chatDraft:'',chatDraftPeer:null,chatMessages:[],chatConnection:null,ephemeralRoom:false,connections:[],transaction:null,agentDraft:null,agentGrant:null,agentKind:null});}
const peer=()=>encryptionPeer(state.relation,state.user,chainIdentity(state));
const scope=()=>state.relation?.id&&state.relation.id!=='0'?state.relation.id:'personal';
async function refresh(){
  if(!state.user||refreshing)return;refreshing=true;const session=epoch,searchRevision=radarRevision;
  const address=state.user;
  try {
    const [profile,proofs,radar,history,userOperations,connections,journeyResp]=await Promise.all([api('/api/profile'),api('/api/transactions'),api('/api/radar?'+new URLSearchParams(state.radarFilters)).catch(error=>({candidates:[],total:0,hasLocation:false,error:error.message})),api('/api/relations'),state.authProvider==='privy'?api('/api/userops'):Promise.resolve([]),api('/api/connections'),api('/api/journey').catch(()=>({path:''}))]);
    if(epoch!==session)return;
    let relation=null,error='';
    try{relation=await api((state.authProvider==='privy'?'/api/relationships/current':'/api/ring')+'?id='+selectedArchive);}
    catch(failure){error='链上状态不可用：'+failure.message;}
    if(epoch!==session)return;
    const currentScope=relation?.id&&relation.id!=='0'?relation.id:'personal';
    const rows=await api('/api/memories?scope='+currentScope);const partner=encryptionPeer(relation,address,chainIdentity(state));
    const memories=await Promise.all(rows.map(async m=>{try{return {...m,content:await decrypt(m.body,partner)};}catch(error){return {...m,error:'无法解密：'+error.message};}}));
    if(epoch!==session)return;const mergedProofs=[...proofs,...userOperations.filter(op=>op.status==='CONFIRMED'&&op.result?.success&&op.transactionHash).map(op=>({hash:op.transactionHash,block:op.result.block,chainId:state.config.chainId,actions:op.result.events.map(event=>event.name),confirmedAt:new Date(op.updatedAt).toISOString()}))];
    state.journey=journeyResp||{path:''};Object.assign(state,{profile:profile.profile,proofs:mergedProofs.filter((p,i,rows)=>rows.findIndex(row=>row.hash===p.hash)===i),history,userOperations,connections:connections.connections,relation,error,memories,balance:relation?.balances?formatEther(Object.values(relation.balances).reduce((sum,v)=>sum+BigInt(v),0n)):'0'});
    if(searchRevision===radarRevision)Object.assign(state,{candidates:radar.candidates,radar,radarError:radar.error||''});
    if(!state.preview&&!phaseB()&&PHASE_B_ONLY.includes(state.route))state.route='path';
    if(!state.profile&&state.route==='home')state.route='identity';render();
  }finally{refreshing=false;}
}
function resetRadar(){++radarRevision;state.candidates=[];state.radar=null;state.radarFilters={city:'',intention:'',radius:0,gender:'',ageMin:0,ageMax:0};state.radarError='';state.radarExpanded=false;state.radarScanning=false;}
async function scanRadar(){
  const session=epoch;++radarRevision;state.radarScanning=true;state.radarError='';render();
  try{const result=await api('/api/radar?'+new URLSearchParams(state.radarFilters));if(session===epoch){state.radar=result;state.candidates=result.candidates;}}
  catch(error){if(session===epoch)state.radarError=error.message;throw error;}
  finally{if(session===epoch){state.radarScanning=false;render();}}
}
function peerConnection(){return (state.connections||[]).find(c=>[c.requester,c.recipient].some(a=>a.toLowerCase()===state.echoAddress?.toLowerCase()))||null;}
async function loadChat(){
  const connection=peerConnection(),changed=connection!==state.chatConnection;
  state.chatConnection=connection;state.ephemeralRoom=state.ephemeralRoom&&connection?.status==='accepted';
  if(state.preview||!connection||connection.status!=='accepted'){if(changed)render();return;}
  const peer=connection.requester?.toLowerCase()===state.user?.toLowerCase()?connection.recipient:connection.requester;
  const data=await api('/api/connections/'+connection.id+'/messages');
  const mine=sender=>sender?.toLowerCase()===state.user?.toLowerCase();
  const messages=await Promise.all(data.messages.map(async m=>{try{return {...m,mine:mine(m.sender),content:await decrypt({scope:m.scope,ciphertext:m.ciphertext,iv:m.iv},peer)};}catch(error){return {...m,mine:mine(m.sender),error:'无法解密这条消息：'+error.message};}}));
  const fresh=changed||messages.length!==state.chatMessages.length||messages.at(-1)?.id!==state.chatMessages.at(-1)?.id;
  state.chatMessages=messages;
  if(fresh){const composer=document.querySelector('#chat-message'),draft=composer?.value??'';render();const next=document.querySelector('#chat-message');if(next&&draft)next.value=draft;}
}
function listenMessages(){
  if(!state.user||state.preview||state.messageStream)return;
  try{
    const stream=new EventSource('/api/notifications/stream');
    stream.addEventListener('message',event=>{try{const payload=JSON.parse(event.data);if(state.route==='echo-chat'&&payload.connectionId===state.chatConnection?.id)loadChat().catch(()=>{});}catch{}});
    stream.addEventListener('ready',()=>{state.messageStream=stream;});
    stream.onerror=()=>{stream.close();if(state.messageStream===stream)state.messageStream=null;};
  }catch{/* EventSource unavailable; the chat poll still delivers new messages */}
}
function login(){modal('开启你的真实账户',notice('邮箱登录会创建由你控制的嵌入式钱包。已有钱包也可直接签名登录。')+(state.config.privy?.appId?btn('邮箱登录 · Privy','login-privy'):'')+btn('连接已有钱包','login-injected','','light'));}
async function loginPrivy(){
  await walletSDK();
  const visitorDraft=state.preview?state.previewProfile:null,operation=++epoch;
  dialog.close();toast('正在加载安全邮箱登录…');
  const module=await import('/privy.js');privyBridge=await module.mountPrivy(state.config);
  let connection;
  try{connection=await privyBridge.connect(api);}catch(error){try{await api('/api/logout',{method:'POST'});}catch{toast('后端退出未确认，请重新连接前刷新登录状态。');}finally{clearEncryption();state.user=null;state.chainAddress=null;state.authProvider=null;state.profile=null;state.relation=null;state.memories=[];state.proofs=[];state.userOperations=[];privyAdapter=null;provider=null;signer=null;resetRadar();resetJourney();}throw error;}
  if(operation!==epoch){await api('/api/logout',{method:'POST'});throw new Error('登录状态已变化，请重新连接。');}
  privyAdapter=connection.adapter;provider=new BrowserProvider(connection.provider);signer=await provider.getSigner(connection.session.address);
  state.user=connection.session.address;state.chainAddress=connection.binding.sender;state.authProvider='privy';state.preview=false;resetJourney();
  try{await initializeEncryption({account:state.user,api,config:state.config,signer});}catch(error){toast(error.message);}
  await refresh();const draft=carryIdentityDraft(state.profile,visitorDraft);if(draft){state.identityDraft=draft;state.identityStep=4;navigate('identity');}
  listenMessages();toast('邮箱钱包已验证。Ring 使用智能账户 '+short(state.chainAddress));
}
async function loginInjected(){
  await walletSDK();
  const visitorDraft=state.preview?state.previewProfile:null;
  dialog.close();
  if(!window.ethereum?.request)throw new Error('请先安装支持 EVM 的浏览器钱包，再连接。此入口不会生成演示钱包。');
  const operation=++epoch;provider=new BrowserProvider(window.ethereum);await provider.send('eth_requestAccounts',[]);signer=await provider.getSigner();const address=await signer.getAddress();
  const challenge=await api('/api/auth/challenge',{method:'POST',body:{address}});const signature=await signer.signMessage(challenge.message);
  if(operation!==epoch||((await provider.send('eth_accounts',[]))[0]||'').toLowerCase()!==address.toLowerCase())throw new Error('钱包账户已变化，请重新登录。');
  const user=await api('/api/auth/verify',{method:'POST',body:{id:challenge.id,signature}});
  if(operation!==epoch||((await provider.send('eth_accounts',[]))[0]||'').toLowerCase()!==address.toLowerCase()){await api('/api/logout',{method:'POST'});throw new Error('签名期间钱包账户已变化，请重新登录。');}
  state.user=user.address;state.chainAddress=user.address;state.authProvider='wallet';privyAdapter=null;state.preview=false;resetJourney();
  try{await initializeEncryption({account:state.user,api,config:state.config,signer});}catch(error){toast(error.message);}
  await refresh();
  listenMessages();
  const draft=carryIdentityDraft(state.profile,visitorDraft);if(draft){state.identityDraft=draft;state.identityStep=4;navigate('identity');toast('已连接钱包，请核对草稿再保存真实资料。');}
}
async function logout(){
  ++epoch;
  try{const outcomes=await Promise.allSettled([api('/api/logout',{method:'POST'}),state.authProvider==='privy'?privyBridge?.logout():Promise.resolve()]);const failure=outcomes.find(result=>result.status==='rejected');if(failure)throw failure.reason;}
  finally{clearEncryption();state.messageStream?.close();state.messageStream=null;state.user=null;state.chainAddress=null;state.authProvider=null;privyAdapter=null;state.profile=null;state.relation=null;state.memories=[];state.proofs=[];state.userOperations=[];resetRadar();resetJourney();provider=null;signer=null;selectedArchive='0';navigate('home');}
}
async function transact(method,args=[],value){
  if(dialog.open)dialog.close();progress('preparing',{label:({createInvitation:'Ring Invitation',acceptInvitation:'Create Our Ring',proposePrivateVow:'Our Vow',confirmVow:'Confirm Our Vow',deposit:'Our Bond'}[method]||'共同确认'),hash:null,error:null,message:'正在核对真实链上状态与费用。'});
  try{
  if(!state.config.chainConfigured)throw new Error('先配置真实 BOT RPC 与已部署合约。当前没有可提交的链上目标。');
  if(state.authProvider==='privy'){
    if(!privyAdapter)throw new Error('请重新通过邮箱连接钱包，以确认当前签名器。');
    const operation=epoch,prepared=await api('/api/userops/prepare',{method:'POST',body:walletAction(method,args,value)});
    progress('signature',{message:'请在你的钱包中核对并签名。'});
    const signed=await privyAdapter.signPrepared(prepared);if(operation!==epoch)throw new Error('账户已变化，操作未提交。');
    let result=await api('/api/userops/submit',{method:'POST',body:signed});
    progress('submitted',{hash:result.userOpHash,message:'操作已提交，正在等待链上执行。'});
    toast('智能账户操作已提交，等待真实链上回执：'+short(result.userOpHash));
    const deadline=Date.now()+120000;
    while(!['CONFIRMED','FAILED'].includes(result.status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,2000));if(operation!==epoch)throw new Error('账户已变化，请在原账户查看交易记录。');result=await api('/api/userops/'+result.id);if(result.status==='INCLUDED')progress('included',{hash:result.transactionHash,message:'已进入区块，正在等待确认。'});}
    if(result.status==='FAILED')throw new Error(result.error||'智能账户操作未成功，状态未修改。');
    if(result.status!=='CONFIRMED'||!result.transactionHash)throw new Error('操作仍等待链上确认，请稍后查看 Proof History；不会重复发送。');
    progress('confirmed',{hash:result.transactionHash,message:'操作已成功执行，并达到所需区块确认。'});selectedArchive='0';await refresh();toast('智能账户操作已由链上确认：'+short(result.transactionHash));return;
  }
  if(!window.ethereum?.request)throw new Error('请连接你的浏览器钱包。');
  provider=new BrowserProvider(window.ethereum);signer=await provider.getSigner();if((await signer.getAddress()).toLowerCase()!==state.user.toLowerCase())throw new Error('钱包账户与当前登录会话不一致，请重新登录。');
  const network=await provider.getNetwork();if(network.chainId!==BigInt(state.config.chainId)){await provider.send('wallet_switchEthereumChain',[{chainId:'0x'+state.config.chainId.toString(16)}]);provider=new BrowserProvider(window.ethereum);signer=await provider.getSigner();}
  if((await provider.getNetwork()).chainId!==BigInt(state.config.chainId))throw new Error('钱包仍未连接到正确的链。');
  if(await provider.getCode(state.config.contract)==='0x')throw new Error('配置地址没有合约代码，停止提交。');
  progress('signature',{message:'请在你的钱包中核对并签名。'});
  const bell=new Contract(state.config.contract,state.config.abi,signer),transaction=await bell[method](...args,...(value!==undefined?[{value}]:[]));
  progress('submitted',{hash:transaction.hash,message:'已提交，等待真实交易回执。'});
  toast('交易已提交，等待两次区块确认：'+short(transaction.hash));
  const included=await transaction.wait(1);if(!included||included.status!==1)throw new Error('交易未成功执行。');progress('included',{hash:included.hash,message:'已进入区块，等待第二次确认。'});const receipt=await transaction.wait(2);if(!receipt||receipt.status!==1)throw new Error('交易没有成功，界面状态未修改。');
  try{await api('/api/transactions',{method:'POST',body:{hash:receipt.hash}});}catch(error){toast('链上已确认，但记录同步失败：'+error.message);}
  progress('confirmed',{hash:receipt.hash,message:'双方共同选择已由链上确认。'});selectedArchive='0';await refresh();toast('交易已由链上确认。');
  }catch(error){progress('failed',{error:error.shortMessage||error.message,message:''});throw error;}
}
function memoryForm(id){const m=(state.preview?state.previewMemories||[]:state.memories).find(m=>m.id===id);if(id&&!m?.content)throw new Error('无法解密正文，不能覆盖未知内容。');modal(id?'修改记忆':'Keep a memory',`<form class="form" data-form="memory" ${id?`data-id="${escape(id)}"`:''}>${input('标题','title',m?.content?.title||'','required maxlength="80"')}<label for="f-text">一句话，或一封信</label><textarea id="f-text" name="text" maxlength="4000">${escape(m?.content?.text||'')}</textarea><label for="f-image">照片或短视频 · 最大 1MB</label><input type="file" id="f-image" name="image" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">${notice(state.preview?'仅保留本页未上传草稿，不是账户或链上记录。':'内容先在本机加密，再保存到当前账号或你们的 Ring。')}${submit(state.preview?'保留本页草稿':'加密并保存')}</form>`);}
async function fileMedia(file){if(!file?.size)return {image:'',video:''};if(file.size>1024*1024||!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type))throw new Error('请选择不超过 1MB 的 JPEG、PNG、WebP、MP4 或 WebM。');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('媒体读取失败'));reader.readAsDataURL(file);});return file.type.startsWith('video/')?{image:'',video:data}:{image:data,video:''};}
async function saveContent(content,type,id,hash){const envelope={scope:scope(),type,...await encrypt(content,peer(),scope()),...(hash?{hash}:{})};await api('/api/memories?scope='+scope()+(id?'&id='+id:''),{method:id?'PUT':'POST',body:envelope});return envelope;}
async function action(target){
  const action=target.dataset.action;
  if(await journey.action(target))return;
  if(action==='preview'){state.preview=true;navigate('home');return;}
  if(['echo-detail','echo-chat'].includes(action)){state.echoAddress=target.dataset.inbox?null:target.dataset.address||state.echoAddress;if(!state.preview&&action==='echo-chat'){state.connections=(await api('/api/connections')).connections;navigate(action);await loadChat();return;}navigate(action);return;}
  if(action==='discover'){state.journey={path:'radar'};if(state.user){api('/api/journey',{method:'PUT',body:{path:'radar'}}).catch(()=>{});await refresh();}navigate('discover');return;}
  if(action==='direct-bind'){state.journey={path:'direct'};if(state.user)api('/api/journey',{method:'PUT',body:{path:'direct'}}).catch(()=>{});navigate('direct-bind');return;}
  if(routeNames.includes(action)){navigate(action);return;}
  if(action==='help'){modal('从相遇，到共同生活',notice('通过邮箱或钱包创建账户，填写身份后可寻找共鸣。邀请与接受均由各自的钱包签名。记忆在本机加密，交易证明来自真实链上回执。')+btn('开始创建身份','identity'));return;}
  if(action==='wallet-info'){modal('Wallet & Smart Account',state.user?notice('邮箱签名钱包：'+escape(state.user)+'<br>智能账户：'+escape(state.chainAddress||state.user))+btn('查看链上记录','proofs','','light'):notice('连接后，邮箱签名钱包和智能账户会显示在这里。')+btn('连接钱包','login'));return;}
  if(action==='copy-address'){const text=target.dataset.copy||'';if(!text)throw new Error('还没有可复制的账户地址。');await navigator.clipboard.writeText(text);toast('地址已复制：'+short(text));return;}
  if(action==='avatar-picker'){
    const draft=state.identityDraft||{};
    const options=[1,2,3,4,5,6].map(n=>'<button type="button" class="'+(draft.avatarUrl==='/assets/avatar-'+n+'.jpg'?'active':'')+'" data-action="avatar-pick" data-src="/assets/avatar-'+n+'.jpg" aria-label="选择头像 '+n+'"><img src="/assets/avatar-'+n+'.jpg" width="80" height="80" alt=""></button>').join('');
    const urlValue=draft.avatarUrl&&!draft.avatarUrl.startsWith('/assets/')?draft.avatarUrl:'';
    modal('Curate Photo · 挑选头像','<div class="avatar-picker">'+options+'</div><form class="form" data-form="avatar-url">'+input('或使用外部 HTTPS 图片链接','avatarUrl',urlValue,'maxlength="300" inputmode="url" placeholder="https://..."')+'<div class="actions">'+btn('使用此链接','avatar-url-apply','type="submit"','light compact')+'</div></form>'+(draft.avatarUrl?btn('清除当前头像','avatar-clear','','danger compact'):'')+notice('头像会公开展示给已登录用户；可随时更换，保存身份后生效。'));
    return;
  }
  if(action==='avatar-pick'){state.identityDraft={...(state.identityDraft||{}),avatarUrl:target.dataset.src};dialog.close();toast('头像已挑选，保存身份后生效。');if(state.route==='identity'){state.identityStep=1;render();}return;}
  if(action==='avatar-clear'){state.identityDraft={...(state.identityDraft||{}),avatarUrl:''};dialog.close();render();return;}
  if(action==='bind-select'){state.inviteAddress=target.dataset.address||'';navigate('direct-bind');toast('已填入对方地址，请核对后发出邀请。');return;}
  if(action==='proof-detail'){const proof=state.proofs.find(p=>p.hash===target.dataset.hash);if(!proof)throw new Error('真实交易证明尚未加载。');modal('On-chain Proof',proofSheet(proof,state.config));return;}
  if(state.preview&&!['login','login-privy','login-injected','logout','close','discover','stitch-back','stitch-account','stitch-wallet'].includes(action)){toast('访客模式仅供浏览，此操作需要先连接钱包。');return;}
  if(['discover','direct-bind'].includes(action)&&state.user&&!state.preview){api('/api/journey',{method:'PUT',body:{path:action==='discover'?'radar':'direct'}}).catch(()=>{});}
  switch(action){
    case 'stitch-back':if(state.route==='identity'&&state.identityStep>1){state.identityStep--;render();}else navigate(({identity:'path',path:'home',discover:'path','direct-bind':'path','invite-page':'direct-bind','echo-results':'discover','echo-detail':'echo-results','echo-chat':state.echoAddress?'echo-detail':'discover',vault:'me',witness:'me','witness-detail':'witness','witness-configurator':'witness',privacy:'me',proofs:'me','relationship-settings':'me',history:'me'})[state.route]||'home');break;
    case 'stitch-account':modal('Your Space', '<div class="stitch-account-sheet">'+avatar(state.profile?.name||'')+'<h3>'+escape(state.profile?.name||'访客浏览')+'</h3>'+btn('编辑我的资料','identity','','light')+btn('Echo Connections','echo-chat','data-inbox="true"','light')+btn(state.user?'退出登录':'连接钱包','stitch-wallet','','light')+'</div>');break;
    case 'stitch-wallet':dialog.close();await (state.user?logout():login());break;
    case 'echo-whisper':{const connection=(state.connections||[]).find(c=>c.status==='accepted'&&[c.requester,c.recipient].some(a=>a.toLowerCase()===target.dataset.address?.toLowerCase()));if(!connection)throw new Error('双方同意连接后，才能使用开场草稿。');state.echoAddress=target.dataset.address;state.chatDraft=target.dataset.prompt||'';state.chatDraftPeer=state.echoAddress;navigate('echo-chat');await loadChat();break;}
    case 'echo-chime':{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){toast('当前浏览器不支持声音试听。');break;}const audio=new Audio();await audio.resume();const now=audio.currentTime;[760,1140,1820].forEach((frequency,index)=>{const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.06/(index+1),now);gain.gain.exponentialRampToValueAtTime(.001,now+1.2);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now);oscillator.stop(now+1.25);if(index===2)oscillator.onended=()=>audio.close();});break;}
    case 'echo-connect':{const candidate=state.candidates.find(c=>c.address===target.dataset.address);if(!candidate)throw new Error('请先选择真实的公开资料。');await api('/api/connections',{method:'POST',body:{recipient:candidate.address}});state.connections=(await api('/api/connections')).connections;state.echoAddress=candidate.address;navigate('echo-detail');toast('连接请求已保存，等待对方回应。');break;}
    case 'connection-respond':{await api('/api/connections/'+encodeURIComponent(target.dataset.id)+'/respond',{method:'POST',body:{decision:target.dataset.decision}});state.connections=(await api('/api/connections')).connections;if(target.dataset.decision==='accept'){const connection=state.connections.find(c=>c.id===target.dataset.id),peer=connection?.requester?.toLowerCase()===state.user?.toLowerCase()?connection.recipient:connection?.requester;modal('Match Struck · 共鸣达成',`<div class="match-struck"><div class="match-pair">${avatar(state.profile?.name||short(state.user))}<span class="match-heart">${icon('heart')}</span>${avatar(peer)}</div><h3>你们都选择了连接</h3><p>这条连接是双方同意的真实记录。接下来可以在加密对话里了解彼此；建立 Romantic Ring 仍需要两个人各自的钱包签名。</p><div class="actions">${btn('进入连接空间','echo-chat',`data-address="${escape(peer||'')}"`,'rose')}${btn('先返回雷达','discover','','light')}</div></div>`);}else navigate('echo-chat');break;}
    case 'ephemeral-toggle':if(state.chatConnection?.status!=='accepted')throw new Error('先建立双方同意的连接。');state.ephemeralRoom=!state.ephemeralRoom;break;
    case 'agent-request':state.agentKind=state.route==='vows'?'vow-draft':'story-draft';modal('让 Bell 帮你整理一句话',notice('仅在你同意后，根据你自己的公开资料生成结构化草稿。不会读取私人记忆；不会自动保存或提交链上誓言。授权十分钟后到期，也可立即撤回。')+btn('同意并生成可编辑草稿','agent-consent-confirm','','rose')+btn('暂不使用','close','','light'));break;
    case 'agent-consent-confirm':{const grant=await api('/api/consents',{method:'POST',body:{scope:'agent:'+state.agentKind,resourceId:'profile',expiresAt:Date.now()+600000}});state.agentGrant=grant.grant.id;const response=await api('/api/agent/jobs',{method:'POST',body:{skill:state.agentKind,resourceId:'profile',points:[]}});state.agentDraft=response.job.output;dialog.close();toast('规则模板草稿已生成，你可以修改后再决定使用。');break;}
    case 'agent-revoke':if(state.agentGrant)await api('/api/consents',{method:'DELETE',body:{id:state.agentGrant}});state.agentGrant=null;state.agentDraft=null;toast('已撤回这次草稿授权。');break;
    case 'agent-use':case 'agent-edit':{if(!state.agentDraft)throw new Error('草稿尚未生成。');if(state.agentKind==='vow-draft'){if(state.relation?.status!=='ACTIVE')throw new Error('先建立活动 Ring，才能提交真实誓言。');modal('Our Vow', '<form class="form" data-form="vow"><label for="agent-vow">核对并编辑誓言</label><textarea id="agent-vow" name="text" maxlength="200" required>'+escape(state.agentDraft.text.slice(0,200))+'</textarea>'+submit('由我核对并提出誓言')+'</form>');}else{memoryForm();document.querySelector('#f-title').value=state.agentDraft.title;document.querySelector('#f-text').value=state.agentDraft.text;}break;}
    case 'login':login();break;case 'login-privy':await loginPrivy();break;case 'login-injected':await loginInjected();break;case 'logout':await logout();break;case 'close':dialog.close();break;case 'refresh':await refresh();break;
    case 'discover':await refresh();navigate('discover');break;
    case 'radar-expand':state.radarExpanded=!state.radarExpanded;break;
    case 'radar-detail':{state.echoAddress=target.dataset.address;navigate('echo-detail');break;}
        case 'radar-save':{const candidate=state.candidates.find(c=>c.address===target.dataset.address);if(!candidate)throw new Error('候选资料已变化。');await api('/api/radar/saved',{method:'PUT',body:{address:candidate.address,saved:!candidate.saved}});await scanRadar();break;}
    case 'radar-location':modal('允许 O 帮你寻找附近的人？',notice('仅在你确认后请求浏览器定位。服务器丢弃精确坐标，只保存约 11km 网格的粗略区域，有效期 24 小时。附近筛选与距离均为区域间估算；其他人可能据此了解你所在的大致区域，不是匿名或精准导航。每分钟最多更新一次，可随时撤回删除。定位和资料未经独立核验。')+btn('同意并开启定位','radar-location-confirm')+btn('暂不开启','close','','light'));break;
    case 'radar-location-confirm':{if(!navigator.geolocation)throw new Error('当前环境不支持定位，可继续按城市与兴趣寻找。');const session=epoch;const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('未获取到定位授权，请按城市筛选。')),{enableHighAccuracy:false,timeout:10000,maximumAge:0}));if(session!==epoch)throw new Error('账号已变化，请重新开启定位。');await api('/api/radar/location',{method:'PUT',body:{lat:position.coords.latitude,lon:position.coords.longitude,consent:true}});dialog.close();await scanRadar();toast('附近定位已开启，有效期 24 小时。');break;}
    case 'radar-revoke-location':await api('/api/radar/location',{method:'DELETE'});state.radarFilters.radius=0;await scanRadar();toast('已删除位置，不再计算附近距离。');break;
    case 'invite':modal('Send a Ring Invitation',`<form class="form" data-form="invite">${input('对方的钱包地址','address',target.dataset.address||'','required pattern="0x[0-9a-fA-F]{40}"')}${notice('将由当前钱包创建真实链上邀请。请核对对方地址。')}${submit('签名并发送邀请')}</form>`);break;
    case 'accept':modal('Only you can complete this Ring',notice('接受后会建立当前钱包与邀请人的正式链上关系。此操作不转移资金。')+btn('确认接受并签名','accept-confirm'));break;
    case 'accept-confirm':await transact('acceptInvitation');dialog.close();navigate('ceremony');break;
    case 'cancel-invite':modal('取消邀请？',notice('这会由你的钱包取消真实链上的待处理邀请。')+btn('签名取消邀请','cancel-invite-confirm','','danger'));break;
    case 'cancel-invite-confirm':await transact('cancelInvitation');dialog.close();break;
    case 'decline-invite':modal('拒绝邀请？',notice('这会释放你在合约中的待处理邀请状态。')+btn('签名拒绝邀请','decline-invite-confirm','','danger'));break;
    case 'decline-invite-confirm':await transact('declineInvitation');dialog.close();break;
    case 'setup-keys':{const keyProvider=state.authProvider==='privy'?provider:window.ethereum?new BrowserProvider(window.ethereum):null;if(!keyProvider)throw new Error('请重新连接你的钱包。');const keySigner=await keyProvider.getSigner(state.user);if((await keySigner.getAddress()).toLowerCase()!==state.user.toLowerCase())throw new Error('请切换到当前登录的钱包。');await initializeEncryption({account:state.user,api,config:state.config,signer:keySigner});await refresh();toast('本机加密密钥登记完成。');break;}
    case 'memory':memoryForm();break;case 'edit-memory':memoryForm(target.dataset.id);break;
    case 'delete-memory':modal('删除我的记忆？',notice('删除你保存的加密内容。它不会修改链上已经存在的共识记录。')+btn('确认删除','delete-confirm',`data-id="${target.dataset.id}"`,'danger'));break;
    case 'delete-confirm':await api('/api/memories?scope='+scope()+'&id='+target.dataset.id,{method:'DELETE'});dialog.close();await refresh();break;
    case 'new-vow':if(state.relation?.status!=='ACTIVE')throw new Error('先建立 Active Ring，才可以提出誓言。');modal('Our Vow',`<form class="form" data-form="vow"><label for="f-vow">只有你们两人选择它，才成为誓言。</label><textarea id="f-vow" name="text" maxlength="200" required></textarea>${submit('加密正文并提出链上誓言')}</form>`);break;
    case 'confirm-vow':{const vow=state.relation.vows.find(v=>v.index===Number(target.dataset.index));const memory=state.memories.find(m=>m.body.hash?.toLowerCase()===vow?.hash.toLowerCase());const text=memory?.content?.text||vow?.text;if(!vow||!text||keccak256(toUtf8Bytes(text))!==vow.hash)throw new Error('无法核对正文与链上哈希，不会请求你确认未知内容。');await transact('confirmVow',[vow.index]);break;}
    case 'deposit':modal('Contribute to Our Bond',`<form class="form" data-form="deposit"><div class="deposit-quick" aria-label="快捷金额">${[25,50,100].map(amount=>btn('+'+amount+' BOT','deposit-quick',`data-fill="${amount}" type="button"`,'light compact')).join('')}</div>${input('存入 BOT 数量','amount','','required type="number" min="0.000000000000000001" step="any" placeholder="0.0"')}${notice('快捷金额会累加到输入框。提交后由你的钱包签名，把真实 BOT 转入合约；出资记在你的钱包名下。')}${submit('核对并使用钱包存入')}</form>`);break;
    case 'avatar-url-apply':{const url=value('avatarUrl');state.identityDraft={...(state.identityDraft||{}),avatarUrl:url};dialog.close();toast(url?'外部头像链接已记录，保存身份后生效。':'已清除外部链接。');if(state.route==='identity'){state.identityStep=1;render();}break;}
    case 'deposit-quick':{const form=target.closest('form'),el=form?.querySelector('[name="amount"]');if(el)el.value=String(Math.max(0,(Number(el.value)||0)+Number(target.dataset.fill)));break}
    case 'withdraw':modal('取回我的剩余贡献',notice('只有当前钱包在已归档 Ring 中的剩余贡献可以取回。')+btn('钱包确认提现','withdraw-confirm'));break;
    case 'withdraw-confirm':{const id=state.relation.id;await transact('withdrawFrom',[id]);selectedArchive=id;await refresh();dialog.close();break;}
    case 'request-end':modal('Ending does not erase history',notice('请求结束后，对方可确认，或等待链上七天期限。记忆与出资归属保留。')+btn('签名请求结束','request-end-confirm','','danger'));break;
    case 'request-end-confirm':await transact('requestEnd');dialog.close();break;
    case 'confirm-end':modal('确认结束这枚 Ring？',notice('双方共识结束后将归档，并释放两人的活动关系。')+btn('签名确认归档','confirm-end-confirm','','danger'));break;
    case 'confirm-end-confirm':{const id=state.relation.id;await transact('confirmEnd');selectedArchive=id;await refresh();dialog.close();break;}
    case 'finalize-end':await transact('finalizeEnd',[state.relation.id]);break;
    case 'archive':selectedArchive=target.dataset.id;await refresh();navigate('home');break;
    case 'export':{const data=await api('/api/memories?scope='+scope()),blob=new Blob([JSON.stringify({encrypted:true,address:state.user,scope:scope(),memories:data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='consensus-bell-encrypted-archive.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
    default:throw new Error('未实现的操作不会伪装成成功。');
  }
}
async function run(operation){
  if(busy)return;
  const focused=['close'].includes(document.activeElement?.dataset.action)?focusBeforeDialog:document.activeElement,route=state.route,identityStep=state.identityStep;
  const focusKey={action:focused?.dataset.action,address:focused?.dataset.address,id:focused?.dataset.id,value:focused?.dataset.value,name:focused?.getAttribute('name'),form:focused?.closest('form')?.dataset.form,type:focused?.getAttribute('type')};
  busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await operation();}catch(error){state.error=error.shortMessage||error.message;toast(state.error);}
  finally{
    busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);render();
    if(route===state.route&&identityStep===state.identityStep&&!dialog.open){
      if(focused?.isConnected&&!focused.closest('dialog:not([open])'))focused.focus({preventScroll:true});
      else{const replacement=[...app.querySelectorAll('button,input,select,textarea')].find(el=>focusKey.action?el.dataset.action===focusKey.action&&el.dataset.address===focusKey.address&&el.dataset.id===focusKey.id&&el.dataset.value===focusKey.value:focusKey.name?el.getAttribute('name')===focusKey.name:focusKey.form&&el.closest('form')?.dataset.form===focusKey.form&&el.getAttribute('type')===focusKey.type);(replacement||app).focus({preventScroll:true});}
    }
  }
}
document.addEventListener('error',event=>{const image=event.target;if(!(image instanceof HTMLImageElement)||!image.hasAttribute('data-avatar-fallback'))return;const fallback=document.createElement('span');fallback.className='avatar-fallback';fallback.textContent=image.dataset.avatarFallback;image.closest('.has-photo')?.classList.remove('has-photo');image.replaceWith(fallback);},true);
document.addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(target)run(()=>action(target));});
window.addEventListener('hashchange',()=>{const route=location.hash.slice(1);if(routeNames.includes(route))navigate(route);});
document.querySelector('#wallet').addEventListener('click',()=>run(()=>state.user?logout():login()));
document.addEventListener('input',e=>{if(e.target.id==='chat-message'){state.chatDraft=e.target.value;state.chatDraftPeer=state.echoAddress;}});
document.addEventListener('submit',e=>{const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();if(form.dataset.form==='radar')state.radarPulse=Date.now();const data=new FormData(form),value=k=>String(data.get(k)||'').trim();run(async()=>{if(await journey.form(form,data))return;if(state.preview){toast('此操作需要登录，预览不会上传或发起交易。');return;}
  switch(form.dataset.form){
    case 'radar':state.radarFilters={city:value('city'),intention:value('intention'),radius:Number(value('radius')),gender:value('gender'),ageMin:Number(value('ageMin'))||0,ageMax:Number(value('ageMax'))||0};state.radarExpanded=false;await scanRadar();break;
    case 'chat-compose':{const connection=state.chatConnection;if(!connection||connection.status!=='accepted')throw new Error('双方同意连接后才能开始对话。');const text=value('message');if(!text)throw new Error('先写一句话，再发送。');const envelope=await encrypt({text,at:Date.now()},state.echoAddress,'chat:'+connection.id);const reply=await api('/api/connections/'+connection.id+'/messages',{method:'POST',body:{...envelope,scope:'chat:'+connection.id,ephemeral:Boolean(state.ephemeralRoom)}});state.chatMessages=[...state.chatMessages,{...reply.message,content:{text,at:Date.now()}}];state.chatDraft='';render();break;}
    case 'profile':{const profile={name:value('name'),city:value('city'),gender:value('gender'),age:value('age'),interests:value('interests').split(/[,，]/).map(v=>v.trim()).filter(Boolean),statement:value('statement'),intention:value('intention'),discoverable:data.has('discoverable'),avatarUrl:value('avatarUrl'),occupation:value('occupation')};await api('/api/profile',{method:'PUT',body:profile});await refresh();navigate('home');toast('资料已保存到你的真实钱包账户。');break;}
    case 'invite':{const address=value('address');if(!isAddress(address)||address===ZeroAddress)throw new Error('请输入有效的对方钱包地址。');await transact('createInvitation',[address]);dialog.close();navigate('home');toast('邀请已上链，对方使用自己的钱包登录后可读取并接受。');break;}
    case 'memory':{const original=state.memories.find(m=>m.id===form.dataset.id),media=await fileMedia(data.get('image')),hasMedia=Boolean(media.image||media.video),image=hasMedia?media.image:original?.content?.image||'',video=hasMedia?media.video:original?.content?.video||'';await saveContent({title:value('title'),text:value('text'),image,video},video?'video':image?'photo':'note',form.dataset.id);dialog.close();await refresh();toast('记忆已加密并保存。');break;}
    case 'vow':{const text=value('text');if(!text)throw new Error('请写下誓言。');const hash=keccak256(toUtf8Bytes(text));await saveContent({title:'Vow',text,image:''},'vow',null,hash);await transact('proposePrivateVow',[hash]);dialog.close();break;}
    case 'deposit':{const amount=parseEther(value('amount'));if(amount<=0n)throw new Error('存入数量必须大于零。');await transact('deposit',[],amount);dialog.close();break;}
  }
});});
window.ethereum?.on?.('accountsChanged',()=>{if(state.user&&state.authProvider!=='privy'){++epoch;clearEncryption();state.user=null;state.chainAddress=null;state.authProvider=null;state.profile=null;state.relation=null;state.memories=[];resetRadar();resetJourney();render();api('/api/logout',{method:'POST'}).catch(()=>toast('钱包已切换，请重新签名登录。'));}});
window.ethereum?.on?.('chainChanged',()=>{if(state.authProvider!=='privy'){provider=null;signer=null;}});
try{state.config=await api('/api/config');try{const session=state.preview?null:await api('/api/session/status');state.user=session?.address;state.chainAddress=session?.chainAddress||state.user;state.authProvider=session?.authProvider||'wallet';}catch{state.user=null;}if(state.user){await walletSDK();try{await initializeEncryption({account:state.user,api,config:state.config,deferRegistration:true});}catch(error){toast(error.message);}await refresh();if(state.profile&&state.journey?.path&&!state.relation&&['home','path','gateway'].includes(state.route))navigate(state.journey.path==='radar'?'discover':'direct-bind');listenMessages();}render();}catch(error){state.error=error.message;app.innerHTML=head('服务尚未就绪',escape(error.message));}
setInterval(()=>{if(state.user&&!busy&&!refreshing&&!dialog.open&&!['identity','discover'].includes(state.route))refresh().catch(error=>{state.error=error.message;render();});},15000);
setInterval(()=>{if(state.user&&!busy&&!refreshing&&!dialog.open&&state.route==='echo-chat'&&state.chatConnection?.status==='accepted')loadChat().catch(()=>{});},4000);
