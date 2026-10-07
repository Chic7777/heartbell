import { BOT_NETWORKS } from './bot-network.mjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { getAddress, getBytes, isAddress, verifyMessage } from 'ethers';
import { z } from 'zod';
import { AA_DEFAULTS, RpcError, accountABI, addressSchema, bellABI, createRpc, encodeAction, entryABI, factoryABI, hashSchema, opSchema, readContract, sameOperation, sponsorSchema, toQuantity, userOpHash as protocolHash } from './aa-protocol.mjs';
import { mirrorReceipt, verifyReceipt } from './aa-receipts.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const dummySignature='0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c';
const saltSchema=z.string().regex(/^(0|[1-9]\d*)$/).max(78).refine(v=>BigInt(v)<2n**256n);
const gasSchema=z.object({callGasLimit:z.string(),verificationGasLimit:z.string().optional(),verificationGas:z.string().optional(),preVerificationGas:z.string(),maxFeePerGas:z.string().optional(),maxPriorityFeePerGas:z.string().optional()}).passthrough();

export function createAA(db,input={}){
  const network=BOT_NETWORKS[Number(input.chainId||677)]??AA_DEFAULTS;
  const config={...AA_DEFAULTS,...input,chainId:Number(input.chainId||677),rpc:input.rpc||network.rpc,bundler:input.bundler||network.bundler,entryPoint:getAddress(input.entryPoint||AA_DEFAULTS.entryPoint),factory:getAddress(input.factory||AA_DEFAULTS.factory),confirmations:Math.max(2,Number(input.confirmations||2)),pollMs:Number(input.pollMs??5000),origin:input.origin||'http://127.0.0.1:52203'};
  if(!Number.isSafeInteger(config.chainId)||config.chainId<1||!Number.isSafeInteger(config.confirmations)||!Number.isSafeInteger(config.pollMs)||config.pollMs<0)throw new Error('Invalid AA chain ID, confirmation threshold or polling interval');
  const enabled=isAddress(config.contract||'');
  const chainRpc=createRpc(config.rpc),bundlerRpc=createRpc(config.bundler),listeners=new Map();
  db.exec(`CREATE TABLE IF NOT EXISTS aa_wallet_challenges(id TEXT PRIMARY KEY,owner TEXT NOT NULL,salt TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS aa_wallets(owner TEXT NOT NULL,chain_id TEXT NOT NULL,sender TEXT NOT NULL,factory TEXT NOT NULL,salt TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(owner,chain_id),UNIQUE(chain_id,sender));
    CREATE TABLE IF NOT EXISTS aa_operations(id TEXT PRIMARY KEY,owner TEXT NOT NULL,sender TEXT NOT NULL,chain_id TEXT NOT NULL,entry_point TEXT NOT NULL,contract TEXT NOT NULL,action TEXT NOT NULL,operation TEXT NOT NULL,hash TEXT UNIQUE NOT NULL,status TEXT NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,result TEXT,last_error TEXT);
    CREATE INDEX IF NOT EXISTS aa_operations_owner ON aa_operations(owner,created);
    CREATE TABLE IF NOT EXISTS aa_chain_events(chain_id TEXT,contract TEXT,transaction_hash TEXT,log_index INTEGER,block INTEGER,block_hash TEXT,body TEXT,PRIMARY KEY(chain_id,transaction_hash,log_index));
    CREATE TABLE IF NOT EXISTS aa_ring_state(chain_id TEXT,contract TEXT,relation_id TEXT,body TEXT,block INTEGER,PRIMARY KEY(chain_id,contract,relation_id));
    CREATE TABLE IF NOT EXISTS aa_vow_state(chain_id TEXT,contract TEXT,relation_id TEXT,vow_index TEXT,body TEXT,block INTEGER,log_index INTEGER,PRIMARY KEY(chain_id,contract,relation_id,vow_index));
    CREATE TABLE IF NOT EXISTS aa_bond_deposits(chain_id TEXT,contract TEXT,transaction_hash TEXT,log_index INTEGER,relation_id TEXT,sender TEXT,amount_wei TEXT,total_wei TEXT,kind TEXT,block INTEGER,block_hash TEXT,PRIMARY KEY(chain_id,transaction_hash,log_index));
    CREATE TABLE IF NOT EXISTS aa_invitations(chain_id TEXT,contract TEXT,invitee TEXT,inviter TEXT,state TEXT,block INTEGER,log_index INTEGER,transaction_hash TEXT,PRIMARY KEY(chain_id,contract,invitee));
    CREATE TABLE IF NOT EXISTS aa_sponsor_usage(owner TEXT,day TEXT,count INTEGER NOT NULL,PRIMARY KEY(owner,day));
    CREATE TABLE IF NOT EXISTS relations(id TEXT,address TEXT,PRIMARY KEY(id,address));`);
  if(!db.prepare('PRAGMA table_info(aa_ring_state)').all().some(column=>column.name==='log_index'))db.exec('ALTER TABLE aa_ring_state ADD COLUMN log_index INTEGER NOT NULL DEFAULT -1');
  const wallet=owner=>db.prepare('SELECT owner,sender,chain_id AS chainId,factory,salt,created FROM aa_wallets WHERE owner=? AND chain_id=?').get(getAddress(owner),String(config.chainId))||null;
  const identity=owner=>wallet(owner)?.sender||getAddress(owner);
  function publicRow(row){const result=row.result?JSON.parse(row.result):null;return {id:row.id,owner:row.owner,sender:row.sender,userOpHash:row.hash,status:{prepared:'AWAITING_SIGNATURE',submitting:'SUBMITTED',submitted:'SUBMITTED',included:'INCLUDED',confirmed:'CONFIRMED',failed:'FAILED',expired:'FAILED'}[row.status],phase:row.status,action:JSON.parse(row.action),createdAt:row.created,updatedAt:row.updated,expiresAt:row.expires,result,transactionHash:result?.txHash||null,explorerUrl:result?.txHash&&/^https?:\/\//.test(config.explorer||'')?`${config.explorer.replace(/\/$/,'')}/tx/${result.txHash}`:null,error:row.last_error||null};}
  function notify(row){for(const listener of listeners.get(row.owner)||[]){try{listener(publicRow(row));}catch{/* A disconnected notification transport does not undo settlement. */}}}
  async function settlementRecipients(row,result){
    const accounts=new Set([row.sender]);
    for(const event of result.events){
      if(['InvitationCreated','InvitationCancelled'].includes(event.name))event.args.slice(0,2).forEach(a=>accounts.add(getAddress(a)));
      else if(event.name==='RelationCreated')event.args.slice(1,3).forEach(a=>accounts.add(getAddress(a)));
      else{
        const relationId=event.args[0],stored=db.prepare('SELECT body FROM aa_ring_state WHERE chain_id=? AND contract=? AND relation_id=?').get(String(config.chainId),getAddress(config.contract),relationId);
        const ring=stored?JSON.parse(stored.body):null;
        if(ring?.a&&ring?.b){accounts.add(getAddress(ring.a));accounts.add(getAddress(ring.b));}
        else{const raw=await chainRpc('eth_call',[{to:config.contract,data:bellABI.encodeFunctionData('relations',[relationId])},'latest']);const relation=bellABI.decodeFunctionResult('relations',raw);accounts.add(getAddress(relation[0]));accounts.add(getAddress(relation[1]));}
      }
    }
    const owners=new Set();for(const account of accounts){const binding=db.prepare('SELECT owner FROM aa_wallets WHERE chain_id=? AND sender=?').get(String(config.chainId),account);if(binding&&binding.owner!==row.owner)owners.add(binding.owner);}
    return owners;
  }
  function notifyPartners(owners,row,result){for(const owner of owners)for(const listener of listeners.get(owner)||[]){try{listener({type:'chain-update',reason:'partner-settlement',status:'CONFIRMED',chainId:config.chainId,transactionHash:result.txHash,block:result.block,actions:result.events.map(event=>event.name),refresh:true});}catch{/* A disconnected partner refresh is recovered by its next snapshot request. */}}}
  function subscribe(owner,listener){owner=getAddress(owner);if(!listeners.has(owner))listeners.set(owner,new Set());listeners.get(owner).add(listener);return ()=>{listeners.get(owner)?.delete(listener);if(!listeners.get(owner)?.size)listeners.delete(owner);};}
  async function ready(requireBell=true){
    if(requireBell&&!enabled)throw fail('Deploy and configure CONSENSUS_BELL_ADDRESS before preparing operations',503);
    const [chainId,bundlerChainId,entryPoints,...codes]=await Promise.all([chainRpc('eth_chainId'),bundlerRpc('eth_chainId'),bundlerRpc('eth_supportedEntryPoints'),...[config.factory,config.entryPoint,...(requireBell?[config.contract]:[])].map(address=>chainRpc('eth_getCode',[address,'latest']))]);
    if(BigInt(chainId)!==BigInt(config.chainId)||BigInt(bundlerChainId)!==BigInt(config.chainId))throw fail('Chain RPC and Bundler must match configured chain',503);
    if(!Array.isArray(entryPoints)||!entryPoints.some(v=>v.toLowerCase()===config.entryPoint.toLowerCase()))throw fail('Bundler does not support configured EntryPoint',503);
    if(codes.some(code=>code==='0x'))throw fail('Factory, EntryPoint or business contract has no deployed code',503);
  }
  async function validateWallet(binding){
    if(binding.factory!==config.factory)throw fail('Existing wallet factory differs from configured factory',409);
    const sender=getAddress(await readContract(chainRpc,config.factory,factoryABI,'getAddress',[binding.owner,binding.salt]));
    if(sender!==binding.sender)throw fail('Factory no longer derives bound wallet address',409);
    const deployed=await chainRpc('eth_getCode',[sender,'latest'])!=='0x';
    if(deployed){const [owner,entryPoint]=await Promise.all([readContract(chainRpc,sender,accountABI,'owner'),readContract(chainRpc,sender,accountABI,'entryPoint')]);if(getAddress(owner)!==binding.owner||getAddress(entryPoint)!==config.entryPoint)throw fail('Deployed account owner or EntryPoint mismatch',409);}
    return deployed;
  }
  async function sponsorship(phase,context){
    if(config.sponsor)return sponsorSchema.parse(await config.sponsor({phase,...context,entryPoint:config.entryPoint,chainId:config.chainId}));
    if(!config.sponsorUrl)throw fail('Gas sponsorship requires a configured, funded Paymaster authorization service',503);
    const response=await fetch(config.sponsorUrl,{method:'POST',headers:{'Content-Type':'application/json',...(config.sponsorToken?{Authorization:`Bearer ${config.sponsorToken}`}:{})},body:JSON.stringify({phase,...context,entryPoint:config.entryPoint,chainId:config.chainId}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw fail('Paymaster declined sponsorship',403);
    return sponsorSchema.parse(await response.json());
  }
  async function prepare(owner,body){
    const request=z.object({action:z.string(),invitee:z.string().optional(),contentHash:z.string().optional(),vowIndex:z.string().optional(),value:z.string().optional(),mode:z.string().optional(),relationId:z.string().optional(),sponsor:z.boolean().default(false)}).strict().parse(body);
    const {sponsor,...actionInput}=request,binding=wallet(owner);if(!binding)throw fail('Initialize your smart account first',409);
    if(sponsor&&config.requireVerifiedSponsorIdentity){
      const identityTable=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_identities'").get();
      if(!identityTable||!db.prepare('SELECT 1 FROM auth_identities WHERE owner_address=?').get(owner))throw fail('Verify your embedded-wallet identity before requesting Gas sponsorship',403);
    }
    await ready();const deployed=await validateWallet(binding);
    const {action,callData}=encodeAction(actionInput,config.contract,binding.sender);
    if(sponsor&&['withdraw','cancel','decline'].includes(action.action))throw fail('This action is not eligible for Gas sponsorship',403);
    if(action.action==='withdraw'||action.action==='end'&&action.mode==='finalize'){
      const raw=await chainRpc('eth_call',[{to:config.contract,data:bellABI.encodeFunctionData('relations',[action.relationId])},'latest']);
      const relation=bellABI.decodeFunctionResult('relations',raw);if(![relation[0],relation[1]].some(a=>getAddress(a)===binding.sender))throw fail('This Ring does not belong to your account',403);
      if(action.action==='withdraw'&&relation[4]!==2n)throw fail('Only archived Rings allow Bond withdrawal',409);
    }
    const [nonce,fees]=await Promise.all([readContract(chainRpc,config.entryPoint,entryABI,'getNonce',[binding.sender,0]),bundlerRpc('skandha_getGasPrice')]);
    let operation={sender:binding.sender,nonce:toQuantity(nonce),...(deployed?{}:{factory:config.factory,factoryData:factoryABI.encodeFunctionData('createAccount',[owner,binding.salt])}),callData,callGasLimit:'0x0',verificationGasLimit:'0x0',preVerificationGas:'0x0',maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,signature:dummySignature};
    if(sponsor){
      const day=new Date().toISOString().slice(0,10),used=db.prepare('SELECT count FROM aa_sponsor_usage WHERE owner=? AND day=?').get(owner,day)?.count||0;
      if(used>=Number(config.sponsorDailyLimit||5))throw fail('Daily Gas sponsorship limit reached',429);
      db.prepare('INSERT INTO aa_sponsor_usage VALUES(?,?,1) ON CONFLICT(owner,day) DO UPDATE SET count=count+1').run(owner,day);
      operation={...operation,...await sponsorship('estimate',{owner,sender:binding.sender,action,userOperation:operation})};
    }
    operation=opSchema.parse(operation);
    const estimate=gasSchema.parse(await bundlerRpc('eth_estimateUserOperationGas',[operation,config.entryPoint]));
    operation=opSchema.parse({...operation,callGasLimit:estimate.callGasLimit,verificationGasLimit:estimate.verificationGasLimit||estimate.verificationGas,preVerificationGas:estimate.preVerificationGas,maxFeePerGas:estimate.maxFeePerGas||operation.maxFeePerGas,maxPriorityFeePerGas:estimate.maxPriorityFeePerGas||operation.maxPriorityFeePerGas,...(operation.paymaster?{paymasterVerificationGasLimit:estimate.paymasterVerificationGasLimit||operation.paymasterVerificationGasLimit,paymasterPostOpGasLimit:estimate.paymasterPostOpGasLimit||operation.paymasterPostOpGasLimit}:{})});
    if(['callGasLimit','verificationGasLimit','preVerificationGas'].some(k=>BigInt(operation[k])===0n))throw fail('Bundler returned empty gas estimates',502);
    operation=opSchema.parse({...operation,verificationGasLimit:toQuantity((BigInt(operation.verificationGasLimit)*120n+99n)/100n+10000n)});
    if(deployed){
      const executionGas=BigInt(await chainRpc('eth_estimateGas',[{from:config.entryPoint,to:binding.sender,data:operation.callData}]));
      if(executionGas>BigInt(operation.callGasLimit))operation={...operation,callGasLimit:toQuantity(executionGas)};
    }
    if(sponsor){const authorized=await sponsorship('authorize',{owner,sender:binding.sender,action,userOperation:operation});if(authorized.paymaster!==operation.paymaster||authorized.paymasterVerificationGasLimit!==operation.paymasterVerificationGasLimit||authorized.paymasterPostOpGasLimit!==operation.paymasterPostOpGasLimit)throw fail('Paymaster authorization changed estimated gas fields',502);operation=opSchema.parse({...operation,...authorized});}
    if(['callGasLimit','verificationGasLimit','preVerificationGas'].some(k=>BigInt(operation[k])===0n))throw fail('Bundler returned empty gas estimates',502);
    let id=randomUUID();const hash=userOpHashFor(operation),now=Date.now();
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare("UPDATE aa_operations SET status='expired',updated=? WHERE status='prepared' AND expires<?").run(now,now);
      if(db.prepare("SELECT id FROM aa_operations WHERE owner=? AND chain_id=? AND status IN ('prepared','submitting','submitted','included')").get(owner,String(config.chainId)))throw fail('An operation is already awaiting signature or settlement',409);
      const previous=db.prepare('SELECT id,status,result FROM aa_operations WHERE hash=? AND owner=?').get(hash,owner);
      if(previous&&['expired','failed'].includes(previous.status)&&!previous.result){id=previous.id;db.prepare("UPDATE aa_operations SET status='prepared',operation=?,expires=?,updated=?,last_error=NULL WHERE id=?").run(JSON.stringify(operation),now+600000,now,id);}
      else db.prepare('INSERT INTO aa_operations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,binding.sender,String(config.chainId),config.entryPoint,getAddress(config.contract),JSON.stringify(action),JSON.stringify(operation),hash,'prepared',now+600000,now,now,null,null);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return {id,userOpHash:hash,entryPoint:config.entryPoint,chainId:config.chainId,userOperation:operation,expiresAt:now+600000,signing:{method:'personal_sign',message:hash,encoding:'bytes',owner},sponsored:sponsor};
  }
  function userOpHashFor(operation){return protocolHash(operation,config.entryPoint,config.chainId);}
  async function submit(owner,body){
    const request=z.object({id:z.string().uuid(),userOperation:opSchema,userOpHash:hashSchema.optional()}).strict().parse(body);
    let row=db.prepare('SELECT * FROM aa_operations WHERE id=? AND owner=?').get(request.id,owner);if(!row)throw fail('Operation not found',404);
    if(row.chain_id!==String(config.chainId)||row.entry_point!==config.entryPoint||row.contract!==getAddress(config.contract))throw fail('Prepared operation belongs to another configuration',409);
    if(!sameOperation(JSON.parse(row.operation),request.userOperation)||userOpHashFor(request.userOperation)!==row.hash||request.userOpHash&&request.userOpHash!==row.hash)throw fail('Submitted operation differs from the prepared call',403);
    if(getAddress(verifyMessage(getBytes(row.hash),request.userOperation.signature))!==owner)throw fail('UserOperation signature does not match owner',403);
    if(row.status!=='prepared')return publicRow(row);
    if(row.expires<Date.now())throw fail('Prepared operation expired; prepare again',409);
    const changed=db.prepare("UPDATE aa_operations SET operation=?,status='submitting',updated=? WHERE id=? AND status='prepared'").run(JSON.stringify(request.userOperation),Date.now(),row.id);
    if(changed.changes!==1)return publicRow(db.prepare('SELECT * FROM aa_operations WHERE id=?').get(row.id));
    try{const hash=await bundlerRpc('eth_sendUserOperation',[request.userOperation,config.entryPoint]);if(hashSchema.parse(hash)!==row.hash)throw fail('Bundler returned an unexpected operation hash',502);db.prepare("UPDATE aa_operations SET status='submitted',last_error=NULL,updated=? WHERE id=? AND status='submitting'").run(Date.now(),row.id);}catch(error){const status=sendFailureStatus(error);db.prepare('UPDATE aa_operations SET status=?,last_error=?,updated=? WHERE id=?').run(status,error.message,Date.now(),row.id);}
    row=db.prepare('SELECT * FROM aa_operations WHERE id=?').get(row.id);notify(row);return publicRow(row);
  }
  let activePoll=null,closed=false;
  function sendFailureStatus(error){if(error instanceof RpcError){if(/already (?:known|submitted|pending)|nonce (?:too low|already used)/i.test(error.message))return 'submitted';if([-32602,-32500,-32501,-32502,-32506,-32507,-32521].includes(error.code))return 'failed';}return 'submitting';}
  async function runPoll(){
    const rows=db.prepare("SELECT * FROM aa_operations WHERE chain_id=? AND entry_point=? AND contract=? AND status IN ('submitting','submitted','included') ORDER BY created LIMIT 50").all(String(config.chainId),config.entryPoint,getAddress(config.contract));
    if(rows.length===0)return;
    await ready();
    for(const row of rows){if(closed)break;try{
      const result=await verifyReceipt(row,config,chainRpc,bundlerRpc);
      if(!result){if(row.status==='submitting'){const hash=await bundlerRpc('eth_sendUserOperation',[JSON.parse(row.operation),config.entryPoint]);if(hashSchema.parse(hash)!==row.hash)throw new Error('Bundler returned an unexpected operation hash');db.prepare("UPDATE aa_operations SET status='submitted',last_error=NULL,updated=? WHERE id=?").run(Date.now(),row.id);notify(db.prepare('SELECT * FROM aa_operations WHERE id=?').get(row.id));}continue;}
      const recipients=result.status==='confirmed'?await settlementRecipients(row,result):new Set();
      db.exec('BEGIN IMMEDIATE');try{mirrorReceipt(db,row,config,result);db.prepare('UPDATE aa_operations SET status=?,result=?,last_error=NULL,updated=? WHERE id=?').run(result.status,JSON.stringify(result),Date.now(),row.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      notify(db.prepare('SELECT * FROM aa_operations WHERE id=?').get(row.id));
      notifyPartners(recipients,row,result);
    }catch(error){const status=error instanceof RpcError&&error.method==='eth_sendUserOperation'?sendFailureStatus(error):row.status;db.prepare('UPDATE aa_operations SET status=?,last_error=?,updated=? WHERE id=?').run(status,error.message,Date.now(),row.id);if(status!==row.status)notify(db.prepare('SELECT * FROM aa_operations WHERE id=?').get(row.id));}}
  }
  function poll(){if(closed||!enabled)return Promise.resolve();if(!activePoll)activePoll=runPoll().finally(()=>{activePoll=null;});return activePoll;}
  const timer=enabled&&config.pollMs>0?setInterval(()=>{void poll().catch(error=>console.error('AA receipt worker:',error.message));},Math.max(1000,config.pollMs)):null;timer?.unref();
  async function handle({path,method,address,body={}}){
    if(!path.startsWith('/api/wallet')&&!path.startsWith('/api/userops'))return null;
    const owner=addressSchema.parse(address);
    if(path==='/api/wallet'&&method==='GET')return {status:200,body:wallet(owner)};
    if(path==='/api/wallet/challenge'&&method==='POST'){
      const {salt}=z.object({salt:saltSchema.default('0')}).strict().parse(body),existing=wallet(owner);
      if(existing&&existing.salt!==salt)throw fail('Smart account binding is immutable',409);
      const id=randomBytes(24).toString('hex'),expires=Date.now()+300000;
      const message=`Consensus Bell smart account ownership\nOrigin: ${config.origin}\nOwner: ${owner}\nChain ID: ${config.chainId}\nFactory: ${config.factory}\nSalt: ${salt}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nThis proves wallet control and does not authorize transfers.`;
      db.prepare('DELETE FROM aa_wallet_challenges WHERE expires<?').run(Date.now());db.prepare('INSERT INTO aa_wallet_challenges VALUES(?,?,?,?,?)').run(id,owner,salt,message,expires);return {status:200,body:{id,message,expiresAt:expires}};
    }
    if(path==='/api/wallet/init'&&method==='POST'){
      const b=z.object({id:z.string().regex(/^[a-f0-9]{48}$/),signature:z.string().max(300)}).strict().parse(body),challenge=db.prepare('SELECT * FROM aa_wallet_challenges WHERE id=? AND owner=?').get(b.id,owner);
      if(!challenge||challenge.expires<Date.now())throw fail('Wallet ownership challenge expired or already used',401);
      if(getAddress(verifyMessage(challenge.message,b.signature))!==owner)throw fail('Wallet ownership signature does not match session owner',403);
      if(!challenge.message.includes(`Origin: ${config.origin}\nOwner: ${owner}\nChain ID: ${config.chainId}\nFactory: ${config.factory}\n`))throw fail('Wallet challenge belongs to another deployment configuration',409);
      await ready(false);const sender=getAddress(await readContract(chainRpc,config.factory,factoryABI,'getAddress',[owner,challenge.salt]));
      const existing=wallet(owner);if(existing&&(existing.sender!==sender||existing.factory!==config.factory||existing.salt!==challenge.salt))throw fail('Smart account binding is immutable',409);
      await validateWallet({owner,sender,factory:config.factory,salt:challenge.salt});
      db.exec('BEGIN IMMEDIATE');try{if(db.prepare('DELETE FROM aa_wallet_challenges WHERE id=? AND expires>=?').run(b.id,Date.now()).changes!==1)throw fail('Wallet challenge already consumed',401);db.prepare('INSERT OR IGNORE INTO aa_wallets VALUES(?,?,?,?,?,?)').run(owner,String(config.chainId),sender,config.factory,challenge.salt,Date.now());if(wallet(owner)?.sender!==sender)throw fail('Smart account binding conflict',409);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return {status:201,body:wallet(owner)};
    }
    if(path==='/api/userops/prepare'&&method==='POST')return {status:201,body:await prepare(owner,body)};
    if(path==='/api/userops/submit'&&method==='POST')return {status:202,body:await submit(owner,body)};
    if(path==='/api/userops'&&method==='GET')return {status:200,body:db.prepare('SELECT * FROM aa_operations WHERE owner=? AND chain_id=? ORDER BY created DESC LIMIT 100').all(owner,String(config.chainId)).map(publicRow)};
    const match=/^\/api\/userops\/([a-f0-9-]{36})$/.exec(path);
    if(match&&method==='GET'){const row=db.prepare('SELECT * FROM aa_operations WHERE id=? AND owner=? AND chain_id=?').get(match[1],owner,String(config.chainId));if(!row)throw fail('Operation not found',404);return {status:200,body:publicRow(row)};}
    return null;
  }
  return {enabled,handle,wallet,identity,subscribe,poll,publicConfig:{enabled,chainId:config.chainId,entryPoint:config.entryPoint,factory:config.factory,version:'0.7',sponsorshipConfigured:!!(config.sponsor||config.sponsorUrl),confirmations:config.confirmations},async close(){closed=true;if(timer)clearInterval(timer);try{await activePoll;}catch(error){console.error('AA receipt worker stopped with error:',error.message);}finally{listeners.clear();}}};
}
