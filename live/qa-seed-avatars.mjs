import {Wallet} from 'ethers';
const base='http://127.0.0.1:52203', origin=base;
const post=(p,b,ck)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(ck?{Cookie:ck}:{})},body:JSON.stringify(b)});
const put=(p,b,ck)=>fetch(base+p,{method:'PUT',headers:{'Content-Type':'application/json',Origin:origin,Cookie:ck},body:JSON.stringify(b)});
async function session(w){const c=await (await post('/api/auth/challenge',{address:w.address})).json();const s=await w.signMessage(c.message);const v=await post('/api/auth/verify',{id:c.id,signature:s});return (v.headers.get('set-cookie')||'').split(';')[0];}
const ariaKey='0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const xiaoKey=Wallet.createRandom().privateKey;
const yuKey=Wallet.createRandom().privateKey;
const out=[];
{
  const w=new Wallet(ariaKey);const ck=await session(w);
  const cur=await (await fetch(base+'/api/profile',{headers:{Cookie:ck}})).json();
  const p=cur.profile||{name:'Aria'};
  const r=await put('/api/profile',{...p,avatarUrl:'https://randomuser.me/api/portraits/women/44.jpg'},ck);
  out.push('Aria('+w.address.slice(0,8)+'): '+r.status);
}
const personas=[
  ['小柔',65,'Collecting sunset photos and vinyl records.','Open to connection'],
  ['雨薇',68,'Looking for someone to travel and cook with.','Serious relationship'],
];
for(const [name,img,statement,intention] of personas){
  const w=new Wallet(name==='小柔'?xiaoKey:yuKey);const ck=await session(w);
  const r=await put('/api/profile',{name,city:'杭州',gender:'',age:'',interests:['Travel','Music','Photography'],statement,intention,discoverable:true,avatarUrl:'https://randomuser.me/api/portraits/women/'+img+'.jpg'},ck);
  out.push(name+'('+w.address.slice(0,8)+'): '+r.status+' '+(await r.text()).slice(0,60));
}
console.log(out.join('\n'));
