import { test } from 'node:test';
import assert from 'node:assert';
import { rgbaToHex, formatNumber, groupMeta } from './analysis.ts';

test('rgbaToHex converts 0..1 channels to uppercase hex', () => {
  assert.strictEqual(rgbaToHex({ r: 1, g: 1, b: 1, a: 1 }), '#FFFFFF');
  assert.strictEqual(rgbaToHex({ r: 0, g: 0, b: 0, a: 1 }), '#000000');
  assert.strictEqual(rgbaToHex({ r: 43/255, g: 92/255, b: 230/255, a: 1 }), '#2B5CE6');
});

test('formatNumber strips float noise and trailing zeros', () => {
  assert.strictEqual(formatNumber(40), '40');
  assert.strictEqual(formatNumber(8), '8');
  assert.strictEqual(formatNumber(0.1 + 0.2), '0.3');
  assert.strictEqual(formatNumber(1.5), '1.5');
});

test('groupMeta builds category, key, and label for color', () => {
  assert.deepStrictEqual(
    groupMeta('color', '#FFFFFF', 1, null),
    { category: 'color', valueKey: 'color:#FFFFFF@1', label: '#FFFFFF' }
  );
});

test('groupMeta buckets radius and strokeWeight under radiusStroke', () => {
  assert.deepStrictEqual(
    groupMeta('radius', null, null, 8),
    { category: 'radiusStroke', valueKey: 'radius:8', label: 'Corner radius · 8' }
  );
  assert.deepStrictEqual(
    groupMeta('strokeWeight', null, null, 2),
    { category: 'radiusStroke', valueKey: 'strokeWeight:2', label: 'Stroke weight · 2' }
  );
});

test('groupMeta buckets typography kinds with distinct keys', () => {
  assert.strictEqual(groupMeta('fontSize', null, null, 14).category, 'typography');
  assert.strictEqual(groupMeta('fontSize', null, null, 14).valueKey, 'fontSize:14');
  assert.strictEqual(groupMeta('lineHeight', null, null, 14).valueKey, 'lineHeight:14');
  assert.strictEqual(groupMeta('fontSize', null, null, 14).label, 'Font size · 14');
});
