# Variable Auditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Figma plugin that finds unused variables, broken variable references, and hardcoded values, and lets the user jump to, replace, or delete them.

**Architecture:** A self-contained plugin folder mirroring the existing `word-counter`/`component-docs` plugins. All decision logic (value normalization, grouping, unused-set computation, alias resolution, candidate ranking) lives in a pure, unit-tested `analysis.ts` module. The `figma`-API glue (one whole-document traversal, navigation, variable binding, deletion, messaging) lives in `code.ts` and delegates to `analysis.ts`. The UI (`ui.html`) is the already-approved light-mode mockup, wired to a message protocol.

**Tech Stack:** TypeScript, esbuild (bundle → `dist/code.js`), `@figma/plugin-typings`, Node's built-in `node:test` for pure-logic tests. No runtime dependencies. Geist / Geist Mono fonts and Lucide icons are inlined in `ui.html` (no network — `networkAccess: none`).

**Spec:** [`docs/superpowers/specs/2026-07-09-variable-auditor-design.md`](../specs/2026-07-09-variable-auditor-design.md)
**Approved UI mockup (in repo):** [`docs/superpowers/specs/assets/variable-auditor-mockup.html`](../specs/assets/variable-auditor-mockup.html)

## Global Constraints

- **Plugin folder:** `variable-auditor/` at repo root. Never touch `icomoon-to-icons/`.
- **Manifest:** `documentAccess: "dynamic-page"`, `networkAccess: { "allowedDomains": ["none"] }`, `editorType: ["figma"]`, `api: "1.0.0"`, `main: "dist/code.js"`, `ui: "src/ui.html"`.
- **Build:** `esbuild src/code.ts --bundle --outfile=dist/code.js --target=es6`.
- **Tests:** `node --experimental-strip-types --test` (Node ≥ 22.6). Pure logic only; no `figma` global in tested code.
- **Theme:** light mode only (committed single theme). Do not add dark-mode styles.
- **Unused detection is always whole-document**; the scope toggle filters only hardcoded + broken results.
- **Only `!remote` (local) variables** are ever deletion or replace candidates.
- **v1 deferrals (do NOT implement):** gradient/image paints, mixed-style text typography, binding to library variables, fuzzy color matching, transitive-unused chains, detach action, canvas report export.
- **Commit** after every task with the message shown in its final step.

---

## File structure

```
variable-auditor/
  manifest.json         # plugin manifest
  package.json          # build/watch/test scripts + devDependencies
  tsconfig.json         # TS config (matches word-counter)
  .gitignore            # node_modules/
  src/
    types.ts            # shared message + data shapes (no logic)
    analysis.ts         # PURE logic (imported by code.ts and tests)
    analysis.test.ts    # node:test unit tests
    code.ts             # plugin entry: figma glue + messaging
    ui.html             # UI (copied from approved mockup, then wired)
```

- `analysis.ts` — one responsibility: transform plain data (never touches `figma`).
- `code.ts` — one responsibility: talk to the `figma` API and the UI; delegate all decisions to `analysis.ts`.
- `types.ts` — shared contracts so `code.ts`, `ui.html`, and tests agree on shapes.

---

### Task 1: Scaffold the plugin

**Files:**
- Create: `variable-auditor/manifest.json`
- Create: `variable-auditor/package.json`
- Create: `variable-auditor/tsconfig.json`
- Create: `variable-auditor/.gitignore`
- Create: `variable-auditor/src/types.ts`
- Create: `variable-auditor/src/code.ts` (stub)
- Create: `variable-auditor/src/ui.html` (stub)

**Interfaces:**
- Produces: all shared types in `types.ts` (consumed by every later task). Exact definitions below.

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "name": "Variable Auditor",
  "id": "variable-auditor-dev",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "src/ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] }
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "variable-auditor",
  "version": "1.0.0",
  "description": "Figma plugin that finds unused variables, broken references, and hardcoded values",
  "scripts": {
    "build": "esbuild src/code.ts --bundle --outfile=dist/code.js --target=es6",
    "watch": "esbuild src/code.ts --bundle --outfile=dist/code.js --target=es6 --watch",
    "test": "node --experimental-strip-types --test"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.96.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`** (matches `word-counter`)

```json
{
  "compilerOptions": {
    "target": "es6",
    "lib": ["es6", "dom"],
    "strict": true,
    "moduleResolution": "node",
    "typeRoots": ["./node_modules/@types", "./node_modules/@figma"]
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 5: Create `src/types.ts`** (complete — no logic)

```ts
export type Scope = 'selection' | 'page' | 'document';

// Filter buckets shown as chips in the UI.
export type HardcodedCategory = 'color' | 'radiusStroke' | 'spacing' | 'typography';

// Finer per-property kind (drives value key + label).
export type HardcodedKind =
  | 'color' | 'radius' | 'strokeWeight' | 'spacing'
  | 'fontSize' | 'lineHeight' | 'letterSpacing';

export type VariableResolvedType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';

export interface RGBA { r: number; g: number; b: number; a: number } // channels 0..1

export interface Occurrence {
  nodeId: string;
  nodeName: string;
  pageId: string;
  pageName: string;
  category: HardcodedCategory;
  kind: HardcodedKind;
  field: string;          // figma field to bind: 'fills' | 'strokes' | 'cornerRadius' | 'topLeftRadius' | 'strokeWeight' | 'paddingLeft' | 'itemSpacing' | 'fontSize' | 'lineHeight' | 'letterSpacing' | ...
  paintIndex?: number;    // for color occurrences: index in fills/strokes
  valueKey: string;       // grouping key, e.g. 'color:#FFFFFF@1' or 'radius:8'
  colorHex?: string;      // '#RRGGBB' for color
  opacity?: number;       // 0..1 for color
  num?: number;           // numeric value for non-color kinds
}

export interface HardcodedGroup {
  category: HardcodedCategory;
  kind: HardcodedKind;
  valueKey: string;
  label: string;          // e.g. '#FFFFFF' or 'Corner radius · 8'
  colorHex?: string;
  opacity?: number;
  num?: number;
  count: number;
  occurrences: Occurrence[];
}

export interface UnusedVariable {
  id: string;
  name: string;
  collectionName: string;
  resolvedType: VariableResolvedType;
  valuePreview: string;   // '#2B5CE6' or '40'
  colorHex?: string;      // for swatch when COLOR
}

export interface BrokenReference {
  nodeId: string;
  nodeName: string;
  pageId: string;
  pageName: string;
  field: string;
  variableId: string;     // the missing id
}

export interface ScanSummary { unused: number; broken: number; hardcoded: number }

export interface ScanResult {
  scope: Scope;
  summary: ScanSummary;
  unused: UnusedVariable[];
  broken: BrokenReference[];
  hardcoded: HardcodedGroup[];
}

export interface CandidateVariable {
  id: string;
  name: string;
  collectionName: string;
  exact: boolean;
  valuePreview: string;
  colorHex?: string;
}

export type UIToPlugin =
  | { type: 'scan'; scope: Scope }
  | { type: 'set-scope'; scope: Scope }
  | { type: 'navigate'; nodeId: string; pageId: string }
  | { type: 'get-candidates'; category: HardcodedCategory; valueKey: string }
  | { type: 'replace'; category: HardcodedCategory; valueKey: string; variableId: string }
  | { type: 'delete-variables'; ids: string[] };

export type PluginToUI =
  | { type: 'scan-progress'; scanned: number }
  | { type: 'scan-result'; result: ScanResult }
  | { type: 'candidates'; category: HardcodedCategory; valueKey: string; candidates: CandidateVariable[] }
  | { type: 'action-result'; ok: boolean; message: string;
      removedVariableIds?: string[]; replacedValueKey?: string; replacedCount?: number; skippedCount?: number }
  | { type: 'error'; message: string };
```

- [ ] **Step 6: Create stub `src/code.ts`**

```ts
figma.showUI(__html__, { width: 404, height: 660 });
figma.ui.onmessage = (msg) => {
  // handlers added in later tasks
  if (msg?.type === 'noop') figma.closePlugin();
};
```

- [ ] **Step 7: Create stub `src/ui.html`**

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body><p>Variable Auditor</p></body></html>
```

- [ ] **Step 8: Install dependencies and build**

Run: `cd variable-auditor && npm install && npm run build`
Expected: `dist/code.js` created, no errors.

- [ ] **Step 9: Verify the test runner works**

Run: `cd variable-auditor && npm test`
Expected: runs and reports `tests 0` (no test files yet) with exit code 0. If Node < 22.6, upgrade Node.

- [ ] **Step 10: Commit**

```bash
git add variable-auditor
git commit -m "feat(variable-auditor): scaffold plugin (manifest, build, types)"
```

---

### Task 2: analysis.ts — value formatting & group metadata

**Files:**
- Create: `variable-auditor/src/analysis.ts`
- Test: `variable-auditor/src/analysis.test.ts`

**Interfaces:**
- Consumes: `RGBA`, `HardcodedKind`, `HardcodedCategory` from `./types.ts`.
- Produces:
  - `rgbaToHex(c: RGBA): string` → uppercase `#RRGGBB`.
  - `formatNumber(n: number): string` → float-noise-free string (e.g. `0.3`, `40`).
  - `groupMeta(kind: HardcodedKind, colorHex: string | null, opacity: number | null, num: number | null): { category: HardcodedCategory; valueKey: string; label: string }`.

- [ ] **Step 1: Write failing tests** in `src/analysis.test.ts`

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd variable-auditor && npm test`
Expected: FAIL — cannot find module `./analysis.ts` / exports undefined.

- [ ] **Step 3: Implement `src/analysis.ts`**

```ts
import type { RGBA, HardcodedKind, HardcodedCategory } from './types.ts';

function channelToHex(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v * 255)));
  return n.toString(16).padStart(2, '0').toUpperCase();
}

