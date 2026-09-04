import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetCompanyParams,
  GetCompanyResponse,
  ListCompaniesQueryParams,
  ListCompaniesResponse,
} from "@workspace/api-zod";
import { db, discoveredCompanies } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { serializeCompany } from "../lib/serializers";

const router: IRouter = Router();

function asArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

router.get("/companies", async (req, res, next) => {
  try {
    await ensureDemoData();
    const params = ListCompaniesQueryParams.parse({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      region: asArray(req.query.region),
      country: asArray(req.query.country),
      stage: asArray(req.query.stage),
      businessModel: asArray(req.query.businessModel),
      sector: asArray(req.query.sector),
    });
    const filters = [eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID)];
    const companies = await db
      .select()
      .from(discoveredCompanies)
      .where(and(...filters))
      .orderBy(discoveredCompanies.signalScore);
    const regionFiltered = companies.filter((company) => {
      const metadata = company.regionalMetadata;
      const searchable = [
        company.companyName,
        company.productDescription,
        company.website,
        company.knownInvestors.join(" "),
        company.foundersList.map((founder) => `${founder.name} ${founder.title}`).join(" "),
      ].join(" ").toLowerCase();
      const searchMatches =
        !params.search || searchable.includes(params.search.toLowerCase());
      const regionMatches =
        !params.region?.length ||
        params.region.includes(metadata.geographyRegion);
      const countryMatches =
        !params.country?.length ||
        params.country.includes(metadata.specificCountry);
      const stageMatches =
        !params.stage?.length ||
        params.stage.includes(company.lastFundingRound);
      const modelMatches =
        !params.businessModel?.length ||
        params.businessModel.includes(metadata.businessModel);
      const sector = serializeCompany(company).regionalMetadata.sector;
      const sectorMatches =
        !params.sector?.length ||
        params.sector.includes(sector);
      return searchMatches && regionMatches && countryMatches && stageMatches && modelMatches && sectorMatches;
    });
    return res.json(ListCompaniesResponse.parse(regionFiltered.reverse().map(serializeCompany)));
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