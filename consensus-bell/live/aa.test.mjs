import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { Wallet, getBytes, getAddress } from 'ethers';
import { createAA } from './aa.mjs';
import { AA_DEFAULTS, accountABI, bellABI, entryABI, factoryABI, userOpHash } from './aa-protocol.mjs';
import { mirrorReceipt } from './aa-receipts.mjs';

const contract='0x0000000000000000000000000000000000000010',sender='0x0000000000000000000000000000000000000020',invitee='0x0000000000000000000000000000000000000030';
const txHash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
async function fixture(t,options={}){
  const owner=Wallet.createRandom(),other=Wallet.createRandom();
  const state={deployed:false,nonce:'0x0',sent:[],receipt:null,chainReceipt:null,latest:'0x11',canonical:blockHash,wrongHash:false,wrongOwner:false,methods:[],sendError:null,relationStatus:2};
  const server=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const request=JSON.parse(text);const {method,params}=request;state.methods.push(method);let result;
    if(method==='eth_sendUserOperation'&&state.sendError){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,error:state.sendError}));return;}
    switch(method){
      case 'eth_chainId':result='0x2a5';break;
      case 'eth_supportedEntryPoints':result=[AA_DEFAULTS.entryPoint];break;
      case 'eth_getCode':result=getAddress(params[0])===sender?(state.deployed?'0x6000':'0x'):'0x6000';break;
      case 'eth_call':{
        const [call]=params;
        if(getAddress(call.to)===getAddress(AA_DEFAULTS.factory)){const parsed=factoryABI.parseTransaction(call);assert.equal(parsed.name,'getAddress');assert.equal(parsed.args[0],owner.address);result=factoryABI.encodeFunctionResult('getAddress',[sender]);}
        else if(getAddress(call.to)===getAddress(AA_DEFAULTS.entryPoint))result=entryABI.encodeFunctionResult('getNonce',[state.nonce]);
        else if(getAddress(call.to)===sender){const parsed=accountABI.parseTransaction(call);result=accountABI.encodeFunctionResult(parsed.name,[parsed.name==='owner'?(state.wrongOwner?other.address:owner.address):AA_DEFAULTS.entryPoint]);}
        else if(getAddress(call.to)===contract)result=bellABI.encodeFunctionResult('relations',[sender,invitee,1,2,state.relationStatus,0]);
        else throw new Error('Unexpected contract read');break;
      }
      case 'skandha_getGasPrice':result={maxFeePerGas:'0x20',maxPriorityFeePerGas:'0x2'};break;
      case 'eth_estimateGas':assert.equal(getAddress(params[0].from),AA_DEFAULTS.entryPoint);assert.equal(getAddress(params[0].to),sender);result=state.executionGas||'0x10000';break;
      case 'eth_estimateUserOperationGas':result={callGasLimit:state.callGas||'0x20000',verificationGasLimit:state.verificationGas||'0x30000',preVerificationGas:'0x10000'};break;
      case 'eth_sendUserOperation':state.sent.push(params[0]);result=state.wrongHash?'0x'+'c'.repeat(64):userOpHash(params[0],AA_DEFAULTS.entryPoint,677);break;
      case 'eth_getUserOperationReceipt':result=state.receipt;break;
      case 'eth_getUserOperationByHash':result=state.receipt?{userOperation:state.sent.at(-1),entryPoint:AA_DEFAULTS.entryPoint,transactionHash:txHash}:null;break;
      case 'eth_getTransactionReceipt':result=state.chainReceipt;break;
      case 'eth_getTransactionByHash':result=state.chainReceipt?{hash:txHash,to:AA_DEFAULTS.entryPoint,blockHash,blockNumber:'0x10'}:null;break;
      case 'eth_blockNumber':result=state.latest;break;
      case 'eth_getBlockByNumber':result={hash:state.canonical};break;
      default:throw new Error(`Unexpected RPC ${method}`);
    }
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const rpc=`http://127.0.0.1:${server.address().port}`,db=new DatabaseSync(':memory:'),aa=createAA(db,{rpc,bundler:rpc,contract,pollMs:0,...options});
  t.after(async()=>{await aa.close();db.close();await new Promise(resolve=>server.close(resolve));});
  const call=(path,method,body={},address=owner.address)=>aa.handle({path,method,body,address});
  async function initialize(){const {body:challenge}=await call('/api/wallet/challenge','POST');return call('/api/wallet/init','POST',{id:challenge.id,signature:await owner.signMessage(challenge.message)});}
  async function prepare(action={action:'invite',invitee}){return (await call('/api/userops/prepare','POST',action)).body;}
  async function submit(prepared){return call('/api/userops/submit','POST',{id:prepared.id,userOperation:{...prepared.userOperation,signature:await owner.signMessage(getBytes(prepared.userOpHash))}});}
  function include(prepared,{success=true,business=true}={}){
    const event=entryABI.encodeEventLog(entryABI.getEvent('UserOperationEvent'),[prepared.userOpHash,sender,'0x0000000000000000000000000000000000000000',prepared.userOperation.nonce,success,100n,50n]);
    const invite=bellABI.encodeEventLog(bellABI.getEvent('InvitationCreated'),[sender,invitee]);
    state.receipt={userOpHash:prepared.userOpHash,sender,success,receipt:{transactionHash:txHash}};
    state.chainReceipt={transactionHash:txHash,to:AA_DEFAULTS.entryPoint,blockNumber:'0x10',blockHash,status:'0x1',logs:[...(business?[{address:contract,...invite,logIndex:'0x0'}]:[]),{address:AA_DEFAULTS.entryPoint,...event,logIndex:'0x1'}]};
  }
  return {aa,db,state,owner,other,call,initialize,prepare,submit,include};
}

