import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import test from 'node:test';
import Stripe from 'stripe';

const databaseRequire = createRequire(new URL('../../../../lib/db/package.json', import.meta.url));
const { Pool } = databaseRequire('pg');

test('workspace saves survive API restart; filters, sources, counts and native Stripe verification work', async context => {
  assert.ok(process.env.DATABASE_URL);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `local_workspace_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`create schema "${schema}"`);
  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.searchParams.set('options', `-c search_path=${schema}`);
  const database = new Pool({ connectionString: databaseUrl.toString() });
  const portProbe = createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const base = `http://127.0.0.1:${port}/api`;
  let child;
  const logs = [];
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  }
  context.after(async () => {
    await stop();
    await database.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  });
  async function start() {
    child = spawn(process.execPath, ['dist/index.mjs'], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, DATABASE_URL: databaseUrl.toString(), PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', DEMO_SEED_DATA: 'true', GITHUB_WORKER_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_local_verification', STRIPE_WEBHOOK_SECRET: 'whsec_local_verification' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => logs.push(data.toString()));
    child.stderr.on('data', data => logs.push(data.toString()));
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(logs.join(''));
      try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('API did not start');
  }
  const send = (url, method, body) => fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await start();
  const initial = await fetch(`${base}/organization`);
  assert.equal(initial.status, 200);
  const preferences = { companyName: 'Independent Venture Desk', primaryGeography: 'East Asia' };
  const saved = await send('/organization', 'PATCH', preferences);
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), preferences);
  const invalid = await send('/organization', 'PATCH', { ...preferences, companyName: ' ' });
  assert.equal(invalid.status, 400);
  const invalidGeography = await send('/organization', 'PATCH', { ...preferences, primaryGeography: 'Anywhere' });
  assert.equal(invalidGeography.status, 400);
  const search = await send('/saved-searches', 'POST', { name: 'Persistent local search', filterParams: { search: 'Kiteframe', region: [], country: [], stage: [], businessModel: [], sector: [] }, isActive: true });
  assert.equal(search.status, 201);
  const savedSearch = await search.json();
  const source = await send('/portfolio-sources', 'POST', { urlLink: 'https://example.com/portfolio' });
  assert.equal(source.status, 201);
  const savedSource = await source.json();
  assert.equal(savedSource.status, 'Pending');
  assert.equal(savedSource.companyCount, 0);
  await stop();
  await start();
  assert.deepEqual(await (await fetch(`${base}/organization`)).json(), preferences);
  const searches = await (await fetch(`${base}/saved-searches`)).json();
  assert.ok(searches.some(item => item.id === savedSearch.id));
  const sources = await (await fetch(`${base}/portfolio-sources`)).json();
  assert.ok(sources.some(item => item.id === savedSource.id));
  const companies = await (await fetch(`${base}/companies`)).json();
  const summary = await (await fetch(`${base}/dashboard/summary`)).json();
  assert.equal(summary.companyCount, companies.length);
  assert.equal(summary.highSignalCount, companies.filter(item => item.signalScore >= 85).length);
  const filtered = await (await fetch(`${base}/companies?search=Kiteframe`)).json();
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].companyName, 'Kiteframe');
  const csv = await fetch(`${base}/companies/export.csv?search=Kiteframe`);
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Kiteframe/);
  const payload = JSON.stringify({ id: 'evt_local', object: 'event', type: 'ping', data: { object: {} } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_local_verification' });
  const webhook = await fetch(`${base}/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
  assert.equal(webhook.status, 200);
  const tampered = await fetch(`${base}/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload.replace('ping', 'pong') });
  assert.equal(tampered.status, 400);
  const expired = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_local_verification', timestamp: Math.floor(Date.now() / 1000) - 600 });
  assert.equal((await fetch(`${base}/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': expired }, body: payload })).status, 400);
});
