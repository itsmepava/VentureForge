# VentureForge

VentureForge is an AI-assisted sourcing desk for emerging venture managers. It
helps an investment team discover early companies and founder behavior signals
across South Asia, Southeast Asia, and East Asia. The product combines
discovery filters, company briefs, portfolio scans, saved searches, provider
connections, billing status, and CSV/PDF exports in one organization-oriented
workspace.

This repository is the `v2.0.0` release line. It is a Node/pnpm monorepo using
React/Vite, Express, Drizzle, and PostgreSQL. It is not a Python, FastAPI,
Prisma, Expo, or native mobile application.

For the latest handoff state, use the `main` branch. The `v2.0.0` tag is the
immutable release baseline; the latest README, `HANDOVER.md`, ignore rules, and
external-hosting notes are maintained on `main`.

## Current state

### Implemented and validated

- React/Vite web dashboard with responsive discovery, saved-search, portfolio,
  settings, and company-detail surfaces.
- Company discovery filters for keyword, stage, region, country, business
  model, sector, and behavioral signal.
- Sector coverage including Fintech and Regtech.
- Company briefs with founder information, funding context, investors,
  behavioral metrics, signal scores, and source labels.
- Dashboard summary and activity endpoints.
- Saved-search create, replay, and delete flows.
- Portfolio source queue and scan-history flows.
- CSV and filtered PDF company exports.
- Provider connection status, encrypted organization vault values,
  verification, test delivery, and disconnect flows for the supported
  GitHub, Stripe, Notion, Google Sheets, and Slack providers.
- Express API mounted at `/api`, with `/api/healthz` for deployment health
  checks.
- OpenAPI-generated React hooks and Zod schemas.
- PostgreSQL schema and application migrations through Drizzle.
- Startup migrations with PostgreSQL advisory locking and duplicate/conflict
  reconciliation.
- Signed Stripe webhook handling with signature verification, explicit tenant
  identity resolution, canonical Stripe subscription retrieval, compare-and-
  swap ordering, and stale-delivery protection.
- API unit tests and route-level integration tests for exports and Stripe
  webhook behavior.
- Root typecheck, API build, web build, mockup build, and API integration
  validation.

### Important incomplete areas

The current build is a validated product foundation, not a finished
multi-tenant production SaaS. Claude Code must treat these as known work:

- Authentication is not yet the production identity boundary. Development
  routes use the seeded demo organization/user identity; partner accounts,
  private organization workspaces, membership roles, and authorization
  enforcement still need to be completed.
- Demo company, portfolio, activity, and signal data is seeded by the API for
  the demo organization. Live enrichment and provider-backed sourcing require
  real provider credentials and production data pipelines.
- Provider UI and server-side verification are implemented, but no provider
  account is connected in this repository. Secrets must be supplied at
  runtime, never committed.
- Stripe webhook ordering is hardened, but full replay idempotency and
  duplicate-event suppression still need a final production pass.
- Migration safety still needs release checksum/change detection and a
  dedicated upgrade-failure check.
- Archived Stripe/mapping conflicts need an administrator resolution workflow.
- CSV coverage and large-export memory safety need additional production-sized
  tests and implementation hardening.
- The frontend is a web application. There is no iOS, Android, Expo, or React
  Native application in this repository.

## Technical architecture

### Runtime

- Node.js 24
- TypeScript 5.9
- pnpm workspaces
- React, Vite, Wouter, and TanStack Query
- Express 5
- PostgreSQL with `pg`
- Drizzle ORM
- Zod and OpenAPI-generated contracts/client hooks
- Stripe SDK and server-side provider workers

### Request and data flow

1. The browser loads the Vite-built dashboard.
2. The dashboard calls the Express API through `/api`.
3. The API validates request/response shapes using shared generated schemas.
4. Drizzle reads and writes PostgreSQL with organization-scoped records.
5. Provider calls, scans, exports, webhooks, and scheduled work remain
   server-side.
6. Application migrations run before the API begins listening.

