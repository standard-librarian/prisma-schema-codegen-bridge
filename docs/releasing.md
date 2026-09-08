# Releasing to npm

All five publishable packages use the same version. Publish the shared core
first, the three generators second, and the CLI last so every dependency is
available when npm validates the next package.

## Preflight

```bash
npm whoami
pnpm install --frozen-lockfile
pnpm run verify
pnpm run pack:dry-run
```

The CI packaging job also installs pnpm-produced tarballs into a clean temporary
project and runs real generation. This catches undeclared dependencies,
unrewritten `workspace:` ranges, and executable packaging failures.

## Publish 0.2.0

Use `pnpm publish`, not `npm publish`, for packages with `workspace:`
dependencies. pnpm rewrites those ranges in the published manifest.

```bash
cd packages/generator-core
pnpm publish --access public

cd ../plugin-jazz-schema
pnpm publish --access public

cd ../plugin-ts-rest-contract
pnpm publish --access public

cd ../plugin-betterauth-claims
pnpm publish --access public

cd ../cli
pnpm publish --access public
```

After registry propagation, verify the release from outside the repository:

```bash
npm view @mdht/generator-core version
npm view @mdht/plugin-jazz-schema version
npm view @mdht/plugin-ts-rest-contract version
npm view @mdht/plugin-betterauth-claims version
npm view schema-codegen-bridge version
```

Commit the version and changelog changes before publishing, then tag the exact
published commit as `v0.2.0`.
