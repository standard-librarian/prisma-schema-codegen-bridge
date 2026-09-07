# packages/cli (`schema-codegen-bridge`)

`schema-codegen-bridge generate` -- a thin wrapper around ZenStack's own
`zen generate`, not a replacement for it. It can't be more than a wrapper:
the three plugin blocks (`plugin-jazz-schema`, `plugin-ts-rest-contract`,
`plugin-betterauth-claims`) have to be declared directly in a consumer's
own `.zmodel` for ZenStack to register their custom attributes and options
— there's no way for an external CLI to inject that invisibly. See root
`PLAN.md` M6 and `../../docs/plugin-api-notes.md` for why.

What it adds over calling `zen generate` yourself:

- Resolves the schema path (defaults to `zenstack/schema.zmodel`, same
  convention as `zen` itself; override with `--schema <path>`).
- Checks all three plugin blocks are present in the schema and, if not,
  fails with the specific missing block(s) and a copy-pasteable snippet —
  instead of a consumer discovering the problem later via a confusing
  `@@tsRestContract` resolution error or a silently-absent generated file.
- Then forwards to the real `zen generate`.

Verified: `examples/pos-inventory-demo` depends on this package (as
`schema-codegen-bridge`, via `workspace:*`) and runs it for real through
`pnpm run generate:cli` — genuine bin-linking through pnpm, not just
invoking `bin.ts` directly by path. The missing-plugin-block error path was
also tested against a deliberately incomplete copy of the schema.

Depends on `@zenstackhq/cli` directly so that installing just
`schema-codegen-bridge` is enough to get `zen` too, rather than requiring
consumers to separately add `@zenstackhq/cli` themselves.
