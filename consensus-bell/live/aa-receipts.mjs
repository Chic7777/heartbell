import { getAddress } from 'ethers';
import { bellABI, entryABI, hashSchema, sameOperation } from './aa-protocol.mjs';

const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const quantity=v=>Number(BigInt(v));
const expectedEvent=action=>({invite:'InvitationCreated',accept:'RelationCreated',privateVow:'VowProposed',confirm:'VowConfirmed',deposit:'Deposited',withdraw:'Withdrawn',cancel:'InvitationCancelled',decline:'InvitationCancelled',end:action.mode==='request'?'EndRequested':'RelationArchived'}[action.action]);
function belongs(event,action,sender){
  const a=event.args;
  switch(action.action){
    case 'invite':return equal(a[0],sender)&&equal(a[1],action.invitee);
    case 'accept':return equal(a[2],sender);
    case 'privateVow':return equal(a[2],sender)&&equal(a[3],action.contentHash);
    case 'confirm':return equal(a[2],sender)&&a[1]===BigInt(action.vowIndex);
    case 'deposit':return equal(a[1],sender)&&a[2]===BigInt(action.value);
    case 'withdraw':return equal(a[1],sender)&&a[0]===BigInt(action.relationId);
    case 'cancel':return equal(a[0],sender);
    case 'decline':return equal(a[1],sender);
    case 'end':return equal(a[1],sender)&&(action.mode!=='finalize'||a[0]===BigInt(action.relationId));
  }
}
export async function verifyReceipt(row,config,chainRpc,bundlerRpc){
  const bundled=await bundlerRpc('eth_getUserOperationReceipt',[row.hash]);
  if(!bundled)return null;
  if(!equal(bundled.userOpHash,row.hash)||!equal(bundled.sender,row.sender)||typeof bundled.success!=='boolean')throw new Error('Bundler receipt identity mismatch');
  const located=await bundlerRpc('eth_getUserOperationByHash',[row.hash]);
  const operation=JSON.parse(row.operation);
  if(!located||!equal(located.entryPoint,config.entryPoint)||!sameOperation(located.userOperation,operation))throw new Error('Bundler operation differs from prepared operation');
  const txHash=hashSchema.parse(bundled.receipt?.transactionHash);
  if(!equal(located.transactionHash,txHash))throw new Error('Bundler transaction mismatch');
  const [receipt,tx,latest]=await Promise.all([chainRpc('eth_getTransactionReceipt',[txHash]),chainRpc('eth_getTransactionByHash',[txHash]),chainRpc('eth_blockNumber')]);
  if(!receipt||!tx)return null;
  if(!equal(receipt.transactionHash,txHash)||!equal(tx.hash,txHash)||!equal(tx.to,config.entryPoint)||!equal(receipt.to,config.entryPoint)||!equal(tx.blockHash,receipt.blockHash)||quantity(tx.blockNumber)!==quantity(receipt.blockNumber))throw new Error('Chain receipt identity mismatch');
  if(BigInt(receipt.status)!==1n)throw new Error('Bundle reverted; no verified UserOperation inclusion');
  const block=await chainRpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
  if(!block||!equal(block.hash,receipt.blockHash))return null;
  const confirmations=quantity(latest)-quantity(receipt.blockNumber)+1;
  const logs=receipt.logs;
  let matched=null,previous=-1;
  for(let i=0;i<logs.length;i++){
    if(!equal(logs[i].address,config.entryPoint))continue;
    let event;try{event=entryABI.parseLog(logs[i]);}catch{continue;}
    if(event?.name!=='UserOperationEvent')continue;
    if(equal(event.args[0],row.hash)){
      if(matched)throw new Error('Duplicate UserOperationEvent');
      matched={event,start:previous+1,end:i};
    }
    previous=i;
  }
  if(!matched)throw new Error('No EntryPoint UserOperationEvent on chain');
  const args=matched.event.args;
  if(!equal(args[1],row.sender)||args[3]!==BigInt(operation.nonce)||args[4]!==bundled.success||!equal(args[2],operation.paymaster||'0x0000000000000000000000000000000000000000'))throw new Error('UserOperationEvent differs from prepared operation');
  const events=[];
  for(const log of logs.slice(matched.start,matched.end)){
    if(!equal(log.address,config.contract))continue;
    let event;try{event=bellABI.parseLog(log);}catch{continue;}
    if(event)events.push({event,log});
  }
  const action=JSON.parse(row.action);
  if(args[4]&&!events.some(({event})=>event.name===expectedEvent(action)&&belongs(event,action,row.sender)))throw new Error('No matching business event for prepared action');
  return {status:confirmations<config.confirmations?'included':args[4]?'confirmed':'failed',success:args[4],txHash,block:quantity(receipt.blockNumber),blockHash:receipt.blockHash,confirmations,actualGasCost:args[5].toString(),actualGasUsed:args[6].toString(),events:events.map(({event,log})=>({name:event.name,args:Array.from(event.args,v=>typeof v==='bigint'?v.toString():v),logIndex:quantity(log.logIndex)}))};
}
export function mirrorReceipt(db,row,config,result){
  if(result.status!=='confirmed')return;
  const contract=getAddress(config.contract),chainId=String(config.chainId);
  for(const event of result.events){
    const inserted=db.prepare('INSERT OR IGNORE INTO aa_chain_events VALUES(?,?,?,?,?,?,?)').run(chainId,contract,result.txHash,event.logIndex,result.block,result.blockHash,JSON.stringify(event));
    if(inserted.changes===0)continue;
    const later=(table)=>`excluded.block>${table}.block OR (excluded.block=${table}.block AND excluded.log_index>${table}.log_index)`;
    function updateRing(id,patch){
      const old=db.prepare('SELECT body,block,log_index FROM aa_ring_state WHERE chain_id=? AND contract=? AND relation_id=?').get(chainId,contract,id),state={...JSON.parse(old?.body||'{}'),...patch};
      if(old&&(old.block>result.block||old.block===result.block&&old.log_index>event.logIndex)){
        if(event.name==='RelationCreated')db.prepare('UPDATE aa_ring_state SET body=? WHERE chain_id=? AND contract=? AND relation_id=?').run(JSON.stringify({...patch,...JSON.parse(old.body)}),chainId,contract,id);
        else if(patch.vowCount!==undefined){const current=JSON.parse(old.body);db.prepare('UPDATE aa_ring_state SET body=? WHERE chain_id=? AND contract=? AND relation_id=?').run(JSON.stringify({...current,vowCount:Math.max(current.vowCount||0,patch.vowCount)}),chainId,contract,id);}
        return;
      }
      db.prepare(`INSERT INTO aa_ring_state VALUES(?,?,?,?,?,?) ON CONFLICT(chain_id,contract,relation_id) DO UPDATE SET body=excluded.body,block=excluded.block,log_index=excluded.log_index WHERE ${later('aa_ring_state')}`).run(chainId,contract,id,JSON.stringify(state),result.block,event.logIndex);
    }
    function invitation(inviter,invitee,state){db.prepare(`INSERT INTO aa_invitations VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(chain_id,contract,invitee) DO UPDATE SET inviter=excluded.inviter,state=excluded.state,block=excluded.block,log_index=excluded.log_index,transaction_hash=excluded.transaction_hash WHERE ${later('aa_invitations')}`).run(chainId,contract,getAddress(invitee),getAddress(inviter),state,result.block,event.logIndex,result.txHash);}
    if(event.name==='RelationCreated'){
      for(const who of event.args.slice(1,3))db.prepare('INSERT OR IGNORE INTO relations VALUES(?,?)').run(event.args[0],getAddress(who));
      updateRing(event.args[0],{status:'ACTIVE',a:event.args[1],b:event.args[2],createdAt:event.args[3],vowCount:0});invitation(event.args[1],event.args[2],'ACCEPTED');
    }else if(['EndRequested','RelationArchived'].includes(event.name)){
      const state={status:event.name==='EndRequested'?'ENDING':'ARCHIVED',by:event.args[1]};
      if(event.name==='EndRequested')state.endingAt=event.args[2];
      updateRing(event.args[0],state);
    }else if(['VowProposed','VowConfirmed'].includes(event.name)){
      const old=db.prepare('SELECT body,block,log_index FROM aa_vow_state WHERE chain_id=? AND contract=? AND relation_id=? AND vow_index=?').get(chainId,contract,event.args[0],event.args[1]);
      const vow={...JSON.parse(old?.body||'{}'),...(event.name==='VowProposed'?{proposer:event.args[2],contentHash:event.args[3],confirmed:false}:{confirmer:event.args[2],confirmed:true,vowCount:Number(event.args[3])})};
      db.prepare(`INSERT INTO aa_vow_state VALUES(?,?,?,?,?,?,?) ON CONFLICT(chain_id,contract,relation_id,vow_index) DO UPDATE SET body=excluded.body,block=excluded.block,log_index=excluded.log_index WHERE ${later('aa_vow_state')}`).run(chainId,contract,event.args[0],event.args[1],JSON.stringify(vow),result.block,event.logIndex);
      if(event.name==='VowProposed'&&old&&(old.block>result.block||old.block===result.block&&old.log_index>event.logIndex))db.prepare('UPDATE aa_vow_state SET body=? WHERE chain_id=? AND contract=? AND relation_id=? AND vow_index=?').run(JSON.stringify({proposer:event.args[2],contentHash:event.args[3],...JSON.parse(old.body)}),chainId,contract,event.args[0],event.args[1]);
      if(event.name==='VowConfirmed')updateRing(event.args[0],{vowCount:Number(event.args[3])});
    }else if(['Deposited','Withdrawn'].includes(event.name)){
      db.prepare('INSERT OR IGNORE INTO aa_bond_deposits VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(chainId,contract,result.txHash,event.logIndex,event.args[0],getAddress(event.args[1]),event.args[2],event.name==='Deposited'?event.args[3]:'0',event.name==='Deposited'?'DEPOSIT':'WITHDRAWAL',result.block,result.blockHash);
    }else if(event.name==='InvitationCreated')invitation(event.args[0],event.args[1],'PENDING');
    else if(event.name==='InvitationCancelled')invitation(event.args[0],event.args[1],'CANCELLED');
  }
}
