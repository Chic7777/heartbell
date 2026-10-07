import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, concat, getBytes, keccak256, parseEther, toBeHex, toQuantity, toUtf8Bytes, zeroPadValue } from 'ethers';
import { createApp } from './server.mjs';
import { createSponsor } from './sponsor.mjs';
import {generateKeyPair,exportSPKI,SignJWT} from 'jose';
import {createWalletAdapter,connectPrivySession} from './wallet-adapter.mjs';
import { entryABI, userOpHash } from './aa-protocol.mjs';

const packedPair=(high,low)=>zeroPadValue(toBeHex((BigInt(high)<<128n)|BigInt(low)),32);
function pack(op) {
  return {sender:op.sender,nonce:op.nonce,initCode:op.factory?concat([op.factory,op.factoryData]):'0x',callData:op.callData,
    accountGasLimits:packedPair(op.verificationGasLimit,op.callGasLimit),preVerificationGas:op.preVerificationGas,
    gasFees:packedPair(op.maxPriorityFeePerGas,op.maxFeePerGas),signature:op.signature,
    paymasterAndData:op.paymaster?concat([op.paymaster,zeroPadValue(toBeHex(BigInt(op.paymasterVerificationGasLimit)),16),zeroPadValue(toBeHex(BigInt(op.paymasterPostOpGasLimit)),16),op.paymasterData]):'0x'};
}

// The adapter supplies fixed conservative estimates; submission and receipts run on real EntryPoint bytecode.
async function localBundler(provider,entryPoint,beneficiary) {
  const operations=new Map();
  const server=http.createServer(async(req,res)=>{
    let request;
    try {
      let text='';for await(const chunk of req) text+=chunk;
      request=JSON.parse(text);const {method,params=[]}=request;
      let result;
      if(method==='eth_chainId') result=await provider.send(method,[]);
      else if(method==='eth_supportedEntryPoints') result=[await entryPoint.getAddress()];
      else if(method==='skandha_getGasPrice') result={maxFeePerGas:'0x77359400',maxPriorityFeePerGas:'0x3b9aca00'};
      else if(method==='eth_estimateUserOperationGas') result={callGasLimit:'0xf4240',verificationGasLimit:'0xf4240',preVerificationGas:'0x186a0'};
      else if(method==='eth_sendUserOperation') {
        assert.equal(params[1].toLowerCase(),(await entryPoint.getAddress()).toLowerCase());
        const op=params[0],hash=userOpHash(op,params[1],31337);
        assert.equal(await entryPoint.getUserOpHash(pack(op)),hash);
        if(!operations.has(hash)) {
          const tx=await entryPoint.handleOps([pack(op)],beneficiary,{gasLimit:8000000});
          const receipt=await tx.wait();assert.equal(receipt.status,1);
          const log=receipt.logs.filter(log=>log.address.toLowerCase()===params[1].toLowerCase())
            .map(log=>{try{return entryABI.parseLog(log);}catch{return null;}}).find(log=>log?.name==='UserOperationEvent'&&log.args[0]===hash);
          assert.ok(log,'Actual EntryPoint inclusion event is required');
          operations.set(hash,{op,txHash:receipt.hash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,success:log.args[4]});
          await provider.send('evm_mine',[]);
        }
        result=hash;
      } else if(method==='eth_getUserOperationByHash') {
        const included=operations.get(params[0]);
        result=included?{userOperation:included.op,entryPoint:await entryPoint.getAddress(),transactionHash:included.txHash,blockHash:included.blockHash,blockNumber:toQuantity(included.blockNumber)}:null;
      } else if(method==='eth_getUserOperationReceipt') {
        const included=operations.get(params[0]);
        result=included?{userOpHash:params[0],sender:included.op.sender,success:included.success,receipt:await provider.send('eth_getTransactionReceipt',[included.txHash])}:null;
      } else throw new Error('Unsupported local adapter method '+method);
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
    } catch(error) {
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:request?.id,error:{code:-32000,message:error.message}}));
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}

for(const sponsored of [true,false]) test('real SDK HTTP '+(sponsored?'sponsored':'self-funded')+' lifecycle verifies bilateral Ring Vow and Bond', {timeout:90000},async()=>{
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const anvil=spawn(process.env.ANVIL_PATH||'C:/Users/llwxy/.foundry/bin/anvil.exe',['--host','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  const rpc='http://127.0.0.1:'+port;
  let provider,app,bundler,dataDir;
  try {
    await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('Local Anvil startup timed out')),10000);
      anvil.on('error',error=>{clearTimeout(timer);reject(error);});
      anvil.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Listening on')){clearTimeout(timer);resolve();}});
    });
    provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1,pollingInterval:100});
    dataDir=await mkdtemp(path.join(os.tmpdir(),'consensus-bell-aa-e2e-'));
    const alice=await provider.getSigner(0),bob=await provider.getSigner(1),operator=await provider.getSigner(2);
    const aliceOwner=await alice.getAddress(),bobOwner=await bob.getAddress(),operatorAddress=await operator.getAddress();
    async function deploy(name,args=[]) {
      const artifact=JSON.parse(await readFile(new URL('../contracts/out/'+name+'.sol/'+name+'.json',import.meta.url),'utf8'));
      const contract=await new ContractFactory(artifact.abi,artifact.bytecode.object,operator).deploy(...args);
      await contract.waitForDeployment();return contract;
    }
    const entryPoint=await deploy('EntryPoint'),entryAddress=await entryPoint.getAddress();
    const factory=await deploy('SimpleAccountFactory',[entryAddress]),factoryAddress=await factory.getAddress();
    const bell=await deploy('ConsensusBell'),bellAddress=await bell.getAddress();
    const sponsorWallet=Wallet.createRandom(),paymaster=await deploy('BellPaymaster',[entryAddress,operatorAddress,sponsorWallet.address]);
    await (await paymaster.deposit({value:parseEther('1')})).wait();
    bundler=await localBundler(provider,entryPoint,operatorAddress);
    const identityKeys=await generateKeyPair('ES256'),verificationKey=await exportSPKI(identityKeys.publicKey);
    let sponsor;
    app=await createApp({dataDir,identityProvider:{issuer:'privy.io',audience:'local-privy-app',publicKey:verificationKey,algorithms:['ES256'],maxTokenAge:'1h'},origin:'http://127.0.0.1:52203',rpc,contract:bellAddress,chainId:31337,
      aa:{entryPoint:entryAddress,factory:factoryAddress,bundler:bundler.url,pollMs:0,sponsor:context=>sponsor(context)}});
    sponsor=createSponsor(app.db,{paymaster:await paymaster.getAddress(),contract:bellAddress,sponsorKey:sponsorWallet.privateKey,maxCostWei:parseEther('0.02').toString(),dailyLimit:10});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+app.server.address().port;
    const api=async(url,cookie,body)=>{
      const response=await fetch(base+url,{method:body?'POST':'GET',headers:{Origin:'http://127.0.0.1:52203','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
      return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
    };
    async function login(signer) {
      const challenge=await api('/api/auth/challenge',null,{address:await signer.getAddress()});assert.equal(challenge.status,200);
      const session=await api('/api/auth/verify',null,{id:challenge.body.id,signature:await signer.signMessage(challenge.body.message)});assert.equal(session.status,200);return session.cookie;
    }
    const ac=await login(alice),bc=await login(bob);
    async function initialize(signer,cookie) {
      const challenge=await api('/api/wallets/challenge',cookie,{salt:'0'});assert.equal(challenge.status,200);
      const response=await api('/api/wallets/initialize',cookie,{id:challenge.body.id,signature:await signer.signMessage(challenge.body.message)});
      assert.equal(response.status,201,JSON.stringify(response.body));
      assert.equal(response.body.sender,await factory['getAddress(address,uint256)'](await signer.getAddress(),0));
      assert.equal(await provider.getCode(response.body.sender),'0x');return response.body.sender;
    }
    const a=await initialize(alice,ac),b=await initialize(bob,bc);
    const adapters=new Map();
    for(const signer of [alice,bob]){const owner=await signer.getAddress();const adapter=await createWalletAdapter({provider:{request:({method,params=[]})=>provider.send(method,params)},ownerAddress:owner,config:{chainId:31337,rpc,entryPoint:entryAddress,factory:factoryAddress}});adapters.set(owner,adapter);}
    assert.equal(adapters.get(aliceOwner).address.toLowerCase(),a.toLowerCase());assert.equal(adapters.get(bobOwner).address.toLowerCase(),b.toLowerCase());
    const identityToken=await new SignJWT({sid:'local-session'}).setProtectedHeader({alg:'ES256'}).setIssuer('privy.io').setAudience('local-privy-app').setSubject('did:privy:alice').setIssuedAt().setExpirationTime('1h').sign(identityKeys.privateKey);
    let linkedCookie;
    const connected=await connectPrivySession({wallet:{walletClientType:'privy',address:aliceOwner,switchChain:async chainId=>assert.equal(chainId,31337),getEthereumProvider:async()=>({request:({method,params=[]})=>provider.send(method,params)})},config:{chainId:31337,rpc,entryPoint:entryAddress,factory:factoryAddress},getAccessToken:async()=>identityToken,api:async(route,body)=>{const response=await api(route,linkedCookie,body);assert.ok(response.status<400,JSON.stringify(response.body));linkedCookie=response.cookie??linkedCookie;return response.body;}});
    assert.equal(connected.binding.sender.toLowerCase(),a.toLowerCase());assert.equal(connected.session.provider,'privy.io');assert.ok(connected.session.userId);
    assert.equal(app.db.prepare('SELECT owner_address FROM auth_identities WHERE subject=?').get('did:privy:alice').owner_address,aliceOwner);
    assert.notEqual(a,aliceOwner);assert.notEqual(b,bobOwner);
    assert.equal((await api('/api/userops/prepare',ac,{action:'execute',target:bobOwner,value:'1',data:'0x'})).status,400);
    const proofs=[];
    async function operate(signer,cookie,action,eventName) {
      const prepared=await api('/api/userops/prepare',cookie,action);assert.equal(prepared.status,201,JSON.stringify(prepared.body));
      const adapter=adapters.get(await signer.getAddress());
      await assert.rejects(adapter.signPrepared({...prepared.body,chainId:968}),/another network/);
      await assert.rejects(adapter.signPrepared({...prepared.body,userOpHash:'0x'+'ff'.repeat(32)}),/hash does not match/);
      const signed=(await adapter.signPrepared(prepared.body)).userOperation;
      const submitted=await api('/api/user-operations/track',cookie,{id:prepared.body.id,userOperation:signed});assert.equal(submitted.status,202,JSON.stringify(submitted.body));
      assert.equal(submitted.body.phase,'submitted',submitted.body.error);
      await app.aa.poll();
      const tracked=await api('/api/user-operations/'+prepared.body.id,cookie);assert.equal(tracked.status,200);
      assert.equal(tracked.body.status,'CONFIRMED',JSON.stringify(tracked.body));
      assert.equal(tracked.body.result.success,true);assert.ok(tracked.body.result.confirmations>=2);
      assert.notEqual(tracked.body.userOpHash,tracked.body.transactionHash);
      assert.ok(tracked.body.result.events.some(event=>event.name===eventName));
      assert.equal((await provider.getTransactionReceipt(tracked.body.transactionHash)).status,1);
      proofs.push(tracked.body);return {prepared:prepared.body,tracked:tracked.body};
    }
    if(!sponsored)for(const [signer,account] of [[alice,a],[bob,b]])await (await signer.sendTransaction({to:account,value:parseEther('0.1')})).wait();
    const invitation=await operate(alice,ac,{action:'invite',invitee:b,sponsor:sponsored},'InvitationCreated');
    assert.equal(invitation.prepared.userOperation.factory,factoryAddress);assert.equal(invitation.prepared.sponsored,sponsored);
    assert.notEqual(await provider.getCode(a),'0x');if(sponsored)assert.equal(await provider.getBalance(a),0n);
    assert.equal((await api('/api/relationships/current',bc)).body.status,'INVITED');
    await operate(bob,bc,{action:'accept',sponsor:sponsored},'RelationCreated');
    const ring=(await api('/api/relationships/current',ac)).body;
    assert.equal(ring.status,'ACTIVE');assert.equal(ring.id,'1');assert.equal(ring.a,a);assert.equal(ring.b,b);
    const sbt=new Contract(await bell.ringSBT(),['function balanceOf(address) view returns(uint256)'],provider);
    assert.equal(await sbt.balanceOf(a),1n);assert.equal(await sbt.balanceOf(b),1n);
    if(!sponsored){
      const third=await factory.getFunction('getAddress')(operatorAddress,0);
      const rejected=await api('/api/userops/prepare',ac,{action:'invite',invitee:third,sponsor:false});assert.equal(rejected.status,400);assert.match(rejected.body.error,/already have a Ring/);
      assert.equal((await api('/api/relationships/current',ac)).body.id,'1');
    }

    await operate(alice,ac,{action:'privateVow',contentHash:keccak256(toUtf8Bytes('real encrypted vow commitment')),sponsor:sponsored},'VowProposed');
    assert.equal((await api('/api/relationships/current',bc)).body.vowCount,0);
    await operate(bob,bc,{action:'confirm',vowIndex:'0',sponsor:sponsored},'VowConfirmed');
    assert.equal((await api('/api/relationships/current',ac)).body.vowCount,1);
    await (await alice.sendTransaction({to:a,value:parseEther('0.1')})).wait();
    const deposited=await operate(alice,ac,{action:'deposit',value:parseEther('0.01').toString(),sponsor:false},'Deposited');
    assert.equal(deposited.prepared.userOperation.paymaster,undefined);assert.equal(deposited.prepared.userOperation.factory,undefined);
    assert.equal((await api('/api/relationships/current',bc)).body.balances[a],parseEther('0.01').toString());
    assert.deepEqual(app.db.prepare('SELECT address FROM relations WHERE id=? ORDER BY address').all('1').map(row=>row.address),[a,b].sort());
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM aa_chain_events').get().n,5);
    assert.equal(app.db.prepare("SELECT count(*) AS n FROM aa_operations WHERE status='confirmed'").get().n,5);
    assert.equal(JSON.parse(app.db.prepare('SELECT body FROM aa_ring_state WHERE relation_id=?').get('1').body).status,'ACTIVE');
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM sponsorship_grants').get().n,sponsored?4:0);
    assert.equal((await api('/api/user-operations/'+proofs[0].id,bc)).status,404);
    assert.ok(proofs.every(proof=>proof.result.actualGasUsed!=='0'&&proof.result.actualGasCost!=='0'));
    await (await bob.sendTransaction({to:b,value:parseEther('0.01')})).wait();
    await operate(alice,ac,{action:'end',mode:'request',sponsor:false},'EndRequested');
    assert.equal((await api('/api/relationships/current',bc)).body.status,'ENDING');
    await operate(bob,bc,{action:'end',mode:'confirm',sponsor:false},'RelationArchived');
    const archived=(await api('/api/relationships/current?id=1',ac)).body;
    assert.equal(archived.status,'ARCHIVED');
    await operate(alice,ac,{action:'withdraw',relationId:'1',sponsor:false},'Withdrawn');
    assert.equal(await bell.bondOf(1,a),0n);
    assert.equal((await api('/api/relationships/current?id=1',ac)).body.balances[a],'0');
    assert.equal(JSON.parse(app.db.prepare('SELECT body FROM aa_ring_state WHERE relation_id=?').get('1').body).status,'ARCHIVED');
    assert.equal(app.db.prepare("SELECT count(*) AS n FROM aa_operations WHERE status='confirmed'").get().n,8);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM aa_chain_events').get().n,8);
    assert.equal(await sbt.balanceOf(a),1n);assert.equal(await sbt.balanceOf(b),1n);
  } finally {
    if(app)await app.close();if(bundler)await bundler.close();provider?.destroy();anvil.kill();
    if(dataDir)await rm(dataDir,{recursive:true,force:true});
  }
});
