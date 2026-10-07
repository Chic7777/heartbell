import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import http from 'node:http';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {Wallet} from 'ethers';
import {createAuth} from './auth.mjs';
import {createIdentityProvider} from './auth-provider.mjs';

test('verified provider identity requires owner proof and cannot rebind a wallet',async()=>{
  const db=new DatabaseSync(':memory:'),auth=createAuth(db,'http://localhost');
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk={...await exportJWK(publicKey),kid:'test',alg:'RS256'};
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[jwk]}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const issuer='http://127.0.0.1:'+server.address().port;
  const identity=createIdentityProvider(db,auth,{issuer,audience:'bell',jwks:issuer+'/jwks'});
  const token=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(issuer).setAudience('bell').setSubject('email-user-1').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const alice=Wallet.createRandom(),bob=Wallet.createRandom();
  try{
    const challenge=auth.challenge(alice.address);
    await assert.rejects(identity.session({token,id:challenge.id,signature:await bob.signMessage(challenge.message)}));
    const logged=await identity.session({token,id:challenge.id,signature:await alice.signMessage(challenge.message)});
    assert.equal(logged.address,alice.address);assert.ok(logged.userId);
    await assert.rejects(identity.session({token,id:challenge.id,signature:await alice.signMessage(challenge.message)}));
    const changed=auth.challenge(bob.address);
    await assert.rejects(identity.session({token,id:changed.id,signature:await bob.signMessage(changed.message)}),/already linked/);
    const bad=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(issuer).setAudience('attacker').setSubject('email-user-1').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    await assert.rejects(identity.session({token:bad,id:changed.id,signature:await bob.signMessage(changed.message)}),/invalid/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_identities').get().n,1);
  }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('Privy ES256 token within its one-hour lifetime authenticates with public verification key',async()=>{
  const {exportSPKI}=await import('jose');
  const db=new DatabaseSync(':memory:'),auth=createAuth(db,'http://localhost'),wallet=Wallet.createRandom();
  const {privateKey,publicKey}=await generateKeyPair('ES256');
  const provider=createIdentityProvider(db,auth,{issuer:'privy.io',audience:'test-privy-app',publicKey:(await exportSPKI(publicKey)).split(String.fromCharCode(10)).join(String.fromCharCode(92)+'n'),algorithms:['ES256'],maxTokenAge:'1h'});
  const now=Math.floor(Date.now()/1000),token=await new SignJWT({sid:'session-1'}).setProtectedHeader({alg:'ES256'}).setSubject('did:privy:user-1').setIssuer('privy.io').setAudience('test-privy-app').setIssuedAt(now-1800).setExpirationTime(now+1800).sign(privateKey);
  try{
    const challenge=auth.challenge(wallet.address),body={id:challenge.id,signature:await wallet.signMessage(challenge.message),token};
    const session=await provider.session(body);assert.equal(session.provider,'privy.io');assert.equal(session.address,wallet.address);
    const c=auth.challenge(wallet.address),wrongApp=await new SignJWT({}).setProtectedHeader({alg:'ES256'}).setSubject('did:privy:user-1').setIssuer('privy.io').setAudience('other-app').setIssuedAt().setExpirationTime('1h').sign(privateKey);
    await assert.rejects(provider.session({id:c.id,signature:await wallet.signMessage(c.message),token:wrongApp}),/invalid/);
  }finally{db.close();}
});
