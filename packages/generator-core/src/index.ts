// Neutral intermediate representation built from the ZModel AST, shared by
// all generator plugins so none of them re-implements AST traversal.
//
// Ground truth for the AST shapes used here was taken directly from
// @zenstackhq/language's compiled type declarations (ast-*.d.mts) and
// @zenstackhq/sdk's CliPlugin/ModelUtils exports, not from docs prose --
// see ../../docs/plugin-api-notes.md for how that was confirmed.

import type { DataField, DataModel, Enum, Model } from '@zenstackhq/language/ast';
import { isDataModel, isEnum } from '@zenstackhq/language/ast';
import { ModelUtils } from '@zenstackhq/sdk';

export type IrScalarType =
  | 'String'
  | 'Int'
  | 'Float'
  | 'Boolean'
  | 'DateTime'
  | 'BigInt'
  | 'Decimal'
  | 'Bytes'
  | 'Json';

export interface IrFieldBase {
  name: string;
  isList: boolean;
  isOptional: boolean;
}

export interface IrScalarField extends IrFieldBase {
  kind: 'scalar';
  scalarType: IrScalarType;
}

export interface IrEnumField extends IrFieldBase {
  kind: 'enum';
  enumName: string;
}

export interface IrRelationField extends IrFieldBase {
  kind: 'relation';
  relationTarget: string;
}

export type IrField = IrScalarField | IrEnumField | IrRelationField;

export interface IrModel {
  name: string;
  fields: IrField[];
}

export interface IrEnum {
  name: string;
  values: string[];
}

export interface Ir {
  models: IrModel[];
  enums: IrEnum[];
}

/**
 * Walks the ZModel AST and produces a neutral IR: one entry per data model
 * (using `ModelUtils.getOwnedFields` so mixin-contributed fields are
 * included the same way Prisma/ZenStack itself treats them) and one entry
 * per enum declaration.
 */
export function buildIr(model: Model): Ir {
  const enumDecls = model.declarations.filter(isEnum);
  const modelDecls = model.declarations.filter(isDataModel);
  const enumNames = new Set(enumDecls.map((e) => e.name));

  return {
    enums: enumDecls.map(toIrEnum),
    models: modelDecls.map((dm) => toIrModel(dm, enumNames)),
  };
}

function toIrEnum(decl: Enum): IrEnum {
  return {
    name: decl.name,
    values: decl.fields.map((f) => f.name),
  };
}

function toIrModel(decl: DataModel, enumNames: Set<string>): IrModel {
  return {
    name: decl.name,
    fields: ModelUtils.getOwnedFields(decl).map((f) => toIrField(f, enumNames)),
  };
}

function toIrField(field: DataField, enumNames: Set<string>): IrField {
  const type = field.type;
  const base: IrFieldBase = {
    name: field.name,
    isList: type.array,
    isOptional: type.optional,
  };

  if (type.reference) {
    const targetName = type.reference.$refText;
    if (enumNames.has(targetName)) {
      return { ...base, kind: 'enum', enumName: targetName };
    }
    return { ...base, kind: 'relation', relationTarget: targetName };
  }

  // `type.type` is a Prisma-style BuiltinType when the field isn't a
  // relation/enum reference. `type.unsupported` (raw DB-native types) is not
  // handled yet -- see docs/plugin-api-notes.md open questions.
  return { ...base, kind: 'scalar', scalarType: (type.type ?? 'String') as IrScalarType };
}
