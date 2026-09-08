// PLAN.md M5: a compile-time (and runtime) check that the three generated
// artifacts actually agree on shape, instead of just trusting that they do
// because they're all built from the same generator-core IR. If any one
// plugin drifts (wrong field name, stale cache, hand-edit), this file
// should fail to type-check, and `node verify-shape.ts` should throw.
//
// Two independent checks, chosen because they're the two places drift could
// actually happen without any single generated file looking wrong in
// isolation:
//
// 1. The `Role` enum is emitted independently by all three plugins
//    (jazz-schema.ts, ts-rest-contract.ts, betterauth-claims.ts). They
//    should be the exact same literal tuple, not just "compatible" arrays.
// 2. `InventoryItem`/`Order`'s ts-rest contract fields (Jazz relations
//    excluded, per plugin-ts-rest-contract's documented scope) should be an
//    exact subset of the Jazz CoValue's own field shape -- i.e. nothing in
//    the ts-rest contract that isn't a real field on the Jazz CoValue.

import assert from 'node:assert/strict';
import { InventoryItem, Order, RoleValues as JazzRoleValues, WarehouseBin } from './generated/jazz-schema.ts';
import {
  InventoryItemSchema,
  OrderSchema,
  RoleValues as ContractRoleValues,
  WarehouseBinCreateSchema,
  WarehouseBinSchema,
  WarehouseBinUpdateSchema,
  warehouseBinContract,
} from './generated/ts-rest-contract.ts';
import { RoleValues as AuthRoleValues } from './generated/betterauth-claims.ts';
import { Schema } from 'effect';

// ---- Type-level: exact type equality, the standard tsd/expect-type trick ----
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- Type-level: "every key of Sub also exists in Sup" ----
type KeysSubsetOf<Sub extends PropertyKey, Sup extends PropertyKey> = Exclude<Sub, Sup> extends never
  ? true
  : { error: 'keys present in the ts-rest contract but missing from the Jazz CoValue shape'; extraKeys: Exclude<Sub, Sup> };

type MustBeTrue<T extends true> = T;

// If any of these three don't line up, TypeScript fails to compile this
// file -- that's the "failing compile-time check" from PLAN.md's
// Definition of Done, not just a comment promising one exists.
type _RoleEqualJazzVsContract = MustBeTrue<Equal<typeof JazzRoleValues, typeof ContractRoleValues>>;
type _RoleEqualJazzVsAuth = MustBeTrue<Equal<typeof JazzRoleValues, typeof AuthRoleValues>>;

type _InventoryItemFieldsSubset = MustBeTrue<
  KeysSubsetOf<keyof (typeof InventoryItemSchema)['fields'], keyof (typeof InventoryItem)['shape']>
>;
type _OrderFieldsSubset = MustBeTrue<KeysSubsetOf<keyof (typeof OrderSchema)['fields'], keyof (typeof Order)['shape']>>;
type _WarehouseBinFieldsSubset = MustBeTrue<
  KeysSubsetOf<keyof (typeof WarehouseBinSchema)['fields'], keyof (typeof WarehouseBin)['shape']>
>;
type _WarehouseBinCreateFields = MustBeTrue<
  Equal<keyof (typeof WarehouseBinCreateSchema)['fields'], 'warehouseId' | 'binNumber' | 'label' | 'note'>
>;
type _WarehouseBinUpdateFields = MustBeTrue<
  Equal<keyof (typeof WarehouseBinUpdateSchema)['fields'], 'label' | 'note'>
>;

// ---- Runtime: the same two checks, so a `tsc --noEmit` skip (or an `any`
// creeping in somewhere) can't silently hide a real mismatch. ----
assert.deepStrictEqual([...JazzRoleValues], [...ContractRoleValues], 'jazz-schema.ts and ts-rest-contract.ts disagree on Role values');
assert.deepStrictEqual([...JazzRoleValues], [...AuthRoleValues], 'jazz-schema.ts and betterauth-claims.ts disagree on Role values');

function assertKeysSubset(subLabel: string, sub: readonly string[], supLabel: string, sup: readonly string[]): void {
  const missing = sub.filter((k) => !sup.includes(k));
  assert.equal(missing.length, 0, `${subLabel} has keys not present in ${supLabel}: ${missing.join(', ')}`);
}

assertKeysSubset('ts-rest InventoryItemSchema.fields', Object.keys(InventoryItemSchema.fields), 'Jazz InventoryItem.shape', Object.keys(InventoryItem.shape));
assertKeysSubset('ts-rest OrderSchema.fields', Object.keys(OrderSchema.fields), 'Jazz Order.shape', Object.keys(Order.shape));

assert.equal(
  warehouseBinContract.getById.path,
  '/warehouseBins/:warehouseId/:binNumber',
  'compound IDs should produce one path segment per ID field',
);

const createValidator = warehouseBinContract.create.body['~standard'];
const validCreate = await createValidator.validate({ warehouseId: 'main', binNumber: 7, label: 'A-7', note: null });
assert.equal(validCreate.issues, undefined, 'nullable fields should accept null on create');
const missingNaturalId = await createValidator.validate({ label: 'A-7' });
assert.ok(missingNaturalId.issues?.length, 'natural and compound IDs without defaults must be required on create');

const recordValidator = Schema.standardSchemaV1(WarehouseBinSchema)['~standard'];
const validRecord = await recordValidator.validate({ warehouseId: 'main', binNumber: 7, label: 'A-7', note: null });
assert.equal(validRecord.issues, undefined, 'nullable fields should accept null in response records');
const missingNullableRecordField = await recordValidator.validate({ warehouseId: 'main', binNumber: 7, label: 'A-7' });
assert.ok(missingNullableRecordField.issues?.length, 'nullable record fields should be present even when their value is null');

console.log('verify-shape: all cross-artifact checks passed.');
