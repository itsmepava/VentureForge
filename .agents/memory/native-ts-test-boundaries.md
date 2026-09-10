---
name: Native TypeScript test boundaries
description: Node strip-types runner compatibility with this workspace's TypeScript package exports.
---

Tests executed with Node's native TypeScript stripping should import pure leaf modules rather than modules that transitively import the workspace database package.

**Why:** The database package exports TypeScript source containing extensionless directory imports that the native Node ESM resolver rejects, even though the application bundler and TypeScript compiler accept them.

**How to apply:** Extract independently testable provider, parsing, and calculation logic into dependency-free modules. Keep database integration checks as separate commands or use a runner configured for the workspace module-resolution strategy.