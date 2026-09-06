# examples/pos-inventory-demo

A real ZModel schema (`zenstack/schema.zmodel`): `StaffMember` (with a
`Role` enum field), `InventoryItem`, `Order`, and `OrderLineItem` (the
relation table joining the two, matching how ZenStack/Prisma model
many-to-many via an explicit join model).

Run `npx zen generate` in this directory to regenerate everything, including
`generated/jazz-schema.ts` via `plugin-jazz-schema`. That output has been
verified to type-check against a real `jazz-tools` install:

```bash
npx tsc --noEmit --strict --skipLibCheck generated/jazz-schema.ts
```

(`--skipLibCheck` is required only because of pre-existing type issues
inside jazz-tools/cojson's own `.d.ts` files under `--strict`, unrelated to
the generated code — see `../../docs/plugin-api-notes.md`.)

Still missing (see root `PLAN.md` M5): wiring `plugin-ts-rest-contract` and
`plugin-betterauth-claims` into this same schema, and the compile-time check
that all three generated artifacts agree on shape.
