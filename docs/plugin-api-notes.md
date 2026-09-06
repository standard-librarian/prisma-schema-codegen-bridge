# M0 discovery spike: findings

PLAN.md's M0 called for confirming the exact ZenStack plugin API before
committing to an IR shape. The docs site (zenstack.dev) 404s on the
`the-complete-guide/part2/*` URLs that show up in search results — those are
stale v2 paths. The current (v3) docs live at different paths in the
[zenstackhq/zenstack-docs](https://github.com/zenstackhq/zenstack-docs) repo,
fetched directly for this spike since the rendered site wasn't reachable.
**ZenStack v3 is a from-scratch rewrite** (`@zenstackhq/orm`, `@zenstackhq/cli`,
`@zenstackhq/language`, `@zenstackhq/schema` — all `3.9.x` — vs. the old
`zenstack`/`@zenstackhq/runtime` packages still sitting at `2.22.x`). Every
finding below is about v3.

## What "plugin" means in ZModel

A plugin is declared in the schema itself:

```zmodel
plugin jazz {
    provider = '../../packages/plugin-jazz-schema/index.ts'
    output = '../generated/jazz-schema.ts'
}
```

`provider` resolves, in order: local file path (`.js`/`.mjs`/`.ts`/`.mts`) →
folder with an index file → npm package. TypeScript is loaded via `jiti`, no
build step required — confirmed: our plugin ships as a bare `.ts` file and
`zen generate` ran it directly. Everything after `provider`/`output` in the
block (e.g. `output`) is passed through verbatim as `pluginOptions`.

## The actual plugin contract (`@zenstackhq/sdk`)

```ts
type CliGeneratorContext = {
  schemaFile: string;
  model: Model;              // ZModel AST root
  defaultOutputPath: string;
  pluginOptions: Record<string, unknown>;
};

interface CliPlugin {
  name: string;
  statusText?: string;
  generate(context: CliGeneratorContext): MaybePromise<void>;
}
```

Confirmed against the installed `@zenstackhq/sdk@3.9.4-beta.1` type
declarations (`dist/index.d.mts`), not just docs prose.

## The AST shapes that actually matter for codegen

From `@zenstackhq/language`'s compiled `.d.mts` (not the docs — the docs page
for this didn't exist at any path we could find):

- `model.declarations` — everything in the schema; filter with `isDataModel`
  / `isEnum` (both exported from `@zenstackhq/language/ast`).
- `DataModel.fields: DataField[]` — **not** "DataModelField" as PLAN.md
  originally guessed.
- `DataField.type: DataFieldType`, where:
  ```ts
  interface DataFieldType {
    array: boolean;
    optional: boolean;
    reference?: Reference<DataModel | Enum | TypeDef>;
    type?: 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime'
         | 'BigInt' | 'Decimal' | 'Bytes' | 'Json';
    unsupported?: UnsupportedFieldType;
  }
  ```
  A field is a **relation** if `reference` is set and it points at a
  `DataModel`; it's an **enum** field if `reference` points at an `Enum`;
  otherwise it's a scalar and `type` holds the Prisma-style builtin name.
- `@zenstackhq/sdk` also exports `ModelUtils` (`getOwnedFields`,
  `hasAttribute`, `getAttribute`, `isUniqueField`, `isIdField`, `resolved`,
  ...) — used `getOwnedFields` instead of walking `DataModel.fields`
  directly so mixin-contributed fields are included the same way ZenStack's
  own generators see them.

## Custom attributes (for the later ts-rest / BetterAuth plugins)

Confirmed via `docs/recipe/plugin-dev.md` (fetched from GitHub) and the
`zenstackhq/v3-doc-plugin` example repo's `password-plugin`: a plugin
contributes custom attributes/functions via a co-located `plugin.zmodel`
file (not the CLI plugin module itself), e.g.:

```zmodel
attribute @password(hasher: Any) @@@targetField([StringField])
```

Field-level attributes are prefixed `@`, model-level `@@`. This is how
`plugin-ts-rest-contract`'s `@@generate.contract`-style marker (renamed to
avoid the dot — attribute names appear to be plain identifiers, not seen
tested with a `.` in the name) and `plugin-betterauth-claims`'s role
declarations should be implemented — as a `plugin.zmodel`, not by trying to
mutate the AST from the CLI plugin.

## M2 result: round-trip verified, not just planned

`examples/pos-inventory-demo` has a real schema (`StaffMember`, `Order`,
`InventoryItem`, `OrderLineItem`, a `Role` enum) and a real, working
`plugin-jazz-schema`. Running `npx zen generate` in that directory:

1. Runs the built-in `@core/typescript` plugin (produces
   `zenstack/{input,models,schema}.ts`).
2. Runs our plugin, which builds the IR via `generator-core` and writes
   `generated/jazz-schema.ts` (`co.map`/`co.list`/`z.*`/enum-as-const, with
   getter-form relations for forward/circular references).
3. That output was then checked with a real `jazz-tools@0.20.19` install:
   `npx tsc --strict --skipLibCheck generated/jazz-schema.ts` — **zero
   errors**. (`--skipLibCheck` is needed only because jazz-tools/cojson's
   *own* `.d.ts` files fail under `--strict` for unrelated reasons — missing
   `@types/node` for a `util` import, and some internal generic-constraint
   issues in `CoMapSchema`/`AccountSchema` — not something our generated
   code triggers.)

## Open items this spike surfaced (update PLAN.md's "Open questions" too)

- `DataFieldType.unsupported` (raw DB-native types) isn't handled by the IR
  yet — out of scope for the demo schema, but a real schema will hit it.
- `BigInt`/`Decimal`/`Bytes` are mapped to lossy `z.number()`/`z.string()`
  approximations in `plugin-jazz-schema` (flagged inline with `TODO`
  comments in the generated output) — jazz-tools doesn't appear to have
  dedicated primitives for these; needs a real decision, not a placeholder,
  before this touches money fields in `pos-offline-reconciliation`.
- Attribute names with a `.` in them (e.g. the originally-planned
  `@@generate.contract`) are unverified — the only real example we found
  uses plain identifiers (`@password`). `plugin-ts-rest-contract`'s M3 should
  spike this specifically before assuming dotted names work.
