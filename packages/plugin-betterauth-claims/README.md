# @mdht/plugin-betterauth-claims

[![npm](https://img.shields.io/npm/v/@mdht/plugin-betterauth-claims.svg)](https://www.npmjs.com/package/@mdht/plugin-betterauth-claims)
[![CI](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/standard-librarian/prisma-schema-codegen-bridge/actions/workflows/ci.yml)

Generate BetterAuth `additionalFields` from enum fields on the ZenStack auth
model. One enum then drives both BetterAuth session typing and ZenStack access
policies such as `auth().role == 'ADMIN'`.

![Schema Codegen Bridge architecture](https://raw.githubusercontent.com/standard-librarian/prisma-schema-codegen-bridge/main/docs/architecture.svg)

## Install

```bash
npm install --save-dev @zenstackhq/cli @mdht/plugin-betterauth-claims
npm install better-auth @better-auth/core effect
```

## Configure

```zmodel
plugin betterauthClaims {
    provider = '@mdht/plugin-betterauth-claims'
    output = '../generated/betterauth-claims.ts'
}

enum Role {
    MEMBER
    ADMIN
}

model User {
    id   String @id @default(cuid())
    role Role

    @@auth
}
```

Run `npx zen generate`, then add the generated configuration to BetterAuth:

```ts
import { betterAuth } from 'better-auth';
import { additionalFields } from './generated/betterauth-claims.js';

export const auth = betterAuth({
  user: { additionalFields },
});

type SessionRole = typeof auth.$Infer.Session.user.role;
//   ^? 'MEMBER' | 'ADMIN'
```

Each claim is generated with:

- a literal string array for BetterAuth's inferred union;
- an Effect `Schema.Literal` wrapped as Standard Schema;
- `input: false`, so privileged claims are not trusted from user input;
- `required: false` when the ZModel field is nullable.

The module also exports each enum tuple/type and individual field configuration,
such as `RoleValues`, `Role`, and `roleField`.

## Requirements and limits

- Node.js 22.6 or newer
- ZenStack 3.9.x
- BetterAuth 1.7.x
- Effect 3.16 or newer
- The auth target must be a `model`, selected by `@@auth` or ZenStack's `User`
  fallback.
- Only enum-typed auth fields are generated today; scalar custom claims and
  `type` / `TypeDef` auth targets are not yet supported.

See the [full documentation](https://github.com/standard-librarian/prisma-schema-codegen-bridge#readme)
and [verified example](https://github.com/standard-librarian/prisma-schema-codegen-bridge/tree/main/examples/pos-inventory-demo).

## License

MIT
