import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createVaultV2 } from './vault-v2.mjs';

const alice = '0x0000000000000000000000000000000000000001';
const bob = '0x0000000000000000000000000000000000000002';
const stranger = '0x0000000000000000000000000000000000000003';
const smartAlice = '0x0000000000000000000000000000000000000011';
const smartBob = '0x0000000000000000000000000000000000000012';
const config = { chainId: 677, contract: '0x0000000000000000000000000000000000000100' };
const bytes = Buffer.from('opaque-client-encrypted-ciphertext-and-authentication-tag');
const hash = createHash('sha256').update(bytes).digest('hex');
const key = Buffer.alloc(48, 19).toString('base64');
const iv = Buffer.alloc(12, 17).toString('base64');
async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'consensus-vault-v2-'));
  let db = new DatabaseSync(path.join(dir, 'test.sqlite'));
  let state = 0, calls = [];
  const chain = { async member(address, scope) {
    calls.push({ address, scope });
    if (![smartAlice, smartBob].includes(address) || scope !== '1') throw Object.assign(new Error('Ring membership required'), { status: 403 });
    return [smartAlice, smartBob, 1, 0, state];
  } };
  const settings = { dataDir: dir, memberAddress: async address => ({ [alice]: smartAlice, [bob]: smartBob }[address] || address), ...options };
  let vault = await createVaultV2(db, chain, config, settings);
  t.after(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, calls, state: value => { state = value; }, request: (route, method = 'GET', address = alice, body, query) => vault.handle({ path: route, method, address, body, query }),
    interruptUpload: async id => {
      db.prepare("UPDATE vault_v2_uploads SET state='writing' WHERE id=?").run(id);
      await writeFile(path.join(dir, 'vault-v2', id), Buffer.from('interrupted-partial-write'));
    },
    restart: async () => { db.close(); db = new DatabaseSync(path.join(dir, 'test.sqlite')); vault = await createVaultV2(db, chain, config, settings); } };
}
async function intent(app, scope = 'personal', address = alice, extras = {}) {
  return (await app.request('/api/stories/upload-intent', 'POST', address, { scope, ciphertextHash: hash, byteLength: bytes.length, encryptionVersion: 'AES-256-GCM-v1', ...extras })).body;
}
async function upload(app, scope = 'personal', address = alice) {
  const item = await intent(app, scope, address);
  await app.request(item.uploadPath, 'POST', address, { ciphertext: bytes.toString('base64') });
  return item;
}
async function commit(app, item, address = alice, recipients = [alice]) {
  return (await app.request('/api/stories', 'POST', address, { uploadId: item.uploadId, type: 'note', iv, envelopes: recipients.map(recipient => ({ recipient, wrappedKey: key })) })).body;
}