export function rgbaToHex(c: RGBA): string {
  return '#' + channelToHex(c.r) + channelToHex(c.g) + channelToHex(c.b);
}

export function formatNumber(n: number): string {
  return String(Number.parseFloat(n.toFixed(3)));
}

const CATEGORY_BY_KIND: Record<HardcodedKind, HardcodedCategory> = {
  color: 'color',
  radius: 'radiusStroke',
  strokeWeight: 'radiusStroke',
  spacing: 'spacing',
  fontSize: 'typography',
  lineHeight: 'typography',
  letterSpacing: 'typography',
};

const LABEL_BY_KIND: Record<Exclude<HardcodedKind, 'color'>, string> = {
  radius: 'Corner radius',
  strokeWeight: 'Stroke weight',
  spacing: 'Spacing',
  fontSize: 'Font size',
  lineHeight: 'Line height',
  letterSpacing: 'Letter spacing',
};

export function groupMeta(
  kind: HardcodedKind,
  colorHex: string | null,
  opacity: number | null,
  num: number | null,
): { category: HardcodedCategory; valueKey: string; label: string } {
  const category = CATEGORY_BY_KIND[kind];
  if (kind === 'color') {
    const op = formatNumber(opacity ?? 1);
    return { category, valueKey: `color:${colorHex}@${op}`, label: colorHex ?? '#000000' };
  }
  const val = formatNumber(num ?? 0);
  return { category, valueKey: `${kind}:${val}`, label: `${LABEL_BY_KIND[kind]} · ${val}` };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd variable-auditor && npm test`
Expected: PASS (all tests in this file).

- [ ] **Step 5: Commit**

```bash
git add variable-auditor/src/analysis.ts variable-auditor/src/analysis.test.ts
git commit -m "feat(variable-auditor): value formatting and group metadata helpers"
```

---

### Task 3: analysis.ts — computeUnused

**Files:**
- Modify: `variable-auditor/src/analysis.ts`
- Test: `variable-auditor/src/analysis.test.ts`

**Interfaces:**
- Produces:
  - `interface LocalVarInfo { id: string; name: string; collectionName: string; resolvedType: VariableResolvedType; remote: boolean; valuePreview: string; colorHex?: string }`
  - `computeUnused(localVars: LocalVarInfo[], usedIds: Set<string>): UnusedVariable[]` — returns `!remote && !usedIds.has(id)`, preserving input order, mapped to `UnusedVariable` (drop `remote`).

- [ ] **Step 1: Write failing test** (append to `analysis.test.ts`)

```ts
import { computeUnused } from './analysis.ts';

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
```

- [ ] **Step 2: Run to verify failure** — `cd variable-auditor && npm test` → FAIL (computeUnused undefined).

- [ ] **Step 3: Implement** (append to `analysis.ts`)

```ts
import type { UnusedVariable, VariableResolvedType } from './types.ts';

export interface LocalVarInfo {
  id: string;
  name: string;
  collectionName: string;
  resolvedType: VariableResolvedType;
  remote: boolean;
  valuePreview: string;
  colorHex?: string;
}

export function computeUnused(localVars: LocalVarInfo[], usedIds: Set<string>): UnusedVariable[] {
  return localVars
    .filter(v => !v.remote && !usedIds.has(v.id))
    .map(v => ({
      id: v.id,
      name: v.name,
      collectionName: v.collectionName,
      resolvedType: v.resolvedType,
      valuePreview: v.valuePreview,
      colorHex: v.colorHex,
    }));
}
```

- [ ] **Step 4: Run to verify pass** — `cd variable-auditor && npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add variable-auditor/src/analysis.ts variable-auditor/src/analysis.test.ts
git commit -m "feat(variable-auditor): computeUnused"
```

---

### Task 4: analysis.ts — groupHardcoded

**Files:**
- Modify: `variable-auditor/src/analysis.ts`
- Test: `variable-auditor/src/analysis.test.ts`

**Interfaces:**
- Consumes: `Occurrence`, `HardcodedGroup` from `./types.ts`.
- Produces: `groupHardcoded(occurrences: Occurrence[]): HardcodedGroup[]` — groups by `valueKey`, sorts by `count` desc then `label` asc, carries `category/kind/label/colorHex/opacity/num` from the first occurrence.

- [ ] **Step 1: Write failing test** (append)

```ts
import { groupHardcoded } from './analysis.ts';
import type { Occurrence } from './types.ts';

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
```

- [ ] **Step 2: Run to verify failure** — FAIL (groupHardcoded undefined).

- [ ] **Step 3: Implement** (append to `analysis.ts`)

```ts
import type { Occurrence, HardcodedGroup } from './types.ts';

export function groupHardcoded(occurrences: Occurrence[]): HardcodedGroup[] {
  const byKey = new Map<string, HardcodedGroup>();
  for (const o of occurrences) {
    let g = byKey.get(o.valueKey);
    if (!g) {
      g = {
        category: o.category, kind: o.kind, valueKey: o.valueKey,
        label: '', colorHex: o.colorHex, opacity: o.opacity, num: o.num,
        count: 0, occurrences: [],
      };
      byKey.set(o.valueKey, g);
    }
    g.occurrences.push(o);
    g.count++;
  }
  const groups = [...byKey.values()];
  // label from group meta (reuse groupMeta for consistency)
  for (const g of groups) {
    g.label = groupMeta(g.kind, g.colorHex ?? null, g.opacity ?? null, g.num ?? null).label;
  }
  groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return groups;
}
```

- [ ] **Step 4: Run to verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add variable-auditor/src/analysis.ts variable-auditor/src/analysis.test.ts
git commit -m "feat(variable-auditor): groupHardcoded"
```

---

### Task 5: analysis.ts — resolveVariableValue (alias chains)

**Files:**
- Modify: `variable-auditor/src/analysis.ts`
- Test: `variable-auditor/src/analysis.test.ts`

**Interfaces:**
- Produces:
  - `type VarValue = RGBA | number | string | boolean | { type: 'VARIABLE_ALIAS'; id: string }`
  - `interface ResolvableVar { id: string; valuesByMode: Record<string, VarValue> }`
  - `resolveVariableValue(id: string, modeId: string, varMap: Map<string, ResolvableVar>): RGBA | number | string | boolean | null` — follows alias chains, returns `null` on missing var, missing mode, or cycle. On alias, resolve target using the target var's own first mode if `modeId` is absent there.

- [ ] **Step 1: Write failing test** (append)

```ts
import { resolveVariableValue } from './analysis.ts';
import type { ResolvableVar } from './analysis.ts';

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
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement** (append to `analysis.ts`)

```ts
export type VarValue = RGBA | number | string | boolean | { type: 'VARIABLE_ALIAS'; id: string };
export interface ResolvableVar { id: string; valuesByMode: Record<string, VarValue> }

function isAlias(v: VarValue): v is { type: 'VARIABLE_ALIAS'; id: string } {
  return typeof v === 'object' && v !== null && (v as any).type === 'VARIABLE_ALIAS';
}

export function resolveVariableValue(
  id: string,
  modeId: string,
  varMap: Map<string, ResolvableVar>,
  seen: Set<string> = new Set(),
): RGBA | number | string | boolean | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const v = varMap.get(id);
  if (!v) return null;
  let val: VarValue | undefined = v.valuesByMode[modeId];
  if (val === undefined) {
    const firstKey = Object.keys(v.valuesByMode)[0];
    if (firstKey === undefined) return null;
    val = v.valuesByMode[firstKey];
  }
  if (isAlias(val)) return resolveVariableValue(val.id, modeId, varMap, seen);
  return val;
}
```

- [ ] **Step 4: Run to verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add variable-auditor/src/analysis.ts variable-auditor/src/analysis.test.ts
git commit -m "feat(variable-auditor): resolveVariableValue with alias + cycle handling"
```

