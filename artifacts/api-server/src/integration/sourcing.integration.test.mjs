import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import test from 'node:test';
const requireDatabase = createRequire(new URL('../../../../lib/db/package.json', import.meta.url));
const { Pool } = requireDatabase('pg');

test('automatic sourcing retains evidence, encrypts provider keys, deduplicates prospects and preserves call outcomes on rescan and restart', async context => {
  assert.ok(process.env.DATABASE_URL);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `sourcing_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.searchParams.set('options', `-c search_path=${schema}`);
  const database = new Pool({ connectionString: databaseUrl.toString() });
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}/api`;
  let child; const logs = [];
  async function stop() { if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; } }
  context.after(async () => { await stop(); await database.end(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); });
  async function start() {
    child = spawn(process.execPath, ['--import', './src/integration/fixtures/sourcing-provider.mjs', 'dist/index.mjs'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DATABASE_URL: databaseUrl.toString(), PORT: String(port), HOST: '127.0.0.1', DEMO_SEED_DATA: 'false', GITHUB_WORKER_ENABLED: 'false', OPENROUTER_API_KEY: '', OPENROUTER_MODEL: '', FERNET_KEY: 'integration-only-encryption-key' } });
    child.stdout.on('data', data => logs.push(data.toString())); child.stderr.on('data', data => logs.push(data.toString()));
    for (let i = 0; i < 100; i++) { if (child.exitCode !== null) throw new Error(logs.join('')); try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error('API did not start');
  }
  const send = (path, method, body) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const desk = async () => (await fetch(`${base}/sourcing`)).json();
  async function waitRun(id) {
    for (let i = 0; i < 100; i++) { const state = await desk(); const run = state.runs.find(run => run.id === id); if (run && !['queued', 'running'].includes(run.status)) return { state, run }; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error('Sourcing scan did not finish');
  }
  await start();
  assert.equal((await fetch(`${base}/sourcing`, { headers: { Origin: 'https://unrelated-site.dev' } })).status, 403);
  const initial = await desk(); assert.equal(initial.mandates.length, 0); assert.equal(initial.prospects.length, 0);
  assert.equal((await send('/sourcing/mandates', 'POST', { name: 'Invalid' })).status, 400);
  const criteria = { geographies: [], sectors: ['Climate'], stages: [], businessModels: [], signals: [], exclusions: [] };
  const mandateResponse = await send('/sourcing/mandates', 'POST', { name: 'Global climate', daily: false, criteria });
  assert.equal(mandateResponse.status, 201); const mandate = await mandateResponse.json();
  const first = await (await send(`/sourcing/mandates/${mandate.id}/scan`, 'POST')).json();
  const repeated = await (await send(`/sourcing/mandates/${mandate.id}/scan`, 'POST')).json();
  assert.equal(first.id, repeated.id);
  const blocked = await waitRun(first.id); assert.equal(blocked.run.status, 'needs_provider'); assert.equal(blocked.run.evidence.length, 3); assert.equal(blocked.state.prospects.length, 0);
  assert.equal((await send('/sourcing/provider', 'PUT', { apiKey: 'integration-secret', model: 'paid/model' })).status, 400);
  const configured = await send('/sourcing/provider', 'PUT', { apiKey: 'integration-secret', model: 'openrouter/free' }); assert.equal(configured.status, 200);
  const stored = await database.query("SELECT encrypted_values FROM provider_connections WHERE provider='sourcing'"); assert.ok(!stored.rows[0].encrypted_values.includes('integration-secret'));
  assert.ok(!JSON.stringify(await desk()).includes('integration-secret'));
  const second = await (await send(`/sourcing/mandates/${mandate.id}/scan`, 'POST')).json();
  const researched = await waitRun(second.id); assert.equal(researched.run.status, 'completed'); assert.equal(researched.run.added, 1); assert.equal(researched.run.tokens, 246);
  const prospect = researched.state.prospects[0]; assert.equal(prospect.status, 'ready'); assert.equal(prospect.dossier.facts.founders.value, 'Jane Builder');
  const called = await send(`/sourcing/prospects/${prospect.id}`, 'PATCH', { status: 'contacted', notes: 'Call completed; follow up next week.' }); assert.equal(called.status, 200);
  const third = await (await send(`/sourcing/mandates/${mandate.id}/scan`, 'POST')).json();
  const rescanned = await waitRun(third.id); assert.equal(rescanned.run.duplicates, 1); assert.equal(rescanned.state.prospects.length, 1); assert.equal(rescanned.state.prospects[0].status, 'contacted'); assert.equal(rescanned.state.prospects[0].notes, 'Call completed; follow up next week.');
  const csv = await (await fetch(`${base}/sourcing/export.csv`)).text(); assert.ok(csv.includes('Jane Builder')); assert.ok(csv.includes('https://sourcing-fixture.dev/')); assert.ok(!csv.includes('integration-secret'));
  await database.query("INSERT INTO sourcing_runs(organization_id,mandate_id,mandate_snapshot,status) VALUES($1,$2,$3,'running')", [mandate.organization_id, mandate.id, JSON.stringify(mandate)]);
  await stop(); await start();
  const restarted = await desk(); assert.equal(restarted.prospects[0].status, 'contacted'); assert.ok(restarted.runs.some(run => run.status === 'interrupted')); assert.equal(restarted.provider.configured, true);
  await send('/sourcing/provider', 'DELETE'); assert.equal((await desk()).provider.configured, false);
});
