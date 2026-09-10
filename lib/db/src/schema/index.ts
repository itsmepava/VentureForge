import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "Free",
  "Pro",
  "Enterprise",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
]);
export const companyStageEnum = pgEnum("company_stage", [
  "Pre-Seed",
  "Seed",
  "Series A",
]);
export const portfolioStatusEnum = pgEnum("portfolio_status", [
  "Pending",
  "Scanned",
  "Error",
]);

export const providerConnections = pgTable("provider_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  encryptedValues: text("encrypted_values").notNull(),
  status: text("status").notNull().default("active"),
  lastVerifiedAt: timestamp("last_verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const githubEventSnapshots = pgTable(
  "github_event_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => discoveredCompanies.id),
    windowStart: timestamp("window_start").notNull(),
    windowEnd: timestamp("window_end").notNull(),
    weekendCommitCount: integer("weekend_commit_count").notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    observedAt: timestamp("observed_at").notNull().defaultNow(),
    source: text("source").notNull().default("GitHub Events"),
  },
  (table) => [
    uniqueIndex("github_event_snapshots_org_company_window_unique").on(
      table.organizationId,
      table.companyId,
      table.windowStart,
    ),
  ],
);

export const signalAlerts = pgTable(
  "signal_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: uuid("company_id").references(() => discoveredCompanies.id),
    rule: text("rule").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull().default("high"),
    percentageChange: integer("percentage_change"),
    windowStart: timestamp("window_start"),
    windowEnd: timestamp("window_end"),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("signal_alerts_org_company_rule_window_unique").on(
      table.organizationId,
      table.companyId,
      table.rule,
      table.windowStart,
    ),
  ],
);

export const companyGithubRepositories = pgTable(
  "company_github_repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => discoveredCompanies.id),
    repository: text("repository").notNull(),
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    verificationError: text("verification_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("company_github_repositories_org_repo_unique").on(
      table.organizationId,
      sql`lower(${table.repository})`,
    ),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyName: text("company_name").notNull(),
    subscriptionTier: subscriptionTierEnum("subscription_tier")
      .notNull()
      .default("Free"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: subscriptionStatusEnum("subscription_status")
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("organizations_stripe_customer_unique")
      .on(table.stripeCustomerId)
      .where(sql`${table.stripeCustomerId} is not null`),
    uniqueIndex("organizations_stripe_subscription_unique")
      .on(table.stripeSubscriptionId)
      .where(sql`${table.stripeSubscriptionId} is not null`),
  ],
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("Member"),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const discoveredCompanies = pgTable("discovered_companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyName: text("company_name").notNull(),
  website: text("website").notNull(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  foundersList: jsonb("founders_list").notNull().$type<
    Array<{ name: string; title: string; linkedinHandle: string | null }>
  >(),
  productDescription: text("product_description").notNull(),
  lastFundingRound: companyStageEnum("last_funding_round").notNull(),
  fundingAmountEstimated: numeric("funding_amount_estimated").notNull(),
  fundingCurrency: text("funding_currency").notNull().default("USD"),
  knownInvestors: jsonb("known_investors").notNull().$type<string[]>(),
  behavioralMetrics: jsonb("behavioral_metrics").notNull().$type<{
    builderResilienceScore: number;
    problemSolvingNotes: string;
    commitVelocitySpike: number;
  }>(),
  regionalMetadata: jsonb("regional_metadata").notNull().$type<{
    geographyRegion: string;
    specificCountry: string;
    businessModel: string;
    sector: string;
    employeeCount: number;
  }>(),
  signalScore: integer("signal_score").notNull(),
  signalLabel: text("signal_label").notNull(),
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
  source: text("source").notNull(),
  logoLetter: text("logo_letter").notNull(),
});

export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  filterParams: jsonb("filter_params").notNull().$type<{
    search: string;
    region: string[];
    country: string[];
    stage: string[];
    businessModel: string[];
    sector: string[];
  }>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const portfolioSources = pgTable("portfolio_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  urlLink: text("url_link").notNull(),
  status: portfolioStatusEnum("status").notNull().default("Pending"),
  companyCount: integer("company_count").notNull().default(0),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations);
export const insertUserSchema = createInsertSchema(users);
export const insertCompanySchema = createInsertSchema(discoveredCompanies);
export const insertSavedSearchSchema = createInsertSchema(savedSearches);
export const insertPortfolioSourceSchema = createInsertSchema(portfolioSources);
export const insertProviderConnectionSchema = createInsertSchema(providerConnections);
export const insertGitHubEventSnapshotSchema = createInsertSchema(githubEventSnapshots);
export const insertSignalAlertSchema = createInsertSchema(signalAlerts);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type DiscoveredCompany = typeof discoveredCompanies.$inferSelect;
export type SavedSearch = typeof savedSearches.$inferSelect;
export type PortfolioSource = typeof portfolioSources.$inferSelect;
export type ProviderConnection = typeof providerConnections.$inferSelect;
export type GitHubEventSnapshot = typeof githubEventSnapshots.$inferSelect;
export type SignalAlert = typeof signalAlerts.$inferSelect;
export const emptyJson = sql`'{}'::jsonb`;
export { z };