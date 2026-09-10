import assert from "node:assert/strict";
import test from "node:test";
import { verifyGitHubRepositoryAccess } from "./github-repository-verification.ts";

test("returns GitHub's canonical repository name after a successful check", async () => {
  const fetchImpl = (async () => new Response(
    JSON.stringify({ full_name: "Canonical/Repository" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch;
  const result = await verifyGitHubRepositoryAccess("token", "canonical/repository", fetchImpl);
  assert.deepEqual(result, { verified: true, repository: "Canonical/Repository", error: null });
});

test("marks confirmed inaccessible repositories without deleting their identity", async () => {
  const fetchImpl = (async () => new Response(null, { status: 404 })) as typeof fetch;
  const result = await verifyGitHubRepositoryAccess("token", "owner/missing", fetchImpl);
  assert.deepEqual(result, {
    verified: false,
    repository: "owner/missing",
    error: "Repository no longer exists or is not accessible",
  });
});

test("treats transient GitHub failures as errors instead of access revocation", async () => {
  const fetchImpl = (async () => new Response(null, { status: 500 })) as typeof fetch;
  await assert.rejects(
    verifyGitHubRepositoryAccess("token", "owner/repository", fetchImpl),
    /HTTP 500/,
  );
});

test("treats GitHub rate-limit responses as transient", async () => {
  const fetchImpl = (async () => new Response(null, {
    status: 403,
    headers: { "X-RateLimit-Remaining": "0" },
  })) as typeof fetch;
  await assert.rejects(
    verifyGitHubRepositoryAccess("token", "owner/repository", fetchImpl),
    /rate limited/,
  );
});