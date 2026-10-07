# VentureForge

VentureForge automates company sourcing for venture capital investors anywhere.
Each investor defines investment mandates; the app discovers prospects,
researches public evidence, checks investment fit, and maintains a contact queue.
The goal is to leave the investor with informed conversations and investment judgment.

This is **v2.1.0-alpha.1**, a local testing milestone built on the existing
React/Vite, Express, PostgreSQL and pnpm workspace. It has no Replit runtime or
package dependencies. It is not yet a complete production SaaS.

## Run locally

Install Node.js 24, Git and pnpm 12.4.1. No Docker, system PostgreSQL,
Replit account or payment setup is needed.

```bash
git clone --branch prerelease/automated-sourcing https://github.com/itsmepava/VentureForge.git
cd VentureForge
corepack enable
pnpm install --frozen-lockfile
pnpm local
```

Open http://127.0.0.1:18612/.

The launcher starts PostgreSQL 16, the API and Vite on loopback. It creates
local credentials and stores persistent records in ignored `.local/`.
Press Ctrl+C to stop; restarting preserves your work. Web/API/database ports
default to 18612/8080/55432 and can be overridden with `DEMO_WEB_PORT`,
`DEMO_API_PORT` and `DEMO_DATABASE_PORT`.

The default database, `ventureforge_local`, contains no sample companies.
`DEMO_SEED_DATA=true` explicitly enables legacy visual fixtures in the separate
`ventureforge_demo` database. `pnpm demo` aliases `pnpm local` and does not
enable fixtures by itself. Never treat fixture records as sourced companies.

## Automatic sourcing

1. Create a mandate with sectors and optional headquarters geographies,
   funding stages, business models, required signals and exclusions. Blank
   geography means worldwide. Alternatives within the first four groups are
   OR; all required signals and all exclusions must be satisfied.
2. Configure your own OpenRouter key in **Research provider**. It is encrypted
   in the local vault and never returned to the browser. The milestone accepts
   `openrouter/free` and models ending in `:free`, without paid fallback.
   Environment overrides `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` work for
   manually started API deployments. No model key is bundled.
3. Select **Scan now**, or enable a scan every 24 hours while the app is running.
   The app searches the public web with FreeSerp, extracts up to five company
   candidates, researches founders/contact/product/traction/funding, and saves
   evidence-backed assessments in PostgreSQL. No email or call is sent.
4. Review the contact queue, source excerpts, publication dates and missing
   facts. Record calls, save notes or dismiss prospects. Export all prospects
   as formula-safe CSV. Rescans update research while preserving call outcomes.

Without a model key, scans perform real searches and retain the evidence with
**Research model needed** status; they do not invent prospects. Provider errors
and partial results are visible in run history. A key marked configured has
been saved, not verified: the first model request verifies usability.

Scans make three discovery searches, at most two research searches per
candidate, and at most six model requests. Runs record attempted request counts
and provider-reported tokens. This is usage visibility, not a billing ledger.
Free provider availability, coverage, quotas and output quality apply.

Research currently uses indexed search titles and excerpts, not full website
crawling or premium company databases. Published dates remain unknown when
the provider supplies none. Model assertions must cite an exact source excerpt;
unsupported facts/checks are removed or marked unknown. Founder names and
contact details must occur in their supporting quote. Readiness additionally
requires sourced founder/contact/website/description, every mandate check
matching, and activity evidence published within 180 days. These are model
assessments, not independent fact checks or guarantees of company eligibility.

Deduplication is by company website hostname **within each mandate**. The same
company may appear under different mandates. Rebrands and alternate domains
are not yet reconciled. No cheque-size filter is offered until reliable
financial evidence can support it. There are no invented signal scores.

The worker is designed for one local API process. Daily scheduling resumes
when the app runs; queued runs persist and interrupted runs are labeled on
restart. It does not run while the laptop/app is off. Multi-replica worker
coordination, cancellation and production authentication are future work.

## Supporting tools

`/research` fetches real public GitHub repository metadata and up to 300
default-branch commits from the last 30 days. Counts retain their window and
timestamp; capped counts are labeled lower bounds. Repeat research updates
the same record, and CSV exports stored evidence. Anonymous rate limits apply;
an optional GitHub token can be stored in Settings. Repository activity does
not establish founder identity, funding, traction or company quality.

Workspace settings, source URL storage, legacy saved filters and existing
CSV/PDF company exports remain available. The older scored discovery UI is
preserved at `/discovery` for compatibility and appears in navigation only in
fixture mode. Its records are separate from the new evidence-based queue.
Portfolio URL storage is not yet connected to automatic page ingestion.

Stripe uses the official SDK and raw-payload signature verification. It has
no Replit sync service. Billing is not activated for local sourcing; future
GCP hosting, organization login/access controls and token-based pricing remain
separate milestones. Do not expose this local workspace publicly.

## Development and verification

```bash
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-server test
# Against a disposable/local PostgreSQL database:
pnpm --filter @workspace/api-server run test:integration
```

Integration tests isolate schemas and cover provider-key encryption/redaction,
missing-provider behavior, full sourcing with controlled upstream responses,
deduplication, notes across rescans/restarts, interrupted runs, PDF exports and
Stripe signature/order handling. Test provider fixtures are loaded only by
the integration test; the local app uses the real provider endpoints.

Read [HANDOVER.md](HANDOVER.md) for architecture and deployment details.
Application migrations are append-only and run transactionally before listen.
API contracts live in `lib/api-spec/openapi.yaml`; regenerate with
`pnpm --filter @workspace/api-spec run codegen` rather than editing generated code.

All milestones must be pushed to GitHub and published as prereleases with
release notes and validation results. The `v2.0.0` tag remains immutable.
