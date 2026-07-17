import { test } from 'node:test';
import assert from 'node:assert';
import { rgbaToHex, formatNumber, groupMeta, computeUnused, groupHardcoded, groupUnlinked, resolveVariableValue } from './analysis.ts';
import type { Occurrence, UnlinkedRef } from './types.ts';
import type { ResolvableVar } from './analysis.ts';

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

test('computeUnused returns local vars not referenced and not remote', () => {
  const vars = [
    { id: 'v1', name: 'used-by-node', collectionName: 'C', resolvedType: 'COLOR' as const, remote: false, valuePreview: '#111111', colorHex: '#111111' },
    { id: 'v2', name: 'used-by-alias', collectionName: 'C', resolvedType: 'FLOAT' as const, remote: false, valuePreview: '8' },
    { id: 'v3', name: 'orphan', collectionName: 'C', resolvedType: 'FLOAT' as const, remote: false, valuePreview: '40' },
    { id: 'v4', name: 'remote-orphan', collectionName: 'Lib', resolvedType: 'COLOR' as const, remote: true, valuePreview: '#222222' },
  ];
  const used = new Set(['v1', 'v2']);
  const out = computeUnused(vars, used);
  assert.deepStrictEqual(out.map(v => v.id), ['v3']);
  assert.strictEqual(out[0].valuePreview, '40');
  assert.ok(!('remote' in out[0]));
});

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    nodeId: 'n', nodeName: 'N', pageId: 'p', pageName: 'P',
    category: 'color', kind: 'color', field: 'fills',
    valueKey: 'color:#FFFFFF@1', colorHex: '#FFFFFF', opacity: 1,
    ...over,
  };
}

test('groupHardcoded groups by valueKey and sorts by count desc', () => {
  const items = [
    occ({ valueKey: 'radius:8', category: 'radiusStroke', kind: 'radius', field: 'cornerRadius', colorHex: undefined, opacity: undefined, num: 8 }),
    occ({}), occ({ nodeId: 'n2' }), occ({ nodeId: 'n3' }),
    occ({ valueKey: 'radius:8', category: 'radiusStroke', kind: 'radius', field: 'cornerRadius', colorHex: undefined, opacity: undefined, num: 8, nodeId: 'n4' }),
  ];
  const groups = groupHardcoded(items);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].valueKey, 'color:#FFFFFF@1'); // 3 occurrences
  assert.strictEqual(groups[0].count, 3);
  assert.strictEqual(groups[1].valueKey, 'radius:8');         // 2 occurrences
  assert.strictEqual(groups[1].count, 2);
  assert.strictEqual(groups[0].colorHex, '#FFFFFF');
});

function unlinkedRef(over: Partial<UnlinkedRef>): UnlinkedRef {
  return {
    nodeId: 'n', nodeName: 'N', pageId: 'p', pageName: 'P',
    field: 'fills', variableName: 'brand/blue', collectionName: 'Brand Colors', collectionKey: 'key-a',
    ...over,
  };
}

test('groupUnlinked groups by collectionKey, counts refs, and sorts by count desc then collectionName asc', () => {
  const refs: UnlinkedRef[] = [
    unlinkedRef({ collectionKey: 'key-a', collectionName: 'Zeta Library' }),
    unlinkedRef({ collectionKey: 'key-b', collectionName: 'Alpha Library', nodeId: 'n2' }),
    unlinkedRef({ collectionKey: 'key-b', collectionName: 'Alpha Library', nodeId: 'n3' }),
    unlinkedRef({ collectionKey: 'key-c', collectionName: 'Beta Library', nodeId: 'n4' }),
    unlinkedRef({ collectionKey: 'key-c', collectionName: 'Beta Library', nodeId: 'n5' }),
  ];
  const groups = groupUnlinked(refs);
  assert.strictEqual(groups.length, 3);
  // key-b and key-c tie at count 2 (sorted before key-a's 1); tie broken by collectionName asc.
  assert.deepStrictEqual(groups.map(g => g.collectionKey), ['key-b', 'key-c', 'key-a']);
  assert.deepStrictEqual(groups.map(g => g.count), [2, 2, 1]);
  assert.strictEqual(groups[0].collectionName, 'Alpha Library');
  assert.strictEqual(groups[0].refs.length, 2);
  assert.deepStrictEqual(groups[0].refs.map(r => r.nodeId), ['n2', 'n3']);
});

