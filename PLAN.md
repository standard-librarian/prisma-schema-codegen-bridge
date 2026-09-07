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
  plugin-betterauth-claims/  [done] IR + ModelUtils.getAuthDecl -> BetterAuth
                              `additionalFields` (literal-array DBFieldType + a
                              Schema.standardSchemaV1 validator) for every enum field
                              on the @@auth-resolved model
  cli/                       [done] `schema-codegen-bridge generate` -- thin wrapper
                              around `zen generate` with actionable errors if a schema
                              is missing one of the three plugin blocks; published
                              (in spirit) as package name `schema-codegen-bridge`
examples/
  pos-inventory-demo/        [done] StaffMember (marked @@auth) /Order/InventoryItem/
                              OrderLineItem schema + Role enum, exercising all three
                              plugins plus real @@allow policies (auth().role ==
                              'MANAGER') via @zenstackhq/plugin-policy, plus
                              verify-shape.ts's cross-artifact compile-time + runtime
                              checks (`npm run verify`)
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
- [x] **M4 — `plugin-betterauth-claims`**: finds the `@@auth`-resolved model
  via `ModelUtils.getAuthDecl`, and for each of its enum-typed fields emits
  a BetterAuth `additionalFields` entry using `DBFieldType`'s
  `Array<LiteralString>` arm (so the field's TS type is the literal union,
  not `string`) plus a `validator` built from the same
  `Schema.standardSchemaV1(...)` bridge M3 uses. Verified at three levels:
  type-checked in isolation, type-checked wired into a real `betterAuth()`
  call (confirming `$Infer.Session['user']['role']` comes out as `'CASHIER'
  | 'MANAGER'`, not widened to `string`), and runtime-executed
  (`validator.input['~standard'].validate(...)`). The "one enum drives both
  systems" claim is now concretely demonstrated: `InventoryItem` has real
  `@@allow` rules referencing `auth().role` against the same `Role` enum.
  See `packages/plugin-betterauth-claims/index.ts` and
  `docs/plugin-api-notes.md`.
- [x] **M5 — `examples/pos-inventory-demo`**: schema (`StaffMember` marked
  `@@auth`, `Order`, `InventoryItem`, `OrderLineItem`, `Role`) runs through
  all three plugins for real, plus real `@@allow` policies via
  `@zenstackhq/plugin-policy`. `verify-shape.ts` adds the cross-artifact
  compile-time assertion: (1) the `Role` enum values emitted independently
  by all three plugins are asserted *type-equal* (not just "compatible"),
  and (2) the ts-rest contract's field keys are asserted a type-level
  subset of the Jazz CoValue's own `.shape` keys (using `CoMapSchema`'s
  public `shape` property and `Schema.Struct`'s public `fields` property —
  both confirmed by reading the installed packages' `.d.ts` files). Each
  check also has a runtime twin (`assert.deepStrictEqual`/`.every(...)`) so
  a `tsc` skip can't hide a real mismatch. **This was verified to actually
  catch drift, not just pass by construction**: deliberately mutated one
  generated file's `Role` values and confirmed both the type-check and the
  runtime check failed with a clear diagnostic, then restored it. Run the
  whole loop with `npm run verify` in `examples/pos-inventory-demo`
  (regenerates, type-checks, then runs the assertions).
- [x] **M6 — CLI + packaging**: `packages/cli` (`schema-codegen-bridge`)
  wraps `zen generate` -- it can't replace the three `plugin {...}` blocks
  in a consumer's `.zmodel` (ZenStack needs them declared in-schema to
  register custom attributes), but it resolves the schema path, validates
  all three blocks are present with a specific actionable error + copy-paste
  snippet if not, and forwards to `zen generate`. Also switched
  `examples/pos-inventory-demo` from relative-path `provider`s to real
  npm-package-name ones (`@mdht/plugin-jazz-schema`, etc., as
  actual `workspace:*` dependencies) -- confirming a resolution path that
  was documented but never actually exercised before this milestone.
  Verified via `pnpm run generate:cli` inside the example (real bin-linking,
  not just invoking `bin.ts` by path) and by running the CLI against a
  deliberately incomplete schema copy to confirm the missing-plugin error
  path fires correctly. See `packages/cli/bin.ts` and
  `docs/plugin-api-notes.md`.
