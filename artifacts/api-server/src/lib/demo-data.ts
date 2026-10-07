import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  discoveredCompanies,
  githubEventSnapshots,
  organizations,
  portfolioSources,
  savedSearches,
  signalAlerts,
  users,
} from "@workspace/db";
import { logger } from "./logger";

export const DEMO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000002";

const companySeed = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    companyName: "Kiteframe",
    website: "https://kiteframe.dev",
    foundersList: [
      { name: "Maya Perera", title: "Co-founder & CEO", linkedinHandle: "mayaperera" },
      { name: "Ruwan Silva", title: "Co-founder & CTO", linkedinHandle: "ruwansilva" },
    ],
    productDescription:
      "A developer infrastructure layer that turns fragmented deployment workflows into a single, observable control plane for lean engineering teams.",
    lastFundingRound: "Seed" as const,
    fundingAmountEstimated: "1800000",
    fundingCurrency: "USD",
    knownInvestors: ["GroundUp Ventures", "Hatch Works"],
    behavioralMetrics: {
      builderResilienceScore: 91,
      problemSolvingNotes:
        "Repeatedly rebuilt around a hard API constraint and shipped a working migration path within two weeks.",
      commitVelocitySpike: 340,
    },
    regionalMetadata: {
      geographyRegion: "South Asia",
      specificCountry: "Sri Lanka",
      businessModel: "B2B",
      sector: "Developer Tools",
      employeeCount: 8,
    },
    signalScore: 94,
    signalLabel: "High signal",
    source: "GitHub activity",
    logoLetter: "K",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    companyName: "Lattice Health",
    website: "https://latticehealth.co",
    foundersList: [
      { name: "Anika Rao", title: "Founder & CEO", linkedinHandle: "anika-rao" },
    ],
    productDescription:
      "Care coordination software helping distributed clinics share context, reduce missed follow-ups, and make chronic care less reactive.",
    lastFundingRound: "Pre-Seed" as const,
    fundingAmountEstimated: "650000",
    fundingCurrency: "USD",
    knownInvestors: ["Cinnamon Angels"],
    behavioralMetrics: {
      builderResilienceScore: 83,
      problemSolvingNotes:
        "Moved from a consumer prototype to a clinic-first workflow after early adoption surfaced a trust gap.",
      commitVelocitySpike: 215,
    },
    regionalMetadata: {
      geographyRegion: "South Asia",
      specificCountry: "India",
      businessModel: "B2B2C",
      sector: "Healthtech",
      employeeCount: 5,
    },
    signalScore: 82,
    signalLabel: "Promising",
    source: "Portfolio scan",
    logoLetter: "L",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    companyName: "Nami Protocol",
    website: "https://nami.network",
    foundersList: [
      { name: "Jun Park", title: "Co-founder", linkedinHandle: "junpark" },
      { name: "Sora Kim", title: "Co-founder & CTO", linkedinHandle: "sorakim" },
    ],
    productDescription:
      "A compliance-first data exchange for modern logistics operators, making cross-border documentation machine-readable from day one.",
    lastFundingRound: "Seed" as const,
    fundingAmountEstimated: "2400000",
    fundingCurrency: "USD",
    knownInvestors: ["SignalFire Asia", "Northstar Labs"],
    behavioralMetrics: {
      builderResilienceScore: 87,
      problemSolvingNotes:
        "Open-source experiments show unusual persistence through regulatory edge cases and careful constraint mapping.",
      commitVelocitySpike: 178,
    },
    regionalMetadata: {
      geographyRegion: "East Asia",
      specificCountry: "South Korea",
      businessModel: "B2B",
      sector: "Regtech",
      employeeCount: 13,
    },
    signalScore: 78,
    signalLabel: "Promising",
    source: "GitHub activity",
    logoLetter: "N",
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    companyName: "Rill Commerce",
    website: "https://rillcommerce.id",
    foundersList: [
      { name: "Dimas Putra", title: "Founder & CEO", linkedinHandle: "dimasputra" },
    ],
    productDescription:
      "A lightweight operating system for independent retailers to launch, stock, and finance neighborhood commerce across Southeast Asia.",
    lastFundingRound: "Series A" as const,
    fundingAmountEstimated: "8500000",
    fundingCurrency: "USD",
    knownInvestors: ["East Ventures", "Peak XV Partners"],
    behavioralMetrics: {
      builderResilienceScore: 72,
      problemSolvingNotes:
        "Strong execution cadence and high customer feedback volume, with a recent expansion into embedded finance.",
      commitVelocitySpike: 121,
    },
    regionalMetadata: {
      geographyRegion: "Southeast Asia",
      specificCountry: "Indonesia",
      businessModel: "B2B2C",
      sector: "Fintech",
      employeeCount: 46,
    },
    signalScore: 66,
    signalLabel: "Watch",
    source: "Portfolio scan",
    logoLetter: "R",
  },
];

