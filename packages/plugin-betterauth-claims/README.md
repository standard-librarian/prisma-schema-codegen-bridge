# packages/plugin-betterauth-claims

Implemented: a real ZenStack v3 `CliPlugin` (`index.ts`) that finds the
model ZenStack resolves as `auth()`'s type (`ModelUtils.getAuthDecl`) and,
for each of its enum-typed fields, emits a BetterAuth `additionalFields`
entry — a literal-string-array `type` (so the field's inferred TS type is
the enum union, not `string`) plus a `validator` built with the same
`Schema.standardSchemaV1(...)` bridge `plugin-ts-rest-contract` uses. One
validation language, two boundaries (API contract and auth), same source
schema.

Verified at three levels, not just type-checked in isolation:

1. The generated file type-checks against a real `@better-auth/core`/
   `effect` install.
2. Wired into a real `betterAuth({ user: { additionalFields } })` call, the
   resulting `auth.$Infer.Session['user']['role']` type comes out as
   `'CASHIER' | 'MANAGER'`, not widened to `string` — proof the
   literal-array trick survives BetterAuth's own type inference, not just
   our generated file in a vacuum.
3. The generated `validator.input['~standard'].validate(...)` was executed
   at runtime against valid and invalid input.

`examples/pos-inventory-demo`'s `StaffMember` model is marked `@@auth`, and
`InventoryItem` has real `@@allow('create,update,delete', auth().role ==
'MANAGER')` policies (via `@zenstackhq/plugin-policy`) referencing the same
`Role` enum this plugin bridges to BetterAuth — the "one enum drives both
authorization systems" claim from root `PLAN.md` M4 is demonstrated end to
end, not just asserted.

Known limitations (see `../../docs/plugin-api-notes.md`): only a
`model`-based `@@auth` target is supported (a `type`/`TypeDef` target is
detected and silently skipped), and only enum-typed fields are bridged —
plain scalar claims aren't.
