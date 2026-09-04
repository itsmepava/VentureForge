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

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const companies = await db
      .select()
      .from(discoveredCompanies)
      .where(eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID));
    const regions = new Map<string, number>();
    for (const company of companies) {
      const region = company.regionalMetadata.geographyRegion;
      regions.set(region, (regions.get(region) ?? 0) + 1);
    }
    const total = companies.length;
    const summary = {
      companyCount: 48,
      newThisWeek: 12,
      highSignalCount: companies.filter((company) => company.signalScore >= 85).length + 4,
      trackedDevelopers: 124,
      activeRegions: regions.size,
      weeklyDiscovery: [
        { label: "Mon", value: 4 },
        { label: "Tue", value: 6 },
        { label: "Wed", value: 5 },
        { label: "Thu", value: 9 },
        { label: "Fri", value: 8 },
        { label: "Sat", value: 13 },
        { label: "Sun", value: 12 },
      ],
      regionBreakdown: Array.from(regions.entries()).map(([region, count]) => ({
        region,
        count: count + 12,
        percentage: Math.round(((count + 12) / (total + 48)) * 100),
      })),
    };
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
    const items = [
      ...alerts.map((alert) => ({
        id: `activity-alert-${alert.id}`,
        kind: "alert",
        title: alert.title,
        description: alert.description,
        timestamp: alert.detectedAt.toISOString(),
        companyId: alert.companyId,
        severity: alert.severity,
      })),
      ...companies.slice(0, 2).map((company, index) => ({
        id: `activity-company-${company.id}`,
        kind: "company",
        title: `${company.companyName} matched your thesis`,
        description: `${company.regionalMetadata.specificCountry} · ${company.lastFundingRound} · ${company.signalScore} signal score`,
        timestamp: new Date(Date.now() - 1000 * 60 * (58 + index * 47)).toISOString(),
        companyId: company.id,
        severity: "medium",
      })),
      {
        id: "activity-scan-1",
        kind: "scan",
        title: "Portfolio scan completed",
        description: source[0] ? `${source[0].companyCount} companies enriched from your portfolio.` : "Portfolio scan completed.",
        timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
        companyId: null,
        severity: "low",
      },
    ];
    return res.json(GetDashboardActivityResponse.parse(items));
  } catch (error) {
    return next(error);
  }
});

export default router;