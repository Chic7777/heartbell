import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Wallet} from 'ethers';
import {createApp} from './server.mjs';
import {radarView,candidateDetail} from './web/radar.js';
import {view} from './web/view.js';

test('visitor browsing reuses pages without exposing account records or inventing proof',()=>{
  const state={preview:true,user:null,profile:{name:'PRIVATE_NAME'},relation:null,route:'home',memories:[{title:'PRIVATE_NOTE'}],proofs:[{hash:'PRIVATE_HASH'}],candidates:[],history:[{id:'98765'}],radarFilters:{city:'',intention:'',radius:0},radar:null,config:{explorer:''},formatAmount:()=> '0'};
  for(const route of ['home','identity','discover','story','vows','bond','me','vault','witness','proofs','history']){
    const html=view({...state,route});assert.match(html,/访客预览/);assert.doesNotMatch(html,/PRIVATE_NAME|PRIVATE_NOTE|PRIVATE_HASH|98765|VISITOR_VIEW_ONLY/);
  }
  assert.match(view({...state,preview:false,profile:null}),/先逛逛 · 跳过钱包/);
  assert.match(view({...state,route:'discover'}),/访客预览未加载候选人/);
});

test('signed real HTTP users receive consented, ranked, filtered radar data with private location and favorites',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'cb-radar-')),origin='http://127.0.0.1:52203';
  const app=await createApp({dataDir:dir,origin});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const request=async(url,cookie,method='GET',body)=>{const response=await fetch(base+url,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};};
  const login=async()=>{const wallet=Wallet.createRandom(),challenge=await request('/api/auth/challenge',null,'POST',{address:wallet.address});const signed=await request('/api/auth/verify',null,'POST',{id:challenge.data.id,signature:await wallet.signMessage(challenge.data.message)});assert.equal(signed.status,200);return {address:wallet.address,cookie:signed.cookie};};
  const profile=(name,interests,city='Wuhan',intention='Serious relationship',discoverable=true)=>({name,interests,city,intention,discoverable,gender:'',age:'24',statement:'Real editable profile'});
  try{
    assert.equal((await request('/api/radar')).status,401);
    const [alice,bob,carol,hidden]=await Promise.all([login(),login(),login(),login()]);
    for(const [account,body] of [[alice,profile('Alice',['Travel','Music'])],[bob,profile('Bob',['Travel','Music'])],[carol,profile('<Carol>',['Art'],'Shanghai','Open to connection')],[hidden,profile('Private',['Travel','Music'],'Wuhan','Serious relationship',false)]])assert.equal((await request('/api/profile',account.cookie,'PUT',body)).status,200);
    const result=(await request('/api/radar',alice.cookie)).data;
    assert.equal(result.total,2);assert.equal(result.candidates[0].address,bob.address);assert.deepEqual(result.candidates[0].common,['Travel','Music']);assert.equal(result.candidates[0].distanceKm,null);assert.equal(result.candidates.some(c=>c.address===hidden.address||c.address===alice.address),false);
    assert.equal((await request('/api/radar?city=Wuhan&intention=Serious%20relationship',alice.cookie)).data.total,1);
    assert.equal((await request('/api/radar?city=Nowhere',alice.cookie)).data.total,0);
    assert.equal((await request('/api/radar?radius=20',alice.cookie)).status,409);
    assert.equal((await request('/api/radar?radius=-1',alice.cookie)).status,400);
    assert.equal((await request('/api/radar/location',alice.cookie,'PUT',{lat:30.59,lon:114.3})).status,400,'Location requires explicit consent');
    for(const account of [alice,bob])assert.equal((await request('/api/radar/location',account.cookie,'PUT',{lat:30.59317,lon:114.31237,consent:true})).status,200);
    assert.deepEqual({...app.db.prepare('SELECT lat,lon FROM radar_locations WHERE address=?').get(alice.address)},{lat:30.6,lon:114.3},'Exact coordinates are discarded before persistence');
    assert.equal((await request('/api/radar/location',alice.cookie,'PUT',{lat:31,lon:115,consent:true})).status,429,'Repeated coordinate probes are rate limited');
    const nearby=(await request('/api/radar?radius=20',alice.cookie)).data;
    assert.equal(nearby.total,1);assert.equal(nearby.candidates[0].distanceKm,0);assert.equal(nearby.hasLocation,true);
    assert.equal(JSON.stringify(nearby).includes('114.3'),false);assert.equal('lat' in nearby.candidates[0],false);assert.equal('lon' in nearby.candidates[0],false);
    assert.equal((await request('/api/radar/saved',alice.cookie,'PUT',{address:bob.address,saved:true})).status,200);
    assert.equal((await request('/api/radar',alice.cookie)).data.candidates.find(c=>c.address===bob.address).saved,true);
    assert.equal((await request('/api/radar',carol.cookie)).data.candidates.find(c=>c.address===bob.address).saved,false,'Favorites belong to the signed wallet');
    assert.equal((await request('/api/radar/saved',alice.cookie,'PUT',{address:hidden.address,saved:true})).status,404);
    assert.equal((await request('/api/radar/location',alice.cookie,'DELETE')).status,200);
    assert.equal(app.db.prepare('SELECT * FROM radar_locations WHERE address=?').get(alice.address),undefined);
    assert.equal((await request('/api/radar/location',alice.cookie,'PUT',{lat:31,lon:115,consent:true})).status,429,'Revocation does not bypass the update cooldown');
    assert.equal((await request('/api/radar',alice.cookie)).data.hasLocation,false);
    assert.equal((await request('/api/radar?radius=20',bob.cookie)).data.total,0,'Missing location excludes profiles from distance filter');
    app.db.prepare('UPDATE radar_locations SET at=? WHERE address=?').run(Date.now()-86400001,bob.address);
    assert.equal((await request('/api/radar?radius=20',bob.cookie)).status,409,'Expired location cannot produce nearby claims');
    await request('/api/profile',bob.cookie,'PUT',profile('Bob',['Travel','Music'],'Wuhan','Serious relationship',false));
    assert.equal((await request('/api/radar',alice.cookie)).data.total,1,'Revoking public profile immediately removes candidate');
    const state={profile:profile('Alice',['Travel']),candidates:result.candidates,radar:result,radarFilters:{city:'',intention:'',radius:0}};
    const html=radarView(state);assert.match(html,/Resonance Radar/);assert.match(html,/&lt;Carol&gt;/);assert.doesNotMatch(html,/<Carol>/);assert.doesNotMatch(html,/Mainnet.*Verified/);assert.match(candidateDetail(result.candidates[0]),/O 为什么推荐/);
    assert.match(radarView({...state,candidates:[],radar:{total:0,hasLocation:false}}),/不会用示例人物/);
    for(const url of ['/radar.js','/radar.css'])assert.equal((await fetch(base+url)).status,200);
    const entry=await (await fetch(base+'/')).text();assert.doesNotMatch(entry,/desktop-intro|A little world|<aside/);assert.match(entry,/id="app"/);assert.match(entry,/id="tabs"/);
    const css=await readFile(new URL('./web/radar.css',import.meta.url),'utf8');assert.doesNotMatch(css,/\dvar\(/,'Token rewriting must not corrupt CSS dimensions');
    assert.match(html,/aria-live="polite"/);assert.match(html,/radar-stage results/);
    assert.match(radarView({...state,radarError:'Backend offline'}),/radar-stage error/);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
