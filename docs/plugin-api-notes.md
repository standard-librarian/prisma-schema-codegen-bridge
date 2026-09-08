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

Originally confirmed against `@zenstackhq/sdk@3.9.4-beta.1` and reverified on
the stable `@zenstackhq/sdk@3.9.3` type
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

## M3 result: ts-rest + Effect Schema, verified at runtime too

`plugin-ts-rest-contract` emits a `c.router({...})` contract per
`@@tsRestContract`-marked model, with Effect `Schema.Struct`/`Schema.Literal`/
`Schema.Array` field schemas wrapped in `Schema.standardSchemaV1(...)` for
every contract position (`body`, `pathParams`, `responses`).

Two things worth calling out, both confirmed by installing real packages and
reading their compiled types rather than trusting docs prose:

1. **`@ts-rest/core`'s stable release (3.52.1) does not support Standard
   Schema at all** — its `ContractAnyType` is typed as `z.ZodSchema |
   ContractPlainType<unknown> | ContractNullType | null`, Zod-only. Standard
   Schema support (`StandardSchemaV1<any>` added to `ContractAnyType`) only
   exists in **`3.53.0-rc.1`**, which this package pins deliberately. That's
   a real, live risk — not a hedge — and needs revisiting when 3.53
   stabilizes (or if it doesn't, this whole approach needs Zod instead of
   Effect Schema for the ts-rest boundary specifically).
2. **Effect's `Schema` values aren't Standard-Schema-shaped by default** —
   you need `Schema.standardSchemaV1(schema)` to get an object with a
   `~standard` property. Confirmed both by type (`StandardSchemaV1<I, A> &
   SchemaClass<...>`) and at runtime: generated the contract, imported it
   with Node's native TS stripping (`node --input-type=module`, no build
   step), and called `orderContract.create.body['~standard'].validate(...)`
   directly — it accepted valid input and produced `issues` for invalid
   input, exactly like a real Standard Schema validator should.

Also resolved: the `@@tsRestContract` marker attribute (declared in
`packages/plugin-ts-rest-contract/plugin.zmodel` as `attribute
@@tsRestContract() @@@once`) works exactly like ZenStack's own `@@id`/
`@@unique` — model-level attributes are declared with a `@@` prefix, no
special registration beyond the `plugin.zmodel` file. The M0 worry about
dotted attribute names turned out moot for this case (didn't need one), but
along the way found `@db.Text()` in the stdlib, which *does* use a dot in a
field-level attribute name — so dotted names are apparently fine too, just
unnecessary here.

## M4 result: BetterAuth claims, verified against both real packages

`plugin-betterauth-claims` finds the model ZenStack resolves as `auth()`'s
type via `ModelUtils.getAuthDecl(model)`, walks its enum-typed fields, and
emits a BetterAuth `additionalFields` entry per field, using the exact same
`Schema.standardSchemaV1(...)` bridge as `plugin-ts-rest-contract` -- one
validation language (Effect Schema) feeding both the API boundary and the
auth boundary from the same source schema.

Findings, again from installing real packages and reading their compiled
types rather than trusting docs prose (installed `better-auth@1.7.3` in a
scratch dir specifically to check this):

1. **`@@auth` is a *core* ZModel attribute**, unlike `@@allow`/`@@deny`/
   `check()` which come from the separate `@zenstackhq/plugin-policy`
   package -- confirmed in `@zenstackhq/language`'s `stdlib.zmodel`
   (`attribute @@auth()` has no plugin namespace). `ModelUtils.getAuthDecl`
   implements ZenStack's own resolution order (an `@@auth`-annotated
   `model`/`type`, else a model literally named `User`), so this plugin
   doesn't reimplement that fallback logic itself.
2. **BetterAuth's `additionalFields[key].type` accepts `Array<LiteralString>`**,
   not just `"string" | "number" | "boolean" | "date" | "json"` -- this is
   the mechanism that makes an enum field possible at all. Confirmed via
   `@better-auth/core/db`'s `DBFieldType` declaration.
