import Fastify from 'fastify';
import { createAA } from './aa.mjs';
import { createDomainV2 } from './domain-v2.mjs';
import { createVaultV2 } from './vault-v2.mjs';
import { BOT_NETWORKS } from './bot-network.mjs';
import { createIdentityProvider, identityProviderConfig } from './auth-provider.mjs';
import { createSponsor } from './sponsor.mjs';
import { createV2Router } from './v2-router.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { getAddress, isAddress, verifyMessage } from 'ethers';
import { z } from 'zod';
import { createAuth } from './auth.mjs';
import { createChain, ABI } from './chain.mjs';
import { searchRadar } from './radar.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const profileSchema = z.object({name:z.string().trim().min(1).max(40),city:z.string().max(60),gender:z.string().max(30),age:z.string().max(30),interests:z.array(z.string().max(30)).max(8),statement:z.string().max(200),intention:z.string().max(60),discoverable:z.boolean()}).strict();
const keySchema = z.object({kty:z.literal('EC'),crv:z.literal('P-256'),x:z.string().regex(/^[A-Za-z0-9_-]{43}$/),y:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
const envelopeSchema = z.object({scope:z.string().regex(/^(personal|[1-9]\d*)$/),type:z.enum(['note','photo','video','vow','goal']),ciphertext:z.string().min(16).max(2000000).regex(/^[A-Za-z0-9+/=]+$/),iv:z.string().regex(/^[A-Za-z0-9+/]{16}$/),hash:z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional()}).strict();
const keyMessage = (origin,address,key) => `Consensus Bell encryption key\nOrigin: ${origin}\nAddress: ${address}\nPublic key: ${JSON.stringify(key)}`;
export async function createApp(options={}) {
  const selectedNetwork=BOT_NETWORKS[Number(options.chainId||process.env.BOT_CHAIN_ID||677)];
  const config = {chainId:Number(options.chainId||process.env.BOT_CHAIN_ID||677),rpc:options.rpc??(process.env.BOT_RPC_URL||selectedNetwork?.rpc||''),contract:options.contract??process.env.CONSENSUS_BELL_ADDRESS??'',explorer:options.explorer??process.env.BOT_EXPLORER_URL??''};
  const origin=options.origin||process.env.APP_ORIGIN||'http://127.0.0.1:52203';
  if(!/^https?:\/\//.test(origin))throw new Error('APP_ORIGIN must be an HTTP(S) origin');
  const dir=options.dataDir||path.join(root,'data');await mkdir(dir,{recursive:true});
  const db=new DatabaseSync(path.join(dir,'app.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS profiles(address TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS keys(address TEXT PRIMARY KEY, body TEXT NOT NULL, signature TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY, owner TEXT, scope TEXT, type TEXT, body TEXT, at TEXT);
    CREATE TABLE IF NOT EXISTS proofs(hash TEXT PRIMARY KEY, address TEXT, relation TEXT, body TEXT);
    CREATE TABLE IF NOT EXISTS relations(id TEXT, address TEXT, PRIMARY KEY(id,address));
    CREATE TABLE IF NOT EXISTS radar_locations(address TEXT PRIMARY KEY,lat REAL,lon REAL,at INTEGER);
    CREATE TABLE IF NOT EXISTS radar_saved(owner TEXT,target TEXT,PRIMARY KEY(owner,target));`);
  // Retain only coarse ~11km cells, including positions from earlier versions.
  db.exec('UPDATE radar_locations SET lat=ROUND(lat*10)/10.0,lon=ROUND(lon*10)/10.0');
  const auth=createAuth(db,origin),chain=createChain(config),rate=new Map(),locationRate=new Map();
  config.origin=origin;
  const sponsor=createSponsor(db,{contract:config.contract,paymaster:process.env.BELL_PAYMASTER_ADDRESS,sponsorKey:process.env.BELL_SPONSOR_KEY,maxCostWei:process.env.BELL_SPONSOR_MAX_COST_WEI,dailyLimit:process.env.BELL_SPONSOR_DAILY_LIMIT});
  const aa=createAA(db,{...config,sponsor,requireVerifiedSponsorIdentity:!options.aa?.sponsor,...options.aa,bundler:options.aa?.bundler??process.env.BOT_BUNDLER_URL??'',entryPoint:options.aa?.entryPoint??process.env.BOT_ENTRYPOINT_ADDRESS,factory:options.aa?.factory??process.env.BOT_ACCOUNT_FACTORY_ADDRESS,sponsorUrl:process.env.BELL_SPONSOR_URL,sponsorToken:process.env.BELL_SPONSOR_TOKEN});
  const identityProvider=createIdentityProvider(db,auth,options.identityProvider??identityProviderConfig(process.env));
  const domain=createDomainV2(db,chain,config);
  const vault=await createVaultV2(db,chain,config,{dataDir:dir,memberAddress:address=>aa.identity(address)});
  const v2=createV2Router({db,aa,domain,vault,chain});
  db.exec('CREATE TABLE IF NOT EXISTS session_providers(token TEXT PRIMARY KEY,provider TEXT NOT NULL)');
  db.prepare('DELETE FROM session_providers WHERE token NOT IN (SELECT token FROM sessions WHERE expires>?)').run(Date.now());
  const sessionHash=token=>createHash('sha256').update(token).digest('hex');
  const privyAppId=process.env.PRIVY_APP_ID||'';
  const walletConfig={chainId:config.chainId,rpc:config.rpc,entryPoint:aa.publicConfig.entryPoint,factory:aa.publicConfig.factory};
  const streams=new Set();
  const cookie=token=>`cb_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${origin.startsWith('https:')?'; Secure':''}`;
  const bodyCache=new WeakMap();
  const readBody=async req=>{if(bodyCache.has(req))return bodyCache.get(req);let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>2100000)throw Object.assign(new Error('Upload is too large'),{status:413});}const body=JSON.parse(text||'{}');bodyCache.set(req,body);return body;};
  const reply=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const handleRequest=async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://auth.privy.io; media-src 'self' data: blob:; connect-src 'self' https://auth.privy.io https://api.privy.io https://explorer-api.walletconnect.com ${new URL(config.rpc||origin).origin}; frame-src https://auth.privy.io; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
    try {
      const url=new URL(req.url,origin),method=req.method;
      if(/^\/(?:auth\/session|wallets\/|profiles\/me|relationships\/|stories(?:\/|$)|connections(?:\/|$)|vows\/|bonds\/|user-operations(?:\/|$)|proof\/|agent\/jobs|consents$|notifications\/)/.test(url.pathname))url.pathname='/api'+url.pathname;
      if(url.pathname.startsWith('/api/')){
        if(!['GET','HEAD'].includes(method)&&req.headers.origin!==origin) return reply(res,403,{error:'Request origin does not match this App'});
        if(url.pathname==='/api/config')return reply(res,200,{chainId:config.chainId,contract:config.contract,explorer:config.explorer,chainConfigured:chain.enabled,origin,abi:ABI,accountAbstraction:aa.publicConfig,identityProviderConfigured:identityProvider.enabled,privy:{appId:privyAppId},wallet:walletConfig});
        if(url.pathname==='/api/auth/challenge'&&method==='POST'){
          const ip=req.socket.remoteAddress;const r=rate.get(ip);if(r&&r.until>Date.now()&&r.count>=30)return reply(res,429,{error:'Please wait before signing in again'});rate.set(ip,{until:r?.until>Date.now()?r.until:Date.now()+60000,count:r?.until>Date.now()?r.count+1:1});
          const body=await readBody(req);if(!isAddress(body.address))return reply(res,400,{error:'Invalid wallet address'});return reply(res,200,auth.challenge(body.address));
        }
        if(url.pathname==='/api/auth/verify'&&method==='POST'){
          const body=z.object({id:z.string().regex(/^[a-f0-9]{48}$/),signature:z.string().max(300)}).strict().parse(await readBody(req));
          let result;try{result=auth.verify(body.id,body.signature);}catch{return reply(res,401,{error:'Wallet signature is invalid, expired or already used'});}
          res.setHeader('Set-Cookie',cookie(result.token));return reply(res,200,{address:result.address});
        }
        if(url.pathname==='/api/auth/session'&&method==='POST'){
          const result=await identityProvider.session(await readBody(req));
          db.prepare('INSERT INTO session_providers VALUES(?,?)').run(sessionHash(result.token),result.provider==='privy.io'?'privy':result.provider);
          res.setHeader('Set-Cookie',cookie(result.token));return reply(res,200,{address:result.address,userId:result.userId,provider:result.provider});
        }
        const address=auth.user(req.headers.cookie);if(!address)return reply(res,401,{error:'Sign in with your wallet first'});
        if(url.pathname==='/api/notifications/stream'&&method==='GET'){
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});
          res.write('event: ready\ndata: {}\n\n');
          const unsubscribe=aa.subscribe(address,operation=>res.write('event: user-operation\ndata: '+JSON.stringify(operation)+'\n\n'));
          const heartbeat=setInterval(()=>{if(!auth.user(req.headers.cookie)){res.end();return;}res.write(': keepalive\n\n');},15000);
          streams.add(res);res.on('close',()=>{clearInterval(heartbeat);unsubscribe();streams.delete(res);});return;
        }
        const delegated=await v2({path:url.pathname,method,address,body:['GET','HEAD'].includes(method)?{}:await readBody(req),query:url.searchParams});
        if(delegated?.redirect)url.pathname=delegated.redirect;
        else if(delegated)return reply(res,delegated.status,delegated.body);
        if(url.pathname==='/api/logout'&&method==='POST'){auth.logout(req.headers.cookie);db.prepare('DELETE FROM session_providers WHERE token NOT IN (SELECT token FROM sessions WHERE expires>?)').run(Date.now());res.setHeader('Set-Cookie','cb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return reply(res,200,{ok:true});}
        if(url.pathname==='/api/session'){
          const token=/(?:^|;\s*)cb_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
          const authProvider=token?db.prepare('SELECT provider FROM session_providers WHERE token=?').get(sessionHash(token))?.provider:'injected';
          return reply(res,200,{address,authProvider:authProvider||'injected',chainAddress:authProvider==='privy'?aa.identity(address):address});
        }
        if(url.pathname==='/api/profile'){
          if(method==='GET'){const row=db.prepare('SELECT body FROM profiles WHERE address=?').get(address);return reply(res,200,{address,profile:row?JSON.parse(row.body):null});}
          if(method==='PUT'){const profile=profileSchema.parse(await readBody(req));db.prepare('INSERT INTO profiles VALUES(?,?) ON CONFLICT(address) DO UPDATE SET body=excluded.body').run(address,JSON.stringify(profile));return reply(res,200,{profile});}
        }
        if(url.pathname==='/api/key'){
          const who=url.searchParams.has('address')?getAddress(url.searchParams.get('address')):address;
          if(method==='GET'){const row=db.prepare('SELECT body,signature FROM keys WHERE address=?').get(who);return reply(res,200,row?{key:JSON.parse(row.body),signature:row.signature,address:who}:null);}
          if(method==='PUT'){
            const b=z.object({key:keySchema,signature:z.string().max(300)}).strict().parse(await readBody(req));
            if(getAddress(verifyMessage(keyMessage(origin,address,b.key),b.signature))!==address)return reply(res,403,{error:'Encryption key is not signed by this account'});
            const old=db.prepare('SELECT body FROM keys WHERE address=?').get(address);if(old&&old.body!==JSON.stringify(b.key))return reply(res,409,{error:'An encryption key already exists. Use the original browser or a planned key-recovery flow.'});
            db.prepare('INSERT INTO keys VALUES(?,?,?) ON CONFLICT(address) DO UPDATE SET signature=excluded.signature').run(address,JSON.stringify(b.key),b.signature);return reply(res,200,{ok:true});
          }
        }
        if(['/api/discover','/api/radar'].includes(url.pathname)&&method==='GET'){
          const filters=z.object({city:z.string().trim().max(60).default(''),intention:z.string().trim().max(60).default(''),radius:z.coerce.number().int().min(0).max(200).default(0)}).strict().parse(Object.fromEntries(url.searchParams));
          const result=searchRadar(db,address,filters);return reply(res,200,url.pathname==='/api/discover'?result.candidates:result);
        }
        if(url.pathname==='/api/radar/location'){
          if(method==='PUT'){const position=z.object({lat:z.number().min(-90).max(90),lon:z.number().min(-180).max(180),consent:z.literal(true)}).strict().parse(await readBody(req));const previous=locationRate.get(address)||db.prepare('SELECT at FROM radar_locations WHERE address=?').get(address)?.at||0;if(Date.now()-previous<60000)return reply(res,429,{error:'定位更新过于频繁，请一分钟后重试；仍可随时撤回。'});locationRate.set(address,Date.now());db.prepare('INSERT INTO radar_locations VALUES(?,?,?,?) ON CONFLICT(address) DO UPDATE SET lat=excluded.lat,lon=excluded.lon,at=excluded.at').run(address,Math.round(position.lat*10)/10,Math.round(position.lon*10)/10,Date.now());return reply(res,200,{ok:true});}
          if(method==='DELETE'){db.prepare('DELETE FROM radar_locations WHERE address=?').run(address);return reply(res,200,{ok:true});}
        }
        if(url.pathname==='/api/radar/saved'&&method==='PUT'){
          const body=z.object({address:z.string().refine(isAddress),saved:z.boolean()}).strict().parse(await readBody(req)),target=getAddress(body.address);
          const row=db.prepare('SELECT body FROM profiles WHERE address=?').get(target);
          if(target===address||!row||!JSON.parse(row.body).discoverable)return reply(res,404,{error:'该用户目前没有公开资料。'});
          if(body.saved)db.prepare('INSERT OR IGNORE INTO radar_saved VALUES(?,?)').run(address,target);else db.prepare('DELETE FROM radar_saved WHERE owner=? AND target=?').run(address,target);return reply(res,200,{ok:true});
        }
        if(url.pathname==='/api/ring'){
          const archived=url.searchParams.get('id')||'0';if(!/^\d+$/.test(archived))return reply(res,400,{error:'Invalid Ring ID'});
          return reply(res,200,await chain.snapshot(address,archived));
        }
        if(url.pathname==='/api/relations')return reply(res,200,db.prepare('SELECT DISTINCT id FROM relations WHERE address IN (?,?) ORDER BY CAST(id AS INTEGER) DESC').all(address,aa.identity(address)));
        if(url.pathname==='/api/memories'){
          const scope=url.searchParams.get('scope')||'personal';if(!/^(personal|[1-9]\d*)$/.test(scope))return reply(res,400,{error:'Invalid memory scope'});
          let relation;if(scope!=='personal'){
            await chain.ready();relation=await chain.bell.relations(scope);
            if(![relation[0],relation[1]].some(member=>[address,aa.identity(address)].some(owned=>owned.toLowerCase()===member.toLowerCase())))return reply(res,403,{error:'This Ring is not yours'});
          }
          const scoped=scope==='personal'?'personal:'+address:`${config.chainId}:${config.contract.toLowerCase()}:${scope}`;
          if(method==='GET')return reply(res,200,db.prepare('SELECT * FROM memories WHERE scope=? ORDER BY at DESC').all(scoped).map(r=>({...r,body:JSON.parse(r.body)})));
          if(method==='POST'){
            const body=envelopeSchema.parse(await readBody(req));if(body.scope!==scope)return reply(res,400,{error:'Scope mismatch'});if(relation&&Number(relation[4])!==0)return reply(res,409,{error:'This Ring is not active'});
            const id=randomUUID();db.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?)').run(id,address,scoped,body.type,JSON.stringify(body),new Date().toISOString());return reply(res,201,{id});
          }
          if(method==='PUT'||method==='DELETE'){
            const id=z.string().uuid().parse(url.searchParams.get('id'));const owned=db.prepare('SELECT id FROM memories WHERE id=? AND owner=? AND scope=?').get(id,address,scoped);if(!owned)return reply(res,403,{error:'You can only edit your own memories'});
            if(relation&&Number(relation[4])!==0)return reply(res,409,{error:'Archived memories are read-only'});
            if(method==='DELETE')db.prepare('DELETE FROM memories WHERE id=? AND owner=?').run(id,address);else{const body=envelopeSchema.parse(await readBody(req));if(body.scope!==scope)return reply(res,400,{error:'Scope mismatch'});db.prepare('UPDATE memories SET body=?,type=? WHERE id=? AND owner=?').run(JSON.stringify(body),body.type,id,address);}
            return reply(res,200,{ok:true});
          }
        }
        if(url.pathname==='/api/transactions'){
          if(method==='GET')return reply(res,200,db.prepare('SELECT body FROM proofs WHERE address=? ORDER BY rowid DESC').all(address).map(r=>JSON.parse(r.body)));
          if(method==='POST'){
            const b=z.object({hash:z.string().regex(/^0x[a-fA-F0-9]{64}$/)}).strict().parse(await readBody(req));await chain.ready();
            const [tx,receipt,block]=await Promise.all([chain.provider.getTransaction(b.hash),chain.provider.getTransactionReceipt(b.hash),chain.provider.getBlockNumber()]);
            if(!tx||!receipt||receipt.status!==1||block-receipt.blockNumber<1)return reply(res,409,{error:'Transaction has not reached two successful confirmations'});
            if(tx.from.toLowerCase()!==address.toLowerCase()||tx.to?.toLowerCase()!==config.contract.toLowerCase())return reply(res,403,{error:'Transaction does not belong to this wallet and contract'});
            const events=receipt.logs.filter(l=>l.address.toLowerCase()===config.contract.toLowerCase()).map(l=>{try{return chain.bell.interface.parseLog(l);}catch{return null;}}).filter(Boolean);
            if(!events.length)return reply(res,400,{error:'No recognized contract event in this transaction'});
            for(const ev of events){if(ev.name==='RelationCreated'){const id=ev.args[0].toString();for(const who of [ev.args[1],ev.args[2]])db.prepare('INSERT OR IGNORE INTO relations VALUES(?,?)').run(id,getAddress(who));}}
            const proof={hash:b.hash,block:receipt.blockNumber,chainId:config.chainId,contract:config.contract,from:address,actions:events.map(e=>e.name),confirmedAt:new Date().toISOString()};db.prepare('INSERT OR REPLACE INTO proofs VALUES(?,?,?,?)').run(b.hash,address,'',JSON.stringify(proof));return reply(res,200,proof);
          }
        }
        return reply(res,404,{error:'API endpoint not found'});
      }
      const files={'/':'web/index.html','/index.html':'web/index.html','/app.js':'web/app.js','/aa-action.js':'web/aa-action.js','/view.js':'web/view.js','/radar.js':'web/radar.js','/radar.css':'web/radar.css','/crypto.js':'web/crypto.js','/onboarding.js':'web/onboarding.js','/journey.js':'web/journey.js','/journey-actions.js':'web/journey-actions.js','/journey.css':'web/journey.css','/complete.css':'../ui/complete.css','/ethers.js':'node_modules/ethers/dist/ethers.umd.min.js'};
      files['/privy.js']='web/privy.js';files['/aa-action.js']='web/aa-action.js';
      let file=files[url.pathname];if(/^\/assets\/[a-zA-Z0-9._-]+$/.test(url.pathname))file='../ui'+url.pathname;
      if(!file||!['GET','HEAD'].includes(method)){res.writeHead(404);res.end('Not found');return;}
      const bytes=await readFile(path.join(root,file));const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(bytes);
    }catch(error){const status=error instanceof z.ZodError?400:error.status||400;reply(res,status,{error:error instanceof z.ZodError?'Invalid request fields':error.message});}
  };
  const fastify=Fastify({logger:false});
  fastify.addHook('onRequest',async(request,response)=>{response.hijack();await handleRequest(request.raw,response.raw);});
  fastify.all('/*',async()=>null);
  await fastify.ready();
  const server=fastify.server;
  return {server,db,config,auth,aa,fastify,close:async()=>{for(const stream of streams)stream.end();await aa.close();await new Promise(resolve=>server.close(resolve));chain.provider?.destroy();db.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createApp();app.server.listen(Number(process.env.PORT||52203),'127.0.0.1',()=>console.log('Consensus Bell wallet App listening at '+(process.env.APP_ORIGIN||'http://127.0.0.1:52203')));
}
