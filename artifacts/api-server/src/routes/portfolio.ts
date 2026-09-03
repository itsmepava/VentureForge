import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreatePortfolioSourceBody,
  CreatePortfolioSourceResponse,
  ListPortfolioSourcesResponse,
} from "@workspace/api-zod";
import { db, portfolioSources } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { serializePortfolioSource } from "../lib/serializers";

const router: IRouter = Router();

router.get("/portfolio-sources", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const sources = await db
      .select()
      .from(portfolioSources)
      .where(eq(portfolioSources.organizationId, DEMO_ORGANIZATION_ID))
      .orderBy(desc(portfolioSources.createdAt));
    return res.json(ListPortfolioSourcesResponse.parse(sources.map(serializePortfolioSource)));
  } catch (error) {
    return next(error);
  }
});

router.post("/portfolio-sources", async (req, res, next) => {
  try {
    await ensureDemoData();
    const body = CreatePortfolioSourceBody.parse(req.body);
    const [source] = await db
      .insert(portfolioSources)
      .values({
        urlLink: body.urlLink,
        status: "Pending",
        companyCount: 0,
        organizationId: DEMO_ORGANIZATION_ID,
      })
      .returning();
    return res
      .status(201)
      .json(CreatePortfolioSourceResponse.parse(serializePortfolioSource(source)));
  } catch (error) {
    return next(error);
  }
});

export default router;