# Prisma/ZenStack Schema Codegen Bridge

A single-source-of-truth code generator: define your data model **once** as a
ZenStack `.zmodel` schema, and derive every downstream typed artifact a
local-first, offline-capable app needs from it — instead of hand-maintaining
parallel schemas that drift.

This is POC #2 of two. The companion project,
[pos-offline-reconciliation](https://github.com/standard-librarian/pos-offline-reconciliation),
currently hand-maintains its Jazz CoValue schema and its ZenStack `.zmodel` as
two separate files (`packages/db` and `packages/jazz-schema`) — this project
exists to make that duplication unnecessary.

## Why this project

`zod-prisma` generates Zod schemas from a Prisma schema. ZenStack generates an
access-policy-enforcing Prisma client from an extended schema. Both are
instances of the same idea: **one schema, one generator, no drift**. That
idea stops halfway through the stack today — nothing derives a **Jazz CoValue
schema**, a **ts-rest contract**, or **BetterAuth role/claims types** from the
same source. This project extends that idea the rest of the way, using
ZenStack's own plugin system (a Node module exporting `name` / `description` /
a default function that receives the ZModel AST and the Prisma DMMF) rather
than inventing a new schema language.

## Scope

Three ZenStack plugins, one shared AST-traversal core, one example app
proving the round trip:

```
packages/
  generator-core/            Shared helpers for walking the ZModel AST / Prisma DMMF
                              (field types, relations, attributes -> a neutral IR)
  plugin-jazz-schema/        IR -> Jazz CoValue class definitions (CoMap/CoList,
                              co.ref for relations, matching field types)
  plugin-ts-rest-contract/   IR -> ts-rest contract with Effect Schema validators,
                              one CRUD/read contract per model marked `@@generate.contract`
  plugin-betterauth-claims/  IR -> typed role/claims definitions consumed by both
                              ZenStack @@allow policies and BetterAuth session config
examples/
  pos-inventory-demo/        A tiny Order/InventoryItem schema exercising all
                              three plugins, with a small script proving the
                              generated Jazz schema, ts-rest contract, and
                              claims types agree with each other at compile time
```

Deliberately **not** a Turborepo monorepo — this is a tooling project in the
shape of `zenstack`/`zod-prisma` itself (a small set of packages plus an
example), not a multi-app product; a plain pnpm workspace is the right size.

## Milestones

- **M0 — Discovery spike**: confirm the exact plugin function signature
  ZenStack expects (`(model, options, dmmf) => void | Promise<void>`, per
  current docs) and what's available on the AST vs. what needs deriving by
  hand; write findings into `docs/plugin-api-notes.md` before committing to
  an IR shape.
- **M1 — `generator-core`**: a neutral intermediate representation (model
  name, fields with base type + optionality + relation info, attributes)
  built by walking the ZModel AST once, shared by all three plugins so none
  of them re-implements AST traversal.
- **M2 — `plugin-jazz-schema`**: emit a `.ts` file per model with a Jazz
  `co.map({...})` definition; relations become `co.ref(() => OtherModel)`;
  round-trip test: generated CoValue schema compiles and Jazz accepts it.
- **M3 — `plugin-ts-rest-contract`**: emit a ts-rest contract per model
  marked with a custom `@@generate.contract` attribute, with Effect Schema
  (Standard Schema) validators derived from the same field types — proving
  ts-rest's Standard Schema support is enough to avoid a second validator
  library.
- **M4 — `plugin-betterauth-claims`**: emit a `Role`/claims union type from a
  schema-level `Role` enum (or custom attribute), consumed both by
  `@@allow` policy expressions and by a BetterAuth session-claims type —
  proving one enum drives both authorization systems.
- **M5 — `examples/pos-inventory-demo`**: a minimal schema (`Order`,
  `InventoryItem`, `Role`) run through all three generators, plus a
  compile-time assertion test that the three generated artifacts describe
  the same shape (e.g. every field on the Jazz CoValue also appears in the
  ts-rest contract).
- **M6 — CLI + packaging**: `npx schema-codegen-bridge generate` wrapping the
  three plugins; README documents the "why," not just the "how."
- **M7 — stretch**: publish to npm; wire `pos-offline-reconciliation`'s
  `packages/db` and `packages/jazz-schema` to actually consume this tool,
  closing the loop described in that repo's plan.

## Definition of done for the POC

Editing one field in `examples/pos-inventory-demo`'s `.zmodel` — say, adding
a field to `Order` — and running one generate command updates the Jazz
schema, the ts-rest contract, and the claims types together, with a failing
compile-time check if any of the three fall out of sync.

## Open questions / risks

- ZenStack's plugin API is oriented around emitting files from the DMMF;
  need to confirm it exposes enough relation/attribute metadata to build
  Jazz's `co.ref` relations without re-parsing the raw `.zmodel` text.
- Custom attributes (e.g. `@@generate.contract`) need to be registered so
  ZenStack's linter doesn't reject them — to be confirmed in the M0 spike.
- This project intentionally does not attempt to generate Jazz *permission
  group* logic from ZenStack `@@allow` policies — the two permission models
  are different enough (row-level SQL predicates vs. CRDT group membership)
  that forcing a 1:1 mapping would likely produce something worse than
  hand-written policy code in each system. Scoped out, not solved.