3. **`DBFieldAttribute` has a `validator: { input?, output?: StandardSchemaV1 }`
   slot** -- this is what let the same `Schema.standardSchemaV1(...)` call
   from M3 get reused here instead of inventing a second validation
   mechanism.
4. **Round-trip verified at three levels, not just "it compiles"**:
   - `examples/pos-inventory-demo`'s `StaffMember` model is now marked
     `@@auth`, and `zen generate` produces `generated/betterauth-claims.ts`
     for real.
   - A real `betterAuth({ user: { additionalFields } })` call using the
     generated output type-checks (`tsc --strict --skipLibCheck`), **and**
     BetterAuth's own `$Infer.Session['user']['role']` type comes out as
     the `Role` union (`'CASHIER' | 'MANAGER'`), not widened to `string` --
     proof the literal-array trick actually survives BetterAuth's type
     inference machinery, not just our own generated file in isolation.
   - The generated `validator.input['~standard'].validate(...)` was
     executed directly at runtime against valid and invalid input, same as
     M3's ts-rest contract.
5. **The "one enum drives both" claim from PLAN.md is now concretely
   demonstrated, not just asserted**: `InventoryItem` in the example schema
   has real `@@allow` rules (`auth().role == 'MANAGER'` for
   create/update/delete) that reference the exact same `Role` enum the
   generated BetterAuth field is built from -- and the whole schema,
   policies included, passes through the real `zen generate` CLI.

## M5 result: a cross-artifact check that actually catches drift

Everything through M4 individually verified one generated artifact against
its real consumer package. M5 (`examples/pos-inventory-demo/verify-shape.ts`)
checks the three generated artifacts *against each other*, since "all three
are individually correct" doesn't imply "all three still agree" -- a stale
regen of just one of them would be invisible otherwise.

Two things made this straightforward once found:

- Jazz's `CoMapSchema` has a public `shape: Shape` instance property --
  confirmed in the installed `jazz-tools` `.d.ts` (`CoMapSchema.d.ts`). So
  `InventoryItem.shape` gives back the exact object passed to `co.map(...)`,
  both as a runtime value (`Object.keys(...)`) and a type (`keyof typeof
  InventoryItem.shape`).
