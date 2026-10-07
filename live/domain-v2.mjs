import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getAddress, isAddress } from 'ethers';
import { z } from 'zod';
import { searchRadar } from './radar.mjs';

const wallet = z.string().refine(isAddress).transform(getAddress);
const skills = ['radar-explain', 'story-draft', 'vow-draft'];
const scopeSchema = z.enum(skills.map(skill => 'agent:' + skill));
const grantSchema = z.object({scope:scopeSchema,resourceId:z.literal('profile'),expiresAt:z.number().int().safe()}).strict();
const jobSchema = z.object({
  skill:z.enum(skills),resourceId:z.literal('profile'),
  title:z.string().trim().max(100).optional(),
  points:z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  filters:z.object({city:z.string().trim().max(60).default(''),intention:z.string().trim().max(60).default(''),radius:z.number().int().min(0).max(200).default(0),gender:z.string().trim().max(30).default(''),ageMin:z.number().int().min(0).max(120).default(0),ageMax:z.number().int().min(0).max(120).default(0)}).strict().optional()
}).strict();
const chatEnvelope=z.object({scope:z.string().regex(/^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),ciphertext:z.string().min(16).max(60000).regex(/^[A-Za-z0-9+/=]+$/),iv:z.string().regex(/^[A-Za-z0-9+/]{16}$/),ephemeral:z.boolean().default(false)}).strict();
const EPHEMERAL_TTL=24*3600*1000;
const result = (status, body) => ({status, body});
const fail = (status, message) => {throw Object.assign(new Error(message), {status});};

