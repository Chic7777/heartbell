import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {JsonRpcProvider,ContractFactory,Contract,keccak256,toUtf8Bytes,parseEther} from 'ethers';
import {createApp} from './server.mjs';
import {ABI} from './chain.mjs';

test('real local chain and HTTP sessions enforce bilateral consensus and verified receipts', {timeout:90000},async()=>{
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const binary=process.env.ANVIL_PATH||'C:/Users/llwxy/.foundry/bin/anvil.exe';
  const anvil=spawn(binary,['--host','127.0.0.1','--port',String(port),'--block-time','1'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let text='';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Local node did not start')),10000);anvil.on('error',e=>{clearTimeout(timer);reject(e);});anvil.stdout.on('data',chunk=>{text+=chunk;if(text.includes('Listening on')){clearTimeout(timer);resolve();}});});
  const provider=new JsonRpcProvider('http://127.0.0.1:'+port),dataDir=await mkdtemp(path.join(os.tmpdir(),'consensus-bell-chain-'));
  let app;
  try {
    const alice=await provider.getSigner(0),bob=await provider.getSigner(1),eve=await provider.getSigner(2),aAddress=await alice.getAddress(),bAddress=await bob.getAddress();
    const artifact=JSON.parse(await readFile(new URL('../contracts/out/ConsensusBell.sol/ConsensusBell.json',import.meta.url),'utf8'));
    const deployed=await new ContractFactory(artifact.abi,artifact.bytecode.object,alice).deploy();await deployed.waitForDeployment();const address=await deployed.getAddress();
    app=await createApp({dataDir,origin:'http://127.0.0.1:52203',rpc:'http://127.0.0.1:'+port,contract:address,chainId:31337});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+app.server.address().port;
    const api=async(url,cookie,body)=>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:{Origin:'http://127.0.0.1:52203','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};};
    const login=async(signer)=>{const c=await api('/api/auth/challenge',null,{address:await signer.getAddress()});return (await api('/api/auth/verify',null,{id:c.body.id,signature:await signer.signMessage(c.body.message)})).cookie;};
    const ac=await login(alice),bc=await login(bob),ec=await login(eve),a=new Contract(address,ABI,alice),b=new Contract(address,ABI,bob);
    const record=async(tx,cookie)=>{const receipt=await tx.wait(2);const result=await api('/api/transactions',cookie,{hash:receipt.hash});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
    assert.equal((await api('/api/ring',ac)).body.status,'NONE');
    const invitation=await record(await a.createInvitation(bAddress),ac);assert.deepEqual(invitation.actions,['InvitationCreated']);assert.equal((await api('/api/ring',bc)).body.status,'INVITED');
    await record(await b.acceptInvitation(),bc);let ring=(await api('/api/ring',ac)).body;assert.equal(ring.id,'1');assert.equal(ring.status,'ACTIVE');assert.equal(ring.a,aAddress);assert.equal(ring.b,bAddress);
    assert.equal((await api('/api/ring?id=1',ec)).status,400,'Unrelated wallet cannot read private relation-backed data');
    const hash=keccak256(toUtf8Bytes('A real bilateral vow'));
    await record(await a.proposePrivateVow(hash),ac);assert.equal((await api('/api/ring',ac)).body.vowCount,0);await assert.rejects(a.confirmVow(0));await record(await b.confirmVow(0),bc);assert.equal((await api('/api/ring',ac)).body.vowCount,1);
    await record(await a.deposit({value:parseEther('0.01')}),ac);ring=(await api('/api/ring',bc)).body;assert.equal(ring.balances[aAddress],parseEther('0.01').toString());
    await record(await a.requestEnd(),ac);assert.equal((await api('/api/ring',bc)).body.status,'ENDING');await assert.rejects(a.confirmEnd());await record(await b.confirmEnd(),bc);assert.equal((await api('/api/ring?id=1',ac)).body.status,'ARCHIVED');
    const withdrawn=await record(await a.withdrawFrom(1),ac);assert.deepEqual(withdrawn.actions,['Withdrawn']);assert.equal((await api('/api/ring?id=1',ac)).body.balances[aAddress],'0');
    const proofs=(await api('/api/transactions',ac)).body;assert.ok(proofs.length>=5);assert.ok(proofs.every(p=>p.block>0&&p.chainId===31337&&p.contract===address));assert.equal((await api('/api/relations',bc)).body[0].id,'1');
    assert.equal((await api('/api/transactions',bc,{hash:proofs[0].hash})).status,403,'One user cannot claim another wallet’s transaction');
  }finally{if(app)await app.close();provider.destroy();anvil.kill();await rm(dataDir,{recursive:true,force:true});}
});
