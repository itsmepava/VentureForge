type FetchLike = typeof fetch;

export async function verifyGitHubRepositoryAccess(
  token: string,
  repository: string,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VentureForge/2.0",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.ok) {
    const payload = (await response.json()) as { full_name?: string };
    return {
      verified: true as const,
      repository: payload.full_name ?? repository,
      error: null,
    };
  }
  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const retryAfter = response.headers.get("retry-after");
    if (remaining === "0" || retryAfter) {
      throw new Error("GitHub repository verification was rate limited");
    }
  }
  if (response.status === 403 || response.status === 404) {
    return {
      verified: false as const,
      repository,
      error: response.status === 404
        ? "Repository no longer exists or is not accessible"
        : "GitHub access to this repository was denied",
    };
  }
  throw new Error(`GitHub repository verification returned HTTP ${response.status}`);
}