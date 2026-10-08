import {editorialStory,editorialVows,bondSummary} from './editorial.js';
import {onboardingView} from './onboarding.js';
const isMedia=memory=>['note','photo','video'].includes(memory.type);
export const storyItems=(memories,filter='all')=>memories.filter(isMedia).filter(m=>filter==='all'||m.type===filter);
export const mediaCounts=memories=>({photo:memories.filter(m=>m.type==='photo').length,video:memories.filter(m=>m.type==='video').length,note:memories.filter(m=>m.type==='note').length,vow:memories.filter(m=>m.type==='vow').length,goal:memories.filter(m=>m.type==='goal').length});
export const products=[['digital','Digital Ring','数字见证','ring-hero.webp','把真实的共同经历，变成一枚专属纪念。'],['physical','Physical Ring','实体戒指','ring-box.webp','保留设计偏好，等待真正的制作与履约接入。'],['object','Memory Object','记忆物件','keepsake.webp','让一段故事，有一个可以触摸的载体。']];
export const goalCategories={travel:['一起旅行','japan-trip.webp'],anniversary:['纪念日','anniversary.webp'],home:['未来之家','future-home.webp']};
export function journeyView(state,h){
  const {escape:e,short,head,btn,ring,notice,input,submit,icon,avatar}=h;
  const glyph=name=>icon?icon(name):'';
  const initial=(name,label)=>avatar?avatar(name,label):`<span class="identity-initial" aria-label="${e(label)}">${e(Array.from(name||'?')[0])}</span>`;
  const facts=()=>`<ul class="invitation-facts"><li>${glyph('heart')}两个人共同选择的唯一关系</li><li>${glyph('shield')}由双方独立的钱包签名确认</li><li>${glyph('lock')}接受邀请不会自动转移资金</li></ul>`;
  const guest=state.preview||state.previewOnly,r=state.relation,active=r?.status==='ACTIVE',archived=r?.status==='ARCHIVED';
  const memories=guest?(state.previewMemories||[]):state.memories||[],counts=mediaCounts(memories);
  const back=(route='home')=>btn('返回','journey-back',`data-route="${route}"`,'light compact');
  const blank=(title,description,action,label)=>`<div class="blank"><h2>${title}</h2><p>${description}</p>${action?btn(label,action):''}</div>`;
  const privateHint=guest?'访客浏览不加载真实账户记录；填写内容只是当前页面的未上传草稿。':r?.id&&r.id!=='0'?'只属于当前 Ring 的共同空间。':'现在是你的私人空间，建立 Ring 后再开始记录共同内容。';
  if(state.route==='identity')return onboardingView(state,h);
  if(state.route==='path'||(state.route==='home'&&(!r||r.status==='NONE'))){
    const resume=state.journey?.path==='radar'?'discover':state.journey?.path==='direct'?'direct-bind':'';const order=resume;
    return `<div class="journey-intro"><span class="chapter-kicker">Your next chapter · 选择方向</span>${head(resume?'Welcome back · 继续你的方向':'Where do you want to begin?',resume?'已记住你上次的选择，随时可以换向。':'先遇见共鸣，或连接已经选择的彼此。')}</div>`+`<div class="journey-grid">${[['discover','Find Someone','让 Bell 帮你遇见频率相近的人。','find-someone.webp'],['direct-bind','Bind My Person','已经选择了彼此，现在创建我们的 Ring。','bind-person.webp']].sort((a)=>!order?0:a[0]===order?-1:1).map(([action,title,desc,image])=>`<button class="path-card" data-action="${action}">${action===order?'<span class="pill pending resume-tag">继续上次</span>':''}<img src="/assets/${image}" width="360" height="240" alt=""><span class="path-label">${glyph(action==='discover'?'spark':'ring')}${action==='discover'?'Resonance Radar':'Direct Consensus'}</span><div class="path-copy"><h2>${title}</h2><p>${desc}</p></div><span class="path-arrow" aria-hidden="true">${glyph('next')}</span></button>`).join('')}</div><div class="actions">${btn(state.profile?'修改身份资料':'从四步创建身份开始','identity','','light')}${guest?btn('查看完整使用路径','journey-index','','light'):''}</div>`+(!guest&&state.error?notice(e(state.error)):'');
  }
  if(state.route==='journey-index')return head('从相遇，到共同生活','每一步都可以回看；浏览不会替你签署承诺。')+`<div class="journey-index">${[['identity-step-preview','02 · 创建身份','data-step="1"'],['identity-step-preview','03 · 兴趣偏好','data-step="2"'],['identity-step-preview','04 · 关系意向','data-step="3"'],['identity-step-preview','04b · 爱情宣言','data-step="4"'],['path','05 · 选择路径'],['discover','06 · 共鸣雷达'],['discover','06b · 人群筛选'],['echo-results','07 · 推荐结果'],['echo-detail','08 · 个人详情'],['echo-chat','09 · 追光空间'],['echo-chat','09b · 阅后即焚空间'],['direct-bind','10 · 直接绑定'],['invite-page','11 · 发送邀请'],['home','12 · 等待与活动状态'],['invitation-preview','13 · 接受邀请说明'],['ceremony','14 · 戒指仪式'],['home','15 · Our Ring Home'],['story','16 · Our Story'],['vows','17 · Our Vows'],['bond','18 · Our Bond'],['witness','19 · Love Witness'],['witness-configurator','20 · 见证物定制'],['vault','21 · Bell Vault'],['me','22 · 我的空间'],['relationship-settings','23 · 关系治理'],['archived','24 · 封存态'],['privacy','隐私设置']].map(([action,label,attrs])=>btn(label,action,attrs||'','light')).join('')}</div>`;
  if(state.route==='direct-bind'){const candidates=(state.candidates||[]).slice(0,3);return back('path')+`<div class="journey-intro">${head('Find your person','用对方的钱包地址，连接已经选择的彼此。')}</div>`+ring('NONE')+`<form class="form" data-form="direct-bind">${input('对方的 Smart Account 或钱包地址','address',state.inviteAddress||'','required pattern="0x[0-9a-fA-F]{40}" placeholder="粘贴 0x 开头的完整地址"')}${submit('核对邀请')}</form>`+(candidates.length?`<div class="row between"><h3>${glyph('spark')} Resonance Verified · 从共鸣中快速选择</h3></div><div class="bind-candidates">${candidates.map(c=>`<button class="bind-candidate" data-action="bind-select" data-address="${e(c.address)}">${c.avatarUrl&&/^(https:\/\/|\/assets\/)/.test(c.avatarUrl)?`<img class="bell-face" src="${e(c.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:initial(c.name||c.address)}<span class="bind-candidate-body"><b>${e(c.name||short(c.address))}</b><small>${e(c.occupation||c.city||'')} · ${e(c.address)}</small></span>${glyph('next')}</button>`).join('')}</div>`:'')+`<details class="card"><summary>${glyph('shield')} 关于邀请与双方同意</summary><p>请对方从自己的账户中复制完整地址。核对后你可以发出邀请，对方仍需独立接受。当前支持地址绑定，暂不支持用户名或扫码。</p></details>`;}
  if(state.route==='invite-page')return back('path')+`<div class="journey-intro">${head('A new chapter.<br>Begins with your invitation.','把一次共同的选择，交给你们自己。')}</div><div class="invite-stage">${ring('INVITED')}<span class="pill pending">${guest?'流程预览':'等待创建邀请'}</span></div><form class="form" data-form="invite">${input('对方的 Smart Account 或钱包地址','address',state.inviteAddress||'','required pattern="0x[0-9a-fA-F]{40}" placeholder="0x…"')}${facts()}<details class="invite-disclosure"><summary>签名前，我需要知道什么？</summary><p class="small muted">先核对对方账户地址，再由你的钱包创建链上邀请。对方仍需独立接受；只有双方确认后 Ring 才会建立。邀请可到期或撤销。</p></details>${submit(guest?'查看邀请前核对':'Send Invitation · 发出邀请')}</form>`;
  if(state.route==='invitation-preview'){const articles=[['1. Single Sovereign Bond · 唯一契约','一枚合约同时只允许一个活动 Ring；双方都不能再与他人重复绑定。'],['2. Invitation Expiry · 邀请有效期','邀请发出后 24 小时内有效，可随时由发起方撤销或由你拒绝。'],['3. Dual Consent Rule · 双方共识','誓言需要两个人各自签名确认；结束关系也需双方同意或链上七天期满。']];return back('path')+`<div class="journey-intro">${head('Only you can<br>complete this Ring','接受与拒绝，始终由你自己决定。')}</div>`+ring('INVITED')+`<p class="center muted">这意味着，你们将共同选择<br>属于彼此的一段关系。</p><details class="card covenant-articles" open><summary>${glyph('book')} Covenant Articles · 契约条款</summary>${articles.map(([t,d])=>`<div class="bell-reason"><span class="bell-setting-icon">${glyph('shield')}</span><div><h3>${t}</h3><p>${d}</p></div></div>`).join('')}<p class="small muted">条款来自当前部署合约的真实约束，签名前请逐条阅读。</p></details><div class="actions">${btn('查看戒指仪式页面','ceremony')}${btn('返回选择路径','path','','light')}</div>`+notice('页面预览：当前没有加载真实邀请，不代表已收到或接受邀请。正式邀请会显示真实地址、到期时间和链上状态。');}
  if(state.route==='ceremony'){const born=active?new Date(r.createdAt*1000):null,day=active?Math.max(1,Math.floor((Date.now()/1000-r.createdAt)/86400)+1):null;const sealed=active?`<div class="ceremony-facts">${[['Dual Keys Entangled','双人密钥各自独立签名，缺一不可',glyph('shield')],['Vault Encrypted','记忆与誓言端到端加密，服务器只见密文',glyph('lock')],['Genesis Timestamp','Born '+e(born.toLocaleDateString())+' · Ring #'+e(r.id),glyph('clock')],['Shared Cadence','Day '+day+' · 共同生活的第一天',glyph('heart')]].map(([t,d,g])=>`<div class="bell-reason"><span class="bell-setting-icon">${g}</span><div><h3>${t}</h3><p>${d}</p></div></div>`).join('')}</div><div class="actions">${btn('Enter Our Ring '+glyph('next'),'home','data-action="home"')}</div>`:'';return `<div class="journey-ceremony">${head(active?'✦ Ceremony Complete · Vow Sealed':'Our Ring · 仪式预览',active?'Our Ring is now complete. Two lives, one mutual cadence.':'尚未建立链上关系。这里展示仪式布局，不代表签名成功。')}${ring(active?'ACTIVE':'NONE')}${active?`<p class="center">${e(short(r.a))} × ${e(short(r.b))}</p>`:''}${sealed}<p class="quote">Forever does not begin with a promise.<br>It begins with two people choosing the same thing.</p>${btn(active?'继续浏览我们的故事':'继续浏览我们的故事','story','','light')}</div>`;}
  if(state.route==='home'&&active){
    const days=Math.max(1,Math.floor((Date.now()/1000-r.createdAt)/86400)+1),today=memories.find(isMedia);
    const selfAddr=(state.chainAddress||state.user||''),peer=r.a?.toLowerCase()===selfAddr.toLowerCase()?r.b:r.a;
    const pendingVow=(r.vows||[]).find(v=>!v.confirmed&&v.by&&v.by.toLowerCase()!==selfAddr.toLowerCase());
    const pendingMemory=pendingVow?memories.find(m=>m.body?.hash?.toLowerCase()===pendingVow.hash?.toLowerCase()):null;
    const dataIndex=pendingVow?'data-index="'+e(String(pendingVow.index))+'"':'';
    const todayAttrs=today?'data-id="'+e(today.id)+'"':'';
    const selfFace=state.profile?.avatarUrl&&/^(https:\/\/|\/assets\/)/.test(state.profile.avatarUrl)?'<img class="rhn-face" src="'+e(state.profile.avatarUrl)+'" alt="" referrerpolicy="no-referrer">':'<span class="rhn-face rhn-face-initial">'+e(Array.from(state.profile?.name||'你')[0])+'</span>';
    const todayImg=/^data:image\/(jpeg|png|webp);base64,/.test(today?.content?.image||'')?'<img class="rhn-thumb-img" src="'+e(today.content.image)+'" alt="">':'<span class="rhn-thumb-img rhn-thumb-vault">'+glyph('lock')+'</span>';
    return `
    <div class="rhn-sync"><span class="rhn-sync-dot"></span><span class="rhn-sync-text">${e(state.config?.chainConfigured?'BOT Chain Synced':'链未配置 · 只读')} · Ring #${e(r.id)}</span><button class="rhn-sync-refresh" data-action="refresh" aria-label="刷新链上状态">${glyph('refresh')}</button></div>
    <section class="rhn-hero">
      <i class="rhn-glow rhn-glow-a"></i><i class="rhn-glow rhn-glow-b"></i>
      <div class="rhn-pair">
        <span class="rhn-avatar">${selfFace}<i class="rhn-online"></i></span>
        <span class="rhn-knot">${glyph('heart')}</span>
        <span class="rhn-avatar">${initial(short(peer),'另一位参与者')}<i class="rhn-online"></i></span>
      </div>
      <div class="rhn-names"><h2>${e(state.profile?.name||short(selfAddr))} <span>×</span> ${e(short(peer))}</h2>
      <span class="rhn-eyebrow">RING #${e(r.id)} · MINTED TOGETHER · 双方共同铸造</span></div>
      <div class="rhn-orbits">
        <i class="rhn-orbit rhn-orbit-a"></i><i class="rhn-orbit rhn-orbit-b"></i><i class="rhn-orbit rhn-orbit-c"></i>
        <svg class="rhn-rings" fill="none" viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <ellipse cx="82" cy="90" opacity="0.95" rx="46" ry="54" stroke="url(#rhnG1)" stroke-width="6.5" transform="rotate(-18 82 90)"></ellipse>
          <ellipse cx="118" cy="90" opacity="0.95" rx="46" ry="54" stroke="url(#rhnG2)" stroke-width="6.5" transform="rotate(18 118 90)"></ellipse>
          <circle cx="100" cy="90" fill="#FFF9F7" r="5"></circle><circle cx="100" cy="90" fill="#D98C95" r="2.5"></circle>
          <defs>
            <linearGradient gradientUnits="userSpaceOnUse" id="rhnG1" x1="40" x2="130" y1="35" y2="145">
              <stop stop-color="#E7B7A8"></stop><stop offset="0.45" stop-color="#C98877"></stop><stop offset="0.75" stop-color="#8C4B54"></stop><stop offset="1" stop-color="#F4DDE0"></stop>
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="rhnG2" x1="160" x2="70" y1="35" y2="145">
              <stop stop-color="#F4DDE0"></stop><stop offset="0.3" stop-color="#C98877"></stop><stop offset="0.7" stop-color="#8C4B54"></stop><stop offset="1" stop-color="#E7B7A8"></stop>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span class="rhn-resonance"><i></i>Resonance Radar Active · ${e(String((state.candidates||[]).length))} Pulses Linked</span>
      <div class="rhn-days"><span class="rhn-days-number">${days}</span><span class="rhn-days-label">Days of Shared Consensus</span></div>
    </section>
    <section class="rhn-triad">
      <div class="rhn-metric"><span class="rhn-metric-icon rose">${glyph('book')}</span><strong>${counts.photo+counts.video+counts.note}</strong><span>Memories</span></div>
      <div class="rhn-metric"><span class="rhn-metric-icon amber">${glyph('gift')}</span><strong>${e(String(r.vowCount??0))}</strong><span>Mutual Vows</span></div>
      <div class="rhn-metric"><span class="rhn-metric-icon sage">${glyph('wallet')}</span><strong>${e(state.balance||'0')}</strong><span>BOT Bond Pool</span></div>
    </section>
    ${pendingVow?`<section class="rhn-agent">
      <div class="rhn-agent-head"><span class="rhn-agent-badge">${glyph('back')} Bell Agent Suggestion</span><span class="rhn-agent-wait"><i></i>Waiting for You</span></div>
      <h3>${e(pendingMemory?.content?.title?'对方写下了神圣誓言':'对方提交了一句加密誓言')}</h3>
      <blockquote>${e(pendingMemory?.content?.text||pendingVow.text||'加密正文等待解密核对。')}</blockquote>
      <span class="rhn-agent-note">Off-chain draft · 双方签名后才会成为链上生效誓言</span>
      <div class="rhn-signflow"><span class="rhn-sign done">${glyph('shield')} TA Signed</span><span class="rhn-sign-line"></span><span class="rhn-sign turn">${glyph('heart')} Your Turn</span></div>
      <div class="rhn-agent-actions">${btn('Review & Sign','confirm-vow',dataIndex,'rhn-primary')}${btn('Later','vows','','rhn-ghost')}</div>
    </section>`:''}
    <section class="rhn-today">
      <div class="rhn-today-head"><span class="rhn-today-dot"></span><h3>Today's Moments</h3><button class="rhn-link" data-action="story">View Story ${glyph('next')}</button></div>
      <button class="rhn-memory" data-action="${today?'memory-detail':'memory'}" ${todayAttrs}>
        <span class="rhn-thumb">${todayImg}</span>
        <span class="rhn-memory-body">
          <span class="rhn-memory-meta"><i></i>${e(today?.owner?(today.owner.toLowerCase()===selfAddr.toLowerCase()?'你添加了一条记忆':'TA 添加了一条记忆'):'添加第一份共同记忆')}</span>
          <h4>${e(today?.content?.title||'今天，也值得被记住。')}</h4>
          <p>${e(today?.content?.text?.slice(0,80)||'留下一张照片、一句话，或一个想一起实现的愿望。')}</p>
          <span class="rhn-memory-lock">${glyph('lock')} Encrypted in Bell Vault</span>
        </span>
      </button>
    </section>
    <section class="rhn-chime">
      <span class="rhn-chime-icon">${glyph('bell')}</span>
      <span class="rhn-chime-body"><b>Ring Their Bell</b><small>去追光空间，给 TA 发一条端到端加密的心跳私语</small></span>
      ${btn('Chime','echo-chat','','rhn-chime-btn')}
    </section>
    <div class="actions">${btn('把爱变成见证','witness','','light')}${btn('查看真实链上证明','proofs','','light')}</div>`;
  }

  if(state.route==='story')return editorialStory(state,h,memories,privateHint,guest);
  if(state.route==='vows')return editorialVows(state,h,memories,r,guest);
  if(state.route==='bond'){
    const goals=memories.filter(m=>m.type==='goal'),hero=goals.find(g=>g.content?.category==='travel')||goals[0],milestones=goals.filter(g=>g!==hero).slice(0,3);
    const balance=Number(state.balance||0);
    const categoryArt={travel:'japan-trip.webp',anniversary:'anniversary.webp',home:'future-home.webp'};
    const heroArt=hero?categoryArt[hero.content?.category]||categoryArt.travel:categoryArt.travel;
    const target=Number(hero?.content?.target||0),percent=target>0?Math.min(100,Math.round(balance/target*100)):0;
    const step=r?.status==='ACTIVE'?1:r&&['ENDING','ARCHIVED'].includes(r.status)?2:0;
    return `<div class="bell-bond-head"><div class="row between"><h1>Our Bond<button class="bond-proof-trigger" data-action="proofs" aria-label="查看 Bond 链上证明">${glyph('shield')}</button></h1><span class="bond-total-pill">${glyph('wallet')} ${e(state.balance||'0')} BOT Total</span></div><p>Give a future plan some weight.</p></div>`+bondSummary(state,r,goals.length)+(hero?`<article class="bond-hero-card"><div class="bond-hero-art"><img src="/assets/${heroArt}" width="720" height="280" alt="${e(hero.content?.title||'目标')}意象"><span class="bond-hero-badge">${glyph('check')} 共同规划</span></div><div class="bond-hero-body"><div class="row between"><div><h2>${e(hero.content?.title||'加密目标')}</h2><p>${e(hero.content?.text||hero.error||'')}</p></div><span class="pill">${e({travel:'2026 秋',anniversary:'纪念日',home:'未来'}[hero.content?.category]||'规划')}</span></div><div class="bond-signers">${initial(state.profile?.name||short(state.user||''),'你的账户')}${glyph('heart')}${initial('？','等待 Ring 建立后的另一位签名者')}<small>${active?'Dual Signers · 双签名者':'建立 Ring 后成为双签名者'}</small></div><div class="bond-metric"><div><strong>${e(String(balance))}</strong><span>/ ${e(hero.content?.target||'—')} BOT</span></div><span class="bond-percent">${percent}% Reached</span></div><div class="bond-track"><span style="width:${percent}%"></span></div><p class="small muted">${target?`链上已存入 ${e(String(balance))} BOT，占规划的 ${percent}%。${active?'':'建立 Active Ring 后才能发起真实存入。'}`:'这条规划还没有写目标金额，可以编辑补上。'}</p><div class="actions">${active?btn(glyph('wallet')+' Deposit Funds · 存入','deposit'):btn('查看接入要求','witness-requirements','','light')} ${(!archived&&(guest||hero.owner?.toLowerCase()===state.user?.toLowerCase()))?btn('编辑规划','edit-goal',`data-id="${e(hero.id)}"`,'light'):''}</div></div></article>`:'')+`<div class="row between bond-milestones-head"><h2>Upcoming Milestones</h2>${btn('+ New Bond · 新目标','new-goal','','compact')}</div><div class="bond-milestones">${milestones.map(m=>{const t=Number(m.content?.target||0),p=t>0?Math.min(100,Math.round(balance/t*100)):0;return `<button class="bond-milestone" data-action="edit-goal" data-id="${e(m.id)}"><span class="bond-milestone-icon">${glyph(m.content?.category==='anniversary'?'gift':m.content?.category==='home'?'heart':'ring')}</span><span class="bond-milestone-body"><b>${e(m.content?.title||'加密规划')}</b><small>${e((m.content?.text||'').slice(0,40))}</small><span class="bond-mini-track"><span style="width:${p}%"></span></span><small class="muted">目标 ${e(m.content?.target||'—')} BOT · 链上 ${e(String(balance))}</small></span>${glyph('next')}</button>`;}).join('')||'<p class="small muted">还没有更多目标。'+(guest?'':'从上方新建开始。')+'</p>'}</div><div class="card bond-multisig"><div class="row between"><b>${glyph('shield')} Multi-Sig State</b><span class="small muted">Threshold: 2 of 2</span></div><div class="bond-state-steps">${[['Created','关系建立',0],['Accumulating','共同存入',1],['Dual Release','双方释放',2]].map(([label,cn,at])=>`<span class="${step>at?'done':''}${step===at?' now':''}"><i></i><small>${label}<br>${cn}</small></span>`).join('')}</div><p class="small muted">${r?.status==='ACTIVE'?'存入记在各自钱包名下；释放与支出需要双方共同发起。':'链上金库在 Romantic Ring 建立后解锁；当前规划仅加密保存在你的空间。'}</p></div><div class="card"><h2>你们的真实贡献</h2>${[r?.a,r?.b].filter(Boolean).map(address=>`<div class="proof-row"><span>${e(short(address))}</span><b>${e(state.formatAmount(r.balances?.[address]||'0'))} BOT</b></div>`).join('')||((state.history||[]).length?`<p class="muted">当前没有进行中的 Ring。你们归档的 Ring 仍保留真实的链上出资记录，点击载入：</p>${(state.history||[]).map(row=>btn('Ring #'+e(row.id)+' · 查看链上出资','archive',`data-id="${e(row.id)}"`,'light')).join('')}`:'<p class="muted">尚未建立 Ring，暂无链上出资记录。</p>')}<div class="actions">${active?btn('使用钱包存入 BOT','deposit'):archived?btn('取回我的剩余贡献','withdraw'):''}</div></div>`+(!goals.length?`<div class="journey-grid">${Object.entries(goalCategories).map(([value,[label,image]])=>`<button class="plan-template" data-action="new-goal" data-category="${value}"><img src="/assets/${image}" width="320" height="160" alt=""><span>${label}</span><small>从你的真实计划开始</small></button>`).join('')}</div>`:'')+`<p class="small muted bond-disclaimer">${glyph('lock')} 加密保存的共同梦想规划；释放须双方共同签名。规划目标不是余额，现有合约不按目标分账。</p>`;
  }
  if(state.route==='vault'){
    const photos=memories.filter(m=>/^data:image\/(jpeg|png|webp);base64,/.test(m.content?.image||'')).slice(0,6);
    return back('me')+head('Bell Vault','Encrypted for both of you.')+`<div class="vault-mosaic">${photos.length?photos.map(m=>`<button data-action="memory-detail" data-id="${e(m.id)}"><img src="${e(m.content.image)}" width="160" height="200" alt="${e(m.content.title||'私人记忆')}"></button>`).join(''):['image','book','lock'].map((name,i)=>`<div class="vault-placeholder">${glyph(name)}<span>${['照片','影像','私人文字'][i]}</span></div>`).join('')}</div><div class="vault-grid">${[['photo','Photos'],['video','Videos'],['note','Notes'],['vow','Vows'],['goal','Plans']].map(([type,label])=>`<div><strong>${guest?'—':counts[type]}</strong><span>${label}</span></div>`).join('')}<div><strong>${guest?'预览':'AES-GCM'}</strong><span>Encrypted</span></div></div><div class="actions">${btn('Manage Vault · 管理记忆','story')}${btn('导出加密档案','export','','light')}</div><details class="card"><summary>${glyph('lock')} 加密与备份说明</summary><p>${e(privateHint)}</p><p>记忆在本机使用 P-256 ECDH 与 AES-256-GCM 加密；服务器只保存密文。导出仅备份密文，不包含私钥。请保留首次登记的浏览器；跨设备密钥恢复和文档上传尚未接入。</p></details>`;
  }
  if(state.route==='witness'){
    const tab=state.witnessTab||'digital',visible=products.filter(p=>tab==='digital'?p[0]==='digital':p[0]!=='digital');
    return back()+head('Love Witness','Turn your story into a lasting symbol.')+`<div class="witness-hero"><img src="/assets/ring-hero.webp" width="360" height="220" alt="玫瑰金戒指设计参考"><span class="eyebrow">A SYMBOL OF US</span></div><div class="journey-filters witness-tabs" aria-label="见证类型">${[['digital','Digital · 数字'],['physical','Physical · 实体']].map(([value,label])=>`<button class="chip ${tab===value?'active':''}" data-action="witness-tab" data-value="${value}" aria-pressed="${tab===value}">${label}</button>`).join('')}</div><div class="witness-list">${visible.map(([value,title,label,image,desc])=>`<button class="witness-option" data-action="witness-detail" data-value="${value}"><img src="/assets/${image}" width="80" height="80" alt=""><div><h2>${title}</h2><p>${desc}</p><span class="small muted">${e(label)} · 设计参考</span></div>${glyph('next')}</button>`).join('')}</div><div class="actions">${btn('Design Your Love Witness','witness-configurator')}</div>`+notice('可以查看和定制设计偏好。当前没有 Witness 铸造或实体履约服务，不会收款、下单或显示已铸造。');
  }
  if(state.route==='witness-detail'){
    const product=products.find(p=>p[0]===state.witnessKind)||products[0],material=state.material||'Rose Gold';return back('witness')+head(product[1],product[2])+`<div class="ring-hero" data-material="${e(material)}"><img src="/assets/${product[3]}" width="280" height="280" alt="${e(product[2])}设计"></div><div class="card"><h2>Your Unique Ring</h2><p class="small muted">外观预览，不是已铸造或可购买的资产。</p><div class="proof-row"><span>Ring</span><b>${r?.id&&r.id!=='0'?'#'+e(r.id):'尚未建立'}</b></div><div class="proof-row"><span>Memories</span><b>${guest?'未加载':counts.photo+counts.video+counts.note}</b></div><div class="proof-row"><span>Confirmed Vows</span><b>${guest?'未加载':r?.vowCount??'尚未读取'}</b></div></div><h3>Material · 材质偏好</h3><div class="materials">${['Rose Gold','Silver','White Gold','Black Titanium'].map(value=>`<button class="material ${material===value?'active':''}" data-action="witness-material" data-value="${value}" aria-label="${value}" aria-pressed="${material===value}"></button>`).join('')}</div><p>${e(material)} · 仅当前页设计偏好</p><div class="actions">${btn('定制我的见证','witness-configurator')+btn(product[0]==='digital'?'查看铸造接入要求':'查看制作接入要求','witness-requirements','','light')}</div>`;
  }
  if(state.route==='witness-configurator'){
    const design=state.witnessDesign||{material:state.material||'Rose Gold',engraving:'',style:'Eternal'},materials=['Rose Gold','Silver','White Gold','Black Titanium'],styles=['Eternal','Minimal','Orbit'];
    return back('witness')+head('Design Your<br>Love Witness','A unique symbol for your story.')+`<form class="form witness-configurator" data-form="witness-design"><div class="witness-design-preview" data-material="${e(design.material)}" data-style="${e(design.style)}"><img src="/assets/ring-hero.webp" width="360" height="280" alt="戒指外观设计预览"><p class="engraving-preview">${e(design.engraving||'Your words. Your story.')}</p><span class="pill">${e(design.style)} · 本地外观预览</span></div><div class="design-controls"><label for="witness-material">Material · 材质<select id="witness-material" name="material">${materials.map(value=>`<option ${value===design.material?'selected':''}>${value}</option>`).join('')}</select></label><label for="witness-engraving">Engraving · 铭文<input id="witness-engraving" name="engraving" maxlength="40" placeholder="写下你们的一句话" value="${e(design.engraving)}"></label><label for="witness-style">Style · 风格<select id="witness-style" name="style">${styles.map(value=>`<option ${value===design.style?'selected':''}>${value}</option>`).join('')}</select></label></div>${submit('更新我的设计预览')}<p class="small muted center">选择保留在当前页面内存中，刷新后清除。<br>不生成资产，不创建订单，不收费。</p></form>`;
  }
  if(state.route==='privacy')return back('me')+head('Privacy','由你决定，哪些内容可以被看见。')+`<form class="form" data-form="privacy"><div class="card"><h2>出现在共鸣雷达中</h2><div class="check"><input id="privacy-visible" type="checkbox" name="discoverable" ${state.profile?.discoverable?'checked':''}><label for="privacy-visible">允许登录用户发现公开资料</label></div><p class="small muted">公开范围为昵称、城市、年龄、兴趣、意向和宣言。私人记忆、加密目标和精确位置不会因此公开。</p></div>${submit(guest?'查看隐私设置':'保存隐私设置')}</form><div class="actions">${btn('撤回附近位置','radar-revoke-location','','light')}${btn('管理加密记忆','vault','','light')}</div>`;
  return undefined;
}
