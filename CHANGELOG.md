# Changelog

## v2.1.0-alpha.1 — Automated sourcing local milestone

VentureForge now opens on an automated sourcing desk. Investment mandates
support any geography, sectors, funding stages, business models, required
signals and exclusions. On-demand and daily scans collect real web evidence,
use a configured free research model to discover and assess companies, and
save a contact queue with source excerpts and visible gaps.

- Persistent mandate snapshots, scan progress, errors and reported usage.
- Encrypted OpenRouter configuration; no paid-model fallback or bundled key.
- Missing models retain search evidence without generating placeholder prospects.
- Founder/contact provenance, conservative readiness checks and dated activity.
- Domain deduplication per mandate, research refresh, call notes and CSV export.
- Interrupted scans labeled on restart; scheduling requires the app to be on.
- Cross-platform local launcher with persistent PostgreSQL 16 and generated secrets.
- Real public GitHub metadata/30-day activity research and saved CSV exports.
- Persisted workspace preferences and dashboard totals based on stored records.
- No Replit runtime packages or credential domains; native Stripe verification.
- Loopback hosting and restricted browser origins for local testing.
- Updated README/HANDOVER and generated API clients from the OpenAPI contract.

Validation: complete workspace typecheck/build, 29 unit tests and four isolated
PostgreSQL integration tests. The sourcing integration uses controlled upstream
responses to verify extraction, research, key encryption/redaction,
missing-provider handling, deduplication and persistence across rescans/restarts.
Existing mixed-script PDF exports and Stripe verification/order checks pass.
A live keyless scan made three actual FreeSerp searches and retained 30 results.
Real model-provider research remains unverified until a user key is configured.

Limits: this is a single-user, single-process local milestone. Research uses
indexed search excerpts, with bounded candidates and model-dependent
interpretation; readiness is not an independent fact check. No full-page
crawling, reliable financial database, cross-domain entity resolution,
production tenant authorization, GCP deployment or usage billing is included.
Legacy scored fixtures remain opt-in and separate from the sourcing queue.
Local database files, provider keys and personal scan results are excluded
from the repository and release.
