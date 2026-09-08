# @mdht/plugin-ts-rest-contract

[![npm](https://img.shields.io/npm/v/@mdht/plugin-ts-rest-contract.svg)](https://www.npmjs.com/package/@mdht/plugin-ts-rest-contract)
[![CI](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml)

Generate a typed ts-rest CRUD contract from selected ZenStack models. The
generated request and response validators use Effect Schema through the Standard
Schema interface—no parallel Zod model to maintain.

![Schema Codegen Bridge architecture](https://raw.githubusercontent.com/standard-librarian/prisma-schema-codegen-bridge/main/docs/architecture.svg)

## Install

```bash
npm install --save-dev @zenstackhq/cli @mdht/plugin-ts-rest-contract
npm install effect @ts-rest/core@3.53.0-rc.1
```

The exact ts-rest release candidate is currently required. ts-rest 3.52.x does
not accept Standard Schema validators in contracts.

## Configure

```zmodel
plugin tsRestContract {
    provider = '@mdht/plugin-ts-rest-contract'
    output = '../generated/ts-rest-contract.ts'
}

model Product {
    sku         String  @id
    name        String
    description String?
    createdAt   DateTime @default(now())

    @@tsRestContract
}
```

Run `npx zen generate`. The generated module exports:

- `ProductSchema` for complete response records
- `ProductCreateSchema` for create bodies
- `ProductUpdateSchema` for patch bodies
- `productContract` for the model's five CRUD routes
- `contract` combining every marked model

## Generated routes

| Operation | Method and path |
|---|---|
| List | `GET /products` |
| Read | `GET /products/:sku` |
| Create | `POST /products` |
| Update | `PATCH /products/:sku` |
| Delete | `DELETE /products/:sku` |

Natural IDs without defaults remain required in create bodies. Defaulted fields
are optional on create, nullable fields accept `null`, and ID fields are excluded
from patch bodies. Compound IDs produce one path segment per ID field, for
example `/warehouseBins/:warehouseId/:binNumber`.

```ts
import { initClient } from '@ts-rest/core';
import { contract } from './generated/ts-rest-contract.js';

export const api = initClient(contract, {
  baseUrl: 'https://api.example.com',
  baseHeaders: {},
});
```

## Scalar mapping

| ZModel | Effect Schema |
|---|---|
| `String` | `Schema.String` |
| `Int` / `Float` | `Schema.Number` |
| `Boolean` | `Schema.Boolean` |
| `DateTime` | `Schema.DateFromString` |
| Enum | `Schema.Literal(...)` |
| `Json` / `Unsupported(...)` | `Schema.Unknown` |

Relations are intentionally excluded from REST schemas; their scalar foreign-key
fields remain. `BigInt`, `Decimal`, and `Bytes` use documented lossy fallbacks.

## Requirements

- Node.js 22.6 or newer
- ZenStack 3.9.x
- Effect 3.16 or newer
- `@ts-rest/core@3.53.0-rc.1`

See the [full documentation](https://github.com/standard-librarian/prisma-schema-codegen-bridge#readme)
and [verified example](https://github.com/standard-librarian/prisma-schema-codegen-bridge/tree/main/examples/pos-inventory-demo).

## License

MIT
