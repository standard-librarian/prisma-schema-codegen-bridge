# examples/pos-inventory-demo

A real ZModel schema (`zenstack/schema.zmodel`): `StaffMember` (with a
`Role` enum field, marked `@@auth`), `InventoryItem`, `Order`, and
`OrderLineItem` (the relation table joining the two, matching how
ZenStack/Prisma model many-to-many via an explicit join model).

`Order` and `InventoryItem` are marked `@@tsRestContract`. `InventoryItem`
also has real access policies (via `@zenstackhq/plugin-policy`) that read
`auth().role` against the same `Role` enum `plugin-betterauth-claims`
bridges to BetterAuth:

```zmodel
@@allow('read', auth() != null)
@@allow('create,update,delete', auth().role == 'MANAGER')
```

Run `npx zen generate` in this directory to regenerate everything:
`zenstack/{input,models,schema}.ts` (built-in), `generated/jazz-schema.ts`
(`plugin-jazz-schema`), `generated/ts-rest-contract.ts`
(`plugin-ts-rest-contract`), and `generated/betterauth-claims.ts`
(`plugin-betterauth-claims`). All three custom outputs have been verified
against real installed packages, not just type-checked in isolation:

```bash
npx tsc --noEmit --strict --skipLibCheck generated/jazz-schema.ts
npx tsc --noEmit --strict --skipLibCheck generated/ts-rest-contract.ts
npx tsc --noEmit --strict --skipLibCheck generated/betterauth-claims.ts

# the ts-rest contract was also executed at runtime, e.g.:
node --input-type=module -e "
import { orderContract } from './generated/ts-rest-contract.ts';
console.log(await orderContract.create.body['~standard'].validate({ status: 'open' }));
"

# ...and so was the BetterAuth claims validator:
node --input-type=module -e "
import { roleField } from './generated/betterauth-claims.ts';
console.log(await roleField.validator.input['~standard'].validate('MANAGER'));
"
```

(`--skipLibCheck` is required only because of pre-existing type issues
inside jazz-tools/cojson's own `.d.ts` files under `--strict`, unrelated to
the generated code — see `../../docs/plugin-api-notes.md`.)

Still missing (see root `PLAN.md` M5): the compile-time check that all
three generated artifacts agree on shape.
