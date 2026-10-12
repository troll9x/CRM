import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Creates only local backend secrets; never prints values or overwrites a real value.
const envPath = resolve('.env');
const original = await readFile(envPath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const lines = original.split(/\r?\n/);
const settings = [
  ['FACEBOOK_WEBHOOK_VERIFY_TOKEN', () => randomBytes(32).toString('base64url')],
  ['INTEGRATION_TOKEN_ENCRYPTION_KEY', () => randomBytes(32).toString('base64')],
];
const changed = [];
for (const [key, generate] of settings) {
  const matches = lines.flatMap((line, index) => line.startsWith(`${key}=`) ? [index] : []);
  if (matches.length > 1) throw new Error(`Duplicate ${key}; no configuration was changed.`);
  if (matches.length === 1) {
    const current = lines[matches[0]].slice(key.length + 1).trim();
    if (current && !/^replace-with/i.test(current)) continue;
    lines[matches[0]] = `${key}=${generate()}`;
  } else {
    const trailingBlank = lines.at(-1) === '';
    lines.splice(trailingBlank ? lines.length - 1 : lines.length, 0, `${key}=${generate()}`);
  }
  changed.push(key);
}
if (changed.length) {
  const temporaryPath = `${envPath}.channel-secrets-${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, lines.join(eol), { flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, envPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
process.stdout.write(`Local backend keys ready: ${settings.map(([key]) => key).join(', ')}. Values are not displayed.\n`);
