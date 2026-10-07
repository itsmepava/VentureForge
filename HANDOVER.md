# VentureForge handover

This document is the operational handoff for Claude Code or another engineer
working from the GitHub repository. It describes the current `v2.1.0-alpha.1` product
foundation and the boundaries that are intentionally not finished yet.

## Current handoff target

Use `prerelease/automated-sourcing` for this prerelease. `main` can still hold
the older release until the prerelease is merged:

```bash
git clone https://github.com/itsmepava/VentureForge.git
cd VentureForge
git checkout prerelease/automated-sourcing
```

The `v2.0.0` tag is an immutable release baseline. The current changes are published as prereleases from the prerelease branch.
Never overwrite the previous release tag.

Before changing code, Claude Code should read both `README.md` and this file,
then run:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

## Automated sourcing milestone

The main route is now http://127.0.0.1:18612/. It is an automated sourcing
desk for investors worldwide, not an nVentures-specific geography/B2B filter.
Investment mandates persist in `sourcing_mandates`; runs retain an immutable
mandate snapshot, progress, source evidence, errors and usage in
`sourcing_runs`; company dossiers/call outcomes persist in
`sourcing_prospects`. Migration `0006_automated_sourcing` adds these tables
without rewriting the historical scored-company schema or released migrations.

The single-process worker starts after migrations. Every five seconds it
checks for due daily mandates and queued work, with one active scan. Queued
runs survive restart; running runs become interrupted. Daily scans require
the laptop and API to be on. Do not run multiple API workers in production
until cross-process leases and interrupted-run ownership are implemented.

FreeSerp supplies indexed search excerpts. OpenRouter extracts at most five
companies and researches each with two further searches. Free models only;
no paid fallback. Keys are entered in the sourcing UI, encrypted with the
existing vault and redacted from API responses. Manual API deployments can
override with OPENROUTER_API_KEY / OPENROUTER_MODEL. The launcher generates its
own database/encryption secrets; it does not automatically load a root .env.
Missing keys retain web evidence and mark needs_provider. Invalid responses,
limits and provider errors are explicit. There is no simulated success path.

Criteria are customizable lists, with no hard-coded geography. Source-backed
facts and checks are conservative but still model interpretations. Recent
dated activity evidence (180 days), sourced founders/business contact/website/
description and all criteria matching are required for readiness. Unknown
facts remain absent. Exclusions mean all prohibitions are satisfied. No scores
or missing financials are manufactured. See README for the research limits.

Domain deduplication is scoped to a mandate. Rescans refresh evidence and keep
contacted/dismissed statuses and notes. CSV exports all stored prospects;
the desk shows the latest 200 prospects and 20 runs. Token counts are reported
usage only, not billing. No communication is sent to companies.

The legacy dashboard is at /discovery and hidden from normal navigation;
its seeded/scored schema is separate from sourced dossiers. Saved portfolio
URLs remain storage only. Arbitrary page crawling, richer data providers,
founder entity matching, production identity, GCP and billing are unfinished.
Browser origins are restricted to loopback by default; set WEB_ORIGIN to the
exact deployed web origin for an external API. This does not replace auth.

Validation: full typecheck/build, 29 unit tests and four isolated database
integration tests. The sourcing integration test uses controlled provider
responses exclusively; real web search is verified separately. No real model
request has been validated without a user-supplied provider key.

## Supporting local repository research

After `pnpm install --frozen-lockfile`, run `pnpm local` and open
http://127.0.0.1:18612/research. The launcher supplies PostgreSQL 16, generated
local secrets, API startup migrations, and the Vite API proxy. No external
provider or AI key is needed for public GitHub research. Data and secrets stay
in ignored `.local/`; stop with Ctrl+C. No system PostgreSQL installation is
needed for this launcher. The manual setup below is for an external database.

