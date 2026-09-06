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

Planning stage (M0 discovery spike not yet started). Nothing runnable yet.
