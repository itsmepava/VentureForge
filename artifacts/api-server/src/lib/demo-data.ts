import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  discoveredCompanies,
  organizations,
  portfolioSources,
  savedSearches,
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
  seedPromise ??= (async () => {
    const existingOrg = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, DEMO_ORGANIZATION_ID))
      .limit(1);
    if (existingOrg.length) return;

    await db.insert(organizations).values({
      id: DEMO_ORGANIZATION_ID,
      companyName: "Northstar Ventures",
      subscriptionTier: "Pro",
      subscriptionStatus: "active",
    });
    await db.insert(users).values({
      id: DEMO_USER_ID,
      email: "partner@northstar.vc",
      passwordHash: null,
      role: "Admin",
      organizationId: DEMO_ORGANIZATION_ID,
    });
    await db.insert(discoveredCompanies).values(
      companySeed.map((company) => ({
        ...company,
        organizationId: DEMO_ORGANIZATION_ID,
      })),
    );
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
        },
        isActive: true,
      },
    ]);
    await db.insert(portfolioSources).values([
      {
        id: "00000000-0000-4000-8000-000000000301",
        urlLink: "https://northstar.vc/portfolio",
        status: "Scanned",
        companyCount: 12,
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

export const demoCompanies = companySeed;