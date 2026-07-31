import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseCliBoolean,
  parseCliIdList,
  parseCliInteger,
  parseCliIntegerArray,
  parseCliRequiredInteger,
} from '../cliParsing.ts';

test('CLI id parser keeps omitted ids as undefined', () => {
  assert.equal(parseCliIdList(undefined), undefined);
});

test('CLI id parser deduplicates valid ids while preserving order', () => {
  assert.deepEqual(parseCliIdList('77, 88,77'), [77, 88]);
});

test('CLI id parser rejects empty or invalid explicit ids', () => {
  assert.throws(() => parseCliIdList('   '), /id/i);
  assert.throws(() => parseCliIdList('77,abc'), /Invalid ID/i);
  assert.throws(() => parseCliIdList('77,'), /Invalid ID/i);
  assert.throws(() => parseCliIdList('0'), /Invalid ID/i);
  assert.throws(() => parseCliIdList('-1'), /Invalid ID/i);
  assert.throws(() => parseCliIdList('1.5'), /Invalid ID/i);
});

test('CLI integer parser keeps omitted values undefined and trims valid values', () => {
  assert.equal(parseCliInteger(undefined, { label: 'limit', min: 1 }), undefined);
  assert.equal(parseCliInteger(' 25 ', { label: 'limit', min: 1 }), 25);
});

test('CLI integer parser rejects invalid explicit numeric values', () => {
  assert.throws(() => parseCliInteger('   ', { label: 'limit', min: 1 }), /limit/i);
  assert.throws(() => parseCliInteger('abc', { label: 'limit', min: 1 }), /limit/i);
  assert.throws(() => parseCliInteger('1.5', { label: 'limit', min: 1 }), /limit/i);
  assert.throws(() => parseCliInteger('0', { label: 'limit', min: 1 }), /limit/i);
  assert.throws(() => parseCliInteger('101', { label: 'quality', min: 1, max: 100 }), /quality/i);
});

test('CLI required integer parser rejects omitted values', () => {
  assert.equal(parseCliRequiredInteger('42', { label: 'id', min: 1 }), 42);
  assert.throws(() => parseCliRequiredInteger(undefined, { label: 'id', min: 1 }), /id/i);
});

test('CLI integer array parser accepts numbers and strings while deduplicating', () => {
  assert.deepEqual(
    parseCliIntegerArray([7, '8', '7'], { label: 'ids', min: 1, requireNonEmpty: true }),
    [7, 8],
  );
});

test('CLI integer array parser rejects missing, empty, or invalid arrays', () => {
  assert.throws(() => parseCliIntegerArray(undefined, { label: 'ids', min: 1, requireNonEmpty: true }), /ids/i);
  assert.throws(() => parseCliIntegerArray([], { label: 'ids', min: 1, requireNonEmpty: true }), /ids/i);
  assert.throws(() => parseCliIntegerArray(['abc'], { label: 'ids', min: 1, requireNonEmpty: true }), /ids/i);
  assert.throws(() => parseCliIntegerArray([0], { label: 'ids', min: 1, requireNonEmpty: true }), /ids/i);
});

test('CLI boolean parser keeps omitted values undefined and accepts booleans', () => {
  assert.equal(parseCliBoolean(undefined, { label: 'dry-run' }), undefined);
  assert.equal(parseCliBoolean(true, { label: 'dry-run' }), true);
  assert.equal(parseCliBoolean(false, { label: 'dry-run' }), false);
});

test('CLI boolean parser accepts known strings and rejects invalid explicit values', () => {
  assert.equal(parseCliBoolean('true', { label: 'dry-run' }), true);
  assert.equal(parseCliBoolean('0', { label: 'dry-run' }), false);
  assert.throws(() => parseCliBoolean('   ', { label: 'dry-run' }), /dry-run/i);
  assert.throws(() => parseCliBoolean('maybe', { label: 'dry-run' }), /dry-run/i);
});
