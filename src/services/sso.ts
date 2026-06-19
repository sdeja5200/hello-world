import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * GHL Custom Page SSO.
 *
 * The CRM parent window posts an AES-encrypted payload to our iframe; the iframe
 * forwards it here and we decrypt it server-side with the app's SSO Key. GHL
 * encrypts with CryptoJS defaults (AES-256-CBC, OpenSSL "Salted__" envelope,
 * MD5-based EVP_BytesToKey derivation), which we reproduce with Node crypto.
 */
export interface SsoSession {
  userId: string;
  companyId: string;
  /** Present for sub-account context; absent for agency-level views. */
  activeLocation?: string;
  role?: string;
  type?: string;
  userName?: string;
  email?: string;
}

export function decryptSso(encrypted: string): SsoSession {
  const data = Buffer.from(encrypted, 'base64');
  if (data.subarray(0, 8).toString('utf8') !== 'Salted__') {
    throw new Error('Unexpected SSO payload format');
  }
  const salt = data.subarray(8, 16);
  const ciphertext = data.subarray(16);

  const { key, iv } = evpBytesToKey(config.ghl.ssoKey, salt, 32, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(decrypted.toString('utf8')) as SsoSession;
}

/** OpenSSL's EVP_BytesToKey with MD5 (what CryptoJS uses by default). */
function evpBytesToKey(passphrase: string, salt: Buffer, keyLen: number, ivLen: number) {
  const pass = Buffer.from(passphrase, 'utf8');
  let data = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (data.length < keyLen + ivLen) {
    prev = crypto.createHash('md5').update(Buffer.concat([prev, pass, salt])).digest();
    data = Buffer.concat([data, prev]);
  }
  return { key: data.subarray(0, keyLen), iv: data.subarray(keyLen, keyLen + ivLen) };
}
