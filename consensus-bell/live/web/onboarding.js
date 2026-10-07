export const emptyProfile=()=>({name:'',city:'',gender:'',age:'',interests:[],statement:'',intention:'Serious relationship',discoverable:false});
export const carryIdentityDraft=(existingProfile,visitorDraft)=>!existingProfile&&visitorDraft?{...visitorDraft,interests:[...(visitorDraft.interests||[])]}:null;
export const interestChoices=[['Music','音乐','in-music.jpg'],['Travel','旅行','in-travel.jpg'],['Photography','摄影','in-photo.jpg'],['Food','美食','in-food.jpg'],['Reading','阅读','in-reading.jpg'],['Movies','电影','in-movies.jpg'],['AI','AI','in-ai.jpg'],['Art','艺术','in-art.jpg'],['Sports','运动','in-sports.jpg']];
export function updateIdentity(draft,step,fields){
  const next={...emptyProfile(),...draft,interests:[...(draft?.interests||[])]};
  if(step===1){for(const key of ['name','city','gender','age'])next[key]=String(fields[key]||'').trim();if(!next.name)throw new Error('先告诉我们你的昵称。');if(next.name.length>40)throw new Error('昵称最多 40 个字。');}
  if(step===3)next.intention=String(fields.intention||next.intention).trim();
  if(step===4){next.statement=String(fields.statement||'').trim();next.discoverable=Boolean(fields.discoverable);if(next.statement.length>200)throw new Error('爱情宣言最多 200 个字。');}
  if(next.interests.length>8)throw new Error('最多选择八项兴趣。');return next;
}
export function onboardingView(state,{escape,head,input,submit,btn}){
  const step=state.identityStep||1,draft={...emptyProfile(),...state.profile,...state.identityDraft};
  const titles=['Who are you?','What do you love?','What do you seek?','What does love mean to you?'];
  let fields='';
  if(step===1)fields=`<div class="identity-initial" aria-hidden="true">${escape(Array.from(draft.name)[0]||'你')}</div>${input('昵称','name',draft.name,'required maxlength="40" autocomplete="nickname"')}${input('城市','city',draft.city,'maxlength="60" autocomplete="address-level2"')}${input('性别（可选）','gender',draft.gender,'maxlength="30"')}${input('年龄范围（可选）','age',draft.age,'maxlength="30"')}`;
  if(step===2)fields=`<div class="interest-grid">${interestChoices.map(([value,label,image])=>`<button type="button" class="interest ${draft.interests.includes(value)?'selected':''}" data-action="identity-interest" data-value="${value}" aria-pressed="${draft.interests.includes(value)}"><img src="/assets/${image}" width="160" height="108" alt=""><span>${label}</span></button>`).join('')}</div><p class="small muted">已选择 ${draft.interests.length}/8 项；可跳过，之后随时修改。</p>`;
  if(step===3)fields=[['Serious relationship','认真建立关系','寻找愿意长期一起成长的人'],['Open to connection','先认识彼此','见面、交流，让关系自然发生'],['Already in love','已经有了彼此','把已经存在的关系连接起来'],['Just exploring','先探索一下','不急着承诺，先了解自己']].map(([value,label,desc])=>`<div class="radio-card"><input type="radio" id="intention-${value.replaceAll(' ','-')}" name="intention" value="${value}" ${draft.intention===value?'checked':''}><label for="intention-${value.replaceAll(' ','-')}">${label}<p>${desc}</p></label></div>`).join('');
  if(step===4)fields=`<label for="identity-statement">用自己的话，描述你期待的关系</label><textarea id="identity-statement" name="statement" maxlength="200" placeholder="例如：一起看世界，也愿意认真听彼此说话。">${escape(draft.statement)}</textarea><p class="small muted">最多 200 个字；这些是你的自我表达，不是链上承诺。</p><div class="check"><input id="identity-visible" type="checkbox" name="discoverable" ${draft.discoverable?'checked':''}><label for="identity-visible">允许已登录用户发现我的公开资料（昵称、城市、年龄、兴趣、意向与宣言）。随时可关闭。</label></div>`;
  return `<div class="journey-stepper" aria-label="创建身份，第 ${step} 步，共四步">${[1,2,3,4].map(n=>`<span class="${n<=step?'done':''}"></span>`).join('')}<b>${step}/4</b></div>${head(titles[step-1],['从一个属于你的名字开始。','选择你真正喜欢的事。','不替你作决定，只帮助你表达。','关系开始于理解，而不是一个完美答案。'][step-1])}<form class="form" data-form="identity-step">${fields}${submit(step===4?(state.preview?'完成预览草稿':'保存我的身份'):'下一步')}${step>1?btn('上一步','identity-back','type="button"','light'):btn('返回','home','type="button"','light')}</form>`;
}
