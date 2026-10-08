import { Wallet } from 'ethers';
const base = 'http://127.0.0.1:52299';
const post = (p, b, ck) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...(ck ? { Cookie: ck } : {}) }, body: JSON.stringify(b) });
const put = (p, b, ck) => fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: ck }, body: JSON.stringify(b) });
const get = (p, ck) => fetch(base + p, { headers: { Cookie: ck } }).then(r => r.json());
async function session(w) { const c = await (await post('/api/auth/challenge', { address: w.address })).json(); const s = await w.signMessage(c.message); const v = await post('/api/auth/verify', { id: c.id, signature: s }); return (v.headers.getSetCookie?.() || [v.headers.get('set-cookie')])[0].split(';')[0]; }
const log = [];
// A: 固定私钥，浏览器要用它导入登录
const A = new Wallet('0x0000000000000000000000000000000000000000000000000000000000000001');
const ckA = await session(A);
{
  const cur = await get('/api/profile', ckA);
  const r = await put('/api/profile', { name: '临安', city: '杭州', gender: '女', age: '24–28', interests: ['Travel', 'Photography', 'Music'], statement: 'Collecting sunset photos and vinyl records.', intention: 'Serious relationship', discoverable: false, avatarUrl: 'https://randomuser.me/api/portraits/women/44.jpg' }, ckA);
  log.push('A profile: ' + r.status);
}
// B、C: 可发现的候选（雷达/echo 用）
const B = new Wallet('0x0000000000000000000000000000000000000000000000000000000000000002');
const C = new Wallet('0x0000000000000000000000000000000000000000000000000000000000000003');
for (const [w, name, city, img, statement] of [
  [B, '小柔', '杭州', 65, 'Looking for someone to travel and cook with.'],
  [C, '雨薇', '杭州', 68, 'Collecting sunset photos and vinyl records.'],
]) {
  const ck = await session(w);
  const r = await put('/api/profile', { name, city, gender: '女', age: '22–26', interests: ['Travel', 'Music', 'Photography'], statement, intention: 'Open to connection', discoverable: true, avatarUrl: 'https://randomuser.me/api/portraits/women/' + img + '.jpg' }, ck);
  log.push(name + ' profile: ' + r.status);
}
// A→B 连接 + B 接受（echo-detail/chat 审计用）
{
  const r1 = await post('/api/connections', { recipient: B.address }, ckA);
  const conn1 = await r1.json();
  log.push('A→B 连接: ' + r1.status + ' ' + JSON.stringify(conn1).slice(0, 80));
  const ckB = await session(B);
  const list = await get('/api/connections', ckB);
  const pending = (list.connections || []).find(c => c.status === 'requested' && c.requester?.toLowerCase() === A.address.toLowerCase());
  if (pending) { const r2 = await post('/api/connections/' + pending.id + '/respond', { decision: 'accept' }, ckB); log.push('B 接受: ' + r2.status); }
  else log.push('B 没有待处理请求: ' + JSON.stringify(list).slice(0, 120));
}
console.log('A 地址（浏览器导入用私钥 0x…01）: ' + A.address);
console.log(log.join('\n'));
