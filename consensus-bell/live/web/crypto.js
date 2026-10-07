import {loadWalletSDK} from './wallet-sdk.js';
let keys, account, api, config;
const database = () => new Promise((resolve,reject)=>{const r=indexedDB.open('consensus-bell-encryption',1);r.onupgradeneeded=()=>r.result.createObjectStore('keys');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function stored(address,value) {
  const db=await database();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('keys',value?'readwrite':'readonly'),store=tx.objectStore('keys');const r=value?store.put(value,address.toLowerCase()):store.get(address.toLowerCase());tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}
const certificate = (address,key) => `Consensus Bell encryption key\nOrigin: ${config.origin}\nAddress: ${window.ethers.getAddress(address)}\nPublic key: ${JSON.stringify(key)}`;
export function validateKey(record,expected,origin=config.origin){if(!record||window.ethers.getAddress(record.address)!==window.ethers.getAddress(expected))throw new Error('加密密钥不属于目标钱包，已停止读取。');const message=`Consensus Bell encryption key\nOrigin: ${origin}\nAddress: ${window.ethers.getAddress(record.address)}\nPublic key: ${JSON.stringify(record.key)}`;if(window.ethers.getAddress(window.ethers.verifyMessage(message,record.signature))!==window.ethers.getAddress(expected))throw new Error('对方的加密密钥签名无效，已停止读取。');return record.key;}
export async function initializeEncryption(context) {
  await loadWalletSDK();
  ({account,api,config}=context);keys=await stored(account);
  const remote=await api('/api/key');
  if(keys&&remote){const actual=await crypto.subtle.exportKey('jwk',keys.publicKey);if(actual.x!==remote.key.x||actual.y!==remote.key.y)throw new Error('本机密钥与账户登记不一致，请使用原设备。');validateKey(remote,account);return;}
  if(!keys&&remote)throw new Error('该钱包已有加密密钥，请使用首次创建密钥的浏览器。新设备恢复尚未接入。');
  if(!context.signer?.signMessage){if(context.deferRegistration)return;throw new Error('请重新连接钱包，签名登记本机加密密钥后使用私人记忆。');}
  if(!keys){keys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);await stored(account,keys);}
  const raw=await crypto.subtle.exportKey('jwk',keys.publicKey),key={kty:raw.kty,crv:raw.crv,x:raw.x,y:raw.y};
  const signature=await context.signer.signMessage(certificate(account,key));await api('/api/key',{method:'PUT',body:{key,signature}});
}
async function shared(peer) {
  if(!keys)throw new Error('请先完成加密密钥登记。');
  const record=await api('/api/key?address='+encodeURIComponent(peer||account));
  if(!record)throw new Error('对方尚未完成钱包登录和加密密钥登记。');
  const publicKey=await crypto.subtle.importKey('jwk',validateKey(record,peer||account),{name:'ECDH',namedCurve:'P-256'},false,[]);
  return crypto.subtle.deriveKey({name:'ECDH',public:publicKey},keys.privateKey,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const base64 = bytes => {let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};
const bytes = text => Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const context = scope => new TextEncoder().encode(`Consensus Bell:${config.chainId}:${config.contract.toLowerCase()}:${scope==='personal'?'personal:'+account.toLowerCase():scope}`);
export async function encrypt(value,peer,scope='personal') {
  const iv=crypto.getRandomValues(new Uint8Array(12)),key=await shared(peer);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context(scope)},key,new TextEncoder().encode(JSON.stringify(value)));
  return {iv:base64(iv),ciphertext:base64(new Uint8Array(ciphertext))};
}
export async function decrypt(envelope,peer) {
  const key=await shared(peer),plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:context(envelope.scope)},key,bytes(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
export function clearEncryption(){keys=null;account=null;}
