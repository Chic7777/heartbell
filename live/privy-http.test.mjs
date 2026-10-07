import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPair,exportSPKI,SignJWT} from 'jose';
import {Wallet} from 'ethers';
import {createApp} from './server.mjs';

test('real HTTP preserves Privy session identity and separates a later injected wallet session',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'bell-privy-http-'));
  const origin='http://127.0.0.1:52203',audience='privy-http-test';
  const {privateKey,publicKey}=await generateKeyPair('ES256');
  const app=await createApp({dataDir,origin,chainId:968,rpc:'http://127.0.0.1:1',contract:'',
    aa:{pollMs:0},identityProvider:{issuer:'privy.io',audience,publicKey:await exportSPKI(publicKey),algorithms:['ES256'],maxTokenAge:'1h'}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const api=async(route,{cookie,body}={})=>{
    const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    const config=await api('/api/config');
    assert.equal(config.status,200);
    assert.equal(config.body.identityProviderConfigured,true);
    assert.deepEqual(Object.keys(config.body.privy),['appId']);
    assert.equal(typeof config.body.privy.appId,'string');
    assert.deepEqual(Object.keys(config.body.wallet).sort(),['chainId','entryPoint','factory','rpc']);
    assert.equal(config.body.wallet.chainId,968);
    assert.equal(config.body.wallet.rpc,'http://127.0.0.1:1');
    assert.equal(config.body.wallet.entryPoint,config.body.accountAbstraction.entryPoint);
    assert.equal(config.body.wallet.factory,config.body.accountAbstraction.factory);
    assert.doesNotMatch(JSON.stringify(config.body),/privy_app_secret_|VERIFICATION_KEY|PRIVATE KEY/);

    const owner=Wallet.createRandom(),sender=Wallet.createRandom().address;
    app.db.prepare('INSERT INTO aa_wallets VALUES(?,?,?,?,?,?)').run(owner.address,'968',sender,config.body.wallet.factory,'0',Date.now());
    const token=await new SignJWT({}).setProtectedHeader({alg:'ES256'}).setIssuer('privy.io').setAudience(audience)
      .setSubject('did:privy:http-fixture').setIssuedAt().setExpirationTime('1h').sign(privateKey);
    const challenge=await api('/api/auth/challenge',{body:{address:owner.address}});
    assert.equal(challenge.status,200);
    const body={token,id:challenge.body.id,signature:await owner.signMessage(challenge.body.message)};
    const login=await api('/api/auth/session',{body});
    assert.equal(login.status,200);
    assert.equal(login.body.address,owner.address);
    assert.equal(login.body.provider,'privy.io');
    assert.ok(login.body.userId);
    assert.ok(login.cookie);
    const session=await api('/api/session',{cookie:login.cookie});
    assert.equal(session.status,200);
    assert.deepEqual(session.body,{address:owner.address,authProvider:'privy',chainAddress:sender});
    assert.equal((await api('/api/auth/session',{body})).status,401);

    assert.equal((await api('/api/logout',{cookie:login.cookie,body:{}})).status,200);
    assert.equal((await api('/api/session',{cookie:login.cookie})).status,401);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM session_providers').get().n,0);
    const injectedChallenge=await api('/api/auth/challenge',{body:{address:owner.address}});
    const injected=await api('/api/auth/verify',{body:{id:injectedChallenge.body.id,signature:await owner.signMessage(injectedChallenge.body.message)}});
    assert.equal(injected.status,200);
    const restored=await api('/api/session',{cookie:injected.cookie});
    assert.equal(restored.status,200);
    assert.deepEqual(restored.body,{address:owner.address,authProvider:'injected',chainAddress:owner.address});
  } finally {await app.close();await rm(dataDir,{recursive:true,force:true});}
});