export function createDomainV2(db, chain, config = {}) {
  db.exec('CREATE TABLE IF NOT EXISTS domain_schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)');
  if (!db.prepare('SELECT version FROM domain_schema_migrations WHERE version=200').get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL('./domain-migrations.sql', import.meta.url), 'utf8'));
      db.prepare('INSERT INTO domain_schema_migrations VALUES(200,?)').run(Date.now());
      db.exec('COMMIT');
    } catch (error) {db.exec('ROLLBACK');throw error;}
  }
  // Real conversation storage. Messages arrive as client-encrypted envelopes;
  // the server never sees plaintext. Ephemeral rows carry a server-enforced expiry.
  db.exec(`CREATE TABLE IF NOT EXISTS echo_messages(
    id TEXT PRIMARY KEY,connection_id TEXT NOT NULL,sender TEXT NOT NULL,recipient TEXT NOT NULL,
    scope TEXT NOT NULL,ciphertext TEXT NOT NULL,iv TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_echo_messages_pair ON echo_messages(connection_id,created_at)`);
  const notify=config.notify??(()=>{});
  const pruneExpired=()=>db.prepare('DELETE FROM echo_messages WHERE expires_at IS NOT NULL AND expires_at<=?').run(now());
  const now = config.now ?? Date.now;
  const isBlocked = (a,b) => !!db.prepare('SELECT 1 FROM connection_blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)').get(a,b,b,a);
  const connection = (id,address) => {
    const row = db.prepare('SELECT * FROM echo_connections WHERE id=? AND (requester=? OR recipient=?)').get(id,address,address);
    if (!row) fail(404,'Connection not found');
    return row;
  };
  function atomic(run) {
    db.exec('BEGIN IMMEDIATE');
    try {const value=run();db.exec('COMMIT');return value;} catch(error) {db.exec('ROLLBACK');throw error;}
  }
  function visibleTarget(target, address) {
    if (target === address) fail(400,'You cannot connect to yourself');
    const row = db.prepare('SELECT body FROM profiles WHERE address=?').get(target);
    if (!row || !JSON.parse(row.body).discoverable) fail(404,'Public profile not found');
  }
  function draft(job,address) {
    const row = db.prepare('SELECT body FROM profiles WHERE address=?').get(address);
    if (!row) fail(409,'Complete your profile before requesting a draft');
    const profile=JSON.parse(row.body);
    if (job.skill==='radar-explain') {
      const candidates=searchRadar(db,address,job.filters??{city:'',intention:'',radius:0,gender:'',ageMin:0,ageMax:0}).candidates
        .filter(candidate=>!isBlocked(address,candidate.address));
      const nearbyCount=candidates.filter(candidate=>candidate.distanceKm!==null&&candidate.distanceKm!==undefined&&candidate.distanceKm<=50).length;
      const top=candidates[0];
      const summary=top
        ?`根据你公开的兴趣（${(profile.interests||[]).join('、')||'尚未填写'}）${profile.intention?'与「'+profile.intention+'」的意向':''}，在${nearbyCount?'附近 '+nearbyCount+' 位、':''}共 ${candidates.length} 位公开资料中，当前与你共鸣最强的是 ${top.name}${top.distanceKm!==null&&top.distanceKm!==undefined?(top.distanceKm===0?'（同一粗略区域）':'（区域估算约 '+top.distanceKm+' km）'):''}——理由：${top.reasons.join('；')}。这是资料排序结果，不是感情承诺；是否靠近，由你决定。`
        :'当前筛选下没有符合条件的公开资料；试试放宽人群筛选，或先完善自己的兴趣与意向。';
      return {engine:'structured-rules-v1',llm:false,editable:true,requiresUserApproval:true,summary,nearbyCount,candidates};
    }
    const title=job.title || (job.skill==='vow-draft'?'我们的约定':'我们的故事');
    const points=job.points.length?job.points:(profile.interests||[]).map(interest=>'一起分享'+interest);
    const text=job.skill==='vow-draft'
      ? `${title}\n我愿意认真倾听，尊重彼此的边界。${points.length?'\n'+points.map(point=>'我愿意'+point+'。').join('\n'):''}\n让我们共同编辑这份约定，再决定是否确认。`
      : `${title}\n${profile.name}记录了这一刻。${points.length?'\n'+points.join('\n'):''}\n请补充真实的时间、地点和感受后保存。`;
    return {engine:'structured-template-v1',llm:false,editable:true,requiresUserApproval:true,title,text,source:'own-profile-and-user-provided-points'};
  }
  async function handle({path,method,address,body={},query=new URLSearchParams()}) {
    const matched = path==='/api/connections' || /^\/api\/connections\/[^/]+(?:\/(?:respond|block|messages))?$/.test(path)
      || path==='/api/blocks' || path==='/api/consents' || path==='/api/agent/jobs';
    if (!matched) return null;
    try {
      address=wallet.parse(address);
      if (path==='/api/connections') {
        if (method==='GET') return result(200,{connections:db.prepare('SELECT * FROM echo_connections WHERE requester=? OR recipient=? ORDER BY created_at DESC,id DESC LIMIT 100').all(address,address)});
        if (method==='POST') {
          const {recipient}=z.object({recipient:wallet}).strict().parse(body);
          visibleTarget(recipient,address);
          if (isBlocked(address,recipient)) fail(403,'Connection is blocked');
          const [a,b]=[address,recipient].sort();
          return atomic(()=>{
            if(db.prepare("SELECT 1 FROM echo_connections WHERE pair_a=? AND pair_b=? AND status IN ('pending','accepted')").get(a,b)) fail(409,'An active connection or request already exists');
            const id=randomUUID();db.prepare("INSERT INTO echo_connections VALUES(?,?,?,?,?,'pending',?,NULL)").run(id,address,recipient,a,b,now());
            return result(201,{connection:connection(id,address)});
          });
        }
      }
      const route=/^\/api\/connections\/([^/]+)(?:\/(respond|block|messages))?$/.exec(path);
      if (route) {
        const row=connection(z.string().uuid().parse(route[1]),address);
        if (!route[2]&&method==='GET') return result(200,{connection:row});
        if (route[2]==='respond'&&method==='POST') {
          const {decision}=z.object({decision:z.enum(['accept','decline'])}).strict().parse(body);
          if (row.recipient!==address) fail(403,'Only the recipient can respond');
          if (row.status!=='pending') fail(409,'Connection has already been answered');
          if (isBlocked(row.requester,row.recipient)) fail(403,'Connection is blocked');
          const changed=db.prepare("UPDATE echo_connections SET status=?,responded_at=? WHERE id=? AND status='pending'").run(decision==='accept'?'accepted':'declined',now(),row.id);
          if (!changed.changes) fail(409,'Connection has already been answered');
          return result(200,{connection:connection(row.id,address)});
        }
        if(route[2]==='block'&&method==='POST') {
          z.object({}).strict().parse(body);
          const target=row.requester===address?row.recipient:row.requester;
          block(address,target);return result(200,{ok:true});
        }
        if(route[2]==='messages'&&(method==='GET'||method==='POST')) {
          if(row.status!=='accepted') fail(403,'Chat opens only after both people accept the connection');
          const peer=row.requester===address?row.recipient:row.requester;
          if(isBlocked(row.requester,row.recipient)) fail(403,'Connection is blocked');
          pruneExpired();
          if(method==='GET') {
            const rows=db.prepare('SELECT * FROM echo_messages WHERE connection_id=? ORDER BY created_at ASC, rowid ASC LIMIT 500').all(row.id);
            return result(200,{messages:rows.map(m=>({...m,mine:m.sender===address}))});
          }
          const input=chatEnvelope.parse(body);
          if(input.scope!=='chat:'+row.id) fail(400,'Message scope does not match this connection');
          const at=now(),id=randomUUID();
          db.prepare('INSERT INTO echo_messages VALUES(?,?,?,?,?,?,?,?,?)').run(id,row.id,address,peer,input.scope,input.ciphertext,input.iv,at,input.ephemeral?at+EPHEMERAL_TTL:null);
          const stored=db.prepare('SELECT * FROM echo_messages WHERE id=?').get(id);
          notify(peer,'message',{connectionId:row.id,id:stored.id,from:address,at:stored.created_at,ephemeral:Boolean(stored.expires_at)});
          return result(201,{message:{...stored,mine:true}});
        }
      }
      if (path==='/api/blocks') {
        if (method==='GET') return result(200,{blocks:db.prepare('SELECT target,created_at FROM connection_blocks WHERE owner=? ORDER BY created_at DESC LIMIT 100').all(address)});
        if (method==='POST'||method==='DELETE') {
          const {target}=z.object({target:wallet}).strict().parse(body);
          if (target===address) fail(400,'You cannot block yourself');
          if(method==='POST') block(address,target);
          else db.prepare('DELETE FROM connection_blocks WHERE owner=? AND target=?').run(address,target);
          return result(200,{ok:true});
        }
      }
      if (path==='/api/consents') {
        if(method==='GET') return result(200,{grants:db.prepare('SELECT * FROM consent_grants WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 100').all(address)});
        if(method==='POST') {
          const grant=grantSchema.parse(body),at=now();
          if(grant.expiresAt<=at||grant.expiresAt>at+30*86400000) fail(400,'Consent expiry must be within the next 30 days');
          const id=randomUUID();db.prepare('INSERT INTO consent_grants VALUES(?,?,?,?,?,NULL,?)').run(id,address,grant.scope,grant.resourceId,grant.expiresAt,at);
          return result(201,{grant:db.prepare('SELECT * FROM consent_grants WHERE id=?').get(id)});
        }
        if(method==='DELETE') {
          const {id}=z.object({id:z.string().uuid()}).strict().parse(body);
          const grant=db.prepare('SELECT id FROM consent_grants WHERE id=? AND owner=?').get(id,address);
          if(!grant) fail(404,'Consent grant not found');
          db.prepare('UPDATE consent_grants SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner=?').run(now(),id,address);
          return result(200,{ok:true});
        }
      }
      if (path==='/api/agent/jobs') {
        if(method==='GET') {
          const id=query instanceof URLSearchParams?query.get('id'):query.id;
          if(id) {
            const row=db.prepare('SELECT * FROM agent_jobs WHERE id=? AND owner=?').get(z.string().uuid().parse(id),address);
            if(!row) fail(404,'Agent job not found');
            return result(200,{job:{...row,output:JSON.parse(row.output)}});
          }
          return result(200,{jobs:db.prepare('SELECT * FROM agent_jobs WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 100').all(address).map(row=>({...row,output:JSON.parse(row.output)}))});
        }
        if(method==='POST') {
          const job=jobSchema.parse(body);
          if(job.skill!=='radar-explain'&&job.filters) fail(400,'Search filters are only available for Radar');
          return atomic(()=>{
            const grant=db.prepare('SELECT id FROM consent_grants WHERE owner=? AND scope=? AND resource_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY expires_at DESC LIMIT 1').get(address,'agent:'+job.skill,job.resourceId,now());
            if(!grant) fail(403,'This skill requires an unexpired resource-specific consent grant');
            const output=draft(job,address),id=randomUUID(),at=now();
            db.prepare("INSERT INTO agent_jobs VALUES(?,?,?,?,?,'completed',?,?)").run(id,address,job.skill,job.resourceId,grant.id,JSON.stringify(output),at);
            return result(201,{job:{id,owner:address,skill:job.skill,resource_id:job.resourceId,consent_id:grant.id,status:'completed',output,created_at:at}});
          });
        }
      }
      return result(405,{error:'Method not allowed'});
    } catch(error) {
      if(error instanceof z.ZodError) return result(400,{error:'Invalid request fields'});
      if(error.status) return result(error.status,{error:error.message});
      throw error;
    }
  }
  function block(owner,target) {
    atomic(()=>{
      const at=now();db.prepare('INSERT OR IGNORE INTO connection_blocks VALUES(?,?,?)').run(owner,target,at);
      db.prepare("UPDATE echo_connections SET status='blocked',responded_at=? WHERE ((requester=? AND recipient=?) OR (requester=? AND recipient=?)) AND status IN ('pending','accepted')").run(at,owner,target,target,owner);
    });
  }
  return {handle};
}
