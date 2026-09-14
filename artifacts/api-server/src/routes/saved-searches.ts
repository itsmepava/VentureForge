import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateSavedSearchBody,
  CreateSavedSearchResponse,
  DeleteSavedSearchParams,
  ListSavedSearchesResponse,
} from "@workspace/api-zod";
import { db, discoveredCompanies, savedSearches } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, DEMO_USER_ID, ensureDemoData } from "../lib/demo-data";
import { serializeCompany, serializeSavedSearch } from "../lib/serializers";

const router: IRouter = Router();

router.get("/saved-searches", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const [searches, companies] = await Promise.all([
      db
        .select()
        .from(savedSearches)
        .where(
          and(
            eq(savedSearches.userId, DEMO_USER_ID),
            eq(savedSearches.organizationId, DEMO_ORGANIZATION_ID),
          ),
        )
        .orderBy(desc(savedSearches.createdAt)),
      db
        .select()
        .from(discoveredCompanies)
        .where(eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID)),
    ]);
    const data = searches.map((search) => {
      const filters = search.filterParams;
      const sectors = filters.sector ?? [];
      const matchCount = companies.filter((company) => {
        const metadata = company.regionalMetadata;
        return (
          (!filters.region.length || filters.region.includes(metadata.geographyRegion)) &&
          (!filters.country.length || filters.country.includes(metadata.specificCountry)) &&
          (!filters.stage.length || filters.stage.includes(company.lastFundingRound)) &&
          (!filters.businessModel.length || filters.businessModel.includes(metadata.businessModel)) &&
          (!sectors.length || sectors.includes(serializeCompany(company).regionalMetadata.sector))
        );
      }).length;
      return serializeSavedSearch(search, matchCount);
    });
    return res.json(ListSavedSearchesResponse.parse(data));
  } catch (error) {
    return next(error);
  }
});

router.post("/saved-searches", async (req, res, next) => {
  try {
    await ensureDemoData();
    const body = CreateSavedSearchBody.parse(req.body);
    const [search] = await db
      .insert(savedSearches)
      .values({
        name: body.name,
        filterParams: body.filterParams,
        userId: DEMO_USER_ID,
        organizationId: DEMO_ORGANIZATION_ID,
      })
      .returning();
    return res.status(201).json(CreateSavedSearchResponse.parse(serializeSavedSearch(search, 0)));
  } catch (error) {
    return next(error);
  }
});

router.delete("/saved-searches/:searchId", async (req, res, next) => {
  try {
    await ensureDemoData();
    const { searchId } = DeleteSavedSearchParams.parse(req.params);
    const deleted = await db
      .delete(savedSearches)
      .where(
        and(
          eq(savedSearches.id, searchId),
          eq(savedSearches.userId, DEMO_USER_ID),
          eq(savedSearches.organizationId, DEMO_ORGANIZATION_ID),
        ),
      )
      .returning({ id: savedSearches.id });
    if (!deleted.length) return res.status(404).json({ error: "Saved search not found" });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;