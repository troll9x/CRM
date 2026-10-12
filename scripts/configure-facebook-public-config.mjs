import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Updates only non-secret Facebook OAuth settings in the ignored local .env.
// App secrets and encryption keys are deliberately not accepted by this script.
const args = process.argv.slice(2);
const supplied = new Map();
for (let index = 0; index < args.length; index += 1) {
  const key = args[index];
  if (
    !['--app-id', '--graph-version', '--scopes', '--redirect-uri'].includes(key) ||
    !args[index + 1]
  )
    throw new Error('Expected --app-id, --graph-version, and/or --scopes with values.');
  if (supplied.has(key)) throw new Error(`Duplicate option ${key}.`);
  supplied.set(key, args[++index]);
}
if (supplied.size === 0) throw new Error('No Facebook public configuration was provided.');

const settings = new Map([
  ['--app-id', 'FACEBOOK_APP_ID'],
  ['--graph-version', 'FACEBOOK_GRAPH_API_VERSION'],
  ['--scopes', 'FACEBOOK_OAUTH_SCOPES'],
  ['--redirect-uri', 'FACEBOOK_OAUTH_REDIRECT_URI'],
]);
for (const [option, value] of supplied) {
  if (option === '--app-id' && !/^\d+$/.test(value))
    throw new Error('Facebook App ID must contain digits only.');
  if (option === '--graph-version' && !/^v\d+\.\d+$/.test(value))
    throw new Error('Graph API version must look like v26.0.');
  if (option === '--scopes' && !/^[a-z_]+(,[a-z_]+)*$/.test(value))
    throw new Error('Facebook scopes must be a comma-separated list of permission names.');
  if (option === '--redirect-uri') {
    const redirect = new URL(value);
    if (
      redirect.protocol !== 'https:' ||
      redirect.pathname !== '/api/v1/integrations/oauth/facebook/callback' ||
      redirect.search ||
      redirect.hash ||
      redirect.username ||
      redirect.password
    )
      throw new Error(
        'Facebook redirect URI must be HTTPS and use the exact callback path without credentials, query, or fragment.',
      );
  }
}

const envPath = resolve('.env');
const original = await readFile(envPath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const lines = original.split(/\r?\n/);
for (const [option, key] of settings) {
  if (!supplied.has(option)) continue;
  const matches = lines.flatMap((line, index) => (line.startsWith(`${key}=`) ? [index] : []));
  if (matches.length > 1) throw new Error(`Duplicate ${key}; no configuration was changed.`);
  if (matches.length === 1) lines[matches[0]] = `${key}=${supplied.get(option)}`;
  else {
    const trailingBlank = lines.at(-1) === '';
    lines.splice(
      trailingBlank ? lines.length - 1 : lines.length,
      0,
      `${key}=${supplied.get(option)}`,
    );
  }
}

// Write the existing file in place to retain its Windows ACL; replacing it with
// a temp file can inherit broader permissions from the parent directory.
await writeFile(envPath, lines.join(eol), 'utf8');
process.stdout.write(
  `Updated local non-secret Facebook settings: ${[...supplied.keys()].map((option) => settings.get(option)).join(', ')}. Values were not re-read or displayed.\n`,
);
