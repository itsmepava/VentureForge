import assert from "node:assert/strict";
import test from "node:test";
import { fetchRepositoryCommitCount } from "./github-commit-collection.ts";

test("paginates repository commits and deduplicates commit SHAs", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ sha: `sha-${index}` }));
  const requestedUrls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    requestedUrls.push(url);
    const page = new URL(url).searchParams.get("page");
    return new Response(JSON.stringify(page === "1" ? firstPage : [{ sha: "sha-99" }, { sha: "sha-100" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const count = await fetchRepositoryCommitCount(
    "token",
    "owner/repository",
    new Date("2026-09-05T00:00:00.000Z"),
    new Date("2026-09-08T00:00:00.000Z"),
    fetchImpl,
  );

  assert.equal(count, 101);
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0], /since=2026-09-05T00%3A00%3A00\.000Z/);
  assert.match(requestedUrls[0], /until=2026-09-08T00%3A00%3A00\.000Z/);
});