# packages/generator-core

Shared IR builder over the real ZModel AST. Implemented: `buildIr(model)`
walks `model.declarations` (via `isDataModel`/`isEnum` from
`@zenstackhq/language/ast`) and `@zenstackhq/sdk`'s `ModelUtils.getOwnedFields`,
producing `IrModel`/`IrField` (scalar / relation / enum) and `IrEnum` — see
`src/index.ts`. Consumed by `plugin-jazz-schema`; `plugin-ts-rest-contract`
and `plugin-betterauth-claims` (not yet built) are meant to consume the same
IR rather than re-walk the AST. See root `PLAN.md` M1 and
`../../docs/plugin-api-notes.md` for how the AST shapes were confirmed.
