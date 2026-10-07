import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Wallet } from 'ethers';
import { createApp } from './server.mjs';

test('echo chat delivers real encrypted envelopes only between accepted participants',async()=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'consensus-bell-chat-'));
  const origin='http://127.0.0.1:52203',app=await createApp({dataDir,origin});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const request=async(url,options={})=>{const r=await fetch(base+url,{method:options.method||'GET',headers:{Origin:origin,'Content-Type':'application/json',...(options.cookie?{Cookie:options.cookie}:{}),...options.headers},body:options.body?JSON.stringify(options.body):undefined});return {status:r.status,cookie:r.headers.get('set-cookie'),body:await r.json()};};
  const session=async wallet=>{
    const challenge=await request('/api/auth/challenge',{method:'POST',body:{address:wallet.address}});
    const verified=await request('/api/auth/verify',{method:'POST',body:{id:challenge.body.id,signature:await wallet.signMessage(challenge.body.message)}});
    assert.equal(verified.status,200);return verified.cookie;
  };
  const alice=Wallet.createRandom(),bob=Wallet.createRandom(),carol=Wallet.createRandom();
  try {
    const a=await session(alice),b=await session(bob),c=await session(carol);
    const profile=discoverable=>({name:'Person',city:'Shanghai',gender:'女',age:'28',interests:['Photography'],statement:'Real profile.',intention:'Serious relationship',discoverable});
    assert.equal((await request('/api/profile',{method:'PUT',cookie:a,body:profile(true)})).status,200);
    assert.equal((await request('/api/profile',{method:'PUT',cookie:b,body:profile(true)})).status,200);
    assert.equal((await request('/api/profile',{method:'PUT',cookie:c,body:profile(true)})).status,200);
    // Alice connects to Bob; chat stays closed until Bob accepts.
    const created=await request('/api/connections',{method:'POST',cookie:a,body:{recipient:bob.address}});
    assert.equal(created.status,201);
    const connectionId=created.body.connection.id;
    const envelope=scope=>({scope,ciphertext:Buffer.from('0123456789abcdef').toString('base64'),iv:Buffer.from('0123456789ab').toString('base64')});
    const chatScope='chat:'+connectionId;
    assert.equal((await request('/api/connections/'+connectionId+'/messages',{method:'POST',cookie:a,body:envelope(chatScope)})).status,403,'Chat is closed while the connection is only pending');
    assert.equal((await request('/api/connections/'+connectionId+'/messages',{cookie:a})).status,403);
    assert.equal((await request('/api/connections/'+connectionId+'/respond',{method:'POST',cookie:b,body:{decision:'accept'}})).status,200);
    assert.equal((await request('/api/connections/'+connectionId+'/messages',{method:'POST',cookie:a,body:envelope('chat:not-this-connection')})).status,400,'Scope must match the connection');
    assert.equal((await request('/api/connections/'+connectionId+'/messages',{method:'POST',cookie:c,body:envelope(chatScope)})).status,404,'Outsiders cannot write into this conversation');
    assert.equal((await request('/api/connections/'+connectionId+'/messages',{cookie:c})).status,404,'Outsiders cannot read this conversation');
    const sent=await request('/api/connections/'+connectionId+'/messages',{method:'POST',cookie:a,body:{...envelope(chatScope),ephemeral:true}});
    assert.equal(sent.status,201);
    assert.ok(sent.body.message.expires_at,'Ephemeral messages carry a server-enforced expiry');
    assert.equal(sent.body.message.mine,true);
    const asAlice=await request('/api/connections/'+connectionId+'/messages',{cookie:a});
    const asBob=await request('/api/connections/'+connectionId+'/messages',{cookie:b});
    assert.equal(asBob.status,200);assert.equal(asBob.body.messages.length,1);
    assert.equal(asBob.body.messages[0].sender,alice.address);
    assert.equal(asBob.body.messages[0].mine,false,'The recipient does not see their own message flag');
    assert.equal(asAlice.body.messages[0].ciphertext,asBob.body.messages[0].ciphertext,'Both sides read the same ciphertext envelope');
    // Expired ephemeral rows are deleted by the server, not hidden.
    app.db.prepare('UPDATE echo_messages SET expires_at=? WHERE connection_id=?').run(Date.now()-1000,connectionId);
    const pruned=await request('/api/connections/'+connectionId+'/messages',{cookie:a});
    assert.equal(pruned.body.messages.length,0,'Expired ephemeral messages are removed from storage');
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM echo_messages WHERE connection_id=?').get(connectionId).n,0);
    // A blocking either side closes the conversation permanently.
    assert.equal((await request('/api/blocks',{method:'POST',cookie:b,body:{target:alice.address}})).status,200);
    assert.equal((await request('/api/connections/'+connectionId+'/messages',{method:'POST',cookie:a,body:envelope(chatScope)})).status,403,'Blocked connections cannot send');
    assert.equal((await request('/api/connections/'+connectionId+'/messages',{cookie:a})).status,403,'Blocked connections cannot read');
    await request('/api/blocks',{method:'DELETE',cookie:b,body:{target:alice.address}});
    // Audience filter: self-reported gender and age.
    const radar=await request('/api/radar?'+new URLSearchParams({gender:'女'}),{cookie:a});
    assert.ok(radar.body.candidates.some(person=>person.address===bob.address),'Matching self-reported gender stays visible');
    const excluded=await request('/api/radar?'+new URLSearchParams({gender:'男'}),{cookie:a});
    assert.equal(excluded.body.candidates.length,0,'Non-matching gender filter hides candidates');
    const ageBand=await request('/api/radar?'+new URLSearchParams({ageMin:'30'}),{cookie:a});
    assert.equal(ageBand.body.candidates.length,0,'Declared age outside the range is excluded');
    const ageWithin=await request('/api/radar?'+new URLSearchParams({ageMin:'25',ageMax:'30'}),{cookie:a});
    assert.equal(ageWithin.body.candidates.length,2,'Declared age inside the range stays visible');
    for(const url of ['/assets/consensus-bell-logo.svg','/assets/consensus-bell-mark.svg']){
      const asset=await fetch(base+url);
      assert.equal(asset.status,200,url);
      assert.match(asset.headers.get('content-type'),/svg/);
    }
    const home=await (await fetch(base+'/')).text();
    assert.match(home,/consensus-bell-mark\.svg/,'The shell carries the design-system mark');
    assert.doesNotMatch(home,/stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M18 8a6 6/,'The generic bell glyph is replaced by the brand mark');
  }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