The normal database is `ventureforge_local`. Optional sample fixtures use
`ventureforge_demo` only when `DEMO_SEED_DATA=true` is explicitly set.
Research is fetched from GitHub and saved in `repository_research`; metadata
and 30-day activity retain their observation window and fetch timestamp.
At most three pages of 100 commits are fetched per research request; capped
results are lower bounds. The CSV exports stored evidence with formula-safe
cells. Anonymous GitHub rate limits apply, and an optional user-supplied token
can be stored in the encrypted vault. Failures are reported without inventing
research results. Only public repositories are supported in this first flow.

Workspace preferences now persist in PostgreSQL. Discovery totals and activity
come from stored records. Portfolio URLs persist, but arbitrary portfolio-page
ingestion remains unimplemented. No Replit package or runtime is required.
Stripe uses the official SDK and signature verification, with env/vault
credentials; it has no automatic sync/backfill or webhook creation service.
Register `https://YOUR_DOMAIN/api/stripe/webhook` in Stripe when deploying.

Local use is free. GCP hosting, production identity, full-page company enrichment,
independent company fact verification, and usage/token billing remain subsequent milestones.
Do not call the whole SaaS complete based on the working research flow.

All changes must be pushed to GitHub and published as clearly labeled
prereleases with release notes and validation results, per the project owner.

## 1. First-time setup

Requirements:

- Node.js 24
- pnpm
- PostgreSQL 16 or a compatible PostgreSQL service
- Git

Clone and install:

```bash
git clone https://github.com/itsmepava/VentureForge.git
cd VentureForge
corepack enable
pnpm install --frozen-lockfile
```

If a task specifically requires the released baseline:

```bash
git checkout v2.0.0
```

Create local configuration:

```bash
cp .env.example .env
```

Replace placeholders in `.env`. Do not commit `.env`, database URLs, API keys,
tokens, passwords, or private keys.

## 2. Environment variables

### Required for the API

| Variable | Placeholder | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/ventureforge` | PostgreSQL connection used by Drizzle and startup migrations |
| `PORT` | `8080` | Port on which the API listens; the host may provide this in production |
| `JWT_SECRET` | `replace-with-a-long-random-value` | Reserved application signing secret |
| `FERNET_KEY` | `replace-with-a-long-random-value` | Input used by the encrypted provider vault |
| `NODE_ENV` | `development` | Runtime mode; use `production` in deployment |

### Optional provider, worker, and billing variables

| Variable | Placeholder | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | `github-token-placeholder` | Server-side GitHub repository/event access |
| `GITHUB_WORKER_ENABLED` | `false` | Enables the scheduled GitHub events worker |
| `GITHUB_SCAN_HOUR_UTC` | `2` | Scheduled worker hour in UTC |
| `GITHUB_WORKER_RUN_ON_STARTUP` | `false` | Runs the GitHub worker during API startup |
| `STRIPE_SECRET_KEY` | `stripe-secret-placeholder` | Stripe API access |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook-secret-placeholder` | Stripe signature verification |
| `STRIPE_WEBHOOK_BASE_URL` | `https://ventureforge.example.com` | Public HTTPS base used for the Stripe webhook URL |
| `RESEND_API_KEY` | `resend-api-key-placeholder` | Optional email delivery provider |
| `LLM_API_KEY` | `llm-api-key-placeholder` | Optional model/provider access |
| `LOG_LEVEL` | `info` | Optional server logging level |

### Frontend/build variables

| Variable | Placeholder | Purpose |
| --- | --- | --- |
| `BASE_PATH` | `/` | Vite base path for the web artifact |
| `VITE_API_BASE_URL` | empty for same-origin deployment | Optional external API origin; use only when the frontend and API are on different domains |

Provider credentials come from your environment or encrypted vault. No
platform-provided credentials or Replit account is required.

## 3. Local commands

Start the API:

```bash
pnpm --filter @workspace/api-server run dev
```

Start the dashboard in another terminal:

```bash
pnpm --filter @workspace/ventureforge run dev
```

Run the complete static checks and builds:

