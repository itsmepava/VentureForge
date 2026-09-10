import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AddCompanyGitHubRepositoryBody,
  AddCompanyGitHubRepositoryParams,
  AddCompanyGitHubRepositoryResponse,
  DeleteCompanyGitHubRepositoryParams,
  GetCompanyParams,
  GetCompanyResponse,
  ListCompanyGitHubRepositoriesParams,
  ListCompanyGitHubRepositoriesResponse,
  ListCompaniesQueryParams,
  ListCompaniesResponse,
} from "@workspace/api-zod";
import { companyGithubRepositories, db, discoveredCompanies } from "@workspace/db";
import { companiesToCsv, companiesToPdf } from "../lib/company-exports";
import { matchesCompanyFilters } from "../lib/company-filters";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { serializeCompany } from "../lib/serializers";
import { readProviderValues } from "../lib/providers";

const router: IRouter = Router();

function asArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function parseCompanyFilters(query: Record<string, unknown>) {
  return ListCompaniesQueryParams.parse({
    search: typeof query.search === "string" ? query.search : undefined,
    region: asArray(query.region),
    country: asArray(query.country),
    stage: asArray(query.stage),
    businessModel: asArray(query.businessModel),
    sector: asArray(query.sector),
  });
}

export async function listFilteredCompanies(query: Record<string, unknown>) {
  await ensureDemoData();
  const params = parseCompanyFilters(query);
  const companies = await db
    .select()
    .from(discoveredCompanies)
    .where(and(eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID)))
    .orderBy(discoveredCompanies.signalScore);
  const regionFiltered = companies.filter((company) => {
    const serialized = serializeCompany(company);
    return matchesCompanyFilters(serialized, params);
  });
  return regionFiltered.reverse().map(serializeCompany);
}

router.get("/companies", async (req, res, next) => {
  try {
    const companies = await listFilteredCompanies(req.query as Record<string, unknown>);
    return res.json(ListCompaniesResponse.parse(companies));
  } catch (error) {
    return next(error);
  }
});

router.get("/companies/export.csv", async (req, res, next) => {
  try {
    const companies = await listFilteredCompanies(req.query as Record<string, unknown>);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ventureforge-companies.csv"');
    return res.send(companiesToCsv(companies));
  } catch (error) {
    return next(error);
  }
});

router.get("/companies/export.pdf", async (req, res, next) => {
  try {
    const companies = await listFilteredCompanies(req.query as Record<string, unknown>);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="ventureforge-companies.pdf"');
    return res.send(companiesToPdf(companies));
  } catch (error) {
    return next(error);
  }
});

function serializeRepository(repository: typeof companyGithubRepositories.$inferSelect) {
  return {
    id: repository.id,
    companyId: repository.companyId,
    repository: repository.repository,
    verified: repository.verified,
    verifiedAt: repository.verifiedAt?.toISOString() ?? null,
    createdAt: repository.createdAt.toISOString(),
  };
}

async function findOrganizationCompany(companyId: string) {
  const [company] = await db
    .select()
    .from(discoveredCompanies)
    .where(
      and(
        eq(discoveredCompanies.id, companyId),
        eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID),
      ),
    )
    .limit(1);
  return company;
}

router.get("/companies/:companyId/github-repositories", async (req, res, next) => {
  try {
    await ensureDemoData();
    const { companyId } = ListCompanyGitHubRepositoriesParams.parse(req.params);
    if (!(await findOrganizationCompany(companyId))) return res.status(404).json({ error: "Company not found" });
    const repositories = await db
      .select()
      .from(companyGithubRepositories)
      .where(
        and(
          eq(companyGithubRepositories.organizationId, DEMO_ORGANIZATION_ID),
          eq(companyGithubRepositories.companyId, companyId),
        ),
      )
      .orderBy(companyGithubRepositories.repository);
    return res.json(ListCompanyGitHubRepositoriesResponse.parse(repositories.map(serializeRepository)));
  } catch (error) {
    return next(error);
  }
});

router.post("/companies/:companyId/github-repositories", async (req, res, next) => {
  try {
    await ensureDemoData();
    const { companyId } = AddCompanyGitHubRepositoryParams.parse(req.params);
    const { repository } = AddCompanyGitHubRepositoryBody.parse(req.body);
    if (!(await findOrganizationCompany(companyId))) return res.status(404).json({ error: "Company not found" });
    const github = await readProviderValues("github");
    const token = github?.values.token ?? github?.values.accessToken;
    if (!token) return res.status(503).json({ error: "Connect GitHub before verifying repository mappings" });

    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VentureForge/2.0",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return res.status(400).json({ error: "GitHub could not verify that repository" });
    const verifiedRepository = (await response.json()) as { full_name?: string };
    const canonicalName = verifiedRepository.full_name ?? repository;
    const now = new Date();
    const [created] = await db
      .insert(companyGithubRepositories)
      .values({
        organizationId: DEMO_ORGANIZATION_ID,
        companyId,
        repository: canonicalName,
        verified: true,
        verifiedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      return res.status(201).json(AddCompanyGitHubRepositoryResponse.parse(serializeRepository(created)));
    }
    const [existing] = await db
      .select()
      .from(companyGithubRepositories)
      .where(
        and(
          eq(companyGithubRepositories.organizationId, DEMO_ORGANIZATION_ID),
          eq(companyGithubRepositories.companyId, companyId),
          sql`lower(${companyGithubRepositories.repository}) = lower(${canonicalName})`,
        ),
      )
      .limit(1);
    if (!existing) return res.status(409).json({ error: "Repository mapping already exists" });
    return res.status(201).json(AddCompanyGitHubRepositoryResponse.parse(serializeRepository(existing)));
  } catch (error) {
    return next(error);
  }
});

router.delete("/companies/:companyId/github-repositories/:repositoryId", async (req, res, next) => {
  try {
    await ensureDemoData();
    const { companyId, repositoryId } = DeleteCompanyGitHubRepositoryParams.parse(req.params);
    const [deleted] = await db
      .delete(companyGithubRepositories)
      .where(
        and(
          eq(companyGithubRepositories.id, repositoryId),
          eq(companyGithubRepositories.companyId, companyId),
          eq(companyGithubRepositories.organizationId, DEMO_ORGANIZATION_ID),
        ),
      )
      .returning({ id: companyGithubRepositories.id });
    if (!deleted) return res.status(404).json({ error: "Repository mapping not found" });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/companies/:companyId", async (req, res, next) => {
  try {
    await ensureDemoData();
    const { companyId } = GetCompanyParams.parse(req.params);
    const [company] = await db
      .select()
      .from(discoveredCompanies)
      .where(
        and(
          eq(discoveredCompanies.id, companyId),
          eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID),
        ),
      )
      .limit(1);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    return res.json(GetCompanyResponse.parse(serializeCompany(company)));
  } catch (error) {
    return next(error);
  }
});

export default router;