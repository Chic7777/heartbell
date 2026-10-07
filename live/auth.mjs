import { randomBytes, createHash } from 'node:crypto';
import { getAddress, verifyMessage } from 'ethers';

export function createAuth(db, origin) {
  db.exec(`CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, address TEXT, message TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, address TEXT, expires INTEGER);`);
  const hash = token => createHash('sha256').update(token).digest('hex');
  return {
    challenge(address) {
      address = getAddress(address);
      const id = randomBytes(24).toString('hex');
      const message = `${new URL(origin).host} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Consensus Bell. This does not authorize a transaction or transfer.\n\nURI: ${origin}\nVersion: 1\nNonce: ${id}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date(Date.now()+300000).toISOString()}`;
      db.prepare('DELETE FROM challenges WHERE expires < ?').run(Date.now());
      db.prepare('INSERT INTO challenges VALUES (?,?,?,?)').run(id,address,message,Date.now()+300000);
      return {id,message};
    },
    verify(id, signature) {
      const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
      if (!row || row.expires < Date.now()) throw new Error('Sign-in challenge expired or already used');
      const recovered = getAddress(verifyMessage(row.message,signature));
      if (recovered !== row.address) throw new Error('Signature does not match this wallet');
      const consumed = db.prepare('DELETE FROM challenges WHERE id = ?').run(id);
      if (consumed.changes !== 1) throw new Error('Challenge already used');
      const token = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),row.address,Date.now()+86400000);
      return {token,address:row.address};
    },
    user(cookie) {
      const token = /(?:^|;\s*)cb_session=([a-f0-9]{64})(?:;|$)/.exec(cookie || '')?.[1];
      if (!token) return null;
      const row = db.prepare('SELECT address,expires FROM sessions WHERE token = ?').get(hash(token));
      return row && row.expires > Date.now() ? row.address : null;
    },
    logout(cookie) {
      const token = /cb_session=([a-f0-9]{64})/.exec(cookie || '')?.[1];
      if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(hash(token));
    }
  };
}
