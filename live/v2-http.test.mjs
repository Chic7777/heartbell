import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {Wallet} from 'ethers';
import {createApp} from './server.mjs';

test('real HTTP integrates Echo consented drafts private ciphertext and SSE',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'bell-v2-http-')),origin='http://127.0.0.1:52203',app=await createApp({dataDir,origin});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 const api=async(route,cookie,body,method=body?'POST':'GET')=>{const r=await fetch(base+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};};
 const login=async w=>{const c=await api('/api/auth/challenge',null,{address:w.address});return (await api('/api/auth/verify',null,{id:c.body.id,signature:await w.signMessage(c.body.message)})).cookie;};
 try{
 const alice=Wallet.createRandom(),bob=Wallet.createRandom(),ac=await login(alice),bc=await login(bob);
 const profile={name:'Alice',city:'Shanghai',gender:'Private',age:'20–26',interests:['Art'],statement:'',intention:'Serious',discoverable:true};
 assert.equal((await api('/api/profiles/me',ac,profile,'PUT')).status,200);await api('/api/profiles/me',bc,{...profile,name:'Bob'},'PUT');
 const c=await api('/api/connections',ac,{recipient:bob.address});assert.equal(c.status,201);
 assert.equal((await api('/api/connections/'+c.body.connection.id+'/respond',ac,{decision:'accept'})).status,403);
 assert.equal((await api('/api/connections/'+c.body.connection.id+'/respond',bc,{decision:'accept'})).body.connection.status,'accepted');
 assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM relations').get().n,0);
 const jobInput={skill:'vow-draft',resourceId:'profile'};assert.equal((await api('/api/agent/jobs',ac,jobInput)).status,403);
 const grant=await api('/api/consents',ac,{scope:'agent:vow-draft',resourceId:'profile',expiresAt:Date.now()+60000});
 const job=await api('/api/agent/jobs',ac,jobInput);assert.equal(job.status,201);assert.equal(job.body.job.output.requiresUserApproval,true);
 assert.equal((await api('/api/agent/jobs?id='+job.body.job.id,bc)).status,404);
 await api('/api/consents',ac,{id:grant.body.grant.id},'DELETE');assert.equal((await api('/api/agent/jobs',ac,jobInput)).status,403);
 const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),iv=randomBytes(12),plain='真实的私密记忆';
 const bytes=Buffer.from(await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode(plain)));
 const intent=await api('/api/stories/upload-intent',ac,{scope:'personal',ciphertextHash:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,encryptionVersion:'AES-256-GCM-v1'});assert.equal(intent.status,201);
 const uploadId=intent.body.id??intent.body.uploadId;
 assert.equal((await api('/api/stories/uploads/'+uploadId,ac,{ciphertext:bytes.toString('base64')})).status,201);
 const saved=await api('/api/stories',ac,{uploadId,type:'note',iv:iv.toString('base64'),envelopes:[{recipient:alice.address,wrappedKey:randomBytes(32).toString('base64')}]});assert.equal(saved.status,201);
 const id=saved.body.id??saved.body.story?.id,own=await api('/api/stories/'+id,ac);assert.equal(own.status,200);
 const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv},aes,Buffer.from(own.body.ciphertext??own.body.story?.ciphertext,'base64'));assert.equal(new TextDecoder().decode(decoded),plain);
 assert.equal((await api('/api/stories/'+id,bc)).status,404);assert.equal((await api('/api/wallets/me',ac)).body,null);assert.equal((await api('/auth/session',null,{})).status,503);
 const stream=await fetch(base+'/api/notifications/stream',{headers:{Cookie:ac},signal:AbortSignal.timeout(2000)});assert.equal(stream.status,200);
 const reader=stream.body.getReader(),chunk=await reader.read();assert.match(new TextDecoder().decode(chunk.value),/event: ready/);await reader.cancel();
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
