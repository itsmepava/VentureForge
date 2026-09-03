# MASTER PROMPT: Project VentureForge v2.0.0 (Production-Ready SaaS Build)

We are building Version 2.0.0 of this repository — pivoting from a single-user Streamlit script into a standalone, multi-tenant institutional SaaS platform called **"VentureForge"**: an independent AI-powered company discovery and investment-sourcing tool for venture capitalists.

This platform targets a blindspot left by enterprise legacy tools (like Harmonic and Specter): it serves individual emerging managers on a self-serve **$100–$300/mo Stripe-backed subscription tier**, tracks pre-intent behavioral builder traits rather than stale LinkedIn updates, and offers hyper-vertical, niche regional parsing.

**Repository handling:** Read the existing data-parsing and portfolio-link-processing logic before touching anything. Rebuild the frontend and backend architectures from scratch per the spec below, but do this as commits on top of the existing repository — do NOT reinitialize git or delete `.git`. Preserve full commit history, then tag the final state of this rebuild as release `v2.0.0`.

---

## 1. Tech Stack & Framework Boundaries

- **Frontend:** Single codebase using **React Native with Expo**, built specifically for **React Native for Web** compatibility. The UI must dynamically scale and render as a responsive web dashboard for desktop browsers and as a native mobile layout on iOS/Android. Avoid any platform-only packages (native modules with no web shim) that would break cross-compatibility — check each library against Expo's web support before adding it.
- **Backend:** **Python (FastAPI)** for core scraping, crawling, and AI-parsing microservices.
- **Database & ORM:** **PostgreSQL** with **Prisma**. Note: Prisma's first-party client is JS/TS-native — use **`prisma-client-py`** to drive it from FastAPI. If `prisma-client-py`'s feature set can't support a requirement below (e.g. a specific migration or query pattern), flag it explicitly rather than silently substituting a different ORM.
- **Auth:** JWT-based session auth. Every authenticated request resolves to a `user_id` + `organization_id`; all data-layer reads/writes are scoped by `organization_id` at the query level (not just at the API-response filtering level).

## 2. Multi-Tenant Database Schema

All tables below must enforce `organization_id` isolation on every read/write path.

- **Organization:** `id`, `company_name`, `subscription_tier` (Free, Pro [$100/mo], Enterprise [$300/mo]), `stripe_customer_id`, `stripe_subscription_id`, `subscription_status` (active, past_due, canceled).
- **User:** `id`, `email`, `password_hash`, `role` (Admin, Member), `organization_id`.
- **PortfolioSource:** `id`, `url_link`, `status` (Pending, Scanned, Error), `organization_id`.
- **DeveloperTarget:** `id`, `github_handle`, `developer_name`, `baseline_activity_score`, `tracking_status`, `organization_id`.
- **DiscoveredCompany:** `id`, `company_name`, `website`, `organization_id`, plus:
  - `founders_list` — JSON array of `{name, title, linkedin_handle}`
  - `product_description` — deep structural summary (text)
  - `last_funding_round` — enum: Pre-Seed, Seed, Series A
  - `funding_amount_estimated` — numeric with currency field
  - `known_investors` — JSON array of co-investors on the cap table
  - `behavioral_metrics` — JSON: `builder_resilience_score`, `problem_solving_notes`, `commit_velocity_spike`
  - `regional_metadata` — `geography_region`, `specific_country`, `business_model`, `employee_count`
- **SavedSearch:** `id`, `user_id`, `organization_id`, `filter_params` (JSON), `created_at`.

## 3. Automated Nightly Background Worker (Pre-Intent Builder Tracking)

- Implement a background scheduler inside FastAPI using **APScheduler**, wired into the async `lifespan` context, running every night at **00:00**.
- The worker iterates the `DeveloperTarget` table and fetches recent activity from the public GitHub Events API:
  `https://api.github.com/users/{username}/events/public`
- **Behavioral logic:**
  - Intercept `CreateEvent`s where the new repo is initialized with a Next.js, Expo, or FastAPI framework signature.
  - Track weekend `PushEvent` volume against a rolling 90-day baseline per developer.
  - If weekend commit activity spikes **300%+** above baseline, fire a high-signal **"Pre-Intent Stealth Alert"** into the dashboard notification feed.
- Respect GitHub's unauthenticated rate limits (60 req/hr) — use a GitHub App token or PAT for the worker so it can scale past a handful of tracked developers.

