import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.local');
const apiPort = Number(process.env.DEMO_API_PORT ?? 8080);
const webPort = Number(process.env.DEMO_WEB_PORT ?? 18612);
const databasePort = Number(process.env.DEMO_DATABASE_PORT ?? 55432);
const sampleDataEnabled = process.env.DEMO_SEED_DATA === 'true';
const databaseName = sampleDataEnabled ? 'ventureforge_demo' : 'ventureforge_local';
for (const port of [apiPort, webPort, databasePort]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid demo port');
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise(resolve => server.close(resolve));
}
await mkdir(local, { recursive: true });
const credentialsFile = path.join(local, 'demo-credentials.json');
let credentials;
try {
  credentials = JSON.parse(await readFile(credentialsFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  credentials = {
    password: randomBytes(24).toString('hex'),
    jwtSecret: randomBytes(32).toString('hex'),
    fernetKey: randomBytes(32).toString('base64'),
  };
  await writeFile(credentialsFile, JSON.stringify(credentials), { mode: 0o600 });
}
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(local, 'postgres'),
  user: 'postgres', password: credentials.password, port: databasePort,
  persistent: true, postgresFlags: ['-h', '127.0.0.1'],
  initdbFlags: ['--encoding=UTF8'],
  onLog: () => {}, onError: message => console.error(String(message)),
});
let databaseStarted = false;
let api;
let web;
let stopping = false;
async function stop(code = 0) {
  if (code) process.exitCode = code;
  if (stopping) return;
  stopping = true;
  if (web) await web.close();
  if (api && api.exitCode === null) {
    await new Promise(resolve => {
      api.once('exit', resolve);
      api.kill();
    });
  }
  if (databaseStarted) await postgres.stop();
  process.exitCode ??= code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  console.log('Starting local PostgreSQL (demo data stays in .local)...');
  try { await access(path.join(local, 'postgres', 'PG_VERSION')); }
  catch { await postgres.initialise(); }
  await postgres.start();
  databaseStarted = true;
  const client = postgres.getPgClient();
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (!result.rowCount) await client.query(`CREATE DATABASE ${databaseName}`);
  } finally { await client.end(); }
  const env = {
    ...process.env, NODE_ENV: 'development', PORT: String(apiPort), HOST: '127.0.0.1',
    DATABASE_URL: `postgresql://postgres:${credentials.password}@127.0.0.1:${databasePort}/${databaseName}`,
    JWT_SECRET: credentials.jwtSecret, FERNET_KEY: credentials.fernetKey,
    GITHUB_WORKER_ENABLED: 'false',
    DEMO_SEED_DATA: String(sampleDataEnabled),
  };
  console.log('Building the API...');
  await new Promise((resolve, reject) => {
    const build = spawn(process.execPath, ['build.mjs'], { cwd: path.join(root, 'artifacts/api-server'), env, stdio: 'inherit', windowsHide: true });
    build.once('error', reject);
    build.once('exit', code => code === 0 ? resolve() : reject(new Error(`API build failed (${code})`)));
  });
  api = spawn(process.execPath, ['--enable-source-maps', 'artifacts/api-server/dist/index.mjs'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  api.once('error', error => { console.error(error); void stop(1); });
  api.once('exit', code => { if (!stopping) { console.error(`API stopped (${code})`); void stop(1); } });
  const deadline = Date.now() + 60_000;
  let healthy = false;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/healthz`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { healthy = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!healthy) throw new Error('API did not become healthy');
  const frontendRequire = createRequire(path.join(root, 'artifacts/ventureforge/package.json'));
  const { createServer: createViteServer } = await import(pathToFileURL(frontendRequire.resolve('vite')).href);
  process.env.PORT = String(webPort);
  process.env.VITE_SAMPLE_DATA = String(sampleDataEnabled);
  process.env.API_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
  web = await createViteServer({ configFile: path.join(root, 'artifacts/ventureforge/vite.config.ts'), server: { host: '127.0.0.1', port: webPort, strictPort: true } });
  await web.listen();
  console.log(`\nVentureForge local app: http://127.0.0.1:${webPort}/\n${sampleDataEnabled ? 'Sample company data enabled.' : 'Automated sourcing desk. No sample records.'} Press Ctrl+C to stop.\n`);
} catch (error) {
  console.error(error);
  await stop(1);
}
