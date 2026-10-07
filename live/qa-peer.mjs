// QA instrument: a second real user for two-session manual QA.
// It creates its own wallet, signs the real server challenge, registers a real
// P-256 encryption key and exchanges real client-encrypted chat envelopes.
// Usage:
//   node qa-peer.mjs setup                -> prints its address
//   node qa-peer.mjs accept <connId> <peerAddress>
//   node qa-peer.mjs send <connId> <peerAddress> <text> [--ephemeral]
//   node qa-peer.mjs read <connId> <peerAddress>
import { Wallet } from 'ethers';
import { webcrypto as crypto } from 'node:crypto';
import { Buffer } from 'node:buffer';

const base = process.env.QA_BASE || 'http://127.0.0.1:52203';
const stateFile = new URL('./data/qa-peer.json', import.meta.url);
const { readFile, writeFile, mkdir } = await import('node:fs/promises');
const b64 = bytes => Buffer.from(bytes).toString('base64');
const unb64 = text => Uint8Array.from(Buffer.from(text, 'base64'));

async function api(path, options = {}, cookie) {
  const response = await fetch(base + path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  if (!response.ok) throw new Error(path + ' -> ' + response.status + ' ' + (body.error || ''));
  return body;
}

async function loadState() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); } catch { return null; }
}

// The verify response only returns the address; capture the cookie separately.
async function login() {
  let state = await loadState();
  if (state?.cookie) return state;
  const wallet = Wallet.createRandom();
  const challengeResponse = await fetch(base + '/api/auth/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ address: wallet.address }) });
  const challenge = await challengeResponse.json();
  const verifyResponse = await fetch(base + '/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ id: challenge.id, signature: await wallet.signMessage(challenge.message) }) });
  const verified = await verifyResponse.json();
  if (!verifyResponse.ok) throw new Error('login failed: ' + JSON.stringify(verified));
  const setCookie = verifyResponse.headers.get('set-cookie');
  const token = /cb_session=([a-f0-9]{64})/.exec(setCookie)?.[1];
  if (!token) throw new Error('no session cookie returned');
  state = { address: wallet.address, privateKey: wallet.privateKey, cookie: 'cb_session=' + token };
  await mkdir(new URL('./data/', import.meta.url), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  return state;
}

const contextBytes = (config, scope) => new TextEncoder().encode(`Consensus Bell:${config.chainId}:${config.contract.toLowerCase()}:${scope}`);

async function sharedKey(state, peerAddress, scope, config) {
  const record = await api('/api/key?address=' + encodeURIComponent(peerAddress), {}, state.cookie);
  if (!record?.key) throw new Error('peer has no registered encryption key yet');
  const publicKey = await crypto.subtle.importKey('jwk', record.key, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const jwk = JSON.parse(state.jwk);
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function ensureEncryptionKey(state, config) {
  if (state.jwk) return state;
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const key = { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y };
  const wallet = new Wallet(state.privateKey);
  const message = `Consensus Bell encryption key\nOrigin: ${config.origin}\nAddress: ${state.address}\nPublic key: ${JSON.stringify(key)}`;
  await api('/api/key', { method: 'PUT', body: { key, signature: await wallet.signMessage(message) } }, state.cookie);
  state.jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  return state;
}

const [command, connectionId, peerAddress, ...rest] = process.argv.slice(2);
const config = await api('/api/config');
if (command === 'setup') {
  const state = await login();
  console.log(JSON.stringify({ address: state.address }));
} else if (command === 'profile') {
  const state = await login();
  await api('/api/profile', { method: 'PUT', body: { name: '枕水', city: '杭州', gender: '女', age: '28', interests: ['Photography', 'Travel'], statement: '想把喜欢的光影都存进同一本相册。', intention: 'Serious relationship', discoverable: true } }, state.cookie);
  console.log('profile saved for', state.address);
} else if (command === 'connect') {
  const state = await login();
  const result = await api('/api/connections', { method: 'POST', body: { recipient: connectionId } }, state.cookie);
  console.log('connection', result.connection.id, result.connection.status);
} else if (command === 'accept') {
  const state = await login();
  const result = await api(`/api/connections/${connectionId}/respond`, { method: 'POST', body: { decision: 'accept' } }, state.cookie);
  console.log('connection', result.connection.status);
} else if (command === 'send') {
  let state = await login();
  state = await ensureEncryptionKey(state, config);
  const text = rest.filter(value => value !== '--ephemeral').join(' ');
  const ephemeral = rest.includes('--ephemeral');
  const scope = 'chat:' + connectionId;
  const key = await sharedKey(state, peerAddress, scope, config);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: contextBytes(config, scope) }, key, new TextEncoder().encode(JSON.stringify({ text, at: Date.now() })));
  const sent = await api(`/api/connections/${connectionId}/messages`, { method: 'POST', body: { scope, ciphertext: b64(new Uint8Array(ciphertext)), iv: b64(iv), ephemeral } }, state.cookie);
  console.log('sent', sent.message.id, sent.message.ephemeral ? 'ephemeral' : 'persistent');
} else if (command === 'read') {
  let state = await login();
  state = await ensureEncryptionKey(state, config);
  const scope = 'chat:' + connectionId;
  const key = await sharedKey(state, peerAddress, scope, config);
  const data = await api(`/api/connections/${connectionId}/messages`, {}, state.cookie);
  for (const message of data.messages) {
    try {
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(message.iv), additionalData: contextBytes(config, scope) }, key, unb64(message.ciphertext));
      console.log(message.mine ? '我' : '对方', new Date(message.created_at).toISOString(), JSON.parse(new TextDecoder().decode(plaintext)).text, message.expires_at ? '[焚毁 ' + new Date(message.expires_at).toISOString() + ']' : '');
    } catch { console.log(message.mine ? '我' : '对方', new Date(message.created_at).toISOString(), '<无法解密>'); }
  }
} else {
  console.log('usage: node qa-peer.mjs setup | profile | accept <id> | send <id> <peer> <text> [--ephemeral] | read <id> <peer>');
}