## 4. Deep AI Enrichment & Behavioral Sourcing Pipeline

Triggered when a partner submits a portfolio link, or when a GitHub activity alert fires.

- Crawl the relevant text (site copy, README, launch notes, commit messages) and feed it into an LLM parsing pipeline.
- Extract core signals: founders, product description, last funding round, funding amount, co-investors.
- **Behavioral sourcing:** prompt the LLM to evaluate qualitative founder attributes — "resilience," "unconventional problem-solving" — from code/commit/launch-note context, and append these as scored fields on the company profile.
- **Regional classification:** normalize output into structured JSON, bucketed into:
  - South Asia: India, Sri Lanka, Bangladesh, Pakistan
  - Southeast Asia: Singapore, Indonesia, Malaysia
  - East Asia: Japan, South Korea

## 5. Regional & Stage Filtering System

- Group geographies by the three operational regions above.
- Support chained filter queries (e.g. `business_model = B2B` AND `last_funding_round = Seed` AND `specific_country = Sri Lanka`).
- **Desktop layout:** multi-select filter panel on the left, next to a master/detail split-pane view.
- **Mobile layout:** collapse the same filter set into a sliding bottom-sheet drawer.

## 6. Saved Searches & Automated Alerts

- `SavedSearch` model (see schema above), tied to `user_id` + `organization_id`.
- A "Save Search" button next to the dashboard filter bar.
- A "Saved Searches" sidebar tab to re-run any saved configuration in one click.
- When a newly enriched company matches an active `SavedSearch`'s parameters, push a live notification into that user's in-app feed.

## 7. Multi-Format Data Export

- "Export List" toolbar action generating either a CSV or a styled PDF report.
- Export must reflect **exactly** the currently active filtered view — no unfiltered fallback.

## 8. Integrations & CRM Sync

- **Slack:** user provides a webhook URL; a "Send to Slack" action on each company card posts a formatted block to that channel.
- **Notion:** "Sync to Notion" creates a page in the user's pre-configured Notion database, mapped to that database's existing schema.
- **Google Sheets:** a Python-side pipeline appends a row to the user's designated spreadsheet on click.
- All three: store credentials (webhook URL, Notion token, Sheets key) encrypted at rest — see Integration Vault below.

## 9. Billing, Revenue Enforcement & Admin Controls

Restricted to users with the `Admin` role:

- **Team management:** invite via email (send a branded onboarding email through a transactional provider — Resend or SendGrid; pick one and wire it explicitly, don't leave it unimplemented), adjust roles, revoke access.
- **Integration Vault:** forms for Notion tokens, Slack webhook URLs, and Google Sheets keys. Encrypt these at rest using Fernet (symmetric encryption) with the key held in an environment variable, never in the database or source.
- **Stripe subscription pipeline:**
  - Integrate the `stripe` Python SDK on the FastAPI backend.
  - Checkout Session endpoints for the $100/mo Pro and $300/mo Enterprise tiers.
  - A webhook endpoint at `/api/v1/stripe/webhook` handling `customer.subscription.updated`, `customer.subscription.deleted`, and `checkout.session.completed`, syncing `subscription_status`/`subscription_tier` to Postgres. Verify the Stripe signature header on every request to this endpoint.
- **Revenue enforcement middleware:** a FastAPI dependency that gates feature calls and exports — if `subscription_status != active`, return `402 Payment Required` with a link to the Stripe Customer Portal.
- **Billing interface:** a dashboard block linking to the Stripe Customer Portal for usage, seat limits, and invoicing.

## 10. GitHub Repository Connection

- Native OAuth2 flow for connecting a GitHub account from app settings.
- Once connected, let the user pick an existing repo from a dropdown.
- Support staging/committing platform updates from an in-app Git pane, and tag major releases (this one as `v2.0.0`) without disrupting existing history.

## 11. Deliverables & Testing

- Structure backend code into clear modules (routers, services, workers, models) rather than one monolithic file.
- Provide test endpoints for the portfolio-scanning pipeline so it can be exercised independently of the frontend.
- Provide a `.env.example` listing every required secret (`DATABASE_URL`, `JWT_SECRET`, `GITHUB_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FERNET_KEY`, `RESEND_API_KEY` or equivalent, `LLM_API_KEY`).

---

*You can paste this directly into Replit's agent when you're ready to start the build.*
