import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from './server.mjs';
test('public session status reveals no account and private APIs remain authenticated',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bell-status-')),app=await createApp({dataDir:directory,rpc:'',contract:''});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  try{const status=await fetch(base+'/api/session/status');assert.equal(status.status,200);assert.deepEqual(await status.json(),{authenticated:false});assert.equal((await fetch(base+'/api/profile')).status,401);assert.equal((await fetch(base+'/api/session')).status,401);}finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
test('static HTML supports gzip transport without changing the document',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bell-delivery-')),app=await createApp({dataDir:directory,rpc:'',contract:''});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  try{const response=await fetch(base+'/',{headers:{'Accept-Encoding':'gzip'}});assert.equal(response.headers.get('content-encoding'),'gzip');assert.match(await response.text(),/id="app"/);}finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
