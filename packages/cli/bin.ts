#!/usr/bin/env node
// `schema-codegen-bridge generate` -- PLAN.md M6. This is deliberately a
// thin wrapper around the real `zen generate` CLI, not a reimplementation:
// ZenStack's plugin system requires each of the three plugin blocks to be
// declared directly in the consumer's own .zmodel (that's how custom
// attributes like `@@tsRestContract`/`@@auth` get registered -- see
// docs/plugin-api-notes.md), so there's no way for an external wrapper to
// inject them invisibly. What this CLI actually adds:
//
// 1. A single command instead of remembering to run `zen generate` with the
//    right --schema path.
// 2. A specific, actionable error if the schema is missing one of this
//    bridge's three plugin blocks -- instead of the confusing failure you'd
//    get later (an unresolved `@@tsRestContract` attribute, or a silently
//    absent generated file) if someone copy-pastes a schema without them.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface RequiredPlugin {
  packageName: string;
  purpose: string;
  snippet: string;
}

const REQUIRED_PLUGINS: RequiredPlugin[] = [
  {
    packageName: '@codegen-bridge/plugin-jazz-schema',
    purpose: 'Jazz CoValue schema',
    snippet: `plugin jazz {\n    provider = '@codegen-bridge/plugin-jazz-schema'\n    output = '../generated/jazz-schema.ts'\n}`,
  },
  {
    packageName: '@codegen-bridge/plugin-ts-rest-contract',
    purpose: 'ts-rest contract (models marked @@tsRestContract)',
    snippet: `plugin tsRestContract {\n    provider = '@codegen-bridge/plugin-ts-rest-contract'\n    output = '../generated/ts-rest-contract.ts'\n}`,
  },
  {
    packageName: '@codegen-bridge/plugin-betterauth-claims',
    purpose: "BetterAuth additionalFields (the @@auth model's enum fields)",
    snippet: `plugin betterauthClaims {\n    provider = '@codegen-bridge/plugin-betterauth-claims'\n    output = '../generated/betterauth-claims.ts'\n}`,
  },
];

const DEFAULT_SCHEMA_PATH = path.join('zenstack', 'schema.zmodel');

function printUsage(): void {
  console.error('Usage: schema-codegen-bridge generate [--schema <path>] [-- <extra zen generate args>]');
}

function resolveSchemaPath(args: string[]): string {
  const flagIndex = args.indexOf('--schema');
  const explicit = flagIndex !== -1 ? args[flagIndex + 1] : undefined;
  const schemaPath = path.resolve(process.cwd(), explicit ?? DEFAULT_SCHEMA_PATH);
  if (!fs.existsSync(schemaPath)) {
    console.error(`Could not find a schema at ${schemaPath}.`);
    console.error(explicit ? 'Check the --schema path.' : `Pass --schema <path> if your schema isn't at the default location (${DEFAULT_SCHEMA_PATH}).`);
    process.exit(1);
  }
  return schemaPath;
}

function checkRequiredPlugins(schemaPath: string): void {
  const schemaText = fs.readFileSync(schemaPath, 'utf-8');
  const missing = REQUIRED_PLUGINS.filter((p) => !schemaText.includes(p.packageName));
  if (missing.length === 0) return;

  console.error(`\n${schemaPath} is missing ${missing.length} of schema-codegen-bridge's plugin block(s):\n`);
  for (const m of missing) {
    console.error(`# ${m.purpose}`);
    console.error(m.snippet);
    console.error('');
  }
  console.error('Add the missing block(s) above to your schema (and the corresponding package as a dependency), then re-run.');
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] !== 'generate') {
    printUsage();
    process.exit(1);
  }

  const schemaPath = resolveSchemaPath(args);
  checkRequiredPlugins(schemaPath);

  // Everything after "generate", minus a "--schema <path>" pair (already
  // consumed above and re-added explicitly, resolved to an absolute path).
  const rest = args.slice(1);
  const restSchemaFlagIndex = rest.indexOf('--schema');
  const passthrough = restSchemaFlagIndex === -1 ? rest : [...rest.slice(0, restSchemaFlagIndex), ...rest.slice(restSchemaFlagIndex + 2)];

  const result = spawnSync('npx', ['zen', 'generate', '--schema', schemaPath, ...passthrough], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

main();
