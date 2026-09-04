import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetCompanyParams,
  GetCompanyResponse,
  ListCompaniesQueryParams,
  ListCompaniesResponse,
} from "@workspace/api-zod";
import { db, discoveredCompanies } from "@workspace/db";
import { companiesToCsv, companiesToPdf } from "../lib/company-exports";
import { matchesCompanyFilters } from "../lib/company-filters";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { serializeCompany } from "../lib/serializers";

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