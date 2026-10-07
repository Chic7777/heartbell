import { z } from 'zod';
import { getAddress, isAddress } from 'ethers';
import { searchRadar } from './radar.mjs';

const radarFilters=z.object({city:z.string().trim().max(60).default(''),intention:z.string().trim().max(60).default(''),radius:z.coerce.number().int().min(0).max(200).default(0)}).strict();

export function createV2Router({db,aa,domain,vault,chain}) {
  return async function handle({path,method,address,body,query}) {
    if(path==='/api/profiles/me') return {redirect:'/api/profile'};
    if(path==='/api/wallets/me') path='/api/wallet';
    if(path==='/api/wallets/initialize') path='/api/wallet/init';
    if(path==='/api/wallets/challenge') path='/api/wallet/challenge';
    if(path==='/api/user-operations/track') path='/api/userops/submit';
    if(path==='/api/user-operations') path='/api/userops';
    if(path.startsWith('/api/user-operations/')) path=path.replace('/api/user-operations/','/api/userops/');
    if(path==='/api/relationships/current' && method==='GET') {
      const snapshot=await chain.snapshot(aa.identity(address),z.string().regex(/^(0|[1-9]\d{0,77})$/).parse(query.get('id')??'0'));
      const owners={};for(const member of [snapshot.a,snapshot.b].filter(Boolean))owners[member]=db.prepare('SELECT owner FROM aa_wallets WHERE chain_id=? AND sender=?').get(String(aa.publicConfig.chainId),getAddress(member))?.owner||member;
      const peer=[snapshot.a,snapshot.b].find(member=>member&&member.toLowerCase()!==aa.identity(address).toLowerCase());
      return {status:200,body:{...snapshot,owners,peerOwner:peer?owners[peer]:null}};
    }
    if(path==='/api/radar/search' && method==='POST') return {status:200,body:searchRadar(db,address,radarFilters.parse(body))};
    if(path==='/api/radar/echoes' && method==='GET') return {status:200,body:searchRadar(db,address,radarFilters.parse(Object.fromEntries(query)))};
    if(path==='/api/relationships/invitations/prepare'&&method==='POST'){
      const input=z.object({invitee:z.string().refine(isAddress),sponsor:z.boolean().default(false)}).strict().parse(body);
      path='/api/userops/prepare';body={action:'invite',...input};
    }
    const accept=/^\/api\/relationships\/invitations\/([^/]+)\/accept\/prepare$/.exec(path);
    if(accept&&method==='POST'){
      const inviter=getAddress(z.string().refine(isAddress).parse(accept[1]));
      await chain.ready();
      if(getAddress(await chain.bell.pendingInviter(aa.identity(address)))!==inviter)throw Object.assign(new Error('Invitation does not match your smart account'),{status:409});
      const input=z.object({sponsor:z.boolean().default(false)}).strict().parse(body);
      path='/api/userops/prepare';body={action:'accept',...input};
    }
    if(path==='/api/vows/prepare'&&method==='POST'){
      const input=z.object({contentHash:z.string().regex(/^0x[a-fA-F0-9]{64}$/),sponsor:z.boolean().default(false)}).strict().parse(body);
      path='/api/userops/prepare';body={action:'privateVow',...input};
    }
    const confirm=/^\/api\/vows\/(0|[1-9]\d*)\/confirm\/prepare$/.exec(path);
    if(confirm&&method==='POST'){
      const input=z.object({sponsor:z.boolean().default(false)}).strict().parse(body);
      path='/api/userops/prepare';body={action:'confirm',vowIndex:confirm[1],...input};
    }
    const deposit=/^\/api\/bonds\/([1-9]\d*)\/deposit\/prepare$/.exec(path);
    if(deposit&&method==='POST'){
      const current=await chain.snapshot(aa.identity(address));
      if(current.id!==deposit[1]||current.status!=='ACTIVE')throw Object.assign(new Error('Bond is not your active Ring'),{status:403});
      const input=z.object({amountWei:z.string().regex(/^[1-9]\d{0,77}$/),sponsor:z.boolean().default(false)}).strict().parse(body);
      path='/api/userops/prepare';body={action:'deposit',value:input.amountWei,sponsor:input.sponsor};
    }
    const withdraw=/^\/api\/bonds\/([1-9]\d*)\/withdraw\/prepare$/.exec(path);
    if(withdraw&&method==='POST'){
      z.object({}).strict().parse(body);path='/api/userops/prepare';body={action:'withdraw',relationId:withdraw[1],sponsor:false};
    }
    const proof=/^\/api\/proof\/user-operation\/([a-f0-9-]{36})$/.exec(path);
    if(proof&&method==='GET')path='/api/userops/'+proof[1];
    const request={path,method,address,body,query};
    if(path==='/api/userops/prepare'&&method==='POST'&&body.action==='invite'&&isAddress(body.invitee))request.body={...body,invitee:aa.identity(body.invitee)};
    return await aa.handle(request) ?? await domain.handle(request) ?? await vault.handle(request);
  };
}
