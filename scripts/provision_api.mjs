// Run after `wrangler login`. Credentials stay in memory or ignored env files, never command arguments.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
const envFile = existsSync('.env') ? '.env' : '.env.local';
process.loadEnvFile(envFile);
let credentials;
try {
  credentials = JSON.parse(
    execFileSync('npx', ['wrangler', 'auth', 'token', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
} catch {
  throw Error(
    'Cloudflare is not authenticated. Run npx wrangler login, then retry.',
  );
}
const headers = { 'Content-Type': 'application/json' };
if (credentials.token) headers.Authorization = 'Bearer ' + credentials.token;
else {
  headers['X-Auth-Key'] = credentials.key;
  headers['X-Auth-Email'] = credentials.email;
}
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8')),
  prefix = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}/hyperdrive/configs`;
async function cloudflare(path, options = {}) {
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok || !data.success)
    throw Error(
      'Cloudflare provisioning failed: ' +
        (data.errors || []).map((e) => e.message).join('; '),
    );
  return data.result;
}
const existing = (await cloudflare(prefix)).find(
  (row) => row.name === 'finfolk-community',
);
let drive = existing;
if (existing && !existing.caching?.disabled)
  throw Error(
    'Existing Hyperdrive query caching must be disabled before using private account data.',
  );
if (!drive) {
  const direct = new URL(process.env.DATABASE_URL_UNPOOLED);
  direct.searchParams.set('sslmode', 'verify-full');
  const client = new pg.Client({ connectionString: direct.href });
  await client.connect();
  let appURL;
  try {
    const role = (
      await client.query("SELECT 1 FROM pg_roles WHERE rolname='finfolk_api'")
    ).rows;
    if (role.length && !process.env.FINFOLK_DATABASE_URL)
      throw Error(
        'finfolk_api already exists. Restore its FINFOLK_DATABASE_URL in the ignored env file; no password was rotated.',
      );
    const password = role.length ? null : randomBytes(32).toString('hex');
    if (password)
      await client.query(
        `CREATE ROLE finfolk_api LOGIN PASSWORD '${password}'`,
      );
    await client.query(
      'GRANT USAGE ON SCHEMA finfolk,neon_auth TO finfolk_api',
    );
    await client.query(
      'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA finfolk TO finfolk_api',
    );
    await client.query(
      'GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA finfolk TO finfolk_api',
    );
    await client.query(
      'GRANT SELECT(id,name,"emailVerified",banned) ON neon_auth."user" TO finfolk_api',
    );
    appURL = process.env.FINFOLK_DATABASE_URL
      ? new URL(process.env.FINFOLK_DATABASE_URL)
      : new URL(direct);
    appURL.username = 'finfolk_api';
    if (password) appURL.password = password;
    if (password) {
      const source = await readFile(envFile, 'utf8');
      await writeFile(
        envFile,
        source + '\nFINFOLK_DATABASE_URL=' + appURL.href + '\n',
        { mode: 0o600 },
      );
      await chmod(envFile, 0o600);
    }
  } finally {
    await client.end();
  }
  drive = await cloudflare(prefix, {
    method: 'POST',
    body: JSON.stringify({
      name: 'finfolk-community',
      origin: {
        scheme: 'postgresql',
        host: appURL.hostname,
        port: Number(appURL.port || 5432),
        database: appURL.pathname.slice(1),
        user: decodeURIComponent(appURL.username),
        password: decodeURIComponent(appURL.password),
      },
      caching: { disabled: true },
      mtls: { sslmode: 'verify-full' },
      origin_connection_limit: 5,
    }),
  });
}
config.hyperdrive = [{ binding: 'HYPERDRIVE', id: drive.id }];
config.vars = {
  NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
  NEON_AUTH_JWKS_URL: process.env.NEON_AUTH_JWKS_URL,
};
await writeFile('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
console.log(
  'Hyperdrive ready with query caching disabled. Public Auth URLs and binding written to wrangler.jsonc.',
);
execFileSync('npx', ['wrangler', 'deploy'], { stdio: 'inherit' });
