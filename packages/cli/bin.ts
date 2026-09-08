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
import { createRequire } from 'node:module';
import path from 'node:path';

interface RequiredPlugin {
  packageName: string;
  purpose: string;
  snippet: string;
}

const REQUIRED_PLUGINS: RequiredPlugin[] = [
  {
    packageName: '@mdht/plugin-jazz-schema',
    purpose: 'Jazz CoValue schema',
    snippet: `plugin jazz {\n    provider = '@mdht/plugin-jazz-schema'\n    output = '../generated/jazz-schema.ts'\n}`,
  },
  {
    packageName: '@mdht/plugin-ts-rest-contract',
    purpose: 'ts-rest contract (models marked @@tsRestContract)',
    snippet: `plugin tsRestContract {\n    provider = '@mdht/plugin-ts-rest-contract'\n    output = '../generated/ts-rest-contract.ts'\n}`,
  },
  {
    packageName: '@mdht/plugin-betterauth-claims',
    purpose: "BetterAuth additionalFields (the @@auth model's enum fields)",
    snippet: `plugin betterauthClaims {\n    provider = '@mdht/plugin-betterauth-claims'\n    output = '../generated/betterauth-claims.ts'\n}`,
  },
];

const DEFAULT_SCHEMA_PATH = path.join('zenstack', 'schema.zmodel');

interface ParsedArgs {
  schema?: string;
  passthrough: string[];
}

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
  stream.write('Usage: schema-codegen-bridge generate [--schema <path>] [-- <extra zen generate args>]\n');
}

function parseArgs(args: string[]): ParsedArgs {
  const passthrough: string[] = [];
  let schema: string | undefined;

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      passthrough.push(...args.slice(i + 1));
      break;
    }
    if (arg === '--schema') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) throw new Error('--schema requires a path.');
      schema = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--schema=')) {
      const value = arg.slice('--schema='.length);
      if (!value) throw new Error('--schema requires a path.');
      schema = value;
      continue;
    }
    passthrough.push(arg);
  }

  return { schema, passthrough };
}

function findNearestPackageJson(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function schemaFromPackageJson(cwd: string): string | undefined {
  const packageJsonPath = findNearestPackageJson(cwd);
  if (!packageJsonPath) return undefined;
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      zenstack?: { schema?: unknown };
    };
    const configured = packageJson.zenstack?.schema;
    return typeof configured === 'string' && configured.length > 0
      ? path.resolve(path.dirname(packageJsonPath), configured)
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveSchemaPath(explicit: string | undefined): string {
  const cwd = process.cwd();
  const candidates = explicit
    ? [path.resolve(cwd, explicit)]
    : [schemaFromPackageJson(cwd), path.resolve(cwd, 'schema.zmodel'), path.resolve(cwd, DEFAULT_SCHEMA_PATH)].filter(
        (candidate): candidate is string => !!candidate,
      );
  const schemaPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!schemaPath) {
    if (explicit) {
      throw new Error(`Could not find a schema at ${candidates[0]}. Check the --schema path.`);
    }
    throw new Error(
      'Could not find a ZenStack schema. Configure zenstack.schema in package.json, or add schema.zmodel or zenstack/schema.zmodel.',
    );
  }
  return schemaPath;
}

function stripComments(source: string): string {
  let result = '';
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (quote) {
      result += char;
      if (char === '\\' && next) {
        result += next;
        i += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      result += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      result += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    result += char;
  }
  return result;
}

function checkRequiredPlugins(schemaPath: string): void {
  const schemaText = stripComments(fs.readFileSync(schemaPath, 'utf-8'));
  const providers = new Set(
    [...schemaText.matchAll(/\bprovider\s*=\s*(['"])([^'"]+)\1/g)].map((match) => match[2]),
  );
  const missing = REQUIRED_PLUGINS.filter((p) => !providers.has(p.packageName));
  if (missing.length === 0) return;

  let message = `\n${schemaPath} is missing ${missing.length} of schema-codegen-bridge's plugin block(s):\n\n`;
  for (const m of missing) {
    message += `# ${m.purpose}\n${m.snippet}\n\n`;
  }
  message += 'Add the missing block(s) above to your schema (and the corresponding package as a dependency), then re-run.';
  throw new Error(message);
}

function resolveZenCliPath(): string {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve('@zenstackhq/cli/package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
    bin?: string | Record<string, string>;
  };
  const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.zen;
  if (!bin) throw new Error('@zenstackhq/cli does not expose the expected "zen" executable.');
  return path.resolve(path.dirname(packageJsonPath), bin);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage(process.stdout);
    return;
  }
  if (args[0] !== 'generate') {
    printUsage();
    process.exit(1);
  }

  try {
    const parsed = parseArgs(args);
    const schemaPath = resolveSchemaPath(parsed.schema);
    checkRequiredPlugins(schemaPath);

    // Execute the package we depend on directly. Going through `npx` can do
    // a registry lookup (or even offer to install a different package) when
    // executable resolution changes under a workspace or package manager.
    const result = spawnSync(process.execPath, [resolveZenCliPath(), 'generate', '--schema', schemaPath, ...parsed.passthrough], {
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