let seedPromise: Promise<void> | undefined;

export function ensureDemoData() {
  const sampleDataEnabled = process.env.DEMO_SEED_DATA === "true";
  seedPromise ??= (async () => {
    const existingOrg = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, DEMO_ORGANIZATION_ID))
      .limit(1);
    if (existingOrg.length) {
      if (sampleDataEnabled) await ensureDemoSignalData();
      return;
    }

    await db.insert(organizations).values({
      id: DEMO_ORGANIZATION_ID,
      companyName: sampleDataEnabled ? "Northstar Ventures" : "My venture desk",
      subscriptionTier: "Free",
      subscriptionStatus: "active",
    });
    await db.insert(users).values({
      id: DEMO_USER_ID,
      email: sampleDataEnabled ? "partner@northstar.vc" : "local@localhost",
      passwordHash: null,
      role: "Admin",
      organizationId: DEMO_ORGANIZATION_ID,
    });
    if (!sampleDataEnabled) return;
    await db.insert(discoveredCompanies).values(
      companySeed.map((company) => ({
        ...company,
        organizationId: DEMO_ORGANIZATION_ID,
      })),
    );
    await ensureDemoSignalData();
    await db.insert(savedSearches).values([
      {
        id: "00000000-0000-4000-8000-000000000201",
        userId: DEMO_USER_ID,
        organizationId: DEMO_ORGANIZATION_ID,
        name: "South Asia / Seed / B2B",
        filterParams: {
          search: "",
          region: ["South Asia"],
          country: [],
          stage: ["Seed"],
          businessModel: ["B2B"],
          sector: [],
        },
        isActive: true,
      },
      {
        id: "00000000-0000-4000-8000-000000000202",
        userId: DEMO_USER_ID,
        organizationId: DEMO_ORGANIZATION_ID,
        name: "High signal builders",
        filterParams: {
          search: "",
          region: [],
          country: [],
          stage: [],
          businessModel: [],
          sector: [],
        },
        isActive: true,
      },
    ]);
    await db.insert(portfolioSources).values([
      {
        id: "00000000-0000-4000-8000-000000000301",
        urlLink: "https://northstar.vc/portfolio",
        status: "Pending",
        companyCount: 0,
        organizationId: DEMO_ORGANIZATION_ID,
      },
    ]);
    logger.info("Seeded VentureForge demo organization");
  })().catch((error) => {
    seedPromise = undefined;
    throw error;
  });
  return seedPromise;
}

async function ensureDemoSignalData() {
  const [existingAlert] = await db
    .select({ id: signalAlerts.id })
    .from(signalAlerts)
    .where(eq(signalAlerts.organizationId, DEMO_ORGANIZATION_ID))
    .limit(1);
  if (!existingAlert) {
    await db.insert(signalAlerts).values({
      id: "00000000-0000-4000-8000-000000000401",
      organizationId: DEMO_ORGANIZATION_ID,
      companyId: companySeed[0].id,
      rule: "weekend_velocity_300",
      title: "Pre-Intent Stealth Alert",
      description: "Weekend commit velocity spiked 340% for a tracked developer.",
      severity: "high",
      percentageChange: 340,
      detectedAt: new Date(Date.now() - 1000 * 60 * 24),
    });
  }

  const existingSnapshot = await db
    .select({ id: githubEventSnapshots.id })
    .from(githubEventSnapshots)
    .where(eq(githubEventSnapshots.organizationId, DEMO_ORGANIZATION_ID))
    .limit(1);
  if (!existingSnapshot.length) {
    const currentWeekendStart = new Date();
    currentWeekendStart.setUTCHours(0, 0, 0, 0);
    currentWeekendStart.setUTCDate(currentWeekendStart.getUTCDate() - ((currentWeekendStart.getUTCDay() + 2) % 7));
    await db.insert(githubEventSnapshots).values(
      [1, 2, 1].map((weekendCommitCount, index) => {
        const windowStart = new Date(currentWeekendStart);
        windowStart.setUTCDate(windowStart.getUTCDate() - (index + 1) * 7);
        const windowEnd = new Date(windowStart);
        windowEnd.setUTCDate(windowEnd.getUTCDate() + 3);
        return {
          organizationId: DEMO_ORGANIZATION_ID,
          companyId: companySeed[0].id,
          windowStart,
          windowEnd,
          weekendCommitCount,
          eventCount: weekendCommitCount,
          observedAt: windowEnd,
          source: "GitHub Events baseline",
        };
      }),
    );
  }
}

export const demoCompanies = companySeed;
