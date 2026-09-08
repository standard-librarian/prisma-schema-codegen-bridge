import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages/cli/dist/bin.js');
const exampleDir = path.join(repoRoot, 'examples/pos-inventory-demo');

function run(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

test('discovers the default schema and forwards args after --', () => {
  const result = run(['generate', '--', '--silent'], exampleDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('accepts --schema=<path>', () => {
  const result = run(['generate', '--schema=zenstack/schema.zmodel', '--silent'], exampleDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('rejects a missing --schema value', () => {
  const result = run(['generate', '--schema'], exampleDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--schema requires a path/);
});

test('uses package.json zenstack.schema and ignores plugin names in comments', (t) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-codegen-cli-'));
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(fixtureDir, 'package.json'),
    JSON.stringify({ zenstack: { schema: 'custom/schema.zmodel' } }),
  );
  fs.mkdirSync(path.join(fixtureDir, 'custom'));
  fs.writeFileSync(
    path.join(fixtureDir, 'custom/schema.zmodel'),
    [
      "datasource db { provider = 'sqlite' url = 'file:./dev.db' }",
      '// @mdht/plugin-jazz-schema',
      '// @mdht/plugin-ts-rest-contract',
      '// @mdht/plugin-betterauth-claims',
    ].join('\n'),
  );

  const result = run(['generate'], fixtureDir);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(path.join('custom', 'schema.zmodel')), result.stderr);
  assert.match(result.stderr, /missing 3/);
});

test('prints help without requiring a schema', () => {
  const output = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf-8' });
  assert.match(output, /^Usage: schema-codegen-bridge generate/);
});