---

### Task 6: analysis.ts — rankCandidates

**Files:**
- Modify: `variable-auditor/src/analysis.ts`
- Test: `variable-auditor/src/analysis.test.ts`

**Interfaces:**
- Consumes: `CandidateVariable` from `./types.ts`.
- Produces:
  - `interface ResolvedCandidate { id: string; name: string; collectionName: string; resolvedType: 'COLOR' | 'FLOAT'; valuePreview: string; colorHex?: string; modeValues: (RGBA | number | string | boolean | null)[] }`
  - `rankCandidates(target: { kind: 'color'; colorHex: string; opacity: number } | { kind: 'number'; num: number }, candidates: ResolvedCandidate[]): CandidateVariable[]` — marks `exact` when any `modeValues` entry equals the target (hex+alpha for color; `|a-b| < 1e-4` for number). Sort: exact first, then `collectionName`, then `name`.

- [ ] **Step 1: Write failing test** (append)

```ts
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
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement** (append to `analysis.ts`)

```ts
import type { CandidateVariable } from './types.ts';

export interface ResolvedCandidate {
  id: string;
  name: string;
  collectionName: string;
  resolvedType: 'COLOR' | 'FLOAT';
  valuePreview: string;
  colorHex?: string;
  modeValues: (RGBA | number | string | boolean | null)[];
}

type Target = { kind: 'color'; colorHex: string; opacity: number } | { kind: 'number'; num: number };

function matchesTarget(value: RGBA | number | string | boolean | null, target: Target): boolean {
  if (value === null) return false;
  if (target.kind === 'number') {
    return typeof value === 'number' && Math.abs(value - target.num) < 1e-4;
  }
  if (typeof value !== 'object') return false;
  const hex = rgbaToHex(value as RGBA);
  const op = Number.parseFloat(((value as RGBA).a ?? 1).toFixed(3));
  return hex === target.colorHex && Math.abs(op - target.opacity) < 1e-4;
}