```bash
pnpm run typecheck
pnpm run build
```

Run API unit tests:

```bash
pnpm --filter @workspace/api-server test
```

Run PostgreSQL-backed integration tests:

```bash
pnpm --filter @workspace/api-server run test:integration
```

Regenerate clients after an OpenAPI change:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## 4. Production build and run

Build the web dashboard and API:

```bash
pnpm --filter @workspace/ventureforge run build
pnpm --filter @workspace/api-server run build
```

The web output is:

```text
artifacts/ventureforge/dist/public
```

The API output is:

```text
artifacts/api-server/dist/index.mjs
```

Run the API:

```bash
NODE_ENV=production PORT=8080 \
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

The API runs application migrations before calling `listen`. Use one API
instance for the first production upgrade and keep PostgreSQL advisory locks
and transactions intact. Do not run multiple independent migration processes
against the same database.

For a Google Compute Engine VM, run the API with systemd on `127.0.0.1:8080`.
Serve `artifacts/ventureforge/dist/public` with Caddy or Nginx and reverse
proxy `/api/*` to the API. Same-origin routing keeps the generated browser
client's `/api` base path unchanged.

## 5. Architecture decisions and quirks

- `lib/api-spec/openapi.yaml` is the API contract source of truth. Do not
  hand-edit generated API hooks or generated Zod files; regenerate them.
- The browser is presentation-only. Provider calls, scan work, exports,
  retries, webhooks, and scheduled jobs belong in the API.
- The API is mounted at `/api`. The health endpoint is `/api/healthz`.
- PostgreSQL rows carry `organizationId`, and normal data paths are intended
  to scope reads/writes to an organization.
- Local use has a single initialized organization/user. The
  production authentication and authorization boundary is not complete.
- Sample data is opt-in (`DEMO_SEED_DATA=true`) and uses a separate database.
  Live repository evidence is collected directly from GitHub.
- Stripe is optional. Supply `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
  or encrypted vault equivalents, and register the signed webhook in Stripe.
  There is no automatic provider schema sync or subscription backfill.
- Stripe webhooks require verified signatures and explicit tenant identity.
  Unknown subscriptions are ignored, cross-tenant conflicts are rejected,
  canonical Stripe state is retrieved, and stale deliveries cannot overwrite
  newer subscription state.
- Provider vault values are encrypted. Never log decrypted provider values or
  place them in frontend code.
- Migrations include conflict archival and uniqueness enforcement. Released
  migration files must not be edited in place; add a new migration instead.
- Node's strip-types test runner is used only for pure TypeScript unit modules.
  Database-backed route tests use built API output and temporary PostgreSQL
  schemas.
- The frontend is a web dashboard. There is no mobile, Expo, React Native,
  iOS, or Android app.
- Replit deployment metadata is intentionally ignored for the external
  Git/GCE handoff. `replit.md` remains as project context, not as a runtime
  dependency.

## 6. Current product boundary

Working product surfaces include discovery filters, company briefs, dashboard
summary/activity, saved searches, portfolio sources, provider settings,
billing status, CSV/PDF exports, startup migrations, and signed Stripe
webhooks.

Not yet complete:

1. Production authentication and partner account provisioning.
2. Private organization workspaces, membership roles, and authorization
   enforcement for every route.
3. Live model-provider verification with user credentials, full-page research and richer source coverage.
4. Full Stripe replay idempotency and duplicate delivery suppression.
5. Migration checksum/change detection and upgrade-failure validation.
6. Administrator resolution of archived mapping conflicts.
7. Production-scale CSV/export performance and coverage tests.

These are implementation tasks, not reasons to replace the current
React/Vite, Express, Drizzle, or PostgreSQL architecture.

## 7. Handoff checklist

Before Claude Code changes the project:

```bash
git status --short
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

After changes:

```bash
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server run test:integration
git diff --check
```

Keep secrets outside Git, review migration changes carefully, and push source
changes before deploying them to a VM.