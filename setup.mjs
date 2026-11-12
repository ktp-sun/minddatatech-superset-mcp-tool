import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const config = join(root, 'env.json');
if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run setup in an interactive terminal.');
if (existsSync(config) || existsSync(join(root, 'config.json'))) throw new Error('A configuration file already exists. Use configure_credentials to update it.');
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: true });
let url, username, password;
try {
  url = (await rl.question('Superset URL [https://superset.minddatatech.com]: ')).trim() || 'https://superset.minddatatech.com';
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('An HTTPS URL is required.');
  username = (await rl.question('Superset username: ')).trim();
  process.stdout.write('Superset password (saved locally as plaintext): ');
  muted = true;
  password = await rl.question('');
  muted = false;
  process.stdout.write('\n');
  if (!username || !password) throw new Error('Username and password are required.');
} finally { muted = false; rl.close(); }
writeFileSync(config, JSON.stringify({ SUPERSET_URL: url, SUPERSET_USERNAME: username, SUPERSET_PASSWORD: password, SUPERSET_PROVIDER: 'db' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
password = undefined;
const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (install.error || install.status !== 0) {
  console.error('Dependency installation failed. Configuration was saved; run npm ci --ignore-scripts after resolving the error.');
  process.exitCode = 1;
} else {
  console.log('Setup complete. Connect your MCP client as described in README.md. Credentials have not yet been verified.');
}