export function rankCandidates(target: Target, candidates: ResolvedCandidate[]): CandidateVariable[] {
  return candidates
    .map(c => ({
      id: c.id,
      name: c.name,
      collectionName: c.collectionName,
      valuePreview: c.valuePreview,
      colorHex: c.colorHex,
      exact: c.modeValues.some(v => matchesTarget(v, target)),
    }))
    .sort((a, b) =>
      (b.exact ? 1 : 0) - (a.exact ? 1 : 0) ||
      a.collectionName.localeCompare(b.collectionName) ||
      a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run to verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add variable-auditor/src/analysis.ts variable-auditor/src/analysis.test.ts
git commit -m "feat(variable-auditor): rankCandidates"
```

---

### Task 7: code.ts — scanning engine + scan/set-scope messaging

**Files:**
- Modify: `variable-auditor/src/code.ts` (replace stub body)

**Interfaces:**
- Consumes: `analysis.ts` (`rgbaToHex`, `formatNumber`, `groupMeta`, `computeUnused`, `groupHardcoded`, `LocalVarInfo`); all `types.ts`.
- Produces (module-internal): `fullScan()`, `filterByScope(scope)`, cached `lastScan`. Sends `scan-progress`, `scan-result`, `error`.

> Not unit-testable (needs `figma`). Deliverable = builds cleanly + the manual Figma verification in Step 4.

- [ ] **Step 1: Implement the scan engine** — replace all of `src/code.ts` with:

```ts
import {
  rgbaToHex, formatNumber, groupMeta, computeUnused, groupHardcoded,
  type LocalVarInfo,
} from './analysis.ts';
import type {
  Scope, Occurrence, BrokenReference, UnusedVariable, HardcodedGroup,
  ScanResult, UIToPlugin,
} from './types.ts';

figma.showUI(__html__, { width: 404, height: 660 });

interface FullScan {
  unused: UnusedVariable[];
  brokenAll: BrokenReference[];
  occurrencesAll: Occurrence[];
  selectionIds: Set<string>;
  currentPageId: string;
}
let lastScan: FullScan | null = null;

function isAliasValue(v: unknown): v is { type: 'VARIABLE_ALIAS'; id: string } {
  return typeof v === 'object' && v !== null && (v as any).type === 'VARIABLE_ALIAS';
}

function pushColorOccurrences(
  node: SceneNode, page: PageNode, key: 'fills' | 'strokes', out: Occurrence[],
) {
  const paints = (node as any)[key];
  if (!Array.isArray(paints)) return;
  paints.forEach((paint: Paint, i: number) => {
    if (paint.type !== 'SOLID' || paint.visible === false) return;
    if ((paint as any).boundVariables?.color) return; // already bound
    const colorHex = rgbaToHex({ ...paint.color, a: 1 });
    const opacity = paint.opacity ?? 1;
    const meta = groupMeta('color', colorHex, opacity, null);
    out.push({
      nodeId: node.id, nodeName: node.name, pageId: page.id, pageName: page.name,
      category: meta.category, kind: 'color', field: key, paintIndex: i,
      valueKey: meta.valueKey, colorHex, opacity,
    });
  });
}

function pushNumberOccurrence(
  node: SceneNode, page: PageNode, kind: Exclude<Parameters<typeof groupMeta>[0], 'color'>,
  field: string, num: number, out: Occurrence[],
) {
  const meta = groupMeta(kind, null, null, num);
  out.push({
    nodeId: node.id, nodeName: node.name, pageId: page.id, pageName: page.name,
    category: meta.category, kind, field, valueKey: meta.valueKey, num,
  });
}

function collectNode(
  node: SceneNode, page: PageNode,
  usedIds: Set<string>, refs: { id: string; ref: BrokenReference }[], occ: Occurrence[],
) {
  const bv = (node as any).boundVariables as Record<string, any> | undefined;
  if (bv) {
    for (const field of Object.keys(bv)) {
      const entry = bv[field];
      const aliases = Array.isArray(entry) ? entry : [entry];
      for (const a of aliases) {
        if (a && typeof a.id === 'string') {
          usedIds.add(a.id);
          refs.push({ id: a.id, ref: {
            nodeId: node.id, nodeName: node.name, pageId: page.id, pageName: page.name,
            field, variableId: a.id,
          }});
        }
      }
    }
  }

  // Colors
  if ('fills' in node && (node as any).fills !== figma.mixed) pushColorOccurrences(node, page, 'fills', occ);
  if ('strokes' in node && Array.isArray((node as any).strokes)) pushColorOccurrences(node, page, 'strokes', occ);

  // Corner radius (uniform primary; per-corner when mixed)
  if ('cornerRadius' in node) {
    const cr = (node as any).cornerRadius;
    if (cr !== figma.mixed && typeof cr === 'number') {
      if (cr > 0 && !bv?.topLeftRadius) pushNumberOccurrence(node, page, 'radius', 'cornerRadius', cr, occ);
    } else if (cr === figma.mixed) {
      for (const f of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'] as const) {
        const val = (node as any)[f];
        if (typeof val === 'number' && val > 0 && !bv?.[f]) pushNumberOccurrence(node, page, 'radius', f, val, occ);
      }
    }
  }

  // Stroke weight (only if strokes present, uniform)
  if ('strokeWeight' in node && Array.isArray((node as any).strokes) && (node as any).strokes.length > 0) {
    const sw = (node as any).strokeWeight;
    if (sw !== figma.mixed && typeof sw === 'number' && sw > 0 && !bv?.strokeWeight) {
      pushNumberOccurrence(node, page, 'strokeWeight', 'strokeWeight', sw, occ);
    }
  }

  // Auto-layout spacing
  if ('layoutMode' in node && (node as any).layoutMode !== 'NONE') {
    const spacingFields = ['paddingLeft','paddingRight','paddingTop','paddingBottom','itemSpacing','counterAxisSpacing'] as const;
    for (const f of spacingFields) {
      const val = (node as any)[f];
      if (typeof val === 'number' && val > 0 && !bv?.[f]) pushNumberOccurrence(node, page, 'spacing', f, val, occ);
    }
  }

  // Typography (skip mixed)
  if (node.type === 'TEXT') {
    const t = node as TextNode;
    if (t.fontSize !== figma.mixed && typeof t.fontSize === 'number' && !bv?.fontSize)
      pushNumberOccurrence(node, page, 'fontSize', 'fontSize', t.fontSize, occ);
    if (t.lineHeight !== figma.mixed && (t.lineHeight as any).unit && (t.lineHeight as any).unit !== 'AUTO' && !bv?.lineHeight)
      pushNumberOccurrence(node, page, 'lineHeight', 'lineHeight', (t.lineHeight as any).value, occ);
    if (t.letterSpacing !== figma.mixed && typeof (t.letterSpacing as any).value === 'number' && !bv?.letterSpacing)
      pushNumberOccurrence(node, page, 'letterSpacing', 'letterSpacing', (t.letterSpacing as any).value, occ);
  }
}

function collectSelectionIds(): Set<string> {
  const ids = new Set<string>();
  const walk = (n: SceneNode) => { ids.add(n.id); if ('children' in n) for (const c of n.children) walk(c as SceneNode); };
  for (const n of figma.currentPage.selection) walk(n);
  return ids;
}

async function fullScan(): Promise<FullScan> {
  figma.skipInvisibleInstanceChildren = true;
  await figma.loadAllPagesAsync();

  const localRaw = await figma.variables.getLocalVariablesAsync();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collName = new Map(collections.map(c => [c.id, c.name]));

  const usedIds = new Set<string>();
  // variable→variable alias usage
  for (const v of localRaw) {
    for (const modeId of Object.keys(v.valuesByMode)) {
      const val = v.valuesByMode[modeId];
      if (isAliasValue(val)) usedIds.add(val.id);
    }
  }

  const refs: { id: string; ref: BrokenReference }[] = [];
  const occurrencesAll: Occurrence[] = [];
  let scanned = 0;
  for (const page of figma.root.children) {
    const nodes = (page as PageNode).findAll(() => true);
    for (const node of nodes) {
      collectNode(node as SceneNode, page as PageNode, usedIds, refs, occurrencesAll);
      if ((++scanned % 800) === 0) figma.ui.postMessage({ type: 'scan-progress', scanned });
    }
  }

  // Broken references: resolve each unique referenced id once.
  const brokenAll: BrokenReference[] = [];
  const existence = new Map<string, boolean>();
  for (const { id } of refs) {
    if (existence.has(id)) continue;
    const v = await figma.variables.getVariableByIdAsync(id);
    existence.set(id, v !== null);
  }
  for (const { id, ref } of refs) if (!existence.get(id)) brokenAll.push(ref);

  // Unused
  const firstModeValue = (v: Variable): unknown => v.valuesByMode[Object.keys(v.valuesByMode)[0]];
  const infos: LocalVarInfo[] = localRaw.map(v => {
    const isColor = v.resolvedType === 'COLOR';
    const mv = firstModeValue(v);
    const colorHex = isColor && mv && typeof mv === 'object' && !isAliasValue(mv)
      ? rgbaToHex(mv as any) : undefined;
    const valuePreview = colorHex ?? (typeof mv === 'number' ? formatNumber(mv) : isAliasValue(mv) ? '→ alias' : String(mv));
    return {
      id: v.id, name: v.name, collectionName: collName.get(v.variableCollectionId) ?? '—',
      resolvedType: v.resolvedType, remote: v.remote, valuePreview, colorHex,
    };
  });
  const unused = computeUnused(infos, usedIds);

  return { unused, brokenAll, occurrencesAll, selectionIds: collectSelectionIds(), currentPageId: figma.currentPage.id };
}

function filterByScope(scope: Scope): ScanResult {
  if (!lastScan) return { scope, summary: { unused: 0, broken: 0, hardcoded: 0 }, unused: [], broken: [], hardcoded: [] };
  const inScope = (nodeId: string, pageId: string) =>
    scope === 'document' ? true :
    scope === 'page' ? pageId === lastScan!.currentPageId :
    lastScan!.selectionIds.has(nodeId);
  const broken = lastScan.brokenAll.filter(b => inScope(b.nodeId, b.pageId));
  const occ = lastScan.occurrencesAll.filter(o => inScope(o.nodeId, o.pageId));
  const hardcoded: HardcodedGroup[] = groupHardcoded(occ);
  return {
    scope,
    summary: { unused: lastScan.unused.length, broken: broken.length, hardcoded: occ.length },
    unused: lastScan.unused, broken, hardcoded,
  };
}

figma.ui.onmessage = async (msg: UIToPlugin) => {
  try {
    if (msg.type === 'scan') {
      lastScan = await fullScan();
      figma.ui.postMessage({ type: 'scan-result', result: filterByScope(msg.scope) });
    } else if (msg.type === 'set-scope') {
      if (!lastScan) lastScan = await fullScan();
      figma.ui.postMessage({ type: 'scan-result', result: filterByScope(msg.scope) });
    }
    // navigate / delete / candidates / replace added in later tasks
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: String((e as Error)?.message ?? e) });
  }
};
```

- [ ] **Step 2: Build**

Run: `cd variable-auditor && npm run build`
Expected: no type errors; `dist/code.js` updated.

- [ ] **Step 3: Add a temporary UI probe** so the scan can be triggered before the real UI exists. Temporarily set `src/ui.html` body to:

```html
<body>
<button id="scan">Scan document</button>
<pre id="out" style="white-space:pre-wrap;font:11px monospace"></pre>
<script>
  document.getElementById('scan').onclick = () =>
    parent.postMessage({ pluginMessage: { type: 'scan', scope: 'document' } }, '*');
  onmessage = (e) => {
    const m = e.data.pluginMessage; if (!m) return;
    if (m.type === 'scan-result') document.getElementById('out').textContent =
      JSON.stringify(m.result.summary) + '\n' + m.result.hardcoded.map(g => g.label + ' ×' + g.count).join('\n');
    if (m.type === 'error') document.getElementById('out').textContent = 'ERROR: ' + m.message;
  };
