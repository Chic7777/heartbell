import { createRemoteJWKSet, importSPKI, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export function createIdentityProvider(db, auth, config) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_users(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES app_users(id),owner_address TEXT NOT NULL,PRIMARY KEY(provider,subject),UNIQUE(owner_address));`);
  const enabled = Boolean(config.issuer && config.audience && (config.jwks || config.publicKey));
  const jwks = enabled && !config.publicKey ? createRemoteJWKSet(new URL(config.jwks), {timeoutDuration:5000}) : null;
  return {
    enabled,
    async session(input) {
      if (!enabled) throw Object.assign(new Error('Configure an email/Passkey identity provider before creating an embedded-wallet session'), {status:503});
      const body = z.object({token:z.string().min(1).max(16000),id:z.string().regex(/^[a-f0-9]{48}$/),signature:z.string().max(300)}).strict().parse(input);
      let payload;
      try {
        ({payload} = await jwtVerify(body.token,config.publicKey ? await importSPKI(config.publicKey.split(String.fromCharCode(92)+'n').join(String.fromCharCode(10)),'ES256') : jwks,{issuer:config.issuer,audience:config.audience,algorithms:config.algorithms??['RS256','ES256'],requiredClaims:['sub','iat','exp'],maxTokenAge:config.maxTokenAge??'10m'}));
      } catch (error) {
        if (error instanceof Error) throw Object.assign(new Error('Identity token is invalid or expired'),{status:401});
        throw error;
      }
      const subject=z.string().min(1).max(255).parse(payload.sub);
      const challenge=db.prepare('SELECT address FROM challenges WHERE id=?').get(body.id);
      if(!challenge) throw Object.assign(new Error('Wallet-control challenge is missing'),{status:401});
      const linked=db.prepare('SELECT * FROM auth_identities WHERE provider=? AND subject=?').get(config.issuer,subject);
      const occupied=db.prepare('SELECT * FROM auth_identities WHERE owner_address=?').get(challenge.address);
      if((linked && linked.owner_address!==challenge.address)||(occupied && (occupied.provider!==config.issuer || occupied.subject!==subject)))
        throw Object.assign(new Error('Identity is already linked; wallet recovery requires a separate authorized recovery flow'),{status:409});
      db.exec('BEGIN IMMEDIATE');
      try {
        const session=auth.verify(body.id,body.signature);
        const userId=linked?.user_id ?? randomUUID();
        if(!linked){
          db.prepare('INSERT INTO app_users VALUES(?,?)').run(userId,new Date().toISOString());
          db.prepare('INSERT INTO auth_identities VALUES(?,?,?,?)').run(config.issuer,subject,userId,session.address);
        }
        db.exec('COMMIT');
        return {...session,userId,provider:config.issuer};
      } catch(error) {db.exec('ROLLBACK');throw error;}
    }
  };
}

export function identityProviderConfig(env){
  if(env.PRIVY_APP_ID){
    const appId=z.string().regex(/^[a-z0-9]{1,128}$/,'Invalid Privy App ID').parse(env.PRIVY_APP_ID);
    const publicKey=env.PRIVY_VERIFICATION_KEY?.trim();
    if(publicKey && !publicKey.startsWith('-----BEGIN PUBLIC KEY-----'))
      throw new Error('Privy verification requires a PEM public key; omit it to use public JWKS');
    return {issuer:'privy.io',audience:appId,publicKey,jwks:env.PRIVY_JWKS_URL||`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,algorithms:['ES256'],maxTokenAge:'1h'};
  }
  return {issuer:env.AUTH_ISSUER,audience:env.AUTH_AUDIENCE,jwks:env.AUTH_JWKS_URL};
}