test('resolveVariableValue resolves concrete and alias chains', () => {
  const map = new Map<string, ResolvableVar>([
    ['a', { id: 'a', valuesByMode: { m1: 8 } }],
    ['b', { id: 'b', valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'a' } } }],
    ['c', { id: 'c', valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'missing' } } }],
  ]);
  assert.strictEqual(resolveVariableValue('a', 'm1', map), 8);
  assert.strictEqual(resolveVariableValue('b', 'm1', map), 8);   // through alias
  assert.strictEqual(resolveVariableValue('c', 'm1', map), null); // dangling alias
  assert.strictEqual(resolveVariableValue('missing', 'm1', map), null);
});

test('resolveVariableValue guards against cycles', () => {
  const map = new Map<string, ResolvableVar>([
    ['x', { id: 'x', valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'y' } } }],
    ['y', { id: 'y', valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'x' } } }],
  ]);
  assert.strictEqual(resolveVariableValue('x', 'm1', map), null);
});

import { rankCandidates } from './analysis.ts';
import type { ResolvedCandidate } from './analysis.ts';

test('rankCandidates flags exact matches first (number)', () => {
  const cands: ResolvedCandidate[] = [
    { id: 'a', name: 'space-4', collectionName: 'Spacing', resolvedType: 'FLOAT', valuePreview: '16', modeValues: [16] },
    { id: 'b', name: 'space-3', collectionName: 'Spacing', resolvedType: 'FLOAT', valuePreview: '12', modeValues: [12] },
  ];
  const out = rankCandidates({ kind: 'number', num: 16 }, cands);
  assert.strictEqual(out[0].id, 'a');
  assert.strictEqual(out[0].exact, true);
  assert.strictEqual(out[1].exact, false);
});

test('rankCandidates flags exact matches (color, any mode)', () => {
  const cands: ResolvedCandidate[] = [
    { id: 'c', name: 'brand', collectionName: 'Color', resolvedType: 'COLOR', valuePreview: '#2B5CE6', colorHex: '#2B5CE6',
      modeValues: [{ r: 1, g: 1, b: 1, a: 1 }, { r: 43/255, g: 92/255, b: 230/255, a: 1 }] },
  ];
  const out = rankCandidates({ kind: 'color', colorHex: '#2B5CE6', opacity: 1 }, cands);
  assert.strictEqual(out[0].exact, true);
});

// Tests for colorDistance
import { colorDistance } from './analysis.ts';

test('colorDistance identical colors → 0', () => {
  const white = { r: 1, g: 1, b: 1, a: 1 };
  assert.strictEqual(colorDistance(white, white), 0);
  const black = { r: 0, g: 0, b: 0, a: 1 };
  assert.strictEqual(colorDistance(black, black), 0);
});

test('colorDistance black vs white → sqrt(3) ≈ 1.732', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 1, g: 1, b: 1, a: 1 };
  const dist = colorDistance(black, white);
  assert.ok(Math.abs(dist - Math.sqrt(3)) < 1e-6, `expected ~1.732, got ${dist}`);
});

test('colorDistance includes alpha channel', () => {
  const opaque = { r: 1, g: 0, b: 0, a: 1 };
  const transparent = { r: 1, g: 0, b: 0, a: 0.5 };
  const dist = colorDistance(opaque, transparent);
  assert.strictEqual(dist, 0.5); // only alpha differs by 0.5
});

