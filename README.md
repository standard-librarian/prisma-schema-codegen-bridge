# prisma-schema-codegen-bridge

Proof-of-concept: derive a Jazz CoValue schema, a ts-rest contract, and
BetterAuth role/claims types — all from a single ZenStack `.zmodel` schema,
via ZenStack's own plugin system. One schema, no drift, in the spirit of
`zod-prisma` and ZenStack itself.

See **[PLAN.md](./PLAN.md)** for the full scope, milestones, and open
questions. This repo is currently in the planning/discovery stage.

## Layout

Plain pnpm workspace (not Turborepo — see PLAN.md for why): three generator
packages plus one example app. See `PLAN.md` → "Scope" for the breakdown.

## Status

M0 (discovery spike) through M4 are done — all three plugins
(`plugin-jazz-schema`, `plugin-ts-rest-contract`, `plugin-betterauth-claims`)
are implemented and wired into `examples/pos-inventory-demo`. See
[`docs/plugin-api-notes.md`](./docs/plugin-api-notes.md) for the real
ZenStack v3 (and BetterAuth, and ts-rest) APIs this relies on — several
differ from PLAN.md's original guesses — and [`PLAN.md`](./PLAN.md) for the
milestone checklist. `examples/pos-inventory-demo` runs the real `zen
generate` CLI and produces a Jazz CoValue schema, a ts-rest contract, and a
BetterAuth `additionalFields` config — all Effect-Schema-validated via the
same `Schema.standardSchemaV1(...)` bridge — that type-check against real
`jazz-tools`/`effect`/`@ts-rest/core`/`@better-auth/core` installs. The
ts-rest contract and the BetterAuth claims validator were both also
exercised at runtime (`~standard.validate(...)`), not just type-checked, and
the BetterAuth wiring was checked against a real `betterAuth()` call to
confirm `$Infer.Session['user']['role']` comes out as the literal union, not
`string`. **Caveat carried over from M3**: the ts-rest plugin only works
against `@ts-rest/core@3.53.0-rc.1` — the current stable release has no
Standard Schema support.

```bash
cd examples/pos-inventory-demo
npx zen generate                       # regenerates zenstack/*, generated/jazz-schema.ts, generated/ts-rest-contract.ts, generated/betterauth-claims.ts
npx tsc --noEmit --strict --skipLibCheck generated/jazz-schema.ts
npx tsc --noEmit --strict --skipLibCheck generated/ts-rest-contract.ts
npx tsc --noEmit --strict --skipLibCheck generated/betterauth-claims.ts
```
