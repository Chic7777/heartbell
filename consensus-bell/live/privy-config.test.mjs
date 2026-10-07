import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import {Wallet} from 'ethers';
import {createAuth} from './auth.mjs';
import {createIdentityProvider, identityProviderConfig} from './auth-provider.mjs';

const appId='cmuxf6vmm003c0bjrt2ejmqpm';

test('Privy App ID enables verification using its public JWKS without an app secret',()=>{
  const env={PRIVY_APP_ID:appId};
  Object.defineProperty(env,'PRIVY_APP_SECRET',{get(){throw new Error('Secret must not be read');}});
  const config=identityProviderConfig(env);
  assert.equal(config.jwks,`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
  assert.equal(config.issuer,'privy.io');
  assert.equal(config.audience,appId);
  assert.deepEqual(config.algorithms,['ES256']);
  const db=new DatabaseSync(':memory:');
  try {assert.equal(createIdentityProvider(db,createAuth(db,'http://localhost'),config).enabled,true);}
  finally {db.close();}
});

test('Privy configuration rejects an app secret supplied as verification key without exposing it',()=>{
  assert.throws(()=>identityProviderConfig({PRIVY_APP_ID:appId,PRIVY_VERIFICATION_KEY:'privy_app_secret_test-fixture'}),error=>
    error instanceof Error && !error.message.includes('test-fixture') && error.message.includes('public key'));
});

test('Privy configuration rejects malformed App IDs before constructing a JWKS URL',()=>{
  assert.throws(()=>identityProviderConfig({PRIVY_APP_ID:'../other-app'}),/App ID/);
});

test('Privy public JWKS verifies signatures, issuer, audience, lifetime and wallet ownership',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('ES256');
  const jwk={...await exportJWK(publicKey),kid:'privy-fixture',alg:'ES256'};
  let requests=0;
  const server=http.createServer((req,res)=>{
    requests++;
    assert.equal(req.headers.authorization,undefined);
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({keys:[jwk]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const db=new DatabaseSync(':memory:'),auth=createAuth(db,'http://localhost');
  const provider=createIdentityProvider(db,auth,identityProviderConfig({PRIVY_APP_ID:appId,PRIVY_JWKS_URL:`http://127.0.0.1:${server.address().port}/jwks`}));
  const alice=Wallet.createRandom(),bob=Wallet.createRandom(),now=Math.floor(Date.now()/1000);
  const tokenFor=({issuer='privy.io',audience=appId,issued=now-1800,expiry=now+1800,key=privateKey}={})=>
    new SignJWT({}).setProtectedHeader({alg:'ES256',kid:'privy-fixture'}).setSubject('did:privy:alice')
      .setIssuer(issuer).setAudience(audience).setIssuedAt(issued).setExpirationTime(expiry).sign(key);
  try {
    const token=await tokenFor(),challenge=auth.challenge(alice.address);
    const body={token,id:challenge.id,signature:await alice.signMessage(challenge.message)};
    await assert.rejects(provider.session({...body,signature:await bob.signMessage(challenge.message)}),/Signature/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_identities').get().n,0);
    const session=await provider.session(body);
    assert.equal(session.address,alice.address);
    assert.equal(session.provider,'privy.io');
    assert.ok(auth.user(`cb_session=${session.token}`));
    await assert.rejects(provider.session(body),/challenge is missing/);
    const {privateKey:otherKey}=await generateKeyPair('ES256');
    for(const invalid of [{issuer:'attacker'},{audience:'other-app'},{expiry:now-1},{issued:now-3700},{key:otherKey}]) {
      const next=auth.challenge(alice.address);
      await assert.rejects(provider.session({token:await tokenFor(invalid),id:next.id,signature:await alice.signMessage(next.message)}),/invalid or expired/);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_identities').get().n,1);
    assert.equal(requests,1);
  } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});
