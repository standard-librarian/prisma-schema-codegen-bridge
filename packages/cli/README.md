# schema-codegen-bridge

[![npm](https://img.shields.io/npm/v/schema-codegen-bridge.svg)](https://www.npmjs.com/package/schema-codegen-bridge)
[![CI](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml)

A focused wrapper around `zen generate` for the Prisma Schema Codegen Bridge
suite. It finds the same schema locations as ZenStack, verifies that all three
generator blocks are configured, then runs the installed ZenStack CLI directly.

![Schema Codegen Bridge architecture](https://raw.githubusercontent.com/standard-librarian/prisma-schema-codegen-bridge/main/docs/architecture.svg)

## Install

```bash
npm install --save-dev schema-codegen-bridge \
  @mdht/plugin-jazz-schema \
  @mdht/plugin-ts-rest-contract \
  @mdht/plugin-betterauth-claims
```

`@zenstackhq/cli` is included, so a separate CLI install is not required.

## Configure

Add all three blocks to your `.zmodel` file:

```zmodel
plugin jazz {
    provider = '@mdht/plugin-jazz-schema'
    output = '../generated/jazz-schema.ts'
}

plugin tsRestContract {
    provider = '@mdht/plugin-ts-rest-contract'
    output = '../generated/ts-rest-contract.ts'
}

plugin betterauthClaims {
    provider = '@mdht/plugin-betterauth-claims'
    output = '../generated/betterauth-claims.ts'
}
```

## Run

```bash
npx schema-codegen-bridge generate
```

Schema discovery follows this order:

1. `zenstack.schema` in the nearest `package.json`
2. `schema.zmodel`
3. `zenstack/schema.zmodel`

Override it or forward additional ZenStack flags when needed:

```bash
npx schema-codegen-bridge generate --schema ./db/app.zmodel
npx schema-codegen-bridge generate -- --silent
```

The wrapper never downloads a second CLI through `npx`; it executes its declared
`@zenstackhq/cli` dependency. Missing blocks produce copy-pasteable configuration
instead of a later unresolved attribute or missing output.

## Requirements

- Node.js 22.6 or newer
- The runtime dependencies required by each generated artifact

For package-specific setup and a complete example, see the
[project documentation](https://github.com/standard-librarian/prisma-schema-codegen-bridge#readme).

## License

MIT
