# @mdht/plugin-jazz-schema

[![npm](https://img.shields.io/npm/v/@mdht/plugin-jazz-schema.svg)](https://www.npmjs.com/package/@mdht/plugin-jazz-schema)
[![CI](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml)

Generate a typed Jazz CoValue schema from a ZenStack `.zmodel`. Models become
`co.map` definitions, list relations become `co.list`, and enums remain literal
tuples and TypeScript unions.

![Schema Codegen Bridge architecture](https://raw.githubusercontent.com/standard-librarian/prisma-schema-codegen-bridge/main/docs/architecture.svg)

## Install

```bash
npm install --save-dev @zenstackhq/cli @mdht/plugin-jazz-schema
npm install jazz-tools
```

## Configure

```zmodel
plugin jazz {
    provider = '@mdht/plugin-jazz-schema'
    output = '../generated/jazz-schema.ts'
}
```

Then run:

```bash
npx zen generate
```

## Example

Given:

```zmodel
enum Visibility {
    PRIVATE
    PUBLIC
}

model Project {
    id         String     @id @default(cuid())
    name       String
    visibility Visibility
    tasks      Task[]
}
```

the plugin emits the equivalent of:

```ts
export const VisibilityValues = ['PRIVATE', 'PUBLIC'] as const;
export type Visibility = (typeof VisibilityValues)[number];

export const Project = co.map({
  id: z.string(),
  name: z.string(),
  visibility: z.enum(VisibilityValues),
  get tasks() { return co.list(Task); },
});
```

Getter-form relations make circular and forward model references safe.

## Scalar mapping

| ZModel | Jazz validator |
|---|---|
| `String` / `Bytes` | `z.string()` |
| `Int` / `Float` / `BigInt` / `Decimal` | `z.number()` |
| `Boolean` | `z.boolean()` |
| `DateTime` | `z.date()` |
| `Json` / `Unsupported(...)` | `z.unknown()` |

`BigInt`, `Decimal`, and `Bytes` are intentionally marked as lossy in generated
code until confirmed Jazz-native representations are available.

## Requirements

- Node.js 22.6 or newer
- ZenStack 3.9.x
- jazz-tools 0.20.x

See the [full project documentation](https://github.com/standard-librarian/prisma-schema-codegen-bridge#readme)
and [working example](https://github.com/standard-librarian/prisma-schema-codegen-bridge/tree/main/examples/pos-inventory-demo).

## License

MIT
