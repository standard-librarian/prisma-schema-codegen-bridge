# packages/plugin-ts-rest-contract

Implemented: a real ZenStack v3 `CliPlugin` (`index.ts`) that emits a
ts-rest `c.router({...})` CRUD contract (list/getById/create/update/remove)
for every model marked with the custom `@@tsRestContract` attribute
(declared in `plugin.zmodel`). Field schemas are built with Effect's
`Schema.Struct`/`Schema.Literal`/`Schema.Array` and wrapped in
`Schema.standardSchemaV1(...)` so ts-rest accepts them as Standard Schema
validators instead of Zod.

Verified end to end, not just type-checked: `examples/pos-inventory-demo`
runs this plugin through the real `zen generate` CLI, the output
type-checks against real `effect`/`@ts-rest/core` installs, and a generated
contract's body schema was executed at runtime (`~standard.validate(...)`)
against both valid and invalid input.

**Real, load-bearing caveat**: this only works because `@ts-rest/core` is
pinned to `3.53.0-rc.1` in this package's `package.json` — the current
stable release (3.52.x) has no Standard Schema support at all and is
Zod-only. See root `PLAN.md` M3 and `../../docs/plugin-api-notes.md`.

Known limitation: relation fields are excluded from the generated contract
entirely (only their scalar FK column, e.g. `orderId`, is included) — no
nested/shallow resource support yet.
