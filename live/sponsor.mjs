import {AbiCoder,Wallet,concat,getBytes,keccak256,toBeHex,zeroPadValue,isAddress,getAddress} from 'ethers';
import {encodeAction} from './aa-protocol.mjs';
const packedPair=(high,low)=>zeroPadValue(toBeHex((BigInt(high)<<128n)|BigInt(low)),32);

export function createSponsor(db,config){
  if(!config.paymaster || !config.sponsorKey) return null;
  if(!isAddress(config.paymaster)||!isAddress(config.contract))throw new Error('Configure deployed Bell Paymaster and business contract addresses');
  const paymaster=getAddress(config.paymaster);
  const signer=new Wallet(config.sponsorKey),coder=AbiCoder.defaultAbiCoder();
  const limit=BigInt(config.maxCostWei??'10000000000000000');
  const dailyLimit=Number(config.dailyLimit??10);
  if(limit<=0n||!Number.isInteger(dailyLimit)||dailyLimit<1)throw new Error('Invalid sponsorship limits');
  db.exec(`CREATE TABLE IF NOT EXISTS sponsorship_grants(id TEXT PRIMARY KEY,owner TEXT NOT NULL,sender TEXT NOT NULL,action TEXT NOT NULL,op_hash TEXT NOT NULL UNIQUE,max_cost_wei TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);`);
  return async({phase,owner,sender,action,userOperation:op,entryPoint,chainId})=>{
    const actionName=action.action;
    const encoded=encodeAction(action,config.contract,sender);
    if(op.sender.toLowerCase()!==sender.toLowerCase()||encoded.callData.toLowerCase()!==op.callData.toLowerCase())throw Object.assign(new Error('Sponsor only authorizes validated Bell calls'),{status:403});
    if(phase==='estimate')return {paymaster:paymaster,paymasterVerificationGasLimit:'0x186a0',paymasterPostOpGasLimit:'0x7530',paymasterData:coder.encode(['uint48','uint48','uint256','bytes'],[1,281474976710655,limit,'0x'+'11'.repeat(64)+'1b'])};
    if(!['invite','accept','privateVow','confirm','deposit'].includes(actionName))throw Object.assign(new Error('This action is not sponsored'),{status:403});
    const header=concat([paymaster,zeroPadValue(toBeHex(BigInt(op.paymasterVerificationGasLimit)),16),zeroPadValue(toBeHex(BigInt(op.paymasterPostOpGasLimit)),16)]);
    const verificationGas=BigInt(op.paymasterVerificationGasLimit),postOpGas=BigInt(op.paymasterPostOpGasLimit);
    const cost=(BigInt(op.callGasLimit)+BigInt(op.verificationGasLimit)+BigInt(op.preVerificationGas)+verificationGas+postOpGas)*BigInt(op.maxFeePerGas);
    if(cost>limit)throw Object.assign(new Error('Operation exceeds sponsor gas-cost limit'),{status:403});
    const now=Date.now(),validAfter=Math.floor(now/1000)-30,validUntil=Math.floor(now/1000)+300;
    const initCode=op.factory?concat([op.factory,op.factoryData]):'0x';
    const digest=keccak256(coder.encode(['uint256','address','address','address','uint256','bytes32','bytes32','bytes32','uint256','bytes32','bytes32','uint48','uint48','uint256'],[chainId,entryPoint,paymaster,sender,op.nonce,keccak256(initCode),keccak256(op.callData),packedPair(op.verificationGasLimit,op.callGasLimit),op.preVerificationGas,packedPair(op.maxPriorityFeePerGas,op.maxFeePerGas),keccak256(header),validAfter,validUntil,cost]));
    const signature=await signer.signMessage(getBytes(digest));
    db.exec('BEGIN IMMEDIATE');
    try{
      const count=db.prepare('SELECT COUNT(*) AS n FROM sponsorship_grants WHERE owner=? AND created_at>?').get(owner,now-86400000).n;
      if(count>=dailyLimit)throw Object.assign(new Error('Daily sponsor allowance exhausted'),{status:429});
      db.prepare('INSERT INTO sponsorship_grants VALUES(?,?,?,?,?,?,?,?)').run(digest,owner,sender,actionName,digest,cost.toString(),validUntil*1000,now);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return {paymaster:paymaster,paymasterVerificationGasLimit:op.paymasterVerificationGasLimit,paymasterPostOpGasLimit:op.paymasterPostOpGasLimit,paymasterData:coder.encode(['uint48','uint48','uint256','bytes'],[validAfter,validUntil,cost,signature])};
  };
}
