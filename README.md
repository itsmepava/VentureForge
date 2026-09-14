# VentureForge v2.0.0

VentureForge is an AI-assisted sourcing desk for emerging venture managers. It
surfaces early company and founder signals across South Asia, Southeast Asia,
and East Asia, with discovery filters, saved searches, portfolio scanning,
provider connections, billing, and export workflows.

## Repository stack

This repository is a pnpm workspace, not a Python or Expo project:

- Node.js 24 and TypeScript 5.9
- React, Vite, Wouter, and TanStack Query for the web dashboard
- Express 5 for the API
- PostgreSQL and Drizzle ORM for persistence
- Zod and OpenAPI-generated contracts for validation and client hooks

There is intentionally no `requirements.txt`, `requirements.json`,
`pyproject.toml`, Prisma schema, or Expo application. The Node `package.json`
files and `pnpm-lock.yaml` are the dependency source of truth.

## Repository layout

- `artifacts/ventureforge` — React/Vite web dashboard
- `artifacts/api-server` — Express API, workers, exports, webhooks, and billing
- `lib/api-spec` — OpenAPI source of truth
- `lib/api-client-react` — generated React API client
- `lib/db` — Drizzle schema and application migrations
- `.env.example` — environment variable template
- `.replit-artifact/artifact.toml` files — Replit development and deployment metadata

## Prerequisites

- Node.js 24
- pnpm
- PostgreSQL 16 or a compatible PostgreSQL service

Install dependencies:

```bash
pnpm install
```

Create a local environment file from the template:

```bash
cp .env.example .env
```

Set at least `DATABASE_URL`, `JWT_SECRET`, and `FERNET_KEY`. Keep `.env`
outside Git and provide provider credentials through your deployment secret
manager.

## Development

Run the API and web dashboard in separate terminals:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/ventureforge run dev
```

The API is mounted at `/api`. Application migrations run before the API starts.
The development workflow uses the configured Replit artifact ports; when
running directly, set `PORT` to the port expected by your local proxy.

## Validation

Run the complete workspace typecheck and build:

```bash
pnpm run typecheck
pnpm run build
```

Run API unit and route-level integration tests:

```bash
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server run test:integration
```

The integration suite creates temporary PostgreSQL schemas and cleans them up
after each run. It covers filtered PDF downloads and the signed Stripe webhook
route, including unknown tenants, cross-tenant conflicts, canonical Stripe
retrieval failures, invalid signatures, and stale concurrent subscription
delivery.

## External deployment

Build the web dashboard and API:

```bash
pnpm --filter @workspace/ventureforge run build
pnpm --filter @workspace/api-server run build
```

Serve the web artifact from
`artifacts/ventureforge/dist/public` with SPA fallback rewrites to
`index.html`. Run the API artifact with a PostgreSQL connection:

```bash
NODE_ENV=production \
PORT=8080 \
node artifacts/api-server/dist/index.mjs
```

The API startup process applies application migrations before listening. Use a
deployment process that runs one API instance during the first schema upgrade,
or otherwise preserves PostgreSQL transaction and advisory-lock behavior.

Required runtime variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `FERNET_KEY`

Optional provider and worker variables are documented in `.env.example`.
`STRIPE_SYNC_ENABLED=false` is the safe default. When Stripe sync is enabled,
configure the Stripe credentials and an HTTPS, credential-free
`STRIPE_WEBHOOK_BASE_URL`.

## Release

The current release milestone is tagged `v2.0.0`:

```bash
git checkout v2.0.0
```

Before publishing a new release, run the validation commands above, confirm
the database migration state, and create a new annotated version tag.