import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

export class CredentialCrypto {
  private readonly key: Buffer;

  constructor(encodedKey: string | undefined) {
    const key = encodedKey ? Buffer.from(encodedKey, 'base64') : Buffer.alloc(0);
    if (!encodedKey || key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new ServiceUnavailableException('Khóa mã hóa kênh chưa được cấu hình hợp lệ.');
    }
    this.key = key;
  }

  encrypt(value: unknown, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
  }

  decrypt<T>(ciphertext: string, context: string): T {
    const [version, iv, tag, body] = ciphertext.split('.');
    if (version !== 'v1' || !iv || !tag || !body) throw new Error('Invalid ciphertext.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString(
        'utf8',
      ),
    ) as T;
  }
}
