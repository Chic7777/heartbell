import test from 'node:test';
import assert from 'node:assert/strict';
import {view,escape,short,head,btn,notice,input,submit} from './web/view.js';
import {createJourneyActions} from './web/journey-actions.js';
const base={preview:false,user:'0x'+'1'.repeat(40),profile:null,relation:null,memories:[],candidates:[],connections:[],proofs:[],history:[],formatAmount:()=> '0',config:{},radarFilters:{city:'',intention:'',radius:0}};
test('Story search only filters loaded readable memories and never searches goal plans',async()=>{
  const state={...base,route:'story',memories:[{id:'note',type:'note',owner:base.user,at:'2026-10-07',content:{title:'Autumn walk',text:'East Lake'}},{id:'goal',type:'goal',at:'2026-10-07',content:{title:'Autumn secret plan'}},{id:'locked',type:'photo',owner:base.user,at:'2026-10-07',error:'Unable to read'}]},forbidden=()=>{throw new Error('Search must not write or fetch');};
  const controller=createJourneyActions({state,api:forbidden,refresh:forbidden,helpers:{escape,short,head,btn,notice,input,submit}}),data=new FormData();data.set('query','AUTUMN');await controller.form({dataset:{form:'story-search'}},data);
  const html=view(state);assert.match(html,/Autumn walk/);assert.doesNotMatch(html,/Autumn secret plan|Unable to read/);
  data.set('query','not found');await controller.form({dataset:{form:'story-search'}},data);assert.match(view(state),/没有找到这段记忆/);await controller.action({dataset:{action:'story-search-clear'}});assert.match(view(state),/Autumn walk/);
});
test('Vow status filters distinguish pending from confirmed without issuing transactions',async()=>{
  const hash='0x'+'2'.repeat(64),state={...base,route:'vows',relation:{status:'ACTIVE',vows:[{index:0,hash,confirmed:true,text:'Confirmed choice'},{index:1,hash:'0x'+'3'.repeat(64),confirmed:false,text:'Pending choice'}]}},forbidden=()=>{throw new Error('Filter must not write');};
  const controller=createJourneyActions({state,api:forbidden,helpers:{escape,short,head,btn,notice,input,submit}});
  await controller.action({dataset:{action:'vow-filter',value:'pending'}});assert.match(view(state),/Pending choice/);assert.doesNotMatch(view(state),/Confirmed choice/);
  await controller.action({dataset:{action:'vow-filter',value:'confirmed'}});assert.match(view(state),/Confirmed choice/);assert.doesNotMatch(view(state),/Pending choice/);
  await assert.rejects(controller.action({dataset:{action:'vow-filter',value:'unknown'}}),/未知/);
});
