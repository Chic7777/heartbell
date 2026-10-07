import {test} from 'node:test';
import assert from 'node:assert/strict';
import {view,escape,short,head,btn,notice,input,submit} from './web/view.js';
import {emptyProfile,updateIdentity,onboardingView,carryIdentityDraft} from './web/onboarding.js';
import {storyItems,mediaCounts} from './web/journey.js';
import {createJourneyActions,witnessDesign} from './web/journey-actions.js';
const helpers={escape,short,head,btn,notice,input,submit};

test('four-step identity preserves input, choices and explicit visibility',()=>{
  let draft=updateIdentity(emptyProfile(),1,{name:'真实昵称',city:'武汉'});draft.interests=['Music'];draft=updateIdentity(draft,3,{intention:'Open to connection'});draft=updateIdentity(draft,4,{statement:'一起成长',discoverable:false});
  assert.equal(draft.name,'真实昵称');assert.equal(draft.city,'武汉');assert.deepEqual(draft.interests,['Music']);assert.equal(draft.discoverable,false);
  assert.throws(()=>updateIdentity(emptyProfile(),1,{name:''}),/昵称/);assert.throws(()=>updateIdentity({...draft,interests:Array(9).fill('Art')},2,{}),/八项/);
  for(let identityStep=1;identityStep<=4;identityStep++)assert.match(onboardingView({identityStep,identityDraft:draft,preview:true},helpers),new RegExp(identityStep+'/4'));
});
test('wallet handoff retains a new-user draft without overwriting an existing account',()=>{
  const draft={...emptyProfile(),name:'预览填写',interests:['Travel']};assert.equal(carryIdentityDraft({name:'原账号'},draft),null);const next=carryIdentityDraft(null,draft);assert.equal(next.name,draft.name);next.interests.push('Music');assert.deepEqual(draft.interests,['Travel']);assert.equal(carryIdentityDraft(null,null),null);
});
test('Story and Vault do not count goal budgets as memories or funded balances',()=>{
  const rows=['note','photo','video','goal','vow'].map(type=>({type}));assert.deepEqual(storyItems(rows).map(m=>m.type),['note','photo','video']);assert.equal(storyItems(rows,'video').length,1);assert.deepEqual(mediaCounts(rows),{note:1,photo:1,video:1,goal:1,vow:1});
});
test('visitor journey forms never call private API or encrypted account save',async()=>{
  const state={preview:true,identityStep:1,identityDraft:null,profile:null},calls=[],routes=[];
  const forbidden=()=>{throw new Error('Preview attempted private account operation');};
  const controller=createJourneyActions({state,navigate:r=>routes.push(r),toast:m=>calls.push(['toast',m]),modal:(title,body)=>calls.push(['modal',title,body]),api:forbidden,refresh:forbidden,saveContent:forbidden,fileMedia:()=>({image:'',video:''}),memoryForm:()=>{},helpers});
  for(const [step,fields] of [[1,{name:'<访客草稿>',city:'武汉'}],[2,{}],[3,{intention:'Serious relationship'}],[4,{statement:'未上传'}]]){state.identityStep=step;const data=new FormData();for(const [key,value] of Object.entries(fields))data.set(key,value);assert.equal(await controller.form({dataset:{form:'identity-step'}},data),true);}
  assert.equal(state.profile,null);assert.equal(state.previewProfile.name,'<访客草稿>');assert.equal(routes.at(-1),'path');
  const privacy=new FormData();privacy.set('discoverable','on');assert.equal(await controller.form({dataset:{form:'privacy'}},privacy),true);
  const invite=new FormData();invite.set('address','0x'+'1'.repeat(40));await controller.form({dataset:{form:'invite'}},invite);assert.match(calls.at(-1)[2],/没有创建邀请/);
});
test('encrypted goal edit refuses unreadable or unauthorized content',async()=>{
  const state={preview:false,user:'0xAlice',relation:{status:'ACTIVE'},memories:[{id:'g',type:'goal',owner:'0xAlice',content:null}]};
  let opened=false;const controller=createJourneyActions({state,modal:()=>{opened=true;},helpers});
  const target={dataset:{action:'edit-goal',id:'g'}};
  await assert.rejects(controller.action(target),/解密/);assert.equal(opened,false);
  state.memories[0].content={title:'真实规划'};state.memories[0].owner='0xOther';
  await assert.rejects(controller.action(target),/自己/);assert.equal(opened,false);
  state.memories[0].owner=state.user;state.relation.status='ARCHIVED';
  await assert.rejects(controller.action(target),/未归档/);assert.equal(opened,false);
});
test('journey pages escape content and separate visitor identity from real account records',()=>{
  const base={preview:true,identityStep:1,previewProfile:null,identityDraft:null,previewMemories:[],user:null,relation:null,profile:{name:'PRIVATE'},memories:[],proofs:[],history:[],candidates:[],config:{explorer:''},radarFilters:{city:'',intention:'',radius:0},formatAmount:()=> '0'};
  for(const route of ['identity','path','journey-index','invite-page','invitation-preview','ceremony','story','vows','bond','vault','witness','witness-detail','witness-configurator','privacy']){const html=view({...base,route});assert.match(html,/访客预览/);assert.doesNotMatch(html,/PRIVATE|VISITOR_VIEW_ONLY|Minted|Block #/);}
  const html=view({...base,route:'story',previewMemories:[{id:'draft',type:'note',at:new Date().toISOString(),content:{title:'<script>alert(1)</script>',text:'<img onerror=x>'}}]});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.match(view({...base,route:'witness-detail'}),/外观预览/);assert.match(view({...base,route:'bond'}),/规划目标不是余额/);
});

test('Witness design is an escaped local preference with validated choices',async()=>{
  const state={preview:true},routes=[],messages=[];const forbidden=()=>{throw new Error('design must not call backend');};
  const controller=createJourneyActions({state,navigate:r=>routes.push(r),toast:m=>messages.push(m),api:forbidden,refresh:forbidden,saveContent:forbidden,helpers});
  const data=new FormData();data.set('material','Silver');data.set('style','Orbit');data.set('engraving','<script>test</script>');
  assert.equal(await controller.form({dataset:{form:'witness-design'}},data),true);assert.equal(state.witnessDesign.material,'Silver');assert.equal(state.witnessDesign.style,'Orbit');assert.equal(routes.at(-1),'witness-configurator');
  assert.match(messages[0],/不下单/);assert.throws(()=>witnessDesign({material:'invalid'}),/材质/);assert.throws(()=>witnessDesign({style:'invalid'}),/风格/);assert.throws(()=>witnessDesign({engraving:'字'.repeat(41)}),/40/);
  const html=view({...state,route:'witness-configurator'});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/data-material="Silver"/);assert.match(html,/data-style="Orbit"/);
});
test('Witness browsing filters actual design options without exposing account data',async()=>{
  const state={preview:true},controller=createJourneyActions({state,helpers});await controller.action({dataset:{action:'witness-tab',value:'physical'}});
  const html=view({...state,route:'witness'});assert.match(html,/Physical Ring/);assert.match(html,/Memory Object/);assert.doesNotMatch(html,/<h2>Digital Ring/);
  await assert.rejects(controller.action({dataset:{action:'witness-tab',value:'unknown'}}),/未知/);
});

test('direct binding reviews validated addresses without creating an invitation',async()=>{
  const state={preview:true},routes=[],forbidden=()=>{throw new Error('review must not send transaction');};
  const controller=createJourneyActions({state,navigate:r=>routes.push(r),api:forbidden,refresh:forbidden,helpers});
  const data=new FormData();data.set('address','0x'+'a'.repeat(40));
  assert.equal(await controller.form({dataset:{form:'direct-bind'}},data),true);assert.equal(state.inviteAddress,data.get('address'));assert.equal(routes.at(-1),'invite-page');
  data.set('address','0x'+'0'.repeat(40));await assert.rejects(controller.form({dataset:{form:'direct-bind'}},data),/有效/);
});
