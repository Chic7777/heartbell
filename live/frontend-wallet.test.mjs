import test from 'node:test';
import assert from 'node:assert/strict';
import {walletAction,chainIdentity,encryptionPeer} from './web/aa-action.js';
test('AA actions preserve value and explicit self-paid gas',()=>{
  assert.deepEqual(walletAction('deposit',[],23n),{action:'deposit',value:'23',sponsor:false});
  assert.deepEqual(walletAction('withdrawFrom',['4']),{action:'withdraw',relationId:'4',sponsor:false});
  assert.deepEqual(walletAction('finalizeEnd',['4']),{action:'end',mode:'finalize',relationId:'4',sponsor:false});
  assert.throws(()=>walletAction('unknown'),/尚未接入/);
});
test('AA membership uses smart account while encryption uses mapped owner',()=>{
  const owner='0x111',sender='0x222',peerSender='0x333',peerOwner='0x444';
  assert.equal(chainIdentity({user:owner,chainAddress:sender}),sender);
  assert.equal(chainIdentity({user:owner}),owner);
  assert.equal(encryptionPeer({a:sender,b:peerSender,owners:{[peerSender]:peerOwner}},owner,sender),peerOwner);
  assert.equal(encryptionPeer({a:peerSender,b:sender,peerOwner},owner,sender),peerOwner);
  assert.equal(encryptionPeer(null,owner,sender),owner);
});
