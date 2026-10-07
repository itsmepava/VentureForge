import assert from 'node:assert/strict';
import test from 'node:test';
import { askModel, criteriaLabels, discoveryQueries, parseEvidence, publicUrl, validateDossier, type Criteria } from './sourcing.ts';
const criteria: Criteria = { geographies: [], sectors: ['Climate'], stages: [], businessModels: [], signals: [], exclusions: ['Gambling', 'Crypto'] };
test('mandates are worldwide by default and exclusions require all prohibitions', () => {
  assert.ok(discoveryQueries(criteria).every(query => !query.includes('South Asia')));
  assert.ok(criteriaLabels(criteria).includes('exclusions: Gambling AND Crypto'));
});
test('untrusted links and malformed search payloads do not become research sources', () => {
  for (const value of ['javascript:alert(1)', 'http://127.0.0.1', 'https://localhost', 'https://user:pass@company.dev', 'https://company.dev:8080', 'http://[::1]']) assert.equal(publicUrl(value), null);
  assert.throws(() => parseEvidence({ error: 'upstream unavailable' }, 'query'));
  const sources = parseEvidence({ results: [null, { url: 'https://localhost' }, { url: 'https://company.dev', title: 'Company' }] }, 'query', 2);
  assert.equal(sources[0].id, 's3');
});
test('fabricated facts, ungrounded criteria and stale activity cannot create a ready prospect', () => {
  const evidence = parseEvidence({ results: [{ url: 'https://company.dev', title: 'Company', snippet: 'Company makes climate software.', published_at: '2020-01-01' }] }, 'query');
  const dossier = validateDossier({ facts: { founders: { value: 'Invented Founder', sourceId: 's1', quote: 'Company makes climate software.' }, active: { value: 'true', sourceId: 's1', quote: 'Company makes climate software.' } }, checks: [{ criterion: 'sectors: Climate', result: 'match', sourceId: 'invented', quote: 'Climate' }] }, { name: 'Company', website: 'https://company.dev' }, criteria, evidence);
  assert.equal(dossier.facts.founders, undefined);
  assert.equal(dossier.ready, false);
  assert.ok(dossier.checks.every(item => item.result === 'unknown'));
  assert.ok(dossier.gaps.some(gap => gap.includes('Recent company activity')));
});
test('free local mode never sends a paid-model request; provider failures are explicit', async () => {
  let calls = 0;
  const transport = (async () => { calls++; return new Response('denied', { status: 429 }); }) as typeof fetch;
  await assert.rejects(askModel('key', 'paid/model', '', {}, transport), /free models/);
  assert.equal(calls, 0);
  await assert.rejects(askModel('key', 'openrouter/free', '', {}, transport), /429/);
  assert.equal(calls, 1);
});
