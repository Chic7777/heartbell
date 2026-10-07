import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Wallet,AbiCoder,verifyMessage,getBytes,keccak256,concat,zeroPadValue,toBeHex} from 'ethers';
import {createSponsor} from './sponsor.mjs';
import {encodeAction} from './aa-protocol.mjs';

test('sponsor binds exact operation gas sender target expiry and has durable quota',async()=>{
  const db=new DatabaseSync(':memory:'),signer=Wallet.createRandom();
  const owner=Wallet.createRandom().address,sender=Wallet.createRandom().address,contract=Wallet.createRandom().address,paymaster=Wallet.createRandom().address,entryPoint=Wallet.createRandom().address;
  const sponsor=createSponsor(db,{contract,paymaster,sponsorKey:signer.privateKey,dailyLimit:1});
  const action={action:'invite',invitee:Wallet.createRandom().address};
  const op={sender,nonce:'0x0',callData:encodeAction(action,contract,sender).callData,callGasLimit:'0x10000',verificationGasLimit:'0x10000',preVerificationGas:'0x10000',maxFeePerGas:'0x100',maxPriorityFeePerGas:'0x10',signature:'0x'};
  const input={owner,sender,action,userOperation:op,entryPoint,chainId:677};
  try{
    const stub=await sponsor({phase:'estimate',...input});
    const final={...op,...stub};
    const grant=await sponsor({phase:'authorize',...input,userOperation:final});
    const coder=AbiCoder.defaultAbiCoder(),[after,until,cost,signature]=coder.decode(['uint48','uint48','uint256','bytes'],grant.paymasterData);
    const pair=(a,b)=>zeroPadValue(toBeHex((BigInt(a)<<128n)|BigInt(b)),32);
    const header=concat([paymaster,zeroPadValue(toBeHex(BigInt(grant.paymasterVerificationGasLimit)),16),zeroPadValue(toBeHex(BigInt(grant.paymasterPostOpGasLimit)),16)]);
    const digest=keccak256(coder.encode(['uint256','address','address','address','uint256','bytes32','bytes32','bytes32','uint256','bytes32','bytes32','uint48','uint48','uint256'],[677,entryPoint,paymaster,sender,0,keccak256('0x'),keccak256(op.callData),pair(op.verificationGasLimit,op.callGasLimit),op.preVerificationGas,pair(op.maxPriorityFeePerGas,op.maxFeePerGas),keccak256(header),after,until,cost]));
    assert.equal(verifyMessage(getBytes(digest),signature),signer.address);
    assert.ok(until>after);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sponsorship_grants').get().n,1);
    await assert.rejects(sponsor({phase:'authorize',...input,userOperation:final}),/allowance/);
    await assert.rejects(sponsor({phase:'estimate',...input,userOperation:{...op,callData:'0x1234'}}),/validated Bell/);
  }finally{db.close();}
});
