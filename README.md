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

M0 (discovery spike) and M2 (`plugin-jazz-schema`) done — see
[`docs/plugin-api-notes.md`](./docs/plugin-api-notes.md) for the real
ZenStack v3 plugin API (it differs from PLAN.md's original guess) and
[`PLAN.md`](./PLAN.md) for the milestone checklist. `examples/pos-inventory-demo`
runs the real `zen generate` CLI and produces a Jazz CoValue schema that
type-checks against a real `jazz-tools` install. `plugin-ts-rest-contract`
and `plugin-betterauth-claims` are not yet built.

```bash
cd examples/pos-inventory-demo
npx zen generate                       # regenerates zenstack/* and generated/jazz-schema.ts
npx tsc --noEmit --strict --skipLibCheck generated/jazz-schema.ts
```
