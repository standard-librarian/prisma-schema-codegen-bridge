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

All three `plugin {...}` blocks in `zenstack/schema.zmodel` reference the
generator packages by **npm package name** (`@codegen-bridge/plugin-jazz-schema`,
etc.), not relative file path -- this package depends on them for real (via
`workspace:*`), which is what makes that resolution possible. You can
generate either via the real `zen` CLI directly (`npm run generate`) or
through this bridge's own wrapper CLI (`npm run generate:cli`, i.e.
`schema-codegen-bridge generate` — see `../../packages/cli`), which adds a
specific error if any of the three plugin blocks is missing, instead of a
confusing failure later.

Run `npm run verify` in this directory to regenerate everything, type-check
it, and run the cross-artifact shape checks in one go:

```bash
npm run verify
# = npm run generate   (zen generate: regenerates zenstack/*, generated/*.ts)
# + npm run typecheck  (tsc -p . -- see tsconfig.json for the flags this needs,
#                        in particular --skipLibCheck: jazz-tools/cojson's own
#                        .d.ts files fail under --strict for reasons unrelated
#                        to this project's generated code)
# + node verify-shape.ts
```

`verify-shape.ts` (PLAN.md M5) is the "do the three generators actually
still agree" check: it asserts the `Role` enum values emitted independently
by all three plugins are exactly equal, and that the ts-rest contract's
field keys are a subset of the Jazz CoValue's own field shape -- each as
both a compile-time type assertion and a runtime `assert`. This was
confirmed to actually fail (not just theoretically would) by deliberately
breaking one generated file and watching both the type-check and the
runtime assertion catch it before restoring the file -- see
`../../docs/plugin-api-notes.md`.

The ts-rest contract and the BetterAuth claims validator have also each
been executed at runtime directly, independent of `verify-shape.ts`, e.g.:

```bash
node --input-type=module -e "
import { orderContract } from './generated/ts-rest-contract.ts';
console.log(await orderContract.create.body['~standard'].validate({ status: 'open' }));
"
node --input-type=module -e "
import { roleField } from './generated/betterauth-claims.ts';
console.log(await roleField.validator.input['~standard'].validate('MANAGER'));
"
```
