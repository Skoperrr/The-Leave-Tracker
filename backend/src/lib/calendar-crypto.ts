import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
const envelope = z.object({ version: z.literal(1), keyVersion: z.string(), nonce: z.string(), tag: z.string(), ciphertext: z.string() }).strict();
export function createCalendarCipher(keys: Record<string, Buffer>, currentVersion: string) {
  if (!keys[currentVersion] || Object.values(keys).some(key => key.length !== 32)) throw new Error('Calendar encryption requires 32-byte keys');
  const aad = (organisationId: string, purpose: string, keyVersion: string) => Buffer.from(JSON.stringify(['GOOGLE', organisationId, purpose, keyVersion]));
  return {
    encrypt(value: string, organisationId: string, purpose = 'refresh') {
      const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', keys[currentVersion]!, nonce);
      cipher.setAAD(aad(organisationId, purpose, currentVersion));
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return JSON.stringify({ version: 1, keyVersion: currentVersion, nonce: nonce.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'), ciphertext: encrypted.toString('base64url') });
    },
    decrypt(value: string, organisationId: string, purpose = 'refresh') {
      try {
        const data = envelope.parse(JSON.parse(value)), key = keys[data.keyVersion];
        const nonce = Buffer.from(data.nonce, 'base64url'), tag = Buffer.from(data.tag, 'base64url');
        if (!key || nonce.length !== 12 || tag.length !== 16) throw new Error();
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(aad(organisationId, purpose, data.keyVersion)); decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
      } catch { throw new Error('Calendar credential could not be decrypted'); }
    },
  };
}
export type CalendarCipher = ReturnType<typeof createCalendarCipher>;
