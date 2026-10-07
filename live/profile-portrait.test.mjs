import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Wallet} from 'ethers';
import {createApp} from './server.mjs';
import {emptyProfile,updateIdentity,onboardingView} from './web/onboarding.js';

test('portrait fields validate, persist and reach consented discovery',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'cb-portrait-')),origin='http://127.0.0.1:52203';
  const app=await createApp({dataDir:dir,origin});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const request=async(url,cookie,method='GET',body)=>{const response=await fetch(base+url,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};};
  const login=async()=>{const wallet=Wallet.createRandom(),challenge=await request('/api/auth/challenge',null,'POST',{address:wallet.address});return (await request('/api/auth/verify',null,'POST',{id:challenge.data.id,signature:await wallet.signMessage(challenge.data.message)})).cookie;};
  try{
    const [owner,viewer]=await Promise.all([login(),login()]);
    const profile={...emptyProfile(),name:'Portrait Owner',avatarUrl:'https://example.com/portrait.jpg',occupation:'Film curator',discoverable:true};
    assert.equal((await request('/api/profile',owner,'PUT',profile)).status,200);
    const saved=(await request('/api/profile',owner)).data.profile;assert.equal(saved.avatarUrl,profile.avatarUrl);assert.equal(saved.occupation,profile.occupation);
    const candidate=(await request('/api/radar',viewer)).data.candidates[0];assert.equal(candidate.avatarUrl,profile.avatarUrl);assert.equal(candidate.occupation,profile.occupation);
    for(const avatarUrl of ['javascript:alert(1)','http://example.com/a.jpg','https://user:secret@example.com/a.jpg','not a url'])assert.equal((await request('/api/profile',owner,'PUT',{...profile,avatarUrl})).status,400);
    assert.equal((await request('/api/profile',owner,'PUT',{...profile,occupation:'a'.repeat(81)})).status,400);
    const {avatarUrl,occupation,...legacy}=profile;assert.equal((await request('/api/profile',owner,'PUT',legacy)).status,200);
    const cleared=(await request('/api/radar',viewer)).data.candidates[0];assert.equal(cleared.avatarUrl,'');assert.equal(cleared.occupation,'');
    const draft=updateIdentity(emptyProfile(),1,profile);assert.equal(draft.avatarUrl,profile.avatarUrl);assert.equal(draft.occupation,profile.occupation);
    assert.throws(()=>updateIdentity(draft,1,{...profile,avatarUrl:'http://example.com/a.jpg'}),/HTTPS/);
    assert.throws(()=>updateIdentity(draft,1,{...profile,occupation:'a'.repeat(81)}),/80/);
    const html=onboardingView({identityStep:1,profile},{escape:v=>String(v),head:()=>'',submit:()=>'',btn:()=>''});assert.match(html,/name="avatarUrl"/);assert.match(html,/name="occupation"/);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