For a single-domain deployment, serve the web build at `/` and reverse proxy
`/api/*` to the API process. This is the simplest deployment shape because the
generated browser client uses `/api` as its default base path.

## Repository structure

```text
.
├── artifacts/
│   ├── api-server/
│   │   ├── src/
│   │   │   ├── routes/       # health, discovery, dashboard, portfolio,
│   │   │   │                  # saved searches, integrations, billing
│   │   │   ├── lib/          # providers, vault, exports, workers, webhooks
│   │   │   └── integration/  # PostgreSQL-backed route tests
│   │   ├── build.mjs
│   │   └── package.json
│   ├── mockup-sandbox/       # isolated component preview artifact
│   └── ventureforge/
│       ├── src/
│       │   ├── App.tsx       # dashboard shell and product routes
│       │   ├── components/   # UI components
│       │   ├── pages/        # route pages
│       │   └── index.css     # visual tokens and responsive styles
│       ├── vite.config.ts
│       └── package.json
├── lib/
│   ├── api-client-react/     # generated React Query client and custom fetch
│   ├── api-spec/             # OpenAPI source of truth and codegen
│   ├── api-zod/              # generated API validation types
│   └── db/                   # Drizzle schema and application migrations
├── scripts/                  # workspace utility scripts
├── .env.example              # placeholder environment template
├── HANDOVER.md               # Claude Code and external-hosting handover
├── package.json              # root workspace scripts and shared dependencies
├── pnpm-lock.yaml            # dependency lockfile
├── pnpm-workspace.yaml       # workspace/catalog configuration
├── replit.md                 # collaborator-facing project context
└── tsconfig*.json            # TypeScript project configuration
```

Replit-local deployment metadata is ignored for the external handoff. The
source repository does not depend on Replit to build or run the Node
application.

## Prerequisites

- Node.js 24
- pnpm
- PostgreSQL 16 or a compatible PostgreSQL service
- Git

Install dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Create local configuration:

```bash
cp .env.example .env
```

Replace the placeholder values in `.env` with local-only values. Never commit
`.env`.

## Local development

Run the API and web dashboard in separate terminals:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/ventureforge run dev
```

The API listens on the configured `PORT` and is mounted at `/api`. The Vite
dashboard uses its configured development port. When running outside Replit,
set `PORT` and `BASE_PATH` explicitly if your proxy expects different values.

## Validation commands

Run the complete workspace typecheck and build:

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

The integration suite creates temporary PostgreSQL schemas and removes them
after each test. It requires a valid `DATABASE_URL`.

Regenerate API clients after changing the OpenAPI contract:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## External deployment

Build both production artifacts:

```bash
pnpm --filter @workspace/ventureforge run build
pnpm --filter @workspace/api-server run build
```

Serve the web output from:

```text
artifacts/ventureforge/dist/public
```

Run the API with:

```bash
NODE_ENV=production \
PORT=8080 \
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

The API applies application migrations before listening. Start one API
instance during the first production schema upgrade, or otherwise preserve the
PostgreSQL transaction and advisory-lock behavior.

For Google Compute Engine, a practical layout is a Node systemd service on
localhost:8080 plus Caddy or Nginx serving the web output and proxying
`/api/*` to the API. Keep PostgreSQL managed or separately backed up.

## Release and Git workflow

The current release tag is `v2.0.0`:

```bash
git checkout v2.0.0
```

To work from the latest GitHub handoff instead:

```bash
git clone https://github.com/itsmepava/VentureForge.git
cd VentureForge
git checkout main
pnpm install --frozen-lockfile
```

For normal development:

```bash
git checkout main
git pull --ff-only origin main
```

Before a release:

1. Run typecheck, build, unit tests, and integration tests.
2. Confirm the database migration state.
3. Review `git diff --check`.
4. Create an annotated version tag.
5. Push the branch and tag to the external repository.

See `HANDOVER.md` for the complete environment list, operating assumptions,
deployment notes, and Claude Code handoff instructions.