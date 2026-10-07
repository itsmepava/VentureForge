import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { ListRepositoryResearchResponse, ResearchGitHubRepositoryBody, ResearchGitHubRepositoryResponse } from "@workspace/api-zod";
import { db, repositoryResearch } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { readProviderValues } from "../lib/providers";
import { researchRepository, RepositoryResearchError } from "../lib/repository-research";

const router: IRouter = Router();
router.get("/repository-research/export.csv", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const rows = await db.select().from(repositoryResearch).where(eq(repositoryResearch.organizationId, DEMO_ORGANIZATION_ID)).orderBy(desc(repositoryResearch.researchedAt));
    const cell = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[=+@\-\t\r\n]/.test(text) ? "'" + text : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const columns = ["Repository", "Source", "Description", "Stars", "Forks", "Open issues and PRs", "30-day commits", "Lower bound", "Observed authors", "Language", "Window start", "Fetched at", "API requests"];
    const csv = [columns, ...rows.map(row => [row.displayName, row.sourceUrl, row.description, row.stars, row.forks, row.openIssues, row.recentCommitCount, row.commitsTruncated, row.observedAuthorCount, row.language, row.periodStart.toISOString(), row.researchedAt.toISOString(), row.apiRequests])].map(row => row.map(cell).join(",")).join("\r\n");
    return res.type("text/csv").attachment("ventureforge-repository-research.csv").send(csv);
  } catch (error) { return next(error); }
});
function serialize(row: typeof repositoryResearch.$inferSelect) {
  return { ...row, lastPushedAt: row.lastPushedAt?.toISOString() ?? null, periodStart: row.periodStart.toISOString(), researchedAt: row.researchedAt.toISOString() };
}
router.get("/repository-research", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const rows = await db.select().from(repositoryResearch).where(eq(repositoryResearch.organizationId, DEMO_ORGANIZATION_ID)).orderBy(desc(repositoryResearch.researchedAt));
    return res.json(ListRepositoryResearchResponse.parse(rows.map(serialize)));
  } catch (error) { return next(error); }
});
let researchRunning = false;
router.post("/repository-research", async (req, res, next) => {
  const parsed = ResearchGitHubRepositoryBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a GitHub repository." });
  if (researchRunning) return res.status(409).json({ error: "A research request is running. Please wait." });
  researchRunning = true;
  try {
    await ensureDemoData();
    const configured = await readProviderValues("github");
    const evidence = await researchRepository(parsed.data.repository, configured?.values.token ?? configured?.values.accessToken ?? process.env.GITHUB_TOKEN);
    const [saved] = await db.insert(repositoryResearch).values({ ...evidence, organizationId: DEMO_ORGANIZATION_ID }).onConflictDoUpdate({ target: [repositoryResearch.organizationId, repositoryResearch.repository], set: evidence }).returning();
    return res.json(ResearchGitHubRepositoryResponse.parse(serialize(saved)));
  } catch (error) {
    if (error instanceof RepositoryResearchError) return res.status(error.status).json({ error: error.message });
    if (error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")) return res.status(502).json({ error: "Could not reach GitHub. Check your connection and retry." });
    return next(error);
  } finally { researchRunning = false; }
});
export default router;