- [x] **M7 — stretch**: all five packages are published for real —
  [`@mdht/generator-core`](https://www.npmjs.com/package/@mdht/generator-core),
  [`@mdht/plugin-jazz-schema`](https://www.npmjs.com/package/@mdht/plugin-jazz-schema),
  [`@mdht/plugin-ts-rest-contract`](https://www.npmjs.com/package/@mdht/plugin-ts-rest-contract),
  [`@mdht/plugin-betterauth-claims`](https://www.npmjs.com/package/@mdht/plugin-betterauth-claims),
  [`schema-codegen-bridge`](https://www.npmjs.com/package/schema-codegen-bridge)
  (`0.1.1`) — not just dry-run-verified. Publishing surfaced a real,
  serious bug the dry-run couldn't catch: `schema-codegen-bridge`'s
  `bin.ts` shipped as raw TypeScript like every other package here, but
  Node's own module loader (unlike ZenStack's `jiti`-based plugin loader)
  **refuses to type-strip anything under `node_modules`**, no flag
  overrides it — a real `npm install` + `npx` of `0.1.0` crashed with
  `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Fixed with a real build
  step (`tsc` -> `dist/bin.js`) in `0.1.1`, verified with a fresh
  `npm install` + `npx schema-codegen-bridge generate` in a directory with
  nothing but the published registry packages — no workspace, no
  vendoring. See `docs/plugin-api-notes.md` for the full account, including
  a red herring along the way (a scoped package looked 404 right after
  publishing; it was ~60-90s of registry propagation lag specific to
  provisioning a brand-new scope, not a failed publish).
  `pos-offline-reconciliation`'s wiring now consumes these real published
  versions instead of the vendored tarballs it used during development —
  see that repo's `PLAN.md`.

## Definition of done for the POC

Editing one field in `examples/pos-inventory-demo`'s `.zmodel` — say, adding
a field to `Order` — and running one generate command updates the Jazz
schema, the ts-rest contract, and the claims types together, with a failing
compile-time check if any of the three fall out of sync. **Met as of M5**:
`npm run verify` in `examples/pos-inventory-demo` does exactly this, and it
was confirmed to actually fail (not just theoretically would) when one
generated artifact was deliberately made to disagree with the others.

## Open questions / risks

Resolved by the M0-M4 spikes (see `docs/plugin-api-notes.md` for detail):
- ZenStack's AST exposes exactly the relation/attribute metadata needed —
  `DataFieldType.reference` plus `ModelUtils` helpers — no DMMF, no
  re-parsing raw `.zmodel` text required.
- Jazz relations are generated as plain getters returning the referenced
  `co.map`/`co.list`, not a `co.ref()` call — there is no `co.ref` in the
  jazz-tools API surface we found; the PLAN originally guessed wrong here.
- Custom attributes with a `.` in the name (originally-planned
  `@@generate.contract`) turned out to be a non-issue: went with a plain
  identifier (`@@tsRestContract`) for M3 and confirmed it resolves cleanly
  through the real CLI; separately found `@db.Text()` in ZenStack's own
  stdlib, so dotted names would've worked too.
- `@ts-rest/core`'s Standard Schema support and BetterAuth's
  `additionalFields` enum support (`Array<LiteralString>` as a `type`) were
  both unknowns going into M3/M4 and are now confirmed working, including
  at runtime — see the M3/M4 sections in `docs/plugin-api-notes.md`.

Still open:
- `BigInt`/`Decimal`/`Bytes` scalar fields have no confirmed jazz-tools
  primitive — currently mapped to lossy approximations with inline `TODO`s
  in generated output; needs a real answer before any money field in
  `pos-offline-reconciliation` goes through this generator.
- The `3.53.0-rc.1` pin on `@ts-rest/core` (M3) is a real, live risk —
  Standard Schema support isn't in a stable release yet.
- `plugin-betterauth-claims` only handles a `model`-based `@@auth` target
  with enum-typed fields — a `type`-based (`TypeDef`) auth target, or a
  plain scalar claim (e.g. a `String` tenant ID), isn't bridged.
- This project intentionally does not attempt to generate Jazz *permission
  group* logic from ZenStack `@@allow` policies — the two permission models
  are different enough (row-level SQL predicates vs. CRDT group membership)
  that forcing a 1:1 mapping would likely produce something worse than
  hand-written policy code in each system. Scoped out, not solved.
