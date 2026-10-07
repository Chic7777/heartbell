import {emptyProfile,updateIdentity} from './onboarding.js';
import {goalCategories} from './journey.js';
export function createJourneyActions({state,navigate,modal,toast,api,refresh,saveContent,fileMedia,memoryForm,helpers}){
  const {escape:e,btn,notice,input,submit}=helpers;
  const rows=()=>state.preview?(state.previewMemories||[]):state.memories;
  const goalForm=(id,category)=>{const memory=rows().find(m=>m.id===id),goal=memory?.content;modal(id?'修改共同目标':'Give a future plan some weight',`<form class="form" data-form="goal" ${id?`data-id="${e(id)}"`:''}>${input('目标名称','title',goal?.title||'','required maxlength="80"')}${input('目标预算（BOT，规划金额而非余额）','target',goal?.target||'','maxlength="32" inputmode="decimal"')}<label for="goal-category">主题</label><select id="goal-category" name="category">${Object.entries(goalCategories).map(([value,[label]])=>`<option value="${value}" ${(goal?.category||category)===value?'selected':''}>${label}</option>`).join('')}</select><label for="goal-text">为什么想一起实现它？</label><textarea id="goal-text" name="text" maxlength="2000">${e(goal?.text||'')}</textarea>${notice(state.preview?'未上传草稿：仅当前页面保留，不创建账户或资金记录。':'目标正文会加密保存。现有合约不按目标分账，预算不会被当成已存入金额。')}${submit(state.preview?'保留本页规划草稿':'加密保存规划')}</form>`);};
  return {
    async action(target){
      const action=target.dataset.action;
      if(['path','journey-index','invite-page','invitation-preview','ceremony','privacy'].includes(action)){navigate(action);return true;}
      if(action==='identity'){const profile=state.preview?state.previewProfile:state.profile;state.identityStep=1;state.identityDraft={...emptyProfile(),...profile,interests:[...(profile?.interests||[])]};navigate('identity');return true;}
      if(action==='journey-back'){navigate(target.dataset.route||'home');return true;}
      if(action==='identity-back'){const form=document.querySelector('[data-form="identity-step"]');if(form)state.identityDraft=updateIdentity(state.identityDraft,state.identityStep,Object.fromEntries(new FormData(form)));state.identityStep=Math.max(1,state.identityStep-1);navigate('identity');return true;}
      if(action==='identity-interest'){const draft=state.identityDraft||{...emptyProfile(),...state.profile},value=target.dataset.value;if(draft.interests.includes(value))draft.interests=draft.interests.filter(i=>i!==value);else{if(draft.interests.length>=8)throw new Error('最多选择八项兴趣。');draft.interests=[...draft.interests,value];}state.identityDraft=draft;return true;}
      if(action==='story-filter'){state.storyFilter=target.dataset.value;return true;}
      if(action==='witness-detail'){state.witnessKind=target.dataset.value;navigate('witness-detail');return true;}
      if(action==='witness-material'){if(!['Rose Gold','Silver','White Gold','Black Titanium'].includes(target.dataset.value))throw new Error('未知材质');state.material=target.dataset.value;return true;}
      if(action==='witness-requirements'){modal('真实见证尚待接入',notice('数字见证需要已部署、可核验的铸造合约；实体戒指与记忆物件需要真实制作、定价、订单、退款及履约服务。当前只保留外观偏好，不铸造、不下单、不收费。')+btn('返回设计','close'));return true;}
      if(action==='new-goal'||action==='edit-goal'){
        if(action==='edit-goal'){
          const memory=rows().find(m=>m.id===target.dataset.id);
          if(!memory?.content)throw new Error('当前无法解密这份规划，请在原浏览器解锁后再修改。');
          if(!state.preview&&(memory.owner?.toLowerCase()!==state.user?.toLowerCase()||state.relation?.status==='ARCHIVED'))throw new Error('只能修改自己在未归档空间中的规划。');
        }
        goalForm(target.dataset.id,target.dataset.category||'travel');return true;
      }
      if(action==='memory'&&state.preview){memoryForm();return true;}
      if(action==='edit-memory'&&state.preview){memoryForm(target.dataset.id);return true;}
      if(action==='memory-detail'){
        const memory=rows().find(m=>m.id===target.dataset.id);if(!memory)throw new Error('记忆已变化，请刷新。');const c=memory.content;
        const image=/^data:image\/(jpeg|png|webp);base64,/.test(c?.image||'')?`<img class="photo" src="${e(c.image)}" alt="${e(c.title||'记忆照片')}">`:'';
        const video=/^data:video\/(mp4|webm);base64,/.test(c?.video||'')?`<video class="memory-video" controls preload="metadata" src="${e(c.video)}" aria-label="${e(c.title||'记忆视频')}"></video>`:'';
        modal(e(c?.title||'加密记忆'),`<p>${e(c?.text||memory.error||'')}</p>${image}${video}${notice(state.preview?'未上传草稿，不是共享或链上记录。':'内容保存在当前授权空间内，服务器只保存密文。')}${(state.preview||memory.owner.toLowerCase()===state.user.toLowerCase())&&state.relation?.status!=='ARCHIVED'?btn('编辑','edit-memory',`data-id="${e(memory.id)}"`,'light'):''}`);return true;
      }
      if(action==='new-vow'&&state.preview){modal('Our Vow · 未上链草稿',`<form class="form" data-form="vow"><label for="preview-vow">想与你共同选择的一句话</label><textarea id="preview-vow" name="text" maxlength="200" required></textarea>${submit('仅预览正文')}</form>`);return true;}
      if(action==='vow-detail'){
        const vow=state.relation?.vows?.find(v=>String(v.index)===target.dataset.index);if(!vow)throw new Error('这份誓言尚未加载。');const memory=state.memories.find(m=>m.body.hash?.toLowerCase()===vow.hash.toLowerCase());
        modal('Our Vow',`<p class="quote">${e(memory?.content?.text||vow.text||'正文暂不可读，不能核对承诺。')}</p><span class="pill ${vow.confirmed?'ok':'pending'}">${vow.confirmed?'双方已确认':'等待对方确认'}</span><div class="proof-row"><span>提出者</span><b>${e(vow.by)}</b></div><details class="card"><summary>核对内容哈希</summary><p class="small">${e(vow.hash)}</p></details>${!vow.confirmed&&vow.by.toLowerCase()!==(state.chainAddress||state.user).toLowerCase()?btn('核对正文并确认','confirm-vow',`data-index="${vow.index}"`):''}${btn('查看真实交易记录','proofs','','light')}`);return true;
      }
      return false;
    },
    async form(form,data){
      const value=key=>String(data.get(key)||'').trim(),kind=form.dataset.form;
      if(kind==='identity-step'){
        const step=state.identityStep||1,draft=updateIdentity(state.identityDraft||state.profile||emptyProfile(),step,{...Object.fromEntries(data),discoverable:data.has('discoverable')});state.identityDraft=draft;
        if(step<4){state.identityStep=step+1;navigate('identity');return true;}
        if(state.preview){state.previewProfile=draft;toast('身份仅作未上传预览草稿，不创建真实账号。');navigate('path');return true;}
        await api('/api/profile',{method:'PUT',body:draft});await refresh();navigate('path');toast('身份已保存，可选择寻找或绑定伴侣。');return true;
      }
      if(kind==='goal'){
        const target=value('target');if(target&&!/^\d{1,12}(\.\d{1,18})?$/.test(target))throw new Error('请输入有效的非负规划预算。');if(!goalCategories[value('category')])throw new Error('请选择目标主题。');
        const content={title:value('title'),target,category:value('category'),text:value('text')};if(!content.title)throw new Error('请为目标起一个名字。');
        if(state.preview){const old=rows().find(m=>m.id===form.dataset.id),memory={id:old?.id||crypto.randomUUID(),type:'goal',content,at:old?.at||new Date().toISOString()};state.previewMemories=[...rows().filter(m=>m.id!==memory.id),memory];toast('只保留本页草稿，未上传或分配链上资金。');}
        else{await saveContent(content,'goal',form.dataset.id);await refresh();toast('目标规划已加密保存，未移动资金。');}
        dialogClose();navigate('bond');return true;
      }
      if(kind==='privacy'){
        if(state.preview){toast('这里只预览设置，未修改真实资料。');return true;}
        if(!state.profile)throw new Error('先完成身份资料。');await api('/api/profile',{method:'PUT',body:{...state.profile,discoverable:data.has('discoverable')}});await refresh();toast('公开范围已更新。');return true;
      }
      if(state.preview&&kind==='memory'){
        const old=rows().find(m=>m.id===form.dataset.id),media=await fileMedia(data.get('image')),changed=Boolean(media.image||media.video),image=changed?media.image:old?.content?.image||'',video=changed?media.video:old?.content?.video||'';
        const memory={id:old?.id||crypto.randomUUID(),type:video?'video':image?'photo':'note',content:{title:value('title'),text:value('text'),image,video},at:old?.at||new Date().toISOString()};state.previewMemories=[...rows().filter(m=>m.id!==memory.id),memory];dialogClose();navigate('story');toast('未上传草稿：没有保存到账户或链上。');return true;
      }
      if(state.preview&&kind==='vow'){modal('誓言正文预览',`<p class="quote">${e(value('text'))}</p>`+notice('没有发起链上誓言，也没有对方确认。')+btn('返回誓言页面','vows'));return true;}
      if(state.preview&&kind==='invite'){modal('邀请前核对',`<p class="small">目标地址：${e(value('address'))}</p>`+notice('仅查看流程，没有创建邀请或请求签名。')+btn('查看接收与确认页面','invitation-preview'));return true;}
      return false;
    }
  };
  function dialogClose(){const dialog=document.querySelector('#sheet');if(dialog.open)dialog.close();}
}