</script>
</body>
```
Rebuild: `npm run build`.

- [ ] **Step 4: Manual verification in Figma**

  1. Create a test file with: one unused local color variable, one layer bound to a variable then delete that variable (broken ref), a few frames with raw fills / corner radius / auto-layout padding / a text layer with a set font size.
  2. Figma → Plugins → Development → Import plugin from manifest → select `variable-auditor/manifest.json`.
  3. Run the plugin, click **Scan document**.
  4. Confirm the summary counts are non-zero and plausible, and hardcoded group labels look right (e.g. `#FFFFFF ×N`, `Corner radius · 8 ×N`). Confirm no `ERROR:`.

- [ ] **Step 5: Commit**

```bash
git add variable-auditor/src/code.ts variable-auditor/src/ui.html variable-auditor/dist/code.js
git commit -m "feat(variable-auditor): scan engine (unused, broken, hardcoded) + scope filtering"
```

---

### Task 8: code.ts — navigate action

**Files:**
- Modify: `variable-auditor/src/code.ts`

**Interfaces:**
- Consumes: `{ type: 'navigate'; nodeId; pageId }`.
- Produces: selection + viewport change; `error` if node is gone.

- [ ] **Step 1: Add the handler** — inside `figma.ui.onmessage`, after the `set-scope` branch, add:

```ts
    else if (msg.type === 'navigate') {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) { figma.ui.postMessage({ type: 'error', message: 'That layer no longer exists — rescan.' }); return; }
      const page = await figma.getNodeByIdAsync(msg.pageId);
      if (page && page.type === 'PAGE' && figma.currentPage.id !== page.id) {
        await figma.setCurrentPageAsync(page);
      }
      figma.currentPage.selection = [node as SceneNode];
      figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    }
```

- [ ] **Step 2: Build** — `cd variable-auditor && npm run build` → no errors.

- [ ] **Step 3: Manual verification** — In the temporary UI probe, add a button that posts `{ type:'navigate', nodeId:<paste an id from a scan result>, pageId:<its page id> }`. Confirm Figma selects and zooms to that node, switching pages if needed. (Full wiring happens in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add variable-auditor/src/code.ts variable-auditor/dist/code.js
git commit -m "feat(variable-auditor): navigate-to-layer action"
```

---

### Task 9: code.ts — delete unused variables

**Files:**
- Modify: `variable-auditor/src/code.ts`

**Interfaces:**
- Consumes: `{ type: 'delete-variables'; ids: string[] }`.
- Produces: `{ type:'action-result', ok, message, removedVariableIds }`.

- [ ] **Step 1: Add the handler** — after the `navigate` branch:

```ts
    else if (msg.type === 'delete-variables') {
      const removed: string[] = [];
      for (const id of msg.ids) {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (v) { try { v.remove(); removed.push(id); } catch { /* in use / locked */ } }
      }
      figma.ui.postMessage({
        type: 'action-result', ok: true,
        message: `Deleted ${removed.length} variable${removed.length === 1 ? '' : 's'}.`,
        removedVariableIds: removed,
      });
    }
```

- [ ] **Step 2: Build** — `npm run build` → no errors.

- [ ] **Step 3: Manual verification** — Post `{ type:'delete-variables', ids:[<unused var id>] }` from the probe; confirm the variable disappears from Figma's Variables panel and `action-result` returns its id in `removedVariableIds`.

- [ ] **Step 4: Commit**

```bash
git add variable-auditor/src/code.ts variable-auditor/dist/code.js
git commit -m "feat(variable-auditor): delete unused variables action"
```

---

### Task 10: code.ts — replace candidates + apply binding

**Files:**
- Modify: `variable-auditor/src/code.ts`

**Interfaces:**
- Consumes: `{ type:'get-candidates'; category; valueKey }`, `{ type:'replace'; category; valueKey; variableId }`.
- Produces: `{ type:'candidates', ... }`, `{ type:'action-result', replacedValueKey, replacedCount, skippedCount }`.
- Uses `resolveVariableValue`, `rankCandidates`, `ResolvableVar`, `ResolvedCandidate` from `analysis.ts`.

- [ ] **Step 1: Extend the analysis import** at the top of `code.ts`:

```ts
import {
  rgbaToHex, formatNumber, groupMeta, computeUnused, groupHardcoded,
  resolveVariableValue, rankCandidates,
  type LocalVarInfo, type ResolvableVar, type ResolvedCandidate,
} from './analysis.ts';
```

- [ ] **Step 2: Add candidate + replace handlers** — after the `delete-variables` branch:

```ts
    else if (msg.type === 'get-candidates') {
      const wantColor = msg.category === 'color';
      const type = wantColor ? 'COLOR' : 'FLOAT';
      const localVars = (await figma.variables.getLocalVariablesAsync()).filter(v => v.resolvedType === type);
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collName = new Map(collections.map(c => [c.id, c.name]));
      const varMap = new Map<string, ResolvableVar>(localVars.map(v => [v.id, { id: v.id, valuesByMode: v.valuesByMode as any }]));
      const resolved: ResolvedCandidate[] = localVars.map(v => {
        const modes = Object.keys(v.valuesByMode);
        const modeValues = modes.map(m => resolveVariableValue(v.id, m, varMap) as any);
        const first = modeValues[0];
        const colorHex = wantColor && first && typeof first === 'object' ? rgbaToHex(first) : undefined;
        const valuePreview = wantColor ? (colorHex ?? '—') : (typeof first === 'number' ? formatNumber(first) : '—');
        return { id: v.id, name: v.name, collectionName: collName.get(v.variableCollectionId) ?? '—',
          resolvedType: type, valuePreview, colorHex, modeValues };
      });
      const group = lastScan?.occurrencesAll.find(o => o.valueKey === msg.valueKey);
      const target = wantColor
        ? { kind: 'color' as const, colorHex: group?.colorHex ?? '', opacity: group?.opacity ?? 1 }
        : { kind: 'number' as const, num: group?.num ?? 0 };
      figma.ui.postMessage({ type: 'candidates', category: msg.category, valueKey: msg.valueKey,
        candidates: rankCandidates(target, resolved) });
    }
    else if (msg.type === 'replace') {
      const variable = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!variable) { figma.ui.postMessage({ type: 'error', message: 'That variable no longer exists — rescan.' }); return; }
      const occ = (lastScan?.occurrencesAll ?? []).filter(o => o.valueKey === msg.valueKey);
      let replaced = 0, skipped = 0;
      for (const o of occ) {
        const node = await figma.getNodeByIdAsync(o.nodeId);
        if (!node) { skipped++; continue; }
        try { await applyBinding(node as SceneNode, o, variable); replaced++; }
        catch { skipped++; }
      }
      // drop replaced occurrences from cache so a re-filter reflects reality
      if (lastScan) lastScan.occurrencesAll = lastScan.occurrencesAll.filter(o => o.valueKey !== msg.valueKey);
      figma.ui.postMessage({ type: 'action-result', ok: true,
        message: `Replaced ${replaced}${skipped ? `, skipped ${skipped}` : ''}.`,
        replacedValueKey: msg.valueKey, replacedCount: replaced, skippedCount: skipped });
    }
