# packages/plugin-jazz-schema

Implemented: a real ZenStack v3 `CliPlugin` (`index.ts`) that consumes
`generator-core`'s IR and emits a Jazz CoValue schema (`co.map`/`co.list`,
jazz-tools' `z.*`, getter-form relations for forward/circular references,
enums as `as const` value arrays + derived types).

Verified end to end: `examples/pos-inventory-demo` runs this plugin through
the real `zen generate` CLI, and the generated file type-checks against a
real `jazz-tools@0.20.19` install. See root `PLAN.md` M2 and
`../../docs/plugin-api-notes.md` for exactly what was confirmed vs. what's
still a guess (in particular: `BigInt`/`Decimal`/`Bytes` scalar mapping is a
known-lossy placeholder, flagged inline in generated output).