test('personal ciphertext is durable, private, byte-verified and has only caller envelope', async t => {
  const app = await setup(t);
  const item = await upload(app), story = await commit(app, item);
  assert.deepEqual(await readFile(path.join(app.dir, 'vault-v2', item.uploadId)), bytes);
  await app.restart();
  const result = await app.request(`/api/stories/${story.id}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.ciphertext, bytes.toString('base64'));
  assert.deepEqual(result.body.envelope, { recipient: alice, wrappedKey: key });
  assert.equal(result.body.ciphertextHash, hash);
  assert.equal(Object.hasOwn(result.body, 'object_key'), false);
  assert.equal(Object.hasOwn(result.body, 'url'), false);
  assert.equal((await app.request('/api/stories')).body.stories.length, 1);
  assert.equal((await app.request('/api/stories', 'GET', bob)).body.stories.length, 0);
  await assert.rejects(app.request(`/api/stories/${story.id}`, 'GET', bob), { status: 404 });
  await assert.rejects(commit(app, item), { status: 409 });
});

test('shared vault checks AA membership and active state at intent, upload and commit', async t => {
  const app = await setup(t);
  const item = await upload(app, '1');
  await assert.rejects(commit(app, item, alice, [smartAlice, stranger]), { status: 400 });
  const story = await commit(app, item, alice, [smartAlice, smartBob]);
  assert.ok(app.calls.some(call => call.address === smartAlice));
  const result = await app.request(`/api/stories/${story.id}`, 'GET', bob);
  assert.deepEqual(result.body.envelope, { recipient: smartBob, wrappedKey: key });
  assert.equal(Object.hasOwn(result.body, 'envelopes'), false);
  await assert.rejects(app.request(`/api/stories/${story.id}`, 'GET', stranger), { status: 403 });
  const queued = await intent(app, '1');
  const ready = await upload(app, '1');
  app.state(2);
  await assert.rejects(intent(app, '1'), { status: 409 });
  await assert.rejects(app.request(queued.uploadPath, 'POST', alice, { ciphertext: bytes.toString('base64') }), { status: 409 });
  await assert.rejects(commit(app, ready, alice, [smartAlice, smartBob]), { status: 409 });
  assert.equal((await app.request(`/api/stories/${story.id}`, 'GET', bob)).status, 200, 'Archived participants retain access to their existing ciphertext');
});

test('missing recipient key grants no shared read permission', async t => {
  const app = await setup(t);
  const story = await commit(app, await upload(app, '1'), alice, [smartAlice]);
  await assert.rejects(app.request(`/api/stories/${story.id}`, 'GET', bob), { status: 404 });
  const result = await app.request('/api/stories', 'GET', bob, undefined, new URLSearchParams({ scope: '1' }));
  assert.deepEqual(result.body.stories, []);
});

test('upload ownership, expiration, canonical bytes, hash and duplicate race are enforced', async t => {
  let clock = 1000;
  const app = await setup(t, { now: () => clock });
  const item = await intent(app);
  await assert.rejects(app.request(item.uploadPath, 'POST', bob, { ciphertext: bytes.toString('base64') }), { status: 404 });
  await assert.rejects(app.request(item.uploadPath, 'POST', alice, { ciphertext: Buffer.alloc(bytes.length).toString('base64') }), { status: 400 });
  await assert.rejects(app.request(item.uploadPath, 'POST', alice, { ciphertext: bytes.toString('base64') + '\n' }));
  await assert.rejects(commit(app, item), { status: 409 });
  const raced = await Promise.allSettled([0,1].map(() => app.request(item.uploadPath, 'POST', alice, { ciphertext: bytes.toString('base64') })));
  assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(raced.filter(result => result.status === 'rejected')[0].reason.status, 409);
  assert.equal((await readdir(path.join(app.dir, 'vault-v2'))).length, 1);
  const expired = await intent(app);
  clock += 900001;
  await assert.rejects(app.request(expired.uploadPath, 'POST', alice, { ciphertext: bytes.toString('base64') }), { status: 410 });
  await assert.rejects(commit(app, item), { status: 410 });
});

test('rejects plaintext fields, unknown versions, outsiders and quota overreservation', async t => {
  const app = await setup(t, { maxBytes: 100, quotaBytes: bytes.length });
  await assert.rejects(intent(app, 'personal', alice, { plaintext: 'secret' }));
  await assert.rejects(intent(app, 'personal', alice, { encryptionVersion: 'plaintext' }));
  await assert.rejects(intent(app, 'personal', alice, { byteLength: 101 }));
  await assert.rejects(intent(app, '1', stranger), { status: 403 });
  const item = await upload(app);
  await assert.rejects(commit(app, item, alice, [bob]), { status: 400 });
  await assert.rejects(intent(app), { status: 413 });
  assert.equal(await app.request('/api/unrelated'), null);
});

test('expired abandoned ciphertext is removed and quota reused while committed stories survive', async t => {
  let clock = 1000;
  const app = await setup(t, { now: () => clock, quotaBytes: bytes.length * 2 });
  const kept = await upload(app), story = await commit(app, kept);
  const abandoned = await upload(app);
  await assert.rejects(intent(app), { status: 413 });
  clock += 900001;
  const replacement = await upload(app);
  await assert.rejects(readFile(path.join(app.dir, 'vault-v2', abandoned.uploadId)), { code: 'ENOENT' });
  assert.deepEqual((await readdir(path.join(app.dir, 'vault-v2'))).sort(), [kept.uploadId, replacement.uploadId].sort());
  assert.equal((await app.request(`/api/stories/${story.id}`)).body.ciphertext, bytes.toString('base64'));
  await assert.rejects(commit(app, abandoned), { status: 404 });
});

test('startup discards interrupted partial file and permits retry of unexpired upload', async t => {
  const app = await setup(t);
  const item = await intent(app);
  await app.interruptUpload(item.uploadId);
  await app.restart();
  await assert.rejects(readFile(path.join(app.dir, 'vault-v2', item.uploadId)), { code: 'ENOENT' });
  assert.equal((await app.request(item.uploadPath, 'POST', alice, { ciphertext: bytes.toString('base64') })).status, 201);
  const story = await commit(app, item);
  assert.equal((await app.request(`/api/stories/${story.id}`)).body.ciphertext, bytes.toString('base64'));
});