```

- [ ] **Step 3: Add the `applyBinding` helper** (module scope, above `figma.ui.onmessage`):

```ts
async function applyBinding(node: SceneNode, o: Occurrence, variable: Variable): Promise<void> {
  if (o.kind === 'color') {
    const key = o.field as 'fills' | 'strokes';
    const paints = ((node as any)[key] as Paint[]).slice();
    const p = paints[o.paintIndex ?? -1];
    if (!p || p.type !== 'SOLID') throw new Error('paint gone');
    paints[o.paintIndex!] = figma.variables.setBoundVariableForPaint(p as SolidPaint, 'color', variable);
    (node as any)[key] = paints;
  } else if (o.field === 'cornerRadius') {
    for (const f of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'] as const) {
      (node as any).setBoundVariable(f, variable);
    }
  } else {
    if (node.type === 'TEXT' && node.fontName !== figma.mixed) await figma.loadFontAsync(node.fontName);
    (node as any).setBoundVariable(o.field, variable);
  }
}
```

Add `Occurrence` to the `types.ts` import if not already present.

- [ ] **Step 4: Build** — `npm run build` → no errors.

- [ ] **Step 5: Manual verification** — From the probe, post `get-candidates` for a color group and confirm candidates return (exact matches first). Post `replace` with a candidate id; confirm in Figma the layers' fills become bound to the variable (fill shows the variable chip), and `action-result` reports the replaced count.

- [ ] **Step 6: Commit**

```bash
git add variable-auditor/src/code.ts variable-auditor/dist/code.js
git commit -m "feat(variable-auditor): replace candidates + bind hardcoded values to variables"
```

---

### Task 11: ui.html — wire the approved mockup to the plugin

**Files:**
- Create/replace: `variable-auditor/src/ui.html` (start from the committed mockup)

**Interfaces:**
- Consumes all `PluginToUI` messages; sends all `UIToPlugin` messages (see `types.ts`).

> **REQUIRED SUB-SKILL for this task:** use the `impeccable` skill to hold the UI to the mockup's polish bar while wiring it. Preserve the mockup's palette, Geist fonts (already inlined), Lucide icons, soft-shadow cards, and the fixed-height flex scroll layout exactly.

- [ ] **Step 1: Seed the file from the approved mockup**

Run:
```bash
cp docs/superpowers/specs/assets/variable-auditor-mockup.html variable-auditor/src/ui.html
```

- [ ] **Step 2: Convert the mockup shell into the plugin window.** In `src/ui.html`:
  - Remove the `.stage` wrapper and the `.caption` line (mockup-only framing).
  - Change `.panel` height from `min(660px,calc(100dvh - 140px))` to `height:100vh` and `border-radius:0` (it now fills the plugin window). Keep the flex column, pinned header/scope/metrics/footer, scrolling `.results`, and `.card{flex-shrink:0}` exactly as-is (this is the verified scroll fix).
  - Delete the three hard-coded sample section cards inside `.results` and the sample metric numbers; replace `.results` inner content with three empty containers:

```html
<div class="results" id="results">
  <section class="card" data-card id="card-unused" hidden></section>
  <section class="card" data-card id="card-broken" hidden></section>
  <section class="card" data-card id="card-hardcoded" hidden></section>
</div>
```
  - Give the metric numbers ids: `#m-unused`, `#m-broken`, `#m-hardcoded` (start at `0`).
  - Keep the header, scope segmented control, and footer markup.

- [ ] **Step 3: Add a hidden icons block.** Near the top of `<body>`, add a hidden container the render code reads by id (`icon(id)` returns `innerHTML`). Copy each `<svg>` markup **verbatim from the mockup**. Use these exact ids:

```html
<div id="icons" hidden>
  <span id="ic-ghost"><!-- ghost svg --></span>
  <span id="ic-triangle"><!-- triangle-alert svg --></span>
  <span id="ic-code"><!-- code svg --></span>
  <span id="ic-unlink"><!-- unlink svg --></span>
  <span id="ic-locate"><!-- crosshair/locate svg --></span>
  <span id="ic-trash"><!-- trash-2 svg --></span>
  <span id="ic-swap"><!-- arrow-left-right svg --></span>
  <span id="ic-chevron"><!-- chevron-down svg, with NO class attribute on the <svg> --></span>
  <span id="ic-info"><!-- info svg --></span>
  <span id="ic-refresh"><!-- refresh svg --></span>
  <span id="ic-check"><!-- check svg --></span>
</div>
```

The `ic-chevron` svg must have **no `class` attribute** — the render code injects `chev` (section header) or `grow-chev` (group row) at runtime so each rotates correctly.

- [ ] **Step 4: Replace the mockup's demo `<script>` with the render + messaging script.** Use this complete script:

```html
<script>
  var state = { scope: 'page', result: null, pendingReplace: null };
  function post(msg) { parent.postMessage({ pluginMessage: msg }, '*'); }
  function icon(id, cls) {
    var e = document.getElementById('ic-' + id); if (!e) return '';
    var h = e.innerHTML;
    return cls ? h.replace('<svg', '<svg class="' + cls + '"') : h;
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // --- scope control ---
  document.querySelectorAll('.seg').forEach(function (s, i) {
    var scopes = ['selection', 'page', 'document'];
    s.addEventListener('click', function () {
      document.querySelectorAll('.seg').forEach(function (x) { x.classList.remove('active'); });
      s.classList.add('active'); state.scope = scopes[i];
      post({ type: 'set-scope', scope: state.scope });
    });
  });
  document.querySelector('.icon-btn').addEventListener('click', rescan);
  function rescan() { setBusy(true); post({ type: 'scan', scope: state.scope }); }
  function setBusy(b) { document.querySelector('.icon-btn').classList.toggle('busy', b); }

  // --- accordion (delegated so it survives re-render) ---
  document.getElementById('results').addEventListener('click', function (e) {
    var head = e.target.closest('.shead'); if (head) head.closest('.card').classList.toggle('collapsed');
    var grow = e.target.closest('.grow');
    if (grow && !e.target.closest('.replace') && !e.target.closest('.mini')) grow.closest('.grp').classList.toggle('open');
  });

  window.onmessage = function (ev) {
    var m = ev.data.pluginMessage; if (!m) return;
    if (m.type === 'scan-result') { setBusy(false); state.result = m.result; render(m.result); }
    else if (m.type === 'candidates') showPicker(m);
    else if (m.type === 'action-result') { if (m.removedVariableIds || m.replacedValueKey) rescan(); }
    else if (m.type === 'error') { setBusy(false); toast(m.message); }
  };

  function render(r) {
    document.getElementById('m-unused').textContent = r.summary.unused;
    document.getElementById('m-broken').textContent = r.summary.broken;
    document.getElementById('m-hardcoded').textContent = r.summary.hardcoded;
    renderUnused(r.unused);
    renderBroken(r.broken);
    renderHardcoded(r.hardcoded);
  }
  // renderUnused / renderBroken / renderHardcoded / showPicker / toast: see Step 5.
  rescan(); // initial scan on open
</script>
```

