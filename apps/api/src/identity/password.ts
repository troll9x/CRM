import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function derive(
  password: string,
  salt: Buffer,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { ...options, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION });
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = encoded.split('$');
  if (!algorithm || algorithm !== 'scrypt' || !rawN || !rawR || !rawP || !rawSalt || !rawHash) {
    return false;
  }
  const expected = Buffer.from(rawHash, 'base64url');
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, Buffer.from(rawSalt, 'base64url'), {
    N: Number(rawN),
    r: Number(rawR),
    p: Number(rawP),
  });
  return timingSafeEqual(actual, expected);
}
