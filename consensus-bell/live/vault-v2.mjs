import path from 'node:path';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { getAddress, isAddress } from 'ethers';
import { z } from 'zod';

const scopeSchema = z.string().regex(/^(personal|[1-9]\d{0,77})$/);
const bytesSchema = z.string().min(1).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const idSchema = z.string().uuid();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function decode(value, max) {
  const encoded = bytesSchema.max(Math.ceil(max / 3) * 4).parse(value);
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > max || bytes.toString('base64') !== encoded) fail(400, 'Invalid canonical base64');
  return bytes;
}

export async function createVaultV2(db, chain, config, options = {}) {
  if (!options.dataDir) throw new Error('Vault requires a private data directory');
  const directory = path.join(options.dataDir, 'vault-v2');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const memberAddress = options.memberAddress || (async address => address);
  const now = options.now || Date.now;
  const maxBytes = options.maxBytes || 1048576;
  const quotaBytes = options.quotaBytes || 104857600;
  const namespace = `${config.chainId}:${String(config.contract || '').toLowerCase()}`;
  db.exec(`CREATE TABLE IF NOT EXISTS vault_v2_uploads (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, namespace TEXT NOT NULL, scope TEXT NOT NULL,
    hash TEXT NOT NULL, bytes INTEGER NOT NULL, version TEXT NOT NULL, expires INTEGER NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('pending','writing','uploaded','committed')));
    CREATE TABLE IF NOT EXISTS vault_v2_stories (
    id TEXT PRIMARY KEY, upload_id TEXT NOT NULL UNIQUE, owner TEXT NOT NULL,
    namespace TEXT NOT NULL, scope TEXT NOT NULL, type TEXT NOT NULL, iv TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS vault_v2_envelopes (
    story_id TEXT NOT NULL, recipient TEXT NOT NULL, wrapped_key TEXT NOT NULL,
    PRIMARY KEY(story_id,recipient));
    CREATE INDEX IF NOT EXISTS vault_v2_scope ON vault_v2_stories(namespace,scope,at);
    CREATE INDEX IF NOT EXISTS vault_v2_owner ON vault_v2_uploads(owner,namespace);`);
  async function removeFile(id) {
    try { await unlink(path.join(directory, idSchema.parse(id))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const interrupted = db.prepare("SELECT id FROM vault_v2_uploads WHERE namespace=? AND state='writing'").all(namespace);
  for (const row of interrupted) {
    await removeFile(row.id);
    db.prepare("UPDATE vault_v2_uploads SET state='pending' WHERE id=? AND state='writing'").run(row.id);
  }
  async function cleanupExpired() {
    const cutoff = now();
    const expired = db.prepare("SELECT id FROM vault_v2_uploads WHERE namespace=? AND expires<=? AND state IN ('pending','uploaded')").all(namespace, cutoff);
    for (const row of expired) {
      await removeFile(row.id);
      db.prepare("DELETE FROM vault_v2_uploads WHERE id=? AND expires<=? AND state IN ('pending','uploaded')").run(row.id, cutoff);
    }
  }
  await cleanupExpired();
  async function access(owner, scope, mutation) {
    if (scope === 'personal') return { recipient: owner, members: [owner] };
    const recipient = getAddress(await memberAddress(owner));
    const relation = await chain.member(recipient, scope);
    if (![relation[0], relation[1]].some(value => getAddress(value) === recipient)) fail(403, 'Ring membership required');
    if (mutation && Number(relation[4]) !== 0) fail(409, 'This Ring is not active');
    return { recipient, members: [getAddress(relation[0]), getAddress(relation[1])] };
  }
  function upload(id, owner) {
    const row = db.prepare('SELECT * FROM vault_v2_uploads WHERE id=? AND owner=? AND namespace=?').get(id, owner, namespace);
    if (!row) fail(404, 'Upload not found');
    if (row.expires <= now()) fail(410, 'Upload expired');
    return row;
  }
  async function storyView(row, owner, includeCiphertext, permission) {
    if (row.scope === 'personal' && row.owner !== owner) return null;
    const { recipient } = permission || await access(owner, row.scope, false);
    const envelope = db.prepare('SELECT wrapped_key FROM vault_v2_envelopes WHERE story_id=? AND recipient=?').get(row.id, recipient);
    if (!envelope) return null;
    const asset = db.prepare('SELECT hash,bytes,version FROM vault_v2_uploads WHERE id=?').get(row.upload_id);
    const result = { id: row.id, author: row.owner, scope: row.scope, type: row.type, at: row.at,
      iv: row.iv, ciphertextHash: asset.hash, byteLength: asset.bytes, encryptionVersion: asset.version,
      envelope: { recipient, wrappedKey: envelope.wrapped_key } };
    if (includeCiphertext) {
      const bytes = await readFile(path.join(directory, row.upload_id));
      if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.hash) fail(500, 'Encrypted asset integrity check failed');
      result.ciphertext = bytes.toString('base64');
    }
    return result;
  }
  return { async handle({ path: route, method, address, body = {}, query = new URLSearchParams() }) {
    if (route !== '/api/stories' && !route.startsWith('/api/stories/')) return null;
    if (!isAddress(address)) fail(401, 'Authenticated wallet required');
    const owner = getAddress(address);
    if (route === '/api/stories/upload-intent' && method === 'POST') {
      const input = z.object({ scope: scopeSchema, ciphertextHash: z.string().regex(/^(?:0x)?[a-fA-F0-9]{64}$/),
        byteLength: z.number().int().min(16).max(maxBytes), encryptionVersion: z.literal('AES-256-GCM-v1') }).strict().parse(body);
      await access(owner, input.scope, true);
      await cleanupExpired();
      const reserved = db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(bytes),0) AS bytes FROM vault_v2_uploads WHERE owner=? AND namespace=? AND (expires>? OR state IN ('uploaded','committed','writing'))").get(owner, namespace, now());
      if (reserved.count >= 1000 || Number(reserved.bytes) + input.byteLength > quotaBytes) fail(413, 'Private storage quota exceeded');
      const pending = db.prepare("SELECT COUNT(*) AS count FROM vault_v2_uploads WHERE owner=? AND namespace=? AND state='pending' AND expires>?").get(owner, namespace, now());
      if (pending.count >= 20) fail(429, 'Too many pending uploads');
      const id = randomUUID(), expiresAt = now() + 900000;
      db.prepare('INSERT INTO vault_v2_uploads VALUES(?,?,?,?,?,?,?,?,?)').run(id, owner, namespace, input.scope,
        input.ciphertextHash.replace(/^0x/, '').toLowerCase(), input.byteLength, input.encryptionVersion, expiresAt, 'pending');
      return { status: 201, body: { uploadId: id, expiresAt, uploadPath: `/api/stories/uploads/${id}`, maxBytes } };
    }
    const uploadMatch = route.match(/^\/api\/stories\/uploads\/([^/]+)$/);
    if (uploadMatch && method === 'POST') {
      const id = idSchema.parse(uploadMatch[1]), row = upload(id, owner);
      if (row.state !== 'pending') fail(409, 'Upload has already been used');
      await access(owner, row.scope, true);
      const input = z.object({ ciphertext: bytesSchema.max(Math.ceil(maxBytes / 3) * 4) }).strict().parse(body);
      const bytes = decode(input.ciphertext, maxBytes);
      if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.hash) fail(400, 'Ciphertext length or SHA-256 does not match intent');
      const claimed = db.prepare("UPDATE vault_v2_uploads SET state='writing' WHERE id=? AND state='pending' AND expires>?").run(id, now());
      if (!claimed.changes) fail(409, 'Upload unavailable');
      let created = false;
      try {
        await writeFile(path.join(directory, id), bytes, { flag: 'wx', mode: 0o600 }); created = true;
        db.prepare("UPDATE vault_v2_uploads SET state='uploaded' WHERE id=? AND state='writing'").run(id);
      } catch (error) {
        if (created) await unlink(path.join(directory, id));
        db.prepare("UPDATE vault_v2_uploads SET state='pending' WHERE id=? AND state='writing'").run(id);
        throw error;
      }
      return { status: 201, body: { uploadId: id, ciphertextHash: row.hash, byteLength: row.bytes } };
    }
    if (route === '/api/stories' && method === 'POST') {
      const input = z.object({ uploadId: idSchema, type: z.enum(['note','photo','video','vow','goal']),
        iv: bytesSchema.max(16), envelopes: z.array(z.object({ recipient: z.string().refine(isAddress), wrappedKey: bytesSchema.max(8192) }).strict()).min(1).max(2) }).strict().parse(body);
      if (decode(input.iv, 12).length !== 12) fail(400, 'AES-GCM IV must be 12 bytes');
      const row = upload(input.uploadId, owner);
      if (row.state !== 'uploaded') fail(409, 'Ciphertext must be uploaded before committing');
      const { recipient, members } = await access(owner, row.scope, true);
      const envelopes = input.envelopes.map(item => ({ recipient: getAddress(item.recipient), wrappedKey: item.wrappedKey }));
      for (const item of envelopes) {
        if (!members.includes(item.recipient) || decode(item.wrappedKey, 6144).length < 16) fail(400, 'Invalid key recipient or wrapped key');
      }
      if (new Set(envelopes.map(item => item.recipient)).size !== envelopes.length || !envelopes.some(item => item.recipient === recipient)) fail(400, 'Unique envelopes including author required');
      const id = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        const updated = db.prepare("UPDATE vault_v2_uploads SET state='committed' WHERE id=? AND state='uploaded' AND expires>?").run(row.id, now());
        if (!updated.changes) fail(409, 'Upload unavailable');
        db.prepare('INSERT INTO vault_v2_stories VALUES(?,?,?,?,?,?,?,?)').run(id, row.id, owner, namespace, row.scope, input.type, input.iv, now());
        for (const item of envelopes) db.prepare('INSERT INTO vault_v2_envelopes VALUES(?,?,?)').run(id, item.recipient, item.wrappedKey);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { status: 201, body: { id } };
    }
    if (route === '/api/stories' && method === 'GET') {
      const scope = scopeSchema.parse(query.get('scope') || 'personal');
      const permission = await access(owner, scope, false), { recipient } = permission;
      const rows = db.prepare(`SELECT s.* FROM vault_v2_stories s JOIN vault_v2_envelopes e ON e.story_id=s.id
        WHERE s.namespace=? AND s.scope=? AND e.recipient=? AND (s.scope!='personal' OR s.owner=?) ORDER BY s.at DESC,s.id DESC LIMIT 100`).all(namespace, scope, recipient, owner);
      const stories = [];
      for (const row of rows) stories.push(await storyView(row, owner, false, permission));
      return { status: 200, body: { stories } };
    }
    const storyMatch = route.match(/^\/api\/stories\/([^/]+)$/);
    if (storyMatch && method === 'GET') {
      const id = idSchema.parse(storyMatch[1]);
      const row = db.prepare('SELECT * FROM vault_v2_stories WHERE id=? AND namespace=?').get(id, namespace);
      if (!row) fail(404, 'Story not found');
      const result = await storyView(row, owner, true);
      if (!result) fail(404, 'Story not found');
      return { status: 200, body: result };
    }
    return { status: 405, body: { error: 'Unsupported story operation' } };
  } };
}