- [ ] **Step 5: Add the render functions** (append inside the same `<script>`, before `rescan();`). Each builds rows that match the mockup's classes exactly:

```js
  function sectionHeader(iconId, title, count, tint) {
    var h = el('button', 'shead');
    h.innerHTML =
      '<span class="sicon" style="background:' + tint.bg + ';color:' + tint.fg + '">' + icon(iconId) + '</span>' +
      '<span class="stitle">' + title + '</span>' +
      '<span class="count">' + count + '</span>' + icon('chevron', 'chev');
    return h;
  }
  var TINT = {
    violet: { bg: 'rgba(124,92,255,.12)', fg: 'var(--violet)' },
    rose:   { bg: 'rgba(240,57,107,.12)', fg: 'var(--rose)' },
    amber:  { bg: 'rgba(224,134,0,.12)',  fg: 'var(--amber)' },
  };

  function renderUnused(list) {
    var card = document.getElementById('card-unused'); card.hidden = false; card.innerHTML = '';
    card.appendChild(sectionHeader('ghost', 'Unused variables', list.length, TINT.violet));
    var body = el('div', 'swrap'); var sb = el('div', 'sbody'); var inner = el('div', 'sbody-inner');
    inner.appendChild(el('div', 'caveat', icon('info') +
      '<p>Unused in this file only. If it’s published as a library, these may still be used elsewhere.</p>'));
    if (!list.length) inner.appendChild(el('div', 'empty', 'No unused variables — nice.'));
    list.forEach(function (v) {
      var row = el('div', 'row');
      var left = v.colorHex
        ? '<div class="swatch" style="background:' + v.colorHex + '"></div>'
        : '<div class="tglyph">' + (v.valuePreview.length <= 3 ? v.valuePreview : '#') + '</div>';
      row.innerHTML = left +
        '<div class="rmain"><div class="rname">' + esc(v.name) + '</div><div class="rmeta">' + esc(v.collectionName) + ' · ' + cap(v.resolvedType) + '</div></div>' +
        '<div class="rval">' + esc(v.valuePreview) + '</div>' +
        '<div class="ract"><button class="mini danger" aria-label="Delete">' + icon('trash') + '</button></div>';
      row.querySelector('.mini').addEventListener('click', function () { post({ type: 'delete-variables', ids: [v.id] }); });
      inner.appendChild(row);
    });
    sb.appendChild(inner); body.appendChild(sb); card.appendChild(body);
  }

  function renderBroken(list) {
    var card = document.getElementById('card-broken'); card.hidden = false; card.innerHTML = '';
    card.appendChild(sectionHeader('triangle', 'Broken references', list.length, TINT.rose));
    var body = el('div', 'swrap'); var sb = el('div', 'sbody'); var inner = el('div', 'sbody-inner');
    if (!list.length) inner.appendChild(el('div', 'empty', 'No broken references.'));
    list.forEach(function (b) {
      var row = el('div', 'row');
      row.innerHTML =
        '<div class="tglyph" style="color:var(--rose)">' + icon('unlink') + '</div>' +
        '<div class="rmain"><div class="rname">' + esc(b.nodeName) + '</div><div class="rmeta">' + esc(fieldLabel(b.field)) + ' <span class="tag rose">missing</span></div></div>' +
        '<div class="ract"><span class="opage">' + esc(b.pageName) + '</span><button class="mini" aria-label="Locate on canvas">' + icon('locate') + '</button></div>';
      row.querySelector('.mini').addEventListener('click', function () { post({ type: 'navigate', nodeId: b.nodeId, pageId: b.pageId }); });
      inner.appendChild(row);
    });
    sb.appendChild(inner); body.appendChild(sb); card.appendChild(body);
  }

  var FILTERS = [
    { cat: 'color', label: 'Color' },
    { cat: 'radiusStroke', label: 'Radius & stroke' },
    { cat: 'spacing', label: 'Spacing' },
    { cat: 'typography', label: 'Typography' },
  ];
  var activeFilters = { color: true, radiusStroke: true, spacing: true, typography: true };

  function renderHardcoded(groups) {
    var card = document.getElementById('card-hardcoded'); card.hidden = false; card.innerHTML = '';
    card.appendChild(sectionHeader('code', 'Hardcoded values', groups.length, TINT.amber));
    var body = el('div', 'swrap'); var sb = el('div', 'sbody'); var inner = el('div', 'sbody-inner');
    var chips = el('div', 'filters');
    FILTERS.forEach(function (f) {
      var c = el('button', 'fchip' + (activeFilters[f.cat] ? ' on' : ''), '<span class="fdot"></span>' + f.label);
      c.addEventListener('click', function () { activeFilters[f.cat] = !activeFilters[f.cat]; c.classList.toggle('on'); applyFilters(); });
      chips.appendChild(c);
    });
    inner.appendChild(chips);
    groups.forEach(function (g) {
      var grp = el('div', 'grp'); grp.dataset.cat = g.category;
      var left = g.colorHex ? '<div class="swatch" style="background:' + g.colorHex + '"></div>'
                            : '<div class="tglyph">' + esc(formatGlyph(g)) + '</div>';
      var rowMeta = g.category === 'color' ? 'Fill color · ' + g.count + ' layers' : g.count + ' layers';
      var head = el('div', 'row grow');
      head.innerHTML = left +
        '<div class="rmain"><div class="rname">' + esc(g.label) + '</div><div class="rmeta">' + rowMeta + '</div></div>' +
        '<div class="ract"><button class="replace">' + icon('swap') + 'Replace</button>' + icon('chevron', 'grow-chev') + '</div>';
      head.querySelector('.replace').addEventListener('click', function (e) {
        e.stopPropagation(); state.pendingReplace = { category: g.category, valueKey: g.valueKey, label: g.label };
        post({ type: 'get-candidates', category: g.category, valueKey: g.valueKey });
      });
      grp.appendChild(head);
      var ow = el('div', 'occ-wrap'); var oc = el('div', 'occ'); var oi = el('div', 'occ-inner');
      g.occurrences.forEach(function (o) {
        var orow = el('div', 'orow');
        orow.innerHTML = '<div class="obar"></div><span class="oname">' + esc(o.nodeName) + '</span><span class="opage">' + esc(o.pageName) + '</span>' +
          '<button class="mini" aria-label="Locate">' + icon('locate') + '</button>';
        orow.querySelector('.mini').addEventListener('click', function () { post({ type: 'navigate', nodeId: o.nodeId, pageId: o.pageId }); });
        oi.appendChild(orow);
      });
      oc.appendChild(oi); ow.appendChild(oc); grp.appendChild(ow); inner.appendChild(grp);
    });
    if (!groups.length) inner.appendChild(el('div', 'empty', 'No hardcoded values in scope.'));
    sb.appendChild(inner); body.appendChild(sb); card.appendChild(body);
    applyFilters();
  }
  function applyFilters() {
    document.querySelectorAll('#card-hardcoded .grp').forEach(function (g) {
      g.style.display = activeFilters[g.dataset.cat] ? '' : 'none';
    });
  }

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function cap(t) { return t.charAt(0) + t.slice(1).toLowerCase(); }
  function fieldLabel(f) { return ({ fills: 'Fill', strokes: 'Stroke', cornerRadius: 'Corner radius', strokeWeight: 'Stroke weight', fontSize: 'Font size', lineHeight: 'Line height', letterSpacing: 'Letter spacing', itemSpacing: 'Item spacing' })[f] || f; }
  function formatGlyph(g) { var n = g.num != null ? String(g.num) : '#'; return n.length <= 3 ? n : '#'; }
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2600); }

  function showPicker(m) {
    var pr = state.pendingReplace; if (!pr) return;
    var overlay = document.getElementById('picker');
    var body = document.getElementById('picker-body');
    document.getElementById('picker-title').textContent = 'Replace ' + pr.label;
    body.innerHTML = '';
    var exact = m.candidates.filter(function (c) { return c.exact; });
    var rest = m.candidates.filter(function (c) { return !c.exact; });
    function addRow(c) {
      var row = el('button', 'pick-row');
      var left = c.colorHex ? '<div class="swatch" style="background:' + c.colorHex + '"></div>' : '<div class="tglyph">' + esc(c.valuePreview) + '</div>';
      row.innerHTML = left + '<div class="rmain"><div class="rname">' + esc(c.name) + '</div><div class="rmeta">' + esc(c.collectionName) + (c.exact ? ' · <span class="tag exact">exact</span>' : '') + '</div></div>';
      row.addEventListener('click', function () {
        post({ type: 'replace', category: pr.category, valueKey: pr.valueKey, variableId: c.id });
        overlay.classList.remove('show'); state.pendingReplace = null;
      });
      body.appendChild(row);
    }
    if (exact.length) { body.appendChild(el('div', 'pick-label', 'Exact matches')); exact.forEach(addRow); }
    body.appendChild(el('div', 'pick-label', rest.length ? 'All ' + m.category + ' variables' : 'No local variables of this type'));
    rest.forEach(addRow);
    overlay.classList.add('show');
  }
  document.getElementById('picker-cancel').addEventListener('click', function () {
    document.getElementById('picker').classList.remove('show'); state.pendingReplace = null;
  });
```

