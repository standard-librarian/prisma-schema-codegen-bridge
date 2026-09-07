// ZenStack CLI plugin: emits a ts-rest CRUD contract, with Effect Schema
// (wrapped via Schema.standardSchemaV1 into the Standard Schema interface
// ts-rest's contract types accept) for every model marked `@@tsRestContract`
// in plugin.zmodel. See ../../PLAN.md M3 and ../../docs/plugin-api-notes.md.
//
// CONFIDENCE NOTE: @ts-rest/core's *stable* release (3.52.1) only accepts
// `z.ZodSchema` in contract positions -- Standard Schema support (needed to
// use Effect Schema instead of Zod) only exists in `3.53.0-rc.1` as of this
// writing, confirmed by reading that package's installed .d.ts directly
// (`ContractAnyType = z.ZodSchema | StandardSchemaV1<any> | ...`). This
// package pins the RC deliberately -- see package.json -- and that pin is a
// real risk, not a placeholder: revisit when 3.53 stabilizes.

import fs from 'node:fs';
import path from 'node:path';
import type { CliPlugin } from '@zenstackhq/sdk';
import { ModelUtils } from '@zenstackhq/sdk';
import { isDataModel } from '@zenstackhq/language/ast';
import type { DataModel } from '@zenstackhq/language/ast';
import { buildIr, type IrField, type IrModel } from '@codegen-bridge/generator-core';

const MARKER_ATTRIBUTE = '@@tsRestContract';

const SCALAR_TO_EFFECT_SCHEMA: Record<string, string> = {
  String: 'Schema.String',
  Int: 'Schema.Number',
  Float: 'Schema.Number',
  Boolean: 'Schema.Boolean',
  DateTime: 'Schema.DateFromString',
  BigInt: 'Schema.Number /* TODO: precision loss, see plugin-jazz-schema for the same open question */',
  Decimal: 'Schema.Number /* TODO: precision loss, see plugin-jazz-schema for the same open question */',
  Bytes: 'Schema.String /* TODO: no confirmed binary schema chosen yet */',
  Json: 'Schema.Unknown',
};

// Relation fields are deliberately out of scope for the v0 CRUD contract --
// see docs/plugin-api-notes.md / PLAN.md open questions. Only the plain
// foreign-key scalar field (e.g. `orderId`) is included, since that's a real
// scalar column on this model, not a nested resource.
function structFieldLines(fields: IrField[], enumValueConsts: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const f of fields) {
    if (f.kind === 'relation') continue;
    let expr: string;
    if (f.kind === 'enum') {
      const valuesConstName = enumValueConsts.get(f.enumName);
      expr = `Schema.Literal(...${valuesConstName})`;
    } else {
      expr = SCALAR_TO_EFFECT_SCHEMA[f.scalarType] ?? 'Schema.Unknown /* TODO: unmapped scalar type */';
    }
    if (f.isList) expr = `Schema.Array(${expr})`;
    if (f.isOptional) expr = `Schema.optional(${expr})`;
    lines.push(`  ${f.name}: ${expr},`);
  }
  return lines;
}

