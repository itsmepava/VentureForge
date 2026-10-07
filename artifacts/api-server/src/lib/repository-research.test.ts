import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRepository, researchRepository } from './repository-research.ts';

test('research accepts repository identifiers and rejects alternate hosts and paths', () => {
  assert.equal(parseRepository('https://github.com/itsmepava/VentureForge.git'), 'itsmepava/VentureForge');
  assert.equal(parseRepository('owner/repo'), 'owner/repo');
  for (const input of ['https://example.com/owner/repo', 'https://github.com/owner/repo/tree/main', 'owner/../repo', 'https://user:pass@github.com/owner/repo', 'http://127.0.0.1/repo']) assert.throws(() => parseRepository(input));
});

test('research fetches live metadata, paginates and deduplicates observed commits', async () => {
  const requests: string[] = [];
  const request = async (url: string | URL | Request, options?: RequestInit) => {
    requests.push(String(url));
    assert.equal(options?.redirect, 'error');
    if (!String(url).includes('commits?')) return Response.json({ full_name: 'Owner/Repo', description: 'Real provider description', language: 'TypeScript', stargazers_count: 5, forks_count: 2, open_issues_count: 1, archived: false, private: false, pushed_at: '2026-10-01T00:00:00Z' });
    if (String(url).includes('page=1&')) return Response.json(Array.from({ length: 100 }, (_, index) => ({ sha: String(index), author: { login: 'builder' } })));
    return Response.json([{ sha: '99', author: { login: 'builder' } }, { sha: '100', author: { login: 'second-builder' } }]);
  };
  const result = await researchRepository('Owner/Repo', undefined, request as typeof fetch, new Date('2026-10-07T00:00:00Z'));
  assert.equal(result.recentCommitCount, 101);
  assert.equal(result.observedAuthorCount, 2);
  assert.equal(result.commitsTruncated, false);
  assert.equal(result.apiRequests, 3);
  assert.equal(result.repository, 'owner/repo');
  assert.match(requests[1], /since=2026-09-07/);
  assert.equal(result.stars, 5);
});

test('partial activity counts are explicitly marked and provider failures never invent data', async () => {
  const request = async (url: string | URL | Request) => Response.json(String(url).includes('commits?') ? Array.from({ length: 100 }, (_, index) => ({ sha: `${url}-${index}`, author: null })) : { full_name: 'owner/repo', stargazers_count: 0, forks_count: 0, open_issues_count: 0, pushed_at: null, private: false });
  const result = await researchRepository('owner/repo', undefined, request as typeof fetch);
  assert.equal(result.recentCommitCount, 300);
  assert.equal(result.commitsTruncated, true);
  assert.equal(result.apiRequests, 4);
  await assert.rejects(researchRepository('owner/repo', undefined, (async () => new Response('{}', { status: 429 })) as typeof fetch), /rate limit/);
  await assert.rejects(researchRepository('owner/repo', undefined, (async () => new Response('{}', { status: 404 })) as typeof fetch), /not found/);
});
