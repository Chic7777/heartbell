import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Wallet } from 'ethers';
import { createApp } from './server.mjs';

test('nearby resonance ranks real coarse locations and the consented agent explains the best match',async()=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'cb-nearby-'));
  const origin='http://127.0.0.1:52203',app=await createApp({dataDir,origin});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const request=async(url,options={})=>{const r=await fetch(base+url,{method:options.method||'GET',headers:{Origin:origin,'Content-Type':'application/json',...(options.cookie?{Cookie:options.cookie}:{})},body:options.body?JSON.stringify(options.body):undefined});return {status:r.status,cookie:r.headers.get('set-cookie'),body:await r.json()};};
  const signIn=async wallet=>{const c=await request('/api/auth/challenge',{method:'POST',body:{address:wallet.address}});return (await request('/api/auth/verify',{method:'POST',body:{id:c.body.id,signature:await wallet.signMessage(c.body.message)}})).cookie;};
  const alice=Wallet.createRandom(),bob=Wallet.createRandom(),carol=Wallet.createRandom();
  try {
    const a=await signIn(alice),b=await signIn(bob),c=await signIn(carol);
    const profile={name:'X',city:'',gender:'',age:'',interests:['Photography'],statement:'',intention:'Serious relationship',discoverable:true,avatarUrl:'',occupation:''};
    for(const [cookie,name] of [[a,'Alice'],[b,'Bob'],[c,'Carol']])assert.equal((await request('/api/profile',{method:'PUT',cookie,body:{...profile,name}})).status,200);
    // Alice and Bob land in adjacent coarse cells (~11 km apart); Carol is far away.
    await request('/api/radar/location',{method:'PUT',cookie:a,body:{lat:31.23,lon:121.47,consent:true}});
    await request('/api/radar/location',{method:'PUT',cookie:b,body:{lat:31.25,lon:121.47,consent:true}});
    await request('/api/radar/location',{method:'PUT',cookie:c,body:{lat:45.8,lon:126.5,consent:true}});
    const radar=await request('/api/radar',{cookie:a});
    assert.equal(radar.status,200);
    const bobRow=radar.body.candidates.find(person=>person.name==='Bob'),carolRow=radar.body.candidates.find(person=>person.name==='Carol');
    assert.ok(bobRow,'nearby candidate visible');
    assert.ok(bobRow.distanceKm!==null&&bobRow.distanceKm<=20,'adjacent cell resolves to a small coarse distance');
    assert.ok(bobRow.reasons.some(reason=>reason.includes('附近')),'nearby reason is surfaced');
    assert.ok(carolRow.distanceKm===null||carolRow.distanceKm>100,'far candidate is not labeled nearby');
    assert.ok(radar.body.candidates.indexOf(bobRow)<radar.body.candidates.indexOf(carolRow),'nearby ranks above the far candidate at equal interests');
    // The consent-gated agent explains the best nearby match with real rules.
    const withoutConsent=await request('/api/agent/jobs',{method:'POST',cookie:a,body:{skill:'radar-explain',resourceId:'profile'}});
    assert.equal(withoutConsent.status,403,'radar explanation requires explicit consent');
    const grant=await request('/api/consents',{method:'POST',cookie:a,body:{scope:'agent:radar-explain',resourceId:'profile',expiresAt:Date.now()+600000}});
    assert.equal(grant.status,201);
    const job=await request('/api/agent/jobs',{method:'POST',cookie:a,body:{skill:'radar-explain',resourceId:'profile'}});
    assert.equal(job.status,201);
    const output=job.body.job.output;
    assert.equal(output.engine,'structured-rules-v1');
    assert.equal(output.llm,false);
    assert.ok(output.summary.includes('Bob'),'summary names the real top candidate');
    assert.ok(output.summary.includes('不是感情承诺')||output.summary.includes('由你决定'),'summary stays honest about matching limits');
    assert.ok(output.nearbyCount>=1,'nearby count reflects real coarse locations');
    // Consent revocation stops further explanations.
    await request('/api/consents',{method:'DELETE',cookie:a,body:{id:grant.body.grant.id}});
    assert.equal((await request('/api/agent/jobs',{method:'POST',cookie:a,body:{skill:'radar-explain',resourceId:'profile'}})).status,403,'revoked consent stops the agent');
  }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
