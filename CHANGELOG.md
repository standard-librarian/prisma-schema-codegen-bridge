# Changelog

All notable changes to this project are documented here. Versions are
shared across the workspace's publishable packages (`@codegen-bridge/generator-core`,
`@codegen-bridge/plugin-jazz-schema`, `@codegen-bridge/plugin-ts-rest-contract`,
`@codegen-bridge/plugin-betterauth-claims`, `schema-codegen-bridge`).

## 0.1.0 - 2026-09-07

First tagged release. All of `PLAN.md`'s core milestones (M0-M6) are done
and independently verified against real installed dependencies, not just
type-checked in isolation -- see `docs/plugin-api-notes.md` for exactly what
was confirmed and how.

### Added

- `generator-core`: a neutral IR (`IrModel`/`IrField`: scalar, relation, or
  enum) built over the real ZenStack v3 ZModel AST.
- `plugin-jazz-schema`: generates a Jazz CoValue schema (`co.map`/`co.list`)
  from a ZModel schema. Verified to type-check against a real `jazz-tools`
  install.
- `plugin-ts-rest-contract`: generates a ts-rest CRUD contract per model
  marked `@@tsRestContract`, using Effect Schema wrapped via
  `Schema.standardSchemaV1(...)`. Verified at runtime, not just by type.
  **Requires `@ts-rest/core@3.53.0-rc.1`** -- the current stable release has
  no Standard Schema support.
- `plugin-betterauth-claims`: generates a BetterAuth `additionalFields`
  config from the enum-typed fields of the ZModel's `@@auth`-resolved
  model, reusing the same `Schema.standardSchemaV1(...)` bridge. Verified
  against a real `betterAuth()` call, including that
  `$Infer.Session['user']['role']` comes out as the literal union, not
  `string`.
- `schema-codegen-bridge` (CLI): thin wrapper around `zen generate` with
  schema-path resolution and an actionable error if a schema is missing one
  of the three plugin blocks.
- `examples/pos-inventory-demo`: a real schema exercising all three
  plugins plus real `@@allow` policies (via `@zenstackhq/plugin-policy`)
  referencing the same `Role` enum the BetterAuth plugin bridges.
- `verify-shape.ts`: a cross-artifact check (compile-time + runtime) that
  the three generated outputs still agree with each other -- confirmed to
  actually catch drift, not just pass by construction.
- CI (GitHub Actions): regenerate + type-check + cross-verify on Node 22
  and 24, plus an `npm publish --dry-run` packaging check for every
  publishable package.

### Known limitations (tracked, not hidden)

- `@ts-rest/core` is pinned to a release candidate (`3.53.0-rc.1`) for
  Standard Schema support -- revisit when 3.53 stabilizes.
- `BigInt`/`Decimal`/`Bytes` scalar fields map to lossy approximations
  (flagged inline in generated output).
- Relation fields are excluded from the ts-rest contract entirely (only
  their scalar FK column is included).
- `plugin-betterauth-claims` only supports a `model`-based `@@auth` target
  with enum-typed fields, not a `type`/`TypeDef` target or plain scalar
  claims.
- This project does not attempt to generate Jazz permission-group logic
  from ZenStack `@@allow` policies -- scoped out deliberately, see
  `PLAN.md`.
