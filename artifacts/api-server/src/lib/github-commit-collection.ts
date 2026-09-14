type GitHubCommit = {
  sha?: string;
};

export async function fetchRepositoryCommitCount(
  token: string,
  repository: string,
  start: Date,
  end: Date,
  fetchImpl: typeof fetch = fetch,
) {
  const commitShas = new Set<string>();
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`https://api.github.com/repos/${repository}/commits`);
    url.searchParams.set("since", start.toISOString());
    url.searchParams.set("until", end.toISOString());
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VentureForge/2.0",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GitHub commits for ${repository} returned HTTP ${response.status}`);
    const commits = (await response.json()) as GitHubCommit[];
    for (const commit of commits) {
      if (commit.sha) commitShas.add(commit.sha);
    }
    if (commits.length < 100) break;
  }
  return commitShas.size;
}