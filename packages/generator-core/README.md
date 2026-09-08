# @mdht/generator-core

[![npm](https://img.shields.io/npm/v/@mdht/generator-core.svg)](https://www.npmjs.com/package/@mdht/generator-core)
[![CI](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml)

The shared ZModel AST → intermediate representation used by the Schema Codegen
Bridge plugins. Use it when building a ZenStack generator that should agree with
the Jazz, ts-rest, and BetterAuth outputs without reimplementing AST traversal.

## Install

```bash
npm install @mdht/generator-core
```

## API

```ts
import { buildIr } from '@mdht/generator-core';
import type { CliPlugin } from '@zenstackhq/sdk';

const plugin: CliPlugin = {
  name: 'My generator',
  generate({ model }) {
    const ir = buildIr(model);

    for (const dataModel of ir.models) {
      console.log(dataModel.name, dataModel.fields);
    }
  },
};

export default plugin;
```

`buildIr(model)` returns:

```ts
interface Ir {
  models: Array<{
    name: string;
    fields: Array<
      | { kind: 'scalar'; name: string; scalarType: string; isList: boolean; isOptional: boolean }
      | { kind: 'enum'; name: string; enumName: string; isList: boolean; isOptional: boolean }
      | { kind: 'relation'; name: string; relationTarget: string; isList: boolean; isOptional: boolean }
    >;
  }>;
  enums: Array<{ name: string; values: string[] }>;
}
```

Mixin-owned fields are included through ZenStack's `ModelUtils.getOwnedFields`.
Unsupported database-native types remain explicit as `Unsupported`; they are not
silently reported as strings.

## Requirements

- Node.js 22.6 or newer
- ZenStack 3.9.x

See the
[repository](https://github.com/standard-librarian/prisma-schema-codegen-bridge)
for the complete generator suite and verified example.

## License

MIT
