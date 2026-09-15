# VentureForge handover

This document is the operational handoff for Claude Code or another engineer
working from the GitHub repository. It describes the current `v2.0.0` product
foundation and the boundaries that are intentionally not finished yet.

## Current handoff target

Use the GitHub `main` branch for the latest workspace state:

```bash
git clone https://github.com/itsmepava/VentureForge.git
cd VentureForge
git checkout main
```

The `v2.0.0` tag is an immutable release baseline. The latest handoff
documentation and external-hosting cleanup live on `main`, not on that older
release tag.

Before changing code, Claude Code should read both `README.md` and this file,
then run:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

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
| `STRIPE_SYNC_ENABLED` | `false` | Enables Stripe schema sync and backfill |
| `STRIPE_WEBHOOK_BASE_URL` | `https://ventureforge.example.com` | Public HTTPS base used for the Stripe webhook URL |
| `RESEND_API_KEY` | `resend-api-key-placeholder` | Optional email delivery provider |
| `LLM_API_KEY` | `llm-api-key-placeholder` | Optional model/provider access |
| `LOG_LEVEL` | `info` | Optional server logging level |

### Frontend/build variables

| Variable | Placeholder | Purpose |
| --- | --- | --- |
| `BASE_PATH` | `/` | Vite base path for the web artifact |
| `VITE_API_BASE_URL` | empty for same-origin deployment | Optional external API origin; use only when the frontend and API are on different domains |

`REPL_ID`, `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, and
`WEB_REPL_RENEWAL` are platform-provided development values. They are not
required for an external Node/GCE deployment.

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
- The current development identity is a seeded demo organization/user. The
  production authentication and authorization boundary is not complete.
- Demo data is intentionally seeded for the demo organization so the dashboard
  has useful content in a fresh local database. Do not treat it as live
  enrichment or a production tenant.
- `STRIPE_SYNC_ENABLED=false` is the safe default. When enabled, Stripe
  credentials and an HTTPS `STRIPE_WEBHOOK_BASE_URL` are required.
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
3. Live provider credentials and real enrichment/scanning pipelines.
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