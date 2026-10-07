import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";
import {
  db,
  discoveredCompanies,
  signalAlerts,
  portfolioSources,
} from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { buildActivityItems } from "../lib/dashboard-activity";

import { buildDashboardSummary } from "../lib/dashboard-summary";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const companies = await db
      .select()
      .from(discoveredCompanies)
      .where(eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID));
    const summary = buildDashboardSummary(companies);
    return res.json(GetDashboardSummaryResponse.parse(summary));
  } catch (error) {
    return next(error);
  }
});

router.get("/dashboard/activity", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const [companies, source, alerts] = await Promise.all([
      db
        .select()
        .from(discoveredCompanies)
        .where(eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID))
        .orderBy(desc(discoveredCompanies.discoveredAt))
        .limit(3),
      db
        .select()
        .from(portfolioSources)
        .where(eq(portfolioSources.organizationId, DEMO_ORGANIZATION_ID))
        .orderBy(desc(portfolioSources.createdAt))
        .limit(1),
      db
        .select()
        .from(signalAlerts)
        .where(eq(signalAlerts.organizationId, DEMO_ORGANIZATION_ID))
        .orderBy(desc(signalAlerts.detectedAt))
        .limit(5),
    ]);
    const items = buildActivityItems(companies, source[0], alerts);
    return res.json(GetDashboardActivityResponse.parse(items));
  } catch (error) {
    return next(error);
  }
});

export default router;