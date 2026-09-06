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
ZenStack's own plugin system rather than inventing a new schema language: a
plugin is a Node module (TS is fine, loaded via `jiti`, no build step) that
default-exports a `CliPlugin` whose `generate({ model, defaultOutputPath,
pluginOptions })` receives the parsed ZModel AST directly — see
[`docs/plugin-api-notes.md`](./docs/plugin-api-notes.md) for how this was
confirmed against v3's actual types (there is no "Prisma DMMF" in v3; that
was a v2-era detail this project no longer relies on).

## Scope

Three ZenStack plugins, one shared AST-traversal core, one example app
proving the round trip:

```
packages/
  generator-core/            [done] Shared IR builder over the real ZModel AST
                              (DataField/DataFieldType -> IrModel/IrField: scalar,
                              relation, or enum)
  plugin-jazz-schema/        [done] IR -> Jazz CoValue definitions (co.map/co.list,
                              getter-form relations, matching field types)
  plugin-ts-rest-contract/   [done] IR -> ts-rest contract (Effect Schema wrapped via
                              Schema.standardSchemaV1), one CRUD contract per model
                              marked @@tsRestContract -- pinned to @ts-rest/core@3.53.0-rc.1
  plugin-betterauth-claims/  [ ] IR -> typed role/claims definitions consumed by both
                              ZenStack @@allow policies and BetterAuth session config
examples/
  pos-inventory-demo/        [done, partial] StaffMember/Order/InventoryItem/OrderLineItem
                              schema + Role enum, exercising plugin-jazz-schema AND
                              plugin-ts-rest-contract (Order + InventoryItem marked
                              @@tsRestContract); still needs plugin-betterauth-claims and
                              the cross-artifact compile-time check described below
```

Deliberately **not** a Turborepo monorepo — this is a tooling project in the
shape of `zenstack`/`zod-prisma` itself (a small set of packages plus an
example), not a multi-app product; a plain pnpm workspace is the right size.

## Milestones

- [x] **M0 — Discovery spike**: the real API turned out different from the
  guess above — see [`docs/plugin-api-notes.md`](./docs/plugin-api-notes.md)
  for the ground-truth plugin contract (`CliPlugin.generate({ model,
  defaultOutputPath, pluginOptions })`, confirmed against installed
  `@zenstackhq/sdk@3.9.4-beta.1` types, not docs prose — the docs site
  404s on every URL that shows up in search results; v3 restructured them).
- [x] **M1 — `generator-core`**: neutral IR (`IrModel`/`IrField`, scalar vs.
  relation vs. enum) built via `@zenstackhq/sdk`'s `ModelUtils.getOwnedFields`
  over the real `DataField`/`DataFieldType` AST shapes. See
  `packages/generator-core/src/index.ts`.
- [x] **M2 — `plugin-jazz-schema`**: emits a `.ts` file with `co.map({...})`
  per model; relations use the getter form (`get x() { return ... }`) jazz-tools'
  own docs use for forward/circular refs, not `co.ref`. Round-trip verified:
  `examples/pos-inventory-demo` runs the real `zen` CLI, and the generated
  output type-checks (`tsc --strict --skipLibCheck`) against a real
  `jazz-tools@0.20.19` install. See `packages/plugin-jazz-schema/index.ts`
  and `docs/plugin-api-notes.md`.
- [x] **M3 — `plugin-ts-rest-contract`**: emits a `c.router({...})` CRUD
  contract (list/getById/create/update/remove) per `@@tsRestContract`-marked
  model, with Effect `Schema.Struct` field schemas wrapped in
  `Schema.standardSchemaV1(...)`. Verified both by type-check and at
  runtime (`~standard.validate(...)` called directly against real,
  generated output). **Important caveat**: this only works because
  `@ts-rest/core` is pinned to `3.53.0-rc.1` — the current stable release
  has no Standard Schema support at all and is Zod-only. See
  `packages/plugin-ts-rest-contract/index.ts` and
  `docs/plugin-api-notes.md`.
- [ ] **M4 — `plugin-betterauth-claims`**: emit a `Role`/claims union type from a
  schema-level `Role` enum (or custom attribute), consumed both by
  `@@allow` policy expressions and by a BetterAuth session-claims type —
  proving one enum drives both authorization systems.
- [ ] **M5 — `examples/pos-inventory-demo`** (partially done): schema exists
  (`StaffMember`, `Order`, `InventoryItem`, `OrderLineItem`, `Role`) and both
  `plugin-jazz-schema` and `plugin-ts-rest-contract` run against it for real
  (`Order`/`InventoryItem` marked `@@tsRestContract`) — still missing
  `plugin-betterauth-claims` and the cross-artifact compile-time assertion
  that all generated artifacts agree on shape.
- [ ] **M6 — CLI + packaging**: `npx schema-codegen-bridge generate` wrapping the
  three plugins; README documents the "why," not just the "how."
- [ ] **M7 — stretch**: publish to npm; wire `pos-offline-reconciliation`'s
  `packages/db` and `packages/jazz-schema` to actually consume this tool,
  closing the loop described in that repo's plan.

## Definition of done for the POC

Editing one field in `examples/pos-inventory-demo`'s `.zmodel` — say, adding
a field to `Order` — and running one generate command updates the Jazz
schema, the ts-rest contract, and the claims types together, with a failing
compile-time check if any of the three fall out of sync.

## Open questions / risks

Resolved by the M0/M2 spike (see `docs/plugin-api-notes.md` for detail):
- ZenStack's AST exposes exactly the relation/attribute metadata needed —
  `DataFieldType.reference` plus `ModelUtils` helpers — no DMMF, no
  re-parsing raw `.zmodel` text required.
- Jazz relations are generated as plain getters returning the referenced
  `co.map`/`co.list`, not a `co.ref()` call — there is no `co.ref` in the
  jazz-tools API surface we found; the PLAN originally guessed wrong here.

Still open:
- Custom attributes with a `.` in the name (originally-planned
  `@@generate.contract`) are unverified — real examples only show plain
  identifiers. M3 needs to spike this before assuming it works, and likely
  rename to something like `@@tsRestContract`.
- `BigInt`/`Decimal`/`Bytes` scalar fields have no confirmed jazz-tools
  primitive — currently mapped to lossy approximations with inline `TODO`s
  in generated output; needs a real answer before any money field in
  `pos-offline-reconciliation` goes through this generator.
- This project intentionally does not attempt to generate Jazz *permission
  group* logic from ZenStack `@@allow` policies — the two permission models
  are different enough (row-level SQL predicates vs. CRDT group membership)
  that forcing a 1:1 mapping would likely produce something worse than
  hand-written policy code in each system. Scoped out, not solved.
