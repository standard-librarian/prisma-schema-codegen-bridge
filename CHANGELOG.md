# Changelog

All notable changes to this project are documented here. Versions are
shared across the workspace's publishable packages (`@mdht/generator-core`,
`@mdht/plugin-jazz-schema`, `@mdht/plugin-ts-rest-contract`,
`@mdht/plugin-betterauth-claims`, `schema-codegen-bridge`). All five are
published on npm.

## 0.2.0 - 2026-09-08

### Fixed

- Declared `@zenstackhq/language` directly in every package that imports it.
  The monorepo previously masked this missing runtime dependency through other
  workspace packages.
- Required natural and compound IDs are now present in REST create schemas;
  defaulted fields remain optional and ID fields remain protected on patch.
- ZModel nullable fields in REST record schemas now accept `null` while create
  and patch omission is modeled separately.
- Compound IDs generate one URL path segment and path parameter per ID field.
- Unsupported database-native field types remain `Unsupported` in the shared IR
  and map conservatively to unknown validators instead of silently becoming
  strings.
- The CLI now matches ZenStack schema discovery (`package.json`, root schema,
  then `zenstack/schema.zmodel`), supports `--schema=<path>`, rejects malformed
  flags, ignores plugin names in comments, and executes its installed ZenStack
  CLI directly instead of routing through `npx`.

### Added

- Root source typechecking plus CLI regression tests.
- Exported create and update Effect schemas for each generated REST model.
- Compound-ID and nullable-field coverage in the POS inventory example.
- Standalone npm documentation for all five packages and an architecture
  diagram shared by the repository and package pages.

### Changed

- All publishable packages now share version `0.2.0` and use the stable
  ZenStack 3.9.x SDK/language release line instead of the canary tag.
- Package metadata now includes homepage, issue tracker, and public publish
  configuration.

## schema-codegen-bridge 0.1.1 - 2026-09-07

Real `npm publish` surfaced a bug `npm publish --dry-run` couldn't catch:
`bin.ts` shipped as raw TypeScript (fine for the plugins, loaded via
ZenStack's `jiti`-based loader) but Node's own module loader refuses to
type-strip anything under `node_modules` -- a real `npm install` + `npx` of
`0.1.0` crashed with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Fixed
with a real build step (`tsc` -> `dist/bin.js`). Verified with a fresh
`npm install` + `npx schema-codegen-bridge generate` against nothing but
the published registry packages. See `docs/plugin-api-notes.md` for the
full account.

Two follow-on, repo-tooling-only fixes (no new npm version needed -- the
published `0.1.1` tarball is unaffected by either):
- The build step was first wired to `prepublishOnly`, which only runs
  during `npm publish`/`npm pack` -- a genuinely fresh `pnpm install` (what
  CI, and any new clone, actually does) never built `dist/bin.js` at all,
  and pnpm silently skipped linking the `schema-codegen-bridge` bin
  entirely once it found the target file missing. Switched to `prepare`,
  which also runs on a plain local install. Verified against an actual
  fresh git clone, not just a wiped working directory.
- CI's packaging check used `npm publish --dry-run`, which -- now that
  real versions are genuinely published -- correctly fails with "cannot
  publish over previously published versions" for any already-shipped
  version. That's npm behaving correctly, not a bug, but it makes
  `publish --dry-run` useless as an *ongoing* CI check. Switched to
  `npm pack --dry-run`, which validates the same packaging concerns
  without touching the registry's version check.

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