function buildModelContract(
  irModel: IrModel,
  decl: DataModel,
  enumValueConsts: Map<string, string>,
): string {
  const name = irModel.name;
  const idFields = new Set(ModelUtils.getIdFields(decl));
  const rawFieldsByName = new Map(ModelUtils.getOwnedFields(decl).map((f) => [f.name, f] as const));
  const fieldsExcludingRelations = irModel.fields.filter((f) => f.kind !== 'relation');
  const createFields = fieldsExcludingRelations
    .filter((f) => !idFields.has(f.name))
    .map((f) => {
      // Fields with a schema-level @default (e.g. `createdAt DateTime @default(now())`)
      // shouldn't be required on create, even if the ZModel type itself isn't `?`.
      const raw = rawFieldsByName.get(f.name);
      const hasDefault = raw ? ModelUtils.hasAttribute(raw, '@default') : false;
      return hasDefault ? { ...f, isOptional: true } : f;
    });

  const recordSchemaName = `${name}Schema`;
  const createSchemaName = `${name}CreateSchema`;
  const routeGroupName = `${name.charAt(0).toLowerCase()}${name.slice(1)}Contract`;
  const resourcePath = `/${name.charAt(0).toLowerCase()}${name.slice(1)}s`;

  const lines: string[] = [];
  // Exported (not just used internally) so consumers -- including
  // examples/pos-inventory-demo's cross-artifact shape check, PLAN.md M5 --
  // can introspect `.fields` without re-deriving the struct shape themselves.
  lines.push(`export const ${recordSchemaName} = Schema.Struct({`);
  lines.push(...structFieldLines(fieldsExcludingRelations, enumValueConsts));
  lines.push('});');
  lines.push('');
  lines.push(`const ${createSchemaName} = Schema.Struct({`);
  lines.push(...structFieldLines(createFields, enumValueConsts));
  lines.push('});');
  lines.push('');
  lines.push(`export const ${routeGroupName} = c.router({`);
  lines.push('  list: {');
  lines.push("    method: 'GET',");
  lines.push(`    path: '${resourcePath}',`);
  lines.push(`    responses: { 200: Schema.standardSchemaV1(Schema.Array(${recordSchemaName})) },`);
  lines.push('  },');
  lines.push('  getById: {');
  lines.push("    method: 'GET',");
  lines.push(`    path: '${resourcePath}/:id',`);
  lines.push('    pathParams: Schema.standardSchemaV1(Schema.Struct({ id: Schema.String })),');
  lines.push(`    responses: { 200: Schema.standardSchemaV1(${recordSchemaName}), 404: Schema.standardSchemaV1(Schema.Struct({ message: Schema.String })) },`);
  lines.push('  },');
  lines.push('  create: {');
  lines.push("    method: 'POST',");
  lines.push(`    path: '${resourcePath}',`);
  lines.push(`    body: Schema.standardSchemaV1(${createSchemaName}),`);
  lines.push(`    responses: { 201: Schema.standardSchemaV1(${recordSchemaName}) },`);
  lines.push('  },');
  lines.push('  update: {');
  lines.push("    method: 'PATCH',");
  lines.push(`    path: '${resourcePath}/:id',`);
  lines.push('    pathParams: Schema.standardSchemaV1(Schema.Struct({ id: Schema.String })),');
  lines.push(`    body: Schema.standardSchemaV1(Schema.partial(${createSchemaName})),`);
  lines.push(`    responses: { 200: Schema.standardSchemaV1(${recordSchemaName}) },`);
  lines.push('  },');
  lines.push('  remove: {');
  lines.push("    method: 'DELETE',");
  lines.push(`    path: '${resourcePath}/:id',`);
  lines.push('    pathParams: Schema.standardSchemaV1(Schema.Struct({ id: Schema.String })),');
  lines.push('    body: c.noBody(),');
  lines.push('    responses: { 204: c.noBody() },');
  lines.push('  },');
  lines.push('});');
  return lines.join('\n');
}

const plugin: CliPlugin = {
  name: 'ts-rest Contract Bridge',
  statusText: 'Generating ts-rest contract',

  generate: ({ model, defaultOutputPath, pluginOptions }) => {
    const ir = buildIr(model);
    const dataModelDecls = model.declarations.filter(isDataModel);
    const markedDecls = dataModelDecls.filter((dm) => ModelUtils.hasAttribute(dm, MARKER_ATTRIBUTE));

    if (markedDecls.length === 0) {
      // Nothing marked -- nothing to generate. Not an error: a schema with
      // no `@@tsRestContract` models is valid, it just doesn't need this
      // plugin to do anything.
      return;
    }

    const enumValueConsts = new Map(ir.enums.map((e) => [e.name, `${e.name}Values`]));

    const outFile =
      typeof pluginOptions.output === 'string'
        ? pluginOptions.output
        : path.join(defaultOutputPath, 'ts-rest-contract.ts');

    const lines: string[] = [];
    lines.push('// AUTO-GENERATED by @codegen-bridge/plugin-ts-rest-contract. Do not edit by hand.');
    lines.push("import { initContract } from '@ts-rest/core';");
    lines.push("import { Schema } from 'effect';");
    lines.push('');
    lines.push('const c = initContract();');
    lines.push('');

    for (const e of ir.enums) {
      const values = e.values.map((v) => `'${v}'`).join(', ');
      lines.push(`export const ${e.name}Values = [${values}] as const;`);
    }
    if (ir.enums.length > 0) lines.push('');

    const routeGroupNames: string[] = [];
    for (const decl of markedDecls) {
      const irModel = ir.models.find((m) => m.name === decl.name);
      if (!irModel) continue; // should be unreachable: every DataModel has a matching IrModel
      lines.push(buildModelContract(irModel, decl, enumValueConsts));
      lines.push('');
      routeGroupNames.push(`${decl.name.charAt(0).toLowerCase()}${decl.name.slice(1)}Contract`);
    }

    lines.push('export const contract = c.router({');
    for (const decl of markedDecls) {
      const key = `${decl.name.charAt(0).toLowerCase()}${decl.name.slice(1)}s`;
      const group = `${decl.name.charAt(0).toLowerCase()}${decl.name.slice(1)}Contract`;
      lines.push(`  ${key}: ${group},`);
    }
    lines.push('});');

    const resolvedOutFile = path.isAbsolute(outFile) ? outFile : path.resolve(defaultOutputPath, outFile);
    fs.mkdirSync(path.dirname(resolvedOutFile), { recursive: true });
    fs.writeFileSync(resolvedOutFile, lines.join('\n') + '\n', 'utf-8');
  },
};

export default plugin;