test('colorDistance near colors ordered by distance', () => {
  const target = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
  const c1 = { r: 0.51, g: 0.5, b: 0.5, a: 1 };  // distance ≈ 0.01
  const c2 = { r: 0.6, g: 0.5, b: 0.5, a: 1 };   // distance = 0.1
  const c3 = { r: 1, g: 0.5, b: 0.5, a: 1 };     // distance = 0.5
  assert.ok(colorDistance(target, c1) < colorDistance(target, c2));
  assert.ok(colorDistance(target, c2) < colorDistance(target, c3));
});

// Tests for rankCandidates with near flag
test('rankCandidates flags closest non-exact color candidates with near: true', () => {
  const target = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
  const cands: ResolvedCandidate[] = [
    { id: 'a', name: 'gray-1', collectionName: 'Color', resolvedType: 'COLOR', valuePreview: '#7F7F7F', colorHex: '#7F7F7F',
      modeValues: [{ r: 0.51, g: 0.5, b: 0.5, a: 1 }] },
    { id: 'b', name: 'gray-2', collectionName: 'Color', resolvedType: 'COLOR', valuePreview: '#BFBFBF', colorHex: '#BFBFBF',
      modeValues: [{ r: 0.75, g: 0.75, b: 0.75, a: 1 }] },
    { id: 'c', name: 'white', collectionName: 'Color', resolvedType: 'COLOR', valuePreview: '#FFFFFF', colorHex: '#FFFFFF',
      modeValues: [{ r: 1, g: 1, b: 1, a: 1 }] },
  ];
  const out = rankCandidates({ kind: 'color', colorHex: '#7F7F7F', opacity: 1 }, cands);
  assert.strictEqual(out[0].id, 'a', 'closest should be first');
  assert.strictEqual(out[0].near, true, 'closest should be flagged near');
  assert.strictEqual(out[0].exact, false, 'non-exact should not be marked exact');
  assert.strictEqual(out[1].id, 'b', 'second closest should be second');
  assert.strictEqual(out[1].near, true, 'second closest should be flagged near');
  assert.strictEqual(out[2].id, 'c', 'third closest should be third');
  assert.strictEqual(out[2].near, undefined, 'far candidate should not be flagged near');
});

test('rankCandidates flags closest non-exact number candidates with near: true', () => {
  const cands: ResolvedCandidate[] = [
    { id: 'a', name: 'space-16', collectionName: 'Spacing', resolvedType: 'FLOAT', valuePreview: '16', modeValues: [16.1] },
    { id: 'b', name: 'space-20', collectionName: 'Spacing', resolvedType: 'FLOAT', valuePreview: '20', modeValues: [20] },
    { id: 'c', name: 'space-32', collectionName: 'Spacing', resolvedType: 'FLOAT', valuePreview: '32', modeValues: [32] },
  ];
  const out = rankCandidates({ kind: 'number', num: 16 }, cands);
  assert.strictEqual(out[0].id, 'a', 'closest should be first');
  assert.strictEqual(out[0].near, true, 'closest should be flagged near');
  assert.strictEqual(out[1].id, 'b', 'second closest should be second');
  assert.strictEqual(out[1].near, true, 'second closest should be flagged near');
  assert.strictEqual(out[2].id, 'c', 'third closest should be third');
  assert.strictEqual(out[2].near, undefined, 'far candidate should not be flagged near');
});

test('rankCandidates exact matches are NOT also flagged near', () => {
  const cands: ResolvedCandidate[] = [
    { id: 'a', name: 'space-16', collectionName: 'Spacing', resolvedType: 'FLOAT', valuePreview: '16', modeValues: [16] },
    { id: 'b', name: 'space-17', collectionName: 'Spacing', resolvedType: 'FLOAT', valuePreview: '17', modeValues: [17] },
  ];
  const out = rankCandidates({ kind: 'number', num: 16 }, cands);
  assert.strictEqual(out[0].id, 'a', 'exact match should be first');
  assert.strictEqual(out[0].exact, true, 'should be marked exact');
  assert.strictEqual(out[0].near, undefined, 'exact should not be also flagged near');
});
