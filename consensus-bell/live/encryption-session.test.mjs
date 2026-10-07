import test from 'node:test';
import assert from 'node:assert/strict';

test('restored session defers new encryption registration until an explicit signer reconnects',async()=>{
  const previousWindow=globalThis.window,previousIndexedDB=globalThis.indexedDB;
  let writes=0;
  globalThis.window={ethers:{}};
  globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(){const transaction={objectStore(){return {get(){const read={result:undefined};queueMicrotask(()=>transaction.oncomplete());return read;},put(){writes++;throw new Error('Must not persist unsigned key');}};}};return transaction;}};request.onsuccess();});return request;}};
  const requests=[];
  try{
    const {initializeEncryption,clearEncryption}=await import('./web/crypto.js');
    const context={account:'0x'+'1'.repeat(40),api:async(path,options)=>{requests.push({path,options});return null;},config:{origin:'https://test.invalid'}};
    await initializeEncryption({...context,deferRegistration:true});
    assert.equal(writes,0);assert.deepEqual(requests,[{path:'/api/key',options:undefined}]);
    await assert.rejects(initializeEncryption(context),/请重新连接钱包/);
    assert.equal(writes,0);assert.ok(requests.every(request=>!request.options));clearEncryption();
  }finally{globalThis.window=previousWindow;globalThis.indexedDB=previousIndexedDB;}
});
