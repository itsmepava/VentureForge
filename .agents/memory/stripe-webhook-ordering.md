---
name: Stripe webhook ordering
description: Durable rules for tenant-safe Stripe subscription webhook processing.
---

Verified subscription events must resolve an organization from explicit Stripe identities, refresh the canonical subscription state, and update the tenant binding with compare-and-swap predicates based on the observed IDs. A deletion that no longer matches the organization’s current subscription is stale and must not clear the replacement.

**Why:** Stripe can deliver events out of order and concurrently. Applying a valid but older event directly can move billing state between tenants or revoke a newer subscription.

**How to apply:** Keep identity validation and organization resolution pure and tested. Treat unknown subscriptions as no-ops, reject cross-tenant identity conflicts, and add end-to-end replay/concurrency coverage around the signature-verified HTTP route.