test('Owner proof creates immutable counterfactual wallet and one-time challenge',async t=>{
  const f=await fixture(t),{body:challenge}=await f.call('/api/wallet/challenge','POST');
  await assert.rejects(f.call('/api/wallet/init','POST',{id:challenge.id,signature:await f.other.signMessage(challenge.message)}),/does not match/);
  const body={id:challenge.id,signature:await f.owner.signMessage(challenge.message)};
  const result=await f.call('/api/wallet/init','POST',body);assert.equal(result.body.sender,sender);assert.equal(f.aa.identity(f.owner.address),sender);
  await assert.rejects(f.call('/api/wallet/init','POST',body),/already used/);
  await assert.rejects(f.call('/api/wallet/challenge','POST',{salt:'1'}),/immutable/);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aa_wallets').get().n,1);
});
test('Prepare persists v0.7 operation and prevents mutation, impersonation and duplicate nonce',async t=>{
  const f=await fixture(t);await f.initialize();const prepared=await f.prepare();
  assert.equal(prepared.userOperation.sender,sender);assert.equal(prepared.userOperation.factory,getAddress(AA_DEFAULTS.factory));assert.equal(prepared.userOperation.nonce,'0x0');
  assert.equal(f.db.prepare('SELECT status FROM aa_operations WHERE id=?').get(prepared.id).status,'prepared');
  await assert.rejects(f.prepare(),/already awaiting/);
  await assert.rejects(f.call('/api/userops/submit','POST',{id:prepared.id,userOperation:{...prepared.userOperation,callData:'0x',signature:'0x'}}),/differs/);
  await assert.rejects(f.call('/api/userops/submit','POST',{id:prepared.id,userOperation:{...prepared.userOperation,signature:await f.other.signMessage(getBytes(prepared.userOpHash))}}),/does not match/);
  await assert.rejects(f.call(`/api/userops/${prepared.id}`,'GET',{},f.other.address),/not found/);
  assert.equal(f.state.sent.length,0);
  await f.submit(prepared);assert.equal(f.state.sent.length,1);await f.submit(prepared);assert.equal(f.state.sent.length,1);
});
test('Receipt worker verifies actual chain confirmations and mirrors once without getLogs',async t=>{
  const f=await fixture(t);await f.initialize();const prepared=await f.prepare();const updates=[],partnerUpdates=[];f.aa.subscribe(f.owner.address,update=>updates.push(update));f.db.prepare('INSERT INTO aa_wallets VALUES(?,?,?,?,?,?)').run(f.other.address,'677',invitee,getAddress(AA_DEFAULTS.factory),'0',Date.now());f.aa.subscribe(f.other.address,update=>partnerUpdates.push(update));await f.submit(prepared);f.include(prepared);
  f.state.latest='0x10';await f.aa.poll();assert.equal((await f.call(`/api/userops/${prepared.id}`,'GET')).body.status,'INCLUDED');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aa_chain_events').get().n,0);
  f.state.latest='0x11';f.state.canonical='0x'+'d'.repeat(64);await f.aa.poll();assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aa_chain_events').get().n,0);
  f.state.canonical=blockHash;await f.aa.poll();const settled=(await f.call(`/api/userops/${prepared.id}`,'GET')).body;assert.equal(settled.status,'CONFIRMED');assert.equal(settled.transactionHash,txHash);
  await f.aa.poll();assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aa_chain_events').get().n,1);assert.ok(updates.some(update=>update.status==='CONFIRMED'));assert.ok(!f.state.methods.includes('eth_getLogs'));assert.equal(partnerUpdates.length,1);assert.equal(partnerUpdates[0].reason,'partner-settlement');assert.ok(!Object.hasOwn(partnerUpdates[0],'userOperation'));
});
test('A successful bundle with failed UserOperation never creates business mirrors',async t=>{
  const f=await fixture(t);await f.initialize();const prepared=await f.prepare();await f.submit(prepared);f.include(prepared,{success:false,business:false});await f.aa.poll();
  assert.equal((await f.call(`/api/userops/${prepared.id}`,'GET')).body.status,'FAILED');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aa_chain_events').get().n,0);
});
test('Missing contract event and mismatched EntryPoint prevent confirmation',async t=>{
  const f=await fixture(t);await f.initialize();const prepared=await f.prepare();await f.submit(prepared);f.include(prepared,{business:false});await f.aa.poll();assert.match((await f.call(`/api/userops/${prepared.id}`,'GET')).body.error,/No matching/);
  f.include(prepared);f.state.chainReceipt.to=invitee;await f.aa.poll();assert.match((await f.call(`/api/userops/${prepared.id}`,'GET')).body.error,/identity mismatch/);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aa_chain_events').get().n,0);
});
test('Deployed account omits factory fields and checks on-chain owner',async t=>{
  const f=await fixture(t);await f.initialize();f.state.deployed=true;f.state.wrongOwner=true;await assert.rejects(f.prepare(),/owner or EntryPoint mismatch/);f.state.wrongOwner=false;const prepared=await f.prepare();assert.ok(!Object.hasOwn(prepared.userOperation,'factory'));assert.ok(!Object.hasOwn(prepared.userOperation,'factoryData'));
});
test('Arbitrary target, calldata and public vow text cannot enter typed prepare endpoint',async t=>{
  const f=await fixture(t);await f.initialize();await assert.rejects(f.prepare({action:'invite',invitee,target:invitee}),/Unrecognized key/);await assert.rejects(f.prepare({action:'privateVow',contentHash:'0x'+'0'.repeat(64)}));await assert.rejects(f.prepare({action:'transfer',value:'10'}));assert.equal(f.state.sent.length,0);
});
test('Verified identity is required for sponsorship while self-funded EOA operations remain allowed',async t=>{
  const f=await fixture(t,{requireVerifiedSponsorIdentity:true});await f.initialize();await assert.rejects(f.prepare({action:'invite',invitee,sponsor:true}),/Verify your embedded-wallet identity/);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aa_operations').get().n,0);await f.prepare({action:'invite',invitee});
});
test('Expired identical intent can be prepared again without hash uniqueness failure',async t=>{
  const f=await fixture(t);await f.initialize();const first=await f.prepare();f.db.prepare('UPDATE aa_operations SET expires=? WHERE id=?').run(Date.now()-1,first.id);const next=await f.prepare();assert.equal(next.id,first.id);assert.equal(next.userOpHash,first.userOpHash);assert.ok(next.expiresAt>Date.now());assert.equal(f.db.prepare('SELECT status FROM aa_operations WHERE id=?').get(next.id).status,'prepared');
});
test('Definitive Bundler validation rejection fails safely and permits reprepare',async t=>{
  const f=await fixture(t);await f.initialize();const first=await f.prepare();f.state.sendError={code:-32507,message:'AA24 signature error'};const result=await f.submit(first);assert.equal(result.body.status,'FAILED');assert.match(result.body.error,/AA24/);f.state.sendError=null;const next=await f.prepare();assert.equal(next.id,first.id);await f.submit(next);assert.equal(f.state.sent.length,1);
});
test('Unexpected send hash remains reconcilable and blocks unsafe duplicate operations',async t=>{
  const f=await fixture(t);await f.initialize();const prepared=await f.prepare();f.state.wrongHash=true;const submitted=await f.submit(prepared);assert.equal(submitted.body.status,'SUBMITTED');assert.equal(submitted.body.phase,'submitting');await assert.rejects(f.prepare(),/already awaiting/);f.state.wrongHash=false;await f.aa.poll();assert.equal((await f.call(`/api/userops/${prepared.id}`,'GET')).body.phase,'submitted');
});
test('Withdrawal requires archived membership and encodes only withdrawFrom',async t=>{
  const f=await fixture(t);await f.initialize();f.state.relationStatus=0;await assert.rejects(f.prepare({action:'withdraw',relationId:'1'}),/Only archived/);f.state.relationStatus=2;const prepared=await f.prepare({action:'withdraw',relationId:'1'});const outer=accountABI.parseTransaction({data:prepared.userOperation.callData}),inner=bellABI.parseTransaction({data:outer.args[2]});assert.equal(inner.name,'withdrawFrom');assert.equal(inner.args[0],1n);assert.equal(outer.args[0],contract);assert.equal(outer.args[1],0n);
});
test('Sponsor authorization preserves final estimated gas fields and never signs for user',async t=>{
  const phases=[],paymaster=getAddress('0x0000000000000000000000000000000000000040');
  const f=await fixture(t,{sponsor:async context=>{phases.push(context);return {paymaster,paymasterVerificationGasLimit:'0x186a0',paymasterPostOpGasLimit:'0x7530',paymasterData:context.phase==='estimate'?'0x':'0xab'};}});await f.initialize();const prepared=await f.prepare({action:'invite',invitee,sponsor:true});assert.deepEqual(phases.map(v=>v.phase),['estimate','authorize']);assert.equal(prepared.userOperation.callGasLimit,phases[1].userOperation.callGasLimit);assert.equal(prepared.userOperation.paymasterData,'0xab');assert.equal(prepared.sponsored,true);assert.equal(f.state.sent.length,0);
});
test('Confirmed event mirrors retain vow consensus, exact Bond amount and accepted invitations on replay',async t=>{
  const f=await fixture(t),config={chainId:677,contract};
  const creation={status:'confirmed',txHash,block:10,blockHash,events:[{name:'InvitationCreated',args:[sender,invitee],logIndex:1},{name:'RelationCreated',args:['1',sender,invitee,'100'],logIndex:2}]};
  const propose={status:'confirmed',txHash:'0x'+'c'.repeat(64),block:10,blockHash,events:[{name:'VowProposed',args:['1','0',sender,'0x'+'e'.repeat(64)],logIndex:3}]};
  const confirm={status:'confirmed',txHash:'0x'+'d'.repeat(64),block:10,blockHash,events:[{name:'VowConfirmed',args:['1','0',invitee,'1'],logIndex:4},{name:'Deposited',args:['1',sender,'12345678901234567890','12345678901234567890'],logIndex:5},{name:'RelationArchived',args:['1',invitee,true],logIndex:6}]};
  mirrorReceipt(f.db,{},config,creation);mirrorReceipt(f.db,{},config,propose);assert.equal(JSON.parse(f.db.prepare('SELECT body FROM aa_vow_state').get().body).confirmed,false);
  mirrorReceipt(f.db,{},config,confirm);mirrorReceipt(f.db,{},config,creation);mirrorReceipt(f.db,{},config,propose);mirrorReceipt(f.db,{},config,confirm);
  const ring=JSON.parse(f.db.prepare('SELECT body FROM aa_ring_state').get().body),vow=JSON.parse(f.db.prepare('SELECT body FROM aa_vow_state').get().body);
  assert.equal(ring.status,'ARCHIVED');assert.equal(ring.vowCount,1);assert.equal(vow.confirmed,true);assert.equal(vow.proposer,sender);assert.equal(f.db.prepare('SELECT state FROM aa_invitations').get().state,'ACCEPTED');assert.equal(f.db.prepare('SELECT amount_wei FROM aa_bond_deposits').get().amount_wei,'12345678901234567890');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aa_bond_deposits').get().n,1);
});
test('Same-block out-of-order mirrors preserve ARCHIVED and confirmed vows while filling provenance',async t=>{
  const f=await fixture(t),config={chainId:677,contract},result=(hash,events)=>({status:'confirmed',txHash:'0x'+hash.repeat(64),block:10,blockHash,events});
  mirrorReceipt(f.db,{},config,result('a',[{name:'RelationArchived',args:['1',invitee,true],logIndex:6}]));
  mirrorReceipt(f.db,{},config,result('b',[{name:'VowConfirmed',args:['1','0',invitee,'1'],logIndex:4}]));
  mirrorReceipt(f.db,{},config,result('c',[{name:'VowProposed',args:['1','0',sender,'0x'+'e'.repeat(64)],logIndex:3}]));
  mirrorReceipt(f.db,{},config,result('d',[{name:'RelationCreated',args:['1',sender,invitee,'100'],logIndex:2}]));
  const ring=JSON.parse(f.db.prepare('SELECT body FROM aa_ring_state').get().body),vow=JSON.parse(f.db.prepare('SELECT body FROM aa_vow_state').get().body);assert.equal(ring.status,'ARCHIVED');assert.equal(ring.vowCount,1);assert.equal(ring.a,sender);assert.equal(vow.confirmed,true);assert.equal(vow.proposer,sender);
});
test('Idle AA poll performs no RPC readiness calls on legacy chain configuration',async t=>{
  const f=await fixture(t,{chainId:31337});await f.aa.poll();assert.deepEqual(f.state.methods,[]);
});
test('Closing during failed background readiness still completes resource cleanup',async t=>{
  const f=await fixture(t,{chainId:31337}),errors=[];t.mock.method(console,'error',(...args)=>errors.push(args.join(' ')));
  f.db.prepare('INSERT INTO aa_operations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('pending',f.owner.address,sender,'31337',getAddress(AA_DEFAULTS.entryPoint),contract,'{}','{}','0x'+'f'.repeat(64),'submitted',Date.now()+60000,Date.now(),Date.now(),null,null);
  const failure=f.aa.poll().catch(error=>error.message);await f.aa.close();assert.match(await failure,/must match configured chain/);assert.equal(errors.length,1);await f.aa.poll();
});

test('Deployed account execution gas cannot be undercounted by Bundler estimate',async t=>{
  const f=await fixture(t);await f.initialize();f.state.deployed=true;f.state.callGas='0xdcb4';f.state.executionGas='0x1bae8';
  const prepared=await f.prepare({action:'privateVow',contentHash:'0x'+'12'.repeat(32)});
  assert.ok(BigInt(prepared.userOperation.callGasLimit)>=113384n);
});

test('Verification budget accounts for real signature validation beyond tight Bundler estimate',async t=>{
 const f=await fixture(t);await f.initialize();f.state.deployed=true;f.state.verificationGas='0x7801';
 const prepared=await f.prepare();assert.ok(BigInt(prepared.userOperation.verificationGasLimit)>=40721n);
});
