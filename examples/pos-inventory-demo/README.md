# examples/pos-inventory-demo

A real ZModel schema (`zenstack/schema.zmodel`): `StaffMember` (with a
`Role` enum field), `InventoryItem`, `Order`, and `OrderLineItem` (the
relation table joining the two, matching how ZenStack/Prisma model
many-to-many via an explicit join model).

`Order` and `InventoryItem` are marked `@@tsRestContract`.

Run `npx zen generate` in this directory to regenerate everything:
`zenstack/{input,models,schema}.ts` (built-in), `generated/jazz-schema.ts`
(`plugin-jazz-schema`), and `generated/ts-rest-contract.ts`
(`plugin-ts-rest-contract`). Both custom outputs have been verified against
real installed packages, not just type-checked in isolation:

```bash
npx tsc --noEmit --strict --skipLibCheck generated/jazz-schema.ts
npx tsc --noEmit --strict --skipLibCheck generated/ts-rest-contract.ts

# the ts-rest contract was also executed at runtime, e.g.:
node --input-type=module -e "
import { orderContract } from './generated/ts-rest-contract.ts';
console.log(await orderContract.create.body['~standard'].validate({ status: 'open' }));
"
```

(`--skipLibCheck` is required only because of pre-existing type issues
inside jazz-tools/cojson's own `.d.ts` files under `--strict`, unrelated to
the generated code — see `../../docs/plugin-api-notes.md`.)

Still missing (see root `PLAN.md` M5): wiring `plugin-betterauth-claims`
into this same schema, and the compile-time check that all three generated
artifacts agree on shape.
