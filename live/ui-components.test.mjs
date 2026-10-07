import test from 'node:test';
import assert from 'node:assert/strict';
import {proofSheet,transactionStepper,avatar} from './web/components.js';
import {view} from './web/view.js';
const base={preview:true,user:null,route:'home',profile:null,relation:null,candidates:[],memories:[],proofs:[],history:[],config:{chainId:968,explorer:'https://scan.bohr.life'},radarFilters:{city:'',intention:'',radius:0},formatAmount:()=> '0'};
test('new visitor screens cannot expose prior account details or proofs',()=>{
  const privateState={...base,user:'PRIVATE_WALLET',profile:{name:'PRIVATE_NAME'},relation:{status:'ACTIVE',id:'PRIVATE_RING'},proofs:[{hash:'PRIVATE_HASH'}],candidates:[{address:'PRIVATE_ECHO'}]};
  for(const route of ['echo-results','echo-detail','echo-chat','me','relationship-settings','waiting','acceptance','archived','proofs'])assert.doesNotMatch(view({...privateState,route}),/PRIVATE_/);
});
test('proof disclosure links only a supplied transaction hash and preserves escaping',()=>{
  const hash='0x'+'1'.repeat(64),config={chainId:968,explorer:'https://scan.bohr.life'};
  const pending=proofSheet({actions:['<script>'],hash:''},config);assert.doesNotMatch(pending,/href=|<script>/);
  const confirmed=proofSheet({hash,confirmedAt:'2026-10-07T00:00:00Z',block:123,actions:['RelationCreated'],chainId:968},config);
  assert.match(confirmed,new RegExp('https://scan.bohr.life/tx/'+hash));assert.match(confirmed,/BOT Testnet/);
});
test('transaction state never marks an unconfirmed phase complete and exposes failure safely',()=>{
  const html=transactionStepper({stage:'submitted',hash:'0x123'});assert.equal((html.match(/class="complete"/g)||[]).length,2);assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
  const failed=transactionStepper({stage:'failed',error:'<img onerror=x>'});assert.match(failed,/role="alert"/);assert.doesNotMatch(failed,/<img/);
});
test('initial avatars and real candidates escape public self-reported content',()=>{
  assert.doesNotMatch(avatar('<','<script>'),/<script>/);
  const state={...base,preview:false,user:'0xUser',route:'echo-detail',echoAddress:'0xEcho',candidates:[{address:'0xEcho',name:'<script>',age:'24',city:'Wuhan',interests:['<img>'],statement:'<script>alert(1)</script>',reasons:['<b>reason</b>']}]};
  const html=view(state);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img>/);
});
