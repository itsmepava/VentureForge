# VentureForge

VentureForge is an AI-assisted sourcing desk for emerging venture managers, surfacing early company and founder signals across South Asia, Southeast Asia, and East Asia.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/ventureforge run dev` — run the web dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (development only)
- Required secure env: `DATABASE_URL`, `JWT_SECRET`, `FERNET_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter + TanStack Query
- API: Express 5 with typed OpenAPI-generated contracts
- Database: PostgreSQL + Drizzle ORM
- Validation: Zod and generated API schemas
- Visual language: Space Grotesk, Manrope, DM Mono; ink navy, paper, chartreuse signal accent

## Where things live

- `artifacts/ventureforge/src/App.tsx` — dashboard shell and product routes
- `artifacts/ventureforge/src/index.css` — VentureForge visual tokens and responsive styles
- `artifacts/api-server/src/routes/` — dashboard, discovery, saved search, portfolio, provider, and billing endpoints
- `artifacts/api-server/src/lib/providers.ts` — organization-scoped provider connection registry
- `artifacts/api-server/src/lib/vault.ts` — Fernet encryption boundary for provider values
- `artifacts/api-server/src/lib/demo-data.ts` — development-only tenant seed data
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/db/src/schema/index.ts` — tenant-aware PostgreSQL schema

## Architecture decisions

- The first product surface is API-backed rather than a static mock, so dashboard interactions survive refreshes and route changes.
- The browser is presentation-only; nightly scans, provider calls, signal scoring, retries, and destination delivery belong in the API server and its scheduled worker.
- Every seeded read and write path includes an organization constraint; authentication is the next boundary to replace the development tenant identity.
- The workspace’s existing Node/Express/Drizzle runtime is retained for this first build so the generated React client, database package, and managed workflows remain compatible.
- Provider credentials are represented only through environment names and protected integrations; they are never placed in source or UI copy as if already connected.

## Product

- Discovery desk with keyword search plus stage, region, country, sector, and behavioral signal filtering
- Dropdown filters for stage, region, country, and sectors such as Fintech, Regtech, Healthtech, and Developer Tools
- Company brief with founder signals, resilience notes, commit velocity, funding, and investors
- Dashboard summary, cadence, and recent sourcing activity
- Saved search creation, replay, and deletion
- Portfolio URL scan queue and source history
- Protected GitHub, Stripe, Notion, Google Sheets, and Slack connection status
- Encrypted provider vault fallback with verification and disconnect controls
- Signed Stripe webhook endpoint with optional Stripe schema sync and subscription updates
- Settings surface for organization, planned integrations, billing, and data posture

## Gotchas

- Run API codegen after every OpenAPI change before importing new client hooks.
- The API is mounted at `/api`; use the shared proxy for local requests.
- The current development seed uses a single tenant identity until the auth boundary is added.
- `STRIPE_SYNC_ENABLED` defaults to false so an unconnected Stripe integration never prevents the API from starting; enable it only after Stripe is connected.