- Effect's `Schema.Struct` similarly has a public `readonly fields:
  Readonly<Fields>` -- confirmed in `effect`'s `Schema.d.ts`. Combined with
  exporting the previously-internal `${Model}Schema` consts from
  `plugin-ts-rest-contract` (a small, backwards-compatible change), this
  gave a real, introspectable field set to compare against Jazz's `.shape`.

The check itself is two independent assertions, each with a compile-time
form (a `KeysSubsetOf`/`Equal` type-level check, in the tsd/expect-type
style, that fails to compile if violated) and a runtime form
(`assert.deepStrictEqual` / `.every(...)`):

1. The `Role` enum values emitted independently by `plugin-jazz-schema`,
   `plugin-ts-rest-contract`, and `plugin-betterauth-claims` are asserted
   exactly equal.
2. `InventoryItem`/`Order`'s ts-rest contract field keys are asserted a
   subset of the Jazz CoValue's `.shape` keys (a subset, not exact equality,
   because ts-rest deliberately excludes relation fields that the Jazz
   schema legitimately includes -- see M3's documented scope).

**This was verified to have real teeth, not just verified to pass**: one
generated file's `Role` values were deliberately mutated
(`'MANAGER'` -> `'OWNER'`) and both the `tsc` run and `node verify-shape.ts`
failed with a specific, correct diagnostic before the file was restored.
`pnpm run verify` in the example runs the whole loop (regenerate, type-check,
assert) in one command.

## M6 result: npm-package-name provider resolution confirmed, plus a thin CLI

Through M5, every `plugin { provider = ... }` block in the example pointed
at a plugin by relative file path (`'../../../packages/plugin-jazz-schema'`).
M0's plugin-dev doc excerpt said `provider` also resolves as a plain npm
package name ("otherwise, load it as an npm package"), but that path was
never actually exercised until M6.

Confirmed by switching all three blocks in
`examples/pos-inventory-demo/zenstack/schema.zmodel` to package-name
providers (`'@mdht/plugin-jazz-schema'`, etc.) and adding the
three plugin packages as real `dependencies` (via `workspace:*`) of
`pos-inventory-demo` so Node's normal module resolution can find them --
`zen generate` ran identically. This matters because it's the difference
between "only works inside this exact monorepo layout" and "works the way
any real npm-installed plugin would."

`packages/cli` (`schema-codegen-bridge`) wraps `zen generate` rather than
reimplementing it -- confirmed there's no way around this: the three
`plugin {...}` blocks have to be declared directly in the consumer's own
`.zmodel` for ZenStack to register their custom attributes
(`@@tsRestContract`, and `@@auth` is core but still needs the model
annotated in-schema), so an external CLI can't inject them invisibly. What
it adds instead: a single command, and a specific, actionable error if a
schema is missing one of the three blocks, tested against a deliberately
incomplete copy of the schema (one plugin block stripped) -- it printed the
exact missing block's snippet and exited non-zero, instead of the
consumer discovering the problem later via a cryptic `@@tsRestContract`
resolution failure or a silently-absent generated file. Also confirmed
working end-to-end through pnpm's real bin-linking (`pnpm run generate:cli`
inside `pos-inventory-demo`, not just invoking `bin.ts` by path).

## M7 result: consuming this from a genuinely separate repo/workspace

Wiring `pos-offline-reconciliation` (a completely separate git repo and
pnpm workspace) up to consume these plugins surfaced a real packaging bug,
found by trying it rather than by reasoning about it:

Pointing a `file:` dependency straight at a plugin's **source directory**
(e.g. `file:../../../prisma-schema-codegen-bridge/packages/plugin-jazz-schema`)
fails immediately with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`:
`"@mdht/generator-core@workspace:^0.1.0" is in the dependencies
but no package named "@mdht/generator-core" is present in the
workspace`. `workspace:*`-style protocol specifiers (correctly used for the
internal `generator-core` dependency inside *this* repo's workspace) are
only meaningful inside the pnpm workspace that declares them -- they are
not a general-purpose "local package" mechanism.

The fix: `pnpm pack` (run inside this repo, where the workspace context
exists) rewrites `workspace:^0.1.0` to a real semver range (`^0.1.0`) in
the packed tarball's `package.json` -- confirmed by extracting a packed
tarball and reading it directly. That's exactly the problem `workspace:`
protocol exists to defer to pack/publish time. Consuming the resulting
`.tgz` files via `file:` (plus a root-level `pnpm.overrides` entry
redirecting `@mdht/generator-core` to its own vendored tarball,
so the now-plain `^0.1.0` request from a nested plugin resolves locally
instead of hitting the real npm registry) worked cleanly on the first try.

Practical implication: **there is no way to consume an unpublished,
workspace-internal package from a genuinely separate repo without either
(a) packing/publishing it first, or (b) merging the two repos into one
workspace.** (b) was already ruled out deliberately (see both repos'
`PLAN.md`s for why they're split). This is the concrete reason "publish to
npm" and "wire in the other repo" are the same milestone, not two unrelated
stretch goals -- the second literally cannot be done for real without the
packaging discipline of the first.

## M7 continued: the real npm publish, and a genuine bug it surfaced

All five packages are published for real (`@mdht/generator-core`,
`@mdht/plugin-jazz-schema`, `@mdht/plugin-ts-rest-contract`,
`@mdht/plugin-betterauth-claims`, `schema-codegen-bridge`) -- not just
dry-run-verified. Two things worth recording:

**A red herring first**: right after publishing the four `@mdht/*` scoped
packages, `npm view`/a direct registry GET returned 404 for all of them,
including with an authenticated token -- looked exactly like the publish
had silently failed (there's a real, current npm platform change
restricting "bypass 2FA" tokens for "account changes and direct
publishing" per an `npm profile get` notice, which was the first, wrong
hypothesis). It was actually just **registry propagation lag specific to
creating a brand-new scope for the first time** -- a plain version publish
to an existing package/scope propagates near-instantly (confirmed with the
unscoped `schema-codegen-bridge`), but provisioning `@mdht` as a scope for
the first time took roughly 60-90 seconds to become visible on the read
path, even though the publish had already succeeded. Waiting and re-checking
resolved it. Lesson: don't conclude a scoped publish failed from an
immediate 404 -- confirm with `npm view` again after a real wait, not just
a few seconds.

**A genuine, serious bug**: `schema-codegen-bridge`'s `bin.ts` shipped as
raw TypeScript (matching every other package in this project, all loaded
fine via ZenStack's `jiti`-based plugin loader or pnpm workspace symlinks).
But a CLI `bin` entry is executed directly by Node's own module loader, and
**Node hard-refuses to type-strip any file physically located under
`node_modules`** -- confirmed two ways: a real `npm install` + `npx` of the
published `0.1.0` failed with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`,
and explicitly forcing `node --experimental-strip-types` on the same file
produces the identical error -- there is no flag that overrides this, it's
a deliberate, non-negotiable restriction. This had never surfaced in any
earlier testing because pnpm workspace symlinks resolve to a real path
*outside* `node_modules`, and the vendored-tarball test in
`pos-offline-reconciliation` only exercised the three ZenStack *plugins*
(loaded via `jiti`, which has no such restriction) -- never this package's
`bin.ts`, which Node loads directly. **Fixed** by giving `packages/cli` an
actual build step (`tsc` -> `dist/bin.js`, now wired through `prepare`) and
republishing as `0.1.1` -- verified with a real `npm install` +
`npx schema-codegen-bridge generate` in a completely fresh scratch
directory (no workspace, no vendoring, nothing but the published
registry packages) before calling it done.

Practical implication for anyone extending this project: **any file meant
to be executed directly by Node (a `bin` entry, in particular) needs a real
build step before publishing; raw `.ts` only works for files loaded through
a userland transpiler (`jiti`, `tsx`, etc.), not Node's own module loader.**

## Open items this spike surfaced (update PLAN.md's "Open questions" too)

- `DataFieldType.unsupported` (raw DB-native types) is preserved explicitly by
  the IR and mapped to conservative unknown validators; richer native-type
  handling remains open.
- `BigInt`/`Decimal`/`Bytes` are mapped to lossy `z.number()`/`z.string()`
  approximations in `plugin-jazz-schema` (flagged inline with `TODO`
  comments in the generated output) — jazz-tools doesn't appear to have
  dedicated primitives for these; needs a real decision, not a placeholder,
  before this touches money fields in `pos-offline-reconciliation`.
- ~~Attribute names with a `.`~~ — resolved in M3, see above: went with a
  plain identifier (`@@tsRestContract`) and separately found evidence
  (`@db.Text()`) that dotted names work too, so this was never actually a
  blocker.
- Relation fields are entirely excluded from the ts-rest contract (only
  their plain FK scalar, e.g. `orderId`, is included) — fine for the current CRUD
  contract, but `pos-offline-reconciliation`'s settlement API will likely
  want at least shallow nested resources (e.g. an order's line items),
  which this generator doesn't attempt yet.
- The `3.53.0-rc.1` pin on `@ts-rest/core` is the single biggest
  ship-blocking risk in this whole plugin — see the M3 section above.
- `plugin-betterauth-claims` only handles `@@auth` resolving to a `model`
  (`DataModel`); a `type`-based `@@auth` target (TypeDef, per ZenStack's own
  docs example) is detected and silently skipped, not supported. Also only
  handles enum-typed fields on that model — plain scalar claims (e.g. a
  `String` "tenantId" field) aren't bridged, since there's no enum to derive
  a literal-array `type` from.
