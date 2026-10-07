import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Wallet } from 'ethers';
import { createApp } from './server.mjs';

test('journey choice persists per wallet, isolates users and rejects invalid paths', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'consensus-bell-journey-'));
  const origin = 'http://127.0.0.1:52203', app = await createApp({ dataDir, origin });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const request = async (url, options = {}) => { const r = await fetch(base + url, { method: options.method || 'GET', headers: { Origin: origin, 'Content-Type': 'application/json', ...(options.cookie ? { Cookie: options.cookie } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined }); return { status: r.status, cookie: r.headers.get('set-cookie'), body: await r.json() }; };
  const signIn = async (w) => { const c = await request('/api/auth/challenge', { method: 'POST', body: { address: w.address } }); const s = await w.signMessage(c.body.message); const v = await request('/api/auth/verify', { method: 'POST', body: { id: c.body.id, signature: s } }); return v.cookie; };
  const alice = Wallet.createRandom(), bob = Wallet.createRandom();
  try {
    const a = await signIn(alice), b = await signIn(bob);
    assert.equal((await request('/api/journey')).status, 401, '未登录拒绝读取');
    assert.equal((await request('/api/journey', { cookie: a })).body.path, '', '新用户旅程为空');
    assert.equal((await request('/api/journey', { method: 'PUT', cookie: a, body: { path: 'radar' } })).body.path, 'radar', '记录 Find Someone 选择');
    assert.equal((await request('/api/journey', { method: 'PUT', cookie: a, body: { path: 'nft-mint' } })).status, 400, '非法方向拒绝');
    assert.equal((await request('/api/journey', { method: 'PUT', cookie: a })).status, 400, '缺字段拒绝');
    assert.equal((await request('/api/journey', { cookie: a })).body.path, 'radar', '选择已持久化');
    assert.equal((await request('/api/journey', { cookie: b })).body.path, '', '用户隔离：B 不看到 A 的选择');
    assert.equal((await request('/api/journey', { method: 'PUT', cookie: b, body: { path: 'direct' } })).body.path, 'direct', 'B 记录 Bind My Person');
    assert.equal((await request('/api/journey', { cookie: a })).body.path, 'radar', 'B 的选择不影响 A');
    // 换向：A 改选 direct
    assert.equal((await request('/api/journey', { method: 'PUT', cookie: a, body: { path: 'direct' } })).body.path, 'direct', '允许换向');
  } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});
