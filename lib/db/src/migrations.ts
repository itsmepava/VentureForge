import type { Pool } from "pg";

type Migration = {
  id: string;
  sql: string;
};

export const applicationMigrations: Migration[] = [
  {
    id: "0001_ventureforge_baseline",
    sql: `
DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('Free', 'Pro', 'Enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE company_stage AS ENUM ('Pre-Seed', 'Seed', 'Series A');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE portfolio_status AS ENUM ('Pending', 'Scanned', 'Error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  subscription_tier subscription_tier NOT NULL DEFAULT 'Free',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status subscription_status NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  role text NOT NULL DEFAULT 'Member',
  organization_id uuid NOT NULL REFERENCES organizations(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS discovered_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  website text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  founders_list jsonb NOT NULL,
  product_description text NOT NULL,
  last_funding_round company_stage NOT NULL,
  funding_amount_estimated numeric NOT NULL,
  funding_currency text NOT NULL DEFAULT 'USD',
  known_investors jsonb NOT NULL,
  behavioral_metrics jsonb NOT NULL,
  regional_metadata jsonb NOT NULL,
  signal_score integer NOT NULL,
  signal_label text NOT NULL,
  discovered_at timestamp NOT NULL DEFAULT now(),
  source text NOT NULL,
  logo_letter text NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  filter_params jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS portfolio_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url_link text NOT NULL,
  status portfolio_status NOT NULL DEFAULT 'Pending',
  company_count integer NOT NULL DEFAULT 0,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  label text NOT NULL,
  encrypted_values text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS github_event_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  company_id uuid NOT NULL REFERENCES discovered_companies(id),
  window_start timestamp NOT NULL,
  window_end timestamp NOT NULL,
  weekend_commit_count integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  observed_at timestamp NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'GitHub Events'
);
CREATE TABLE IF NOT EXISTS signal_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  company_id uuid REFERENCES discovered_companies(id),
  rule text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  percentage_change integer,
  window_start timestamp,
  window_end timestamp,
  detected_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS company_github_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  company_id uuid NOT NULL REFERENCES discovered_companies(id),
  repository text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamp,
  last_checked_at timestamp,
  verification_error text,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE company_github_repositories ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE company_github_repositories ADD COLUMN IF NOT EXISTS verified_at timestamp;
ALTER TABLE company_github_repositories ADD COLUMN IF NOT EXISTS last_checked_at timestamp;
ALTER TABLE company_github_repositories ADD COLUMN IF NOT EXISTS verification_error text;
ALTER TABLE signal_alerts ADD COLUMN IF NOT EXISTS window_start timestamp;
ALTER TABLE signal_alerts ADD COLUMN IF NOT EXISTS window_end timestamp;

`,
  },
  {
    id: "0002_reconcile_signal_and_repository_uniqueness",
    sql: `
CREATE TABLE IF NOT EXISTS github_event_snapshot_duplicates_archive AS
  SELECT *, now()::timestamp AS archived_at, ''::text AS archive_reason
  FROM github_event_snapshots
  WITH NO DATA;
CREATE TABLE IF NOT EXISTS company_github_repository_conflicts_archive AS
  SELECT *, now()::timestamp AS archived_at, ''::text AS archive_reason
  FROM company_github_repositories
  WITH NO DATA;

LOCK TABLE github_event_snapshots, company_github_repositories, signal_alerts
  IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY organization_id, company_id, window_start
      ORDER BY observed_at DESC, id DESC
    ) AS duplicate_rank
  FROM github_event_snapshots
)
INSERT INTO github_event_snapshot_duplicates_archive (
  id, organization_id, company_id, window_start, window_end,
  weekend_commit_count, event_count, observed_at, source,
  archived_at, archive_reason
)
SELECT id, organization_id, company_id, window_start, window_end,
  weekend_commit_count, event_count, observed_at, source,
  now(), 'Superseded duplicate for the same company and weekend window'
FROM ranked
WHERE duplicate_rank > 1;

WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY organization_id, company_id, window_start
      ORDER BY observed_at DESC, id DESC
    ) AS duplicate_rank
  FROM github_event_snapshots
)
DELETE FROM github_event_snapshots target
USING ranked
WHERE target.id = ranked.id AND ranked.duplicate_rank > 1;

DROP INDEX IF EXISTS company_github_repositories_org_company_repo_unique;
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY organization_id, lower(repository)
      ORDER BY verified DESC, last_checked_at DESC NULLS LAST,
        verified_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS conflict_rank
  FROM company_github_repositories
)
INSERT INTO company_github_repository_conflicts_archive (
  id, organization_id, company_id, repository, verified, verified_at,
  last_checked_at, verification_error, created_at,
  archived_at, archive_reason
)
SELECT id, organization_id, company_id, repository, verified, verified_at,
  last_checked_at, verification_error, created_at,
  now(), 'Repository was also mapped to another company in this organization'
FROM ranked
WHERE conflict_rank > 1;

WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY organization_id, lower(repository)
      ORDER BY verified DESC, last_checked_at DESC NULLS LAST,
        verified_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS conflict_rank
  FROM company_github_repositories
)
DELETE FROM company_github_repositories target
USING ranked
WHERE target.id = ranked.id AND ranked.conflict_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS company_github_repositories_org_repo_unique
  ON company_github_repositories (organization_id, lower(repository));
CREATE UNIQUE INDEX IF NOT EXISTS github_event_snapshots_org_company_window_unique
  ON github_event_snapshots (organization_id, company_id, window_start);
CREATE UNIQUE INDEX IF NOT EXISTS signal_alerts_org_company_rule_window_unique
  ON signal_alerts (organization_id, company_id, rule, window_start);
`,
  },
  {
    id: "0003_secure_organization_stripe_bindings",
    sql: `
CREATE TABLE IF NOT EXISTS archived_organization_stripe_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  conflict_field text NOT NULL,
  archived_at timestamp NOT NULL DEFAULT now()
);

LOCK TABLE organizations IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT id, stripe_customer_id,
    row_number() OVER (
      PARTITION BY stripe_customer_id
      ORDER BY created_at ASC, id ASC
    ) AS conflict_rank
  FROM organizations
  WHERE stripe_customer_id IS NOT NULL
)
INSERT INTO archived_organization_stripe_conflicts (
  organization_id, stripe_customer_id, stripe_subscription_id, conflict_field
)
SELECT organization.id, organization.stripe_customer_id,
  organization.stripe_subscription_id, 'stripe_customer_id'
FROM organizations organization
JOIN ranked ON ranked.id = organization.id
WHERE ranked.conflict_rank > 1;

WITH ranked AS (
  SELECT id, stripe_customer_id,
    row_number() OVER (
      PARTITION BY stripe_customer_id
      ORDER BY created_at ASC, id ASC
    ) AS conflict_rank
  FROM organizations
  WHERE stripe_customer_id IS NOT NULL
)
UPDATE organizations organization
SET stripe_customer_id = NULL
FROM ranked
WHERE organization.id = ranked.id AND ranked.conflict_rank > 1;

WITH ranked AS (
  SELECT id, stripe_subscription_id,
    row_number() OVER (
      PARTITION BY stripe_subscription_id
      ORDER BY created_at ASC, id ASC
    ) AS conflict_rank
  FROM organizations
  WHERE stripe_subscription_id IS NOT NULL
)
INSERT INTO archived_organization_stripe_conflicts (
  organization_id, stripe_customer_id, stripe_subscription_id, conflict_field
)
SELECT organization.id, organization.stripe_customer_id,
  organization.stripe_subscription_id, 'stripe_subscription_id'
FROM organizations organization
JOIN ranked ON ranked.id = organization.id
WHERE ranked.conflict_rank > 1;

WITH ranked AS (
  SELECT id, stripe_subscription_id,
    row_number() OVER (
      PARTITION BY stripe_subscription_id
      ORDER BY created_at ASC, id ASC
    ) AS conflict_rank
  FROM organizations
  WHERE stripe_subscription_id IS NOT NULL
)
UPDATE organizations organization
SET stripe_subscription_id = NULL
FROM ranked
WHERE organization.id = ranked.id AND ranked.conflict_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_customer_unique
  ON organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_subscription_unique
  ON organizations (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
`,
  },
];

export async function runApplicationMigrations(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["ventureforge_application_migrations"],
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS _ventureforge_migrations (
        id text PRIMARY KEY,
        applied_at timestamp NOT NULL DEFAULT now()
      )
    `);
    for (const migration of applicationMigrations) {
      const applied = await client.query(
        "select 1 from _ventureforge_migrations where id = $1",
        [migration.id],
      );
      if (applied.rowCount) continue;
      await client.query(migration.sql);
      await client.query(
        "insert into _ventureforge_migrations (id) values ($1)",
        [migration.id],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}