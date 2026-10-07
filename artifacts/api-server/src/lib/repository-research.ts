export class RepositoryResearchError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

export function parseRepository(input: string) {
  let repository = input.trim();
  if (repository.startsWith('https://')) {
    const url = new URL(repository);
    if (url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw new RepositoryResearchError('Use a GitHub repository URL or owner/repository.', 400);
    repository = url.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, '');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) || ['.', '..'].includes(repository.split('/')[1])) throw new RepositoryResearchError('Enter a repository as owner/repository or https://github.com/owner/repository.', 400);
  return repository;
}

type GitHubRepository = {
  full_name: string; description: string | null; language: string | null;
  stargazers_count: number; forks_count: number; open_issues_count: number;
  pushed_at: string; archived: boolean; private: boolean;
};
type GitHubCommit = { sha: string; commit: { author: { date: string } | null }; author: { login: string } | null };

export async function researchRepository(input: string, token?: string, request: typeof fetch = fetch, now = new Date()) {
  const repository = parseRepository(input);
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'VentureForge' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let apiRequests = 0;
  async function get(resource: string) {
    apiRequests++;
    const response = await request(`https://api.github.com/repos/${repository}${resource ? '/' + resource : ''}`, { headers, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      if (response.status === 404) throw new RepositoryResearchError('Repository not found or not accessible. Check the repository name or your GitHub connection.', 404);
      if (response.status === 403 || response.status === 429) throw new RepositoryResearchError('GitHub rate limit or access restriction. Try later or configure a GitHub token in Settings.', 429);
      if (response.status === 401) throw new RepositoryResearchError('GitHub rejected the token. Update your connection in Settings.', 401);
      // An empty repository has no commits yet.
      if (response.status === 409 && resource.startsWith('commits?')) return [];
      throw new RepositoryResearchError(`GitHub request failed (HTTP ${response.status}).`);
    }
    return response.json();
  }
  const metadata = await get('') as GitHubRepository;
  if (metadata.private) throw new RepositoryResearchError('This research flow currently supports public repositories only.', 400);
  if (typeof metadata.full_name !== 'string' || typeof metadata.stargazers_count !== 'number' || typeof metadata.forks_count !== 'number' || typeof metadata.open_issues_count !== 'number') throw new RepositoryResearchError('GitHub returned invalid repository metadata.');
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const commits = new Set<string>();
  const authors = new Set<string>();
  let commitsTruncated = false;
  // Cap provider work; show the cap explicitly instead of presenting partial counts as totals.
  for (let page = 1; page <= 3; page++) {
    const result = await get(`commits?per_page=100&page=${page}&since=${periodStart.toISOString()}&until=${now.toISOString()}`) as GitHubCommit[];
    if (!Array.isArray(result)) throw new RepositoryResearchError('GitHub returned invalid commit data.');
    for (const commit of result) {
      if (typeof commit.sha !== 'string') throw new RepositoryResearchError('GitHub returned an invalid commit.');
      commits.add(commit.sha);
      if (commit.author?.login) authors.add(commit.author.login);
    }
    if (result.length < 100) break;
    if (page === 3) commitsTruncated = true;
  }
  return {
    repository: metadata.full_name.toLowerCase(), displayName: metadata.full_name,
    sourceUrl: `https://github.com/${metadata.full_name}`, description: metadata.description ?? '',
    language: metadata.language ?? null, stars: metadata.stargazers_count, forks: metadata.forks_count,
    openIssues: metadata.open_issues_count, archived: metadata.archived === true,
    lastPushedAt: metadata.pushed_at ? new Date(metadata.pushed_at) : null,
    recentCommitCount: commits.size, observedAuthorCount: authors.size, commitsTruncated,
    periodStart, researchedAt: now, apiRequests,
  };
}
