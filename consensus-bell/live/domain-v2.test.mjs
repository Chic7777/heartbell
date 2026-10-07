import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createDomainV2 } from './domain-v2.mjs';

const a='0x0000000000000000000000000000000000000001';
const b='0x0000000000000000000000000000000000000002';
const c='0x0000000000000000000000000000000000000003';
function setup(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE profiles(address TEXT PRIMARY KEY,body TEXT NOT NULL);
    CREATE TABLE radar_locations(address TEXT PRIMARY KEY,lat REAL,lon REAL,at INTEGER);
    CREATE TABLE radar_saved(owner TEXT,target TEXT,PRIMARY KEY(owner,target));`);
  for(const address of [a,b,c]) db.prepare('INSERT INTO profiles VALUES(?,?)').run(address,JSON.stringify({name:address===a?'Luna':'Alex',city:'上海',interests:['音乐'],intention:'认真交往',discoverable:true}));
  let time=1700000000000;
  const domain=createDomainV2(db,{}, {now:()=>time});
  const call=(path,method='GET',body={},address=a,query=new URLSearchParams())=>domain.handle({path,method,body,address,query});
  const grant=async(skill,address=a,expiry=time+10000)=>(await call('/api/consents','POST',{scope:'agent:'+skill,resourceId:'profile',expiresAt:expiry},address)).body.grant;
  return {db,call,grant,setTime:value=>{time=value;}};
}
test('Echo allows multiple accepted connections independently of Rings and only recipients respond',async t=>{
  const {call,db}=setup(t);
  const first=await call('/api/connections','POST',{recipient:b});
  assert.equal(first.status,201);const id=first.body.connection.id;
  assert.equal((await call('/api/connections/'+id+'/respond','POST',{decision:'accept'})).status,403);
  assert.equal((await call('/api/connections/'+id,'GET',{},c)).status,404);
  assert.equal((await call('/api/connections','POST',{recipient:a},b)).status,409);
  assert.equal((await call('/api/connections/'+id+'/respond','POST',{decision:'accept'},b)).body.connection.status,'accepted');
  assert.equal((await call('/api/connections/'+id+'/respond','POST',{decision:'decline'},b)).status,409);
  const second=await call('/api/connections','POST',{recipient:c});
  assert.equal((await call('/api/connections/'+second.body.connection.id+'/respond','POST',{decision:'accept'},c)).status,200);
  assert.equal((await call('/api/connections')).body.connections.length,2);
  assert.equal((await call('/api/connections','GET',{},b)).body.connections.length,1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM echo_connections WHERE status='accepted'").get().n,2);
});
test('declined request can be retried, self/private targets and duplicate requests are rejected',async t=>{
  const {call,db}=setup(t);
  assert.equal((await call('/api/connections','POST',{recipient:a})).status,400);
  db.prepare('UPDATE profiles SET body=? WHERE address=?').run(JSON.stringify({discoverable:false}),c);
  assert.equal((await call('/api/connections','POST',{recipient:c})).status,404);
  const {body}=await call('/api/connections','POST',{recipient:b});
  assert.equal((await call('/api/connections','POST',{recipient:b})).status,409);
  assert.equal((await call('/api/connections/'+body.connection.id+'/respond','POST',{decision:'decline'},b)).status,200);
  assert.equal((await call('/api/connections','POST',{recipient:b})).status,201);
});
test('participant-owned blocks prevent requests in either direction; only blocker can remove block',async t=>{
  const {call}=setup(t);
  const id=(await call('/api/connections','POST',{recipient:b})).body.connection.id;
  assert.equal((await call('/api/connections/'+id+'/block','POST',{},c)).status,404);
  assert.equal((await call('/api/connections/'+id+'/block','POST',{},b)).status,200);
  assert.equal((await call('/api/connections/'+id)).body.connection.status,'blocked');
  assert.equal((await call('/api/connections','POST',{recipient:b})).status,403);
  assert.equal((await call('/api/connections','POST',{recipient:a},b)).status,403);
  await call('/api/blocks','DELETE',{target:b});
  assert.equal((await call('/api/connections','POST',{recipient:b})).status,403);
  await call('/api/blocks','DELETE',{target:a},b);
  assert.equal((await call('/api/connections','POST',{recipient:b})).status,201);
});
test('Agent drafts require own exact scoped unexpired consent and never authorize signing',async t=>{
  const {call,grant,setTime,db}=setup(t);
  const job={skill:'vow-draft',resourceId:'profile',title:'一起成长',points:['每周散步']};
  assert.equal((await call('/api/agent/jobs','POST',job)).status,403);
  await grant('story-draft');
  assert.equal((await call('/api/agent/jobs','POST',job)).status,403);
  const consent=await grant('vow-draft');
  assert.equal((await call('/api/agent/jobs','POST',job,b)).status,403);
  const drafted=await call('/api/agent/jobs','POST',job);
  assert.equal(drafted.status,201);
  assert.equal(drafted.body.job.output.llm,false);
  assert.equal(drafted.body.job.output.editable,true);
  assert.equal(drafted.body.job.output.requiresUserApproval,true);
  assert.match(drafted.body.job.output.text,/每周散步/);
  assert.equal((await call('/api/agent/jobs','POST',{...job,signature:'0x'})).status,400);
  assert.equal((await call('/api/agent/jobs','POST',{...job,resourceId:'private-memory'})).status,400);
  assert.equal((await call('/api/agent/jobs','GET',{},b,new URLSearchParams({id:drafted.body.job.id}))).status,404);
  assert.equal((await call('/api/consents','DELETE',{id:consent.id},b)).status,404);
  await call('/api/consents','DELETE',{id:consent.id});
  assert.equal((await call('/api/agent/jobs','POST',job)).status,403);
  await grant('vow-draft');setTime(1700000010000);
  assert.equal((await call('/api/agent/jobs','POST',job)).status,403);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agent_jobs').get().n,1);
});
test('Radar Agent explains real structured candidates and excludes blocked profiles',async t=>{
  const {call,grant}=setup(t);
  await grant('radar-explain');await call('/api/blocks','POST',{target:b});
  const response=await call('/api/agent/jobs','POST',{skill:'radar-explain',resourceId:'profile'});
  assert.equal(response.status,201);
  assert.deepEqual(response.body.job.output.candidates.map(candidate=>candidate.address),[c]);
  assert.match(response.body.job.output.candidates[0].reasons.join(','),/音乐/);
});
test('versioned migration is idempotent and unknown route falls through',async t=>{
  const {db,call}=setup(t);createDomainV2(db,{});
  assert.equal(db.prepare('SELECT count(*) AS n FROM domain_schema_migrations WHERE version=200').get().n,1);
  assert.equal(await call('/api/other'),null);
  assert.equal((await call('/api/connections','PATCH')).status,405);
});
