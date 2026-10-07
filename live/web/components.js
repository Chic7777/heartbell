export const text = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  ring:'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16 M8 2l4 3 4-3',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  back:'m15 18-6-6 6-6',next:'m9 18 6-6-6-6',refresh:'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 6 M4 12l2 6a7 7 0 0 0 12-1',
  shield:'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7z m-4 9 3 3 5-5',
  lock:'M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4',wallet:'M3 5h16v15H3z M15 10h6v6h-6z M17 13h1',
  user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21a8 8 0 0 1 16 0',
  book:'M4 3h16v18H4z M8 8h8 M8 12h8 M8 16h5',gift:'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8c-8 0-6-8-2-5l2 5c8 0 6-8 2-5z',
  spark:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
  check:'m5 12 4 4L19 6',close:'m6 6 12 12 M6 18 18 6',pin:'M12 22s8-8 8-14a8 8 0 0 0-16 0c0 6 8 14 8 14z M12 5v6',
  link:'m10 13 4-4 M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  copy:'M8 8h13v13H8z M16 8V3H3v13h5',logout:'M9 3H3v18h6 M9 12h13 m-5-5 5 5-5 5',
  send:'m22 2-7 20-4-9-9-4z m0 0-11 11',clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 6v6l4 2',
  image:'M3 3h18v18H3z m0 13 5-5 4 4 3-3 6 6 M7 7h1',qr:'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h2v2h4v4h-6v-2',
};
export const icon = (name,cls='') => `<svg class="bell-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.ring}"/></svg>`;
export const avatar = (name,label='') => `<span class="bell-avatar" ${label?`role="img" aria-label="${text(label)}"`:'aria-hidden="true"'}>${text(Array.from(String(name||'?'))[0])}</span>`;
export const settingRow = (label,action,name='next',description='',attrs='') => `<button class="bell-setting" data-action="${action}" ${attrs}><span class="bell-setting-icon">${icon(name)}</span><span><b>${text(label)}</b>${description?`<small>${text(description)}</small>`:''}</span>${icon('next')}</button>`;
export const agentCard = (value,attrs='') => `<aside class="bell-agent"><div class="row"><span class="bell-agent-label">${icon('spark')} Bell suggests</span><span class="small muted">可编辑草稿</span></div><p>${text(value)}</p><div class="row"><button class="btn rose compact" data-action="agent-use" ${attrs}>Use This</button><button class="btn light compact" data-action="agent-edit" ${attrs}>Edit</button></div></aside>`;
const phases=[['preparing','Preparing'],['signature','Awaiting Signature'],['submitted','Submitted'],['included','Included'],['confirmed','Confirmed']];
export function transactionStepper(progress){
  const current=phases.findIndex(([id])=>id===progress.stage),failed=progress.stage==='failed';
  return `<section class="bell-transaction" aria-label="交易状态" aria-live="polite"><h3>${text(progress.label||'共同确认')}</h3><ol class="bell-stepper">${phases.map(([id,label],i)=>`<li class="${i<current?'complete':i===current?'current':''}" ${i===current?'aria-current="step"':''}><span>${i<current||id==='confirmed'&&current===4?icon('check'):icon(id==='signature'?'wallet':id==='submitted'?'send':id==='included'?'shield':'ring')}</span><small>${label}</small></li>`).join('')}</ol>${failed?`<p role="alert" class="danger-text">${text(progress.error)}</p>`:`<p class="small muted">${text(progress.message||'请核对钱包中的请求。')}</p>`}${progress.hash?`<p class="small bell-hash">${text(progress.hash)}</p>`:''}</section>`;
}
export function proofSheet(proof,config){
  const confirmed=Boolean(proof.hash&&proof.confirmedAt),url=config.explorer&&/^0x[a-fA-F0-9]{64}$/.test(proof.hash||'')?config.explorer.replace(/\/$/,'')+'/tx/'+proof.hash:'';
  return `<div class="row"><h3>${text((proof.actions||[]).join(' · ')||'Proof of Ring')}</h3><span class="pill ${confirmed?'ok':'pending'}">${icon(confirmed?'shield':'clock')}${confirmed?'Confirmed':'等待回执'}</span></div><dl class="bell-proof">${[['Network',config.chainId===968?'BOT Testnet':'BOT Chain'],['Chain ID',proof.chainId??config.chainId],['Block',proof.block??'未确认'],['Transaction',proof.hash||'尚未提交'],['Time',proof.confirmedAt?new Date(proof.confirmedAt).toLocaleString('zh-CN'):'未确认']].map(([label,value])=>`<div><dt>${text(label)}</dt><dd>${text(value)}</dd></div>`).join('')}</dl>${url?`<a class="btn" href="${text(url)}" target="_blank" rel="noopener noreferrer">View on Explorer ${icon('next')}</a>`:''}`;
}
export const gatewayHero=()=>`<figure class="bell-jewelry-stage" aria-label="两个人共同选择的戒指意象"><div class="bell-jewelry-orbit orbit-outer"></div><div class="bell-jewelry-orbit orbit-inner"></div><div class="bell-jewelry-medallion"><img src="/assets/ring-float.webp" width="280" height="280" fetchpriority="high" alt="玫瑰金戒指"><span>${icon('ring')} One mutual yes</span></div></figure>`;
