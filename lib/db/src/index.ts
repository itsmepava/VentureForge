import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  companyGithubRepositories,
  discoveredCompanies,
  githubEventSnapshots,
  organizations,
  portfolioSources,
  providerConnections,
  savedSearches,
  signalAlerts,
  users,
} from "./schema/index.ts";
import { runApplicationMigrations as migrate } from "./migrations.ts";

const { Pool } = pg;
const schema = {
  companyGithubRepositories,
  discoveredCompanies,
  githubEventSnapshots,
  organizations,
  portfolioSources,
  providerConnections,
  savedSearches,
  signalAlerts,
  users,
};

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export const runApplicationMigrations = () => migrate(pool);

export * from "./schema/index.ts";
