---
name: Application migration safety
description: Durable rules for VentureForge startup migrations and populated-database upgrades.
---

Application-owned migrations must run before the API listens, inside one transaction protected by a transaction-scoped advisory lock. Once released, migration IDs and SQL are append-only.

**Why:** Multiple replicas can start together, older replicas can continue writing during rolling deployment, and historical databases can have different physical column order or data valid under earlier constraints.

**How to apply:** Lock affected tables before reconciling and tightening uniqueness. Archive displaced rows, use deterministic retention rules, and always name destination columns in migration inserts. Verify fresh, populated, concurrent-runner, concurrent-writer, and rollback cases.