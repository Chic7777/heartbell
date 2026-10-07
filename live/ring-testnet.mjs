import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Contract,ContractFactory,JsonRpcProvider,Wallet,formatEther,getBytes,keccak256,parseEther,toUtf8Bytes} from 'ethers';
import {BOT_NETWORKS} from './bot-network.mjs';
import {checkNetwork} from './network-check.mjs';
import {createWalletAdapter} from './wallet-adapter.mjs';
import {createApp} from './server.mjs';

// Public testnet only. These isolated test keys never represent Privy identities.
const root=path.dirname(fileURLToPath(import.meta.url));
const dir=path.join(root,'data/ring-testnet'),network=BOT_NETWORKS[968];
await mkdir(dir,{recursive:true});
async function save(name,value){const file=path.join(dir,name);await writeFile(file+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(file+'.tmp',file);}
async function load(name){try{return JSON.parse(await readFile(path.join(dir,name),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
let keys=await load('private-wallets.json');
if(!keys){keys={deployer:Wallet.createRandom().privateKey,alice:Wallet.createRandom().privateKey,bob:Wallet.createRandom().privateKey};await save('private-wallets.json',keys);}
const provider=new JsonRpcProvider(network.rpc,968,{staticNetwork:true,cacheTimeout:-1});
const wallets=Object.fromEntries(Object.entries(keys).map(([name,key])=>[name,new Wallet(key,provider)]));
const evidence=await load('evidence.json')||{chainId:968,mode:'public-testnet',signers:'isolated test wallets; not Privy email identities',transactions:[],operations:[]};
let app;
try{
  const compatibility=await checkNetwork({chainId:968,owner:wallets.alice.address});
  assert.equal(BigInt(await provider.send('eth_chainId',[])),968n);
  const artifact=JSON.parse(await readFile(path.join(root,'../contracts/out/ConsensusBell.sol/ConsensusBell.json'),'utf8'));
  const factory=new ContractFactory(artifact.abi,artifact.bytecode.object,wallets.deployer);
  const deployment=await factory.getDeployTransaction();
  const [gas,fees,balance]=await Promise.all([provider.estimateGas({...deployment,from:wallets.deployer.address}),provider.getFeeData(),provider.getBalance(wallets.deployer.address)]);
  const maxFeePerGas=fees.maxFeePerGas??fees.gasPrice;
  if(!maxFeePerGas)throw new Error('RPC returned no gas price');
  const transactionFees=fees.maxFeePerGas?{maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas??BigInt(await provider.send('eth_maxPriorityFeePerGas',[]))}:{type:0,gasPrice:fees.gasPrice};
  const deployGasLimit=gas*12n/10n,required=deployGasLimit*maxFeePerGas+parseEther('0.21');
  evidence.preflight={at:new Date().toISOString(),compatibility,deployer:wallets.deployer.address,balanceBOT:formatEther(balance),requiredBOT:formatEther(required),deploymentGas:gas.toString(),contract:evidence.contract||null};
  await save('evidence.json',evidence);
  console.log(JSON.stringify({chainId:968,deployer:wallets.deployer.address,balanceBOT:formatEther(balance),requiredBOT:formatEther(required),ready:balance>=required,contract:evidence.contract||null},null,2));
  if(!process.argv.includes('--run'))process.exitCode=balance>=required?0:2;
  else{
    if(balance<required)throw new Error('Receive test BOT at the printed deployer address before --run. No transaction submitted.');
    if(required>parseEther('2'))throw new Error('Testnet gas estimate exceeds 2 BOT execution budget');
    async function transaction(label,send){
      let record=evidence.transactions.find(row=>row.label===label);
      if(!record){const request=await wallets.deployer.populateTransaction(await send());const raw=await wallets.deployer.signTransaction(request);record={label,hash:keccak256(raw)};await save('signed-'+label+'.json',{raw});evidence.transactions.push(record);await save('evidence.json',evidence);}
      if(!await provider.getTransaction(record.hash)){const signed=await load('signed-'+label+'.json');if(!signed)throw new Error('Missing signed transaction; inspect saved hash before sending');await provider.broadcastTransaction(signed.raw);}
      const deadline=Date.now()+180000;let receipt;while(Date.now()<deadline){receipt=await provider.getTransactionReceipt(record.hash);if(receipt&&await provider.getBlockNumber()-receipt.blockNumber>=1)break;await new Promise(resolve=>setTimeout(resolve,2000));}
      assert.ok(receipt,'Transaction confirmation timed out; rerun resumes its hash');assert.equal(receipt.status,1);assert.ok(await provider.getBlockNumber()-receipt.blockNumber>=1,'Transaction needs two confirmations');
      Object.assign(record,{block:receipt.blockNumber,contractAddress:receipt.contractAddress,confirmed:true,explorer:`${network.explorer}/tx/${receipt.hash}`});await save('evidence.json',evidence);return receipt;
    }
    if(!evidence.contract){const receipt=await transaction('deploy',()=>({...deployment,gasLimit:deployGasLimit,...transactionFees}));evidence.contract=receipt.contractAddress;await save('evidence.json',evidence);}
    const bell=new Contract(evidence.contract,artifact.abi,provider);
    assert.notEqual(await provider.getCode(evidence.contract),'0x');
    evidence.ringSBT=await bell.ringSBT();
    await writeFile(path.join(dir,'server.env'),`BOT_CHAIN_ID=968\nBOT_RPC_URL=${network.rpc}\nBOT_BUNDLER_URL=${network.bundler}\nBOT_ENTRYPOINT_ADDRESS=${network.entryPoint}\nBOT_ACCOUNT_FACTORY_ADDRESS=${network.factory}\nBOT_EXPLORER_URL=${network.explorer}\nCONSENSUS_BELL_ADDRESS=${evidence.contract}\nPRIVY_APP_ID=${process.env.PRIVY_APP_ID||''}\nPORT=52207\nAPP_ORIGIN=http://127.0.0.1:52207\n`);
    app=await createApp({chainId:968,rpc:network.rpc,explorer:network.explorer,contract:evidence.contract,origin:'http://127.0.0.1:52207',dataDir:path.join(dir,'backend'),identityProvider:{},aa:{bundler:network.bundler,entryPoint:network.entryPoint,factory:network.factory,pollMs:0}});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+app.server.address().port;
    async function api(route,cookie,body){const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:'http://127.0.0.1:52207','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(`${route}: ${data.error}`);return {body:data,cookie:response.headers.get('set-cookie')};}
    const actors={};
    for(const name of ['alice','bob']){
      const wallet=wallets[name];
      const challenge=(await api('/api/auth/challenge',null,{address:wallet.address})).body;
      const login=await api('/api/auth/verify',null,{id:challenge.id,signature:await wallet.signMessage(challenge.message)});
      const proof=(await api('/api/wallets/challenge',login.cookie,{salt:'0'})).body;
      const binding=(await api('/api/wallets/initialize',login.cookie,{id:proof.id,signature:await wallet.signMessage(proof.message)})).body;
      const adapter=await createWalletAdapter({ownerAddress:wallet.address,config:network,provider:{request:async({method,params=[]})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts')return [wallet.address];
        if(method==='eth_chainId')return '0x3c8';
        if(method==='personal_sign'){assert.equal(params[1].toLowerCase(),wallet.address.toLowerCase());return wallet.signMessage(getBytes(params[0]));}
        throw new Error('Unexpected signer method '+method);
      }}});
      assert.equal(adapter.address.toLowerCase(),binding.sender.toLowerCase());
      actors[name]={cookie:login.cookie,adapter,address:binding.sender};
      await transaction('fund-'+name,()=>({to:binding.sender,value:parseEther('0.1'),...transactionFees}));
    }
    evidence.accounts={alice:actors.alice.address,bob:actors.bob.address};await save('evidence.json',evidence);
    async function operate(label,name,action,eventName){
      const actor=actors[name];let record=evidence.operations.find(row=>row.label===label);
      if(!record){const prepared=(await api('/api/userops/prepare',actor.cookie,{...action,sponsor:false})).body;record={label,id:prepared.id,userOpHash:prepared.userOpHash,action,prepared};evidence.operations.push(record);await save('evidence.json',evidence);}
      let tracked=(await api('/api/userops/'+record.id,actor.cookie)).body;
      if(tracked.status==='AWAITING_SIGNATURE'){
        tracked=(await api('/api/userops/submit',actor.cookie,await actor.adapter.signPrepared(record.prepared))).body;
      }
      const deadline=Date.now()+180000;
      while(!['CONFIRMED','FAILED'].includes(tracked.status)&&Date.now()<deadline){await app.aa.poll();tracked=(await api('/api/userops/'+record.id,actor.cookie)).body;if(!['CONFIRMED','FAILED'].includes(tracked.status))await new Promise(resolve=>setTimeout(resolve,2000));}
      assert.equal(tracked.status,'CONFIRMED',tracked.error||'Awaiting public-chain settlement; rerun resumes existing operation');
      assert.ok(tracked.result.events.some(event=>event.name===eventName));
      assert.notEqual(tracked.userOpHash,tracked.transactionHash);
      Object.assign(record,{status:tracked.status,transactionHash:tracked.transactionHash,block:tracked.result.block,confirmations:tracked.result.confirmations,explorer:tracked.explorerUrl});await save('evidence.json',evidence);console.log(label+' '+tracked.transactionHash);return tracked;
    }
    await operate('invite','alice',{action:'invite',invitee:actors.bob.address},'InvitationCreated');
    await operate('accept','bob',{action:'accept'},'RelationCreated');
    const active=(await api('/api/relationships/current',actors.alice.cookie)).body;
    const ringId=evidence.ringId||active.id;assert.notEqual(ringId,'0');evidence.ringId=ringId;
    if(!evidence.active){assert.equal(active.status,'ACTIVE');evidence.active=active;await save('evidence.json',evidence);}
    if(!evidence.uniqueBinding){
      await assert.rejects(bell.createInvitation.staticCall(wallets.deployer.address,{from:actors.alice.address}),/you already have a Ring/);
      evidence.uniqueBinding={verified:true,method:'public RPC eth_call',transactionsSubmitted:0};await save('evidence.json',evidence);
    }
    const sbt=new Contract(evidence.ringSBT,['function balanceOf(address) view returns(uint256)'],provider);
    assert.equal(await sbt.balanceOf(actors.alice.address),1n);assert.equal(await sbt.balanceOf(actors.bob.address),1n);
    await operate('vow','alice',{action:'privateVow',contentHash:keccak256(toUtf8Bytes('Consensus Bell public-testnet bilateral vow'))},'VowProposed');
    await operate('confirm-vow','bob',{action:'confirm',vowIndex:'0'},'VowConfirmed');
    await operate('bond','alice',{action:'deposit',value:parseEther('0.001').toString()},'Deposited');
    await operate('request-end','alice',{action:'end',mode:'request'},'EndRequested');
    await operate('confirm-end','bob',{action:'end',mode:'confirm'},'RelationArchived');
    await operate('withdraw','alice',{action:'withdraw',relationId:ringId},'Withdrawn');
    evidence.final=(await api('/api/relationships/current?id='+ringId,actors.alice.cookie)).body;
    assert.equal(evidence.final.status,'ARCHIVED');assert.equal(evidence.final.vowCount,1);assert.equal(evidence.final.balances[actors.alice.address],'0');
    evidence.complete=true;evidence.completedAt=new Date().toISOString();await save('evidence.json',evidence);
    console.log('Public BOT Testnet Ring lifecycle CONFIRMED. Evidence: '+path.join(dir,'evidence.json'));
  }
}finally{if(app)await app.close();provider.destroy();}