- [ ] **Step 6: Add the picker overlay, toast, and their styles.** Add before `</body>`:

```html
<div class="overlay" id="picker">
  <div class="sheet">
    <div class="sheet-head"><span id="picker-title">Replace</span>
      <button class="mini" id="picker-cancel" aria-label="Cancel"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
    <div class="sheet-body" id="picker-body"></div>
  </div>
</div>
<div id="toast" class="toast"></div>
```

Add to `<style>` (colors reuse the mockup tokens):

```css
.empty{padding:16px 8px;color:var(--text-3);font-size:12px;text-align:center;}
.busy{opacity:.6;pointer-events:none;}
.tag.exact{color:var(--violet-ink);background:rgba(124,92,255,.12);}
.overlay{position:absolute;inset:0;background:rgba(20,18,40,.28);display:none;align-items:flex-end;z-index:10;}
.overlay.show{display:flex;}
.sheet{background:var(--surface);width:100%;max-height:80%;border-radius:18px 18px 0 0;display:flex;flex-direction:column;box-shadow:0 -12px 40px -12px rgba(30,24,70,.4);}
.sheet-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;}
.sheet-body{overflow-y:auto;padding:8px;}
.pick-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);padding:8px 8px 4px;}
.pick-row{display:flex;align-items:center;gap:11px;width:100%;padding:9px 8px;border:0;background:transparent;border-radius:11px;cursor:pointer;font-family:inherit;text-align:left;color:var(--text);}
.pick-row:hover{background:var(--hover);}
.toast{position:absolute;left:50%;bottom:56px;transform:translateX(-50%) translateY(10px);background:var(--text);color:#fff;font-size:11.5px;padding:8px 14px;border-radius:10px;opacity:0;transition:.2s;pointer-events:none;z-index:11;}
.toast.show{opacity:1;transform:translateX(-50%);}
```

(Note: `.overlay` uses `position:absolute` within the `100vh` body — allowed here because the body is the fixed plugin window, not in-flow content.)

- [ ] **Step 7: Build and manually verify in Figma**

Run: `cd variable-auditor && npm run build`
Then in Figma (reimport or reload the plugin) verify end-to-end:
  1. Opens → auto-scans the current page; metric chips + three sections populate; matches the mockup's look.
  2. Scope toggle (Selection / Page / Document) refilters instantly; counts change.
  3. Accordions open/close smoothly; multiple open → results scroll; header + footer stay pinned.
  4. Filter chips hide/show hardcoded categories.
  5. Click a broken row or a hardcoded occurrence's locate button → Figma selects & zooms (switching page if needed).
  6. Delete an unused variable → it vanishes and a rescan refreshes counts.
  7. Replace a hardcoded group → picker shows exact matches first → pick one → layers bind to the variable; rescan refreshes.

- [ ] **Step 8: Commit**

```bash
git add variable-auditor/src/ui.html variable-auditor/dist/code.js
git commit -m "feat(variable-auditor): wire polished UI to scan/navigate/replace/delete"
```

---

### Task 12: README + final verification

**Files:**
- Modify: `README.md` (repo root)
- Remove: any leftover temporary probe markup in `ui.html` (ensure Step 11 UI is the final one)

- [ ] **Step 1: Add a Variable Auditor section to `README.md`** under `## Plugins`, matching the existing `component-docs` entry's style:

```markdown
### [`variable-auditor`](./variable-auditor)

Audits variable hygiene in a file. Scans for **unused variables**, **broken references** (layers bound to a deleted variable), and **hardcoded values** (colors, corner radius, stroke weight, auto-layout spacing, and typography that aren't bound to a variable). Scope the scan to the current selection, page, or whole document, then:

- **Jump** to any layer on canvas from the plugin
- **Replace** a hardcoded value — or a whole group of them — with a matching variable (exact matches suggested first)
- **Delete** unused variables in one click

Results group identical values together (e.g. `#FFFFFF · 14 layers`) so large files stay manageable.
```

- [ ] **Step 2: Full regression pass** — rebuild (`cd variable-auditor && npm run build`), run `npm test` (all analysis tests pass), and repeat the Task 11 Step 7 checklist once more on a fresh Figma test file with a large-ish page (a few hundred layers) to confirm scan performance and scrolling.

- [ ] **Step 3: Commit**

```bash
git add README.md variable-auditor
git commit -m "docs(variable-auditor): add README section"
```

---

## Self-review notes

- **Spec coverage:** unused (Tasks 3, 7) · broken refs (Task 7) · hardcoded across all 4 categories (Task 7 `collectNode`) · scope toggle + whole-file unused (Task 7 `filterByScope`) · grouping by value (Task 4) · navigate (Task 8) · delete unused (Task 9) · replace w/ exact-first candidates, local-only (Tasks 6, 10) · pure logic unit-tested (Tasks 2–6) · locked light UI from mockup incl. scroll pattern (Task 11) · README (Task 12). Deferrals from the spec are explicitly not implemented.
- **Type consistency:** `Occurrence`, `HardcodedGroup`, `HardcodedCategory` (`color|radiusStroke|spacing|typography`), `HardcodedKind`, and the message unions are defined once in Task 1 and used verbatim thereafter. `groupMeta` is the single source of category/key/label (Tasks 2, 4, 7). `applyBinding` handles the `cornerRadius` uniform-vs-corner and color paint-index cases set in `collectNode`.
- **Manual-test rationale:** `code.ts` and `ui.html` depend on the `figma` runtime and a DOM, so they use build + in-Figma verification instead of unit tests, per the spec's testing strategy; all decision logic they call is unit-tested in `analysis.ts`.
