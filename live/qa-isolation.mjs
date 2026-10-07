// 用户独立性证明：两个真实钱包会话，档案/记忆/连接完全隔离
import {Wallet} from 'ethers';
const base='http://127.0.0.1:52203', origin=base;
const post=(p,b,ck)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(ck?{Cookie:ck}:{})},body:JSON.stringify(b)});
const get=(p,ck)=>fetch(base+p,{headers:{Cookie:ck}}).then(r=>r.json());
async function session(key){
  const w=new Wallet(key);
  const ch=await (await post('/api/auth/challenge',{address:w.address})).json();
  const sig=await w.signMessage(ch.message);
  const v=await post('/api/auth/verify',{id:ch.id,signature:sig});
  return {addr:w.address, cookie:v.headers.get('set-cookie').split(';')[0]};
}
const A=await session('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'); // hardhat #0
const B=await session('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'); // hardhat #1 (Aria)
const [pa,pb,ma,mb,ra,rb]=await Promise.all([
  get('/api/profile',A.cookie), get('/api/profile',B.cookie),
  get('/api/memories?scope=personal',A.cookie), get('/api/memories?scope=personal',B.cookie),
  get('/api/connections',A.cookie), get('/api/connections',B.cookie),
]);
console.log('用户A', A.addr.slice(0,10), '档案:', pa.profile?.name??'null', '| 记忆:', (ma.memories??ma).length??0, '| 连接:', (ra.connections??[]).length);
console.log('用户B', B.addr.slice(0,10), '档案:', pb.profile?.name??'null', '| 记忆:', (mb.memories??mb).length??0, '| 连接:', (rb.connections??[]).length);
const isolated = pa.profile?.name!==pb.profile?.name;
console.log(isolated?'✓ 两用户档案完全独立':'✗ 档案串了');
