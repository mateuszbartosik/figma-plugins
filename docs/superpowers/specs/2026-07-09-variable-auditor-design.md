# Variable Auditor — Figma plugin design

- **Date:** 2026-07-09
- **Status:** Approved (design) — ready for implementation planning
- **Author:** Mateusz Bartosik (with Claude)
- **Folder:** `variable-auditor/` (sibling to `component-docs/`, `word-counter/`)

## 1. Overview

A Figma plugin that audits a file's variable hygiene. It surfaces three classes of
problem and lets the user act on each without leaving the plugin:

1. **Unused variables** — local variables that nothing references (safe-to-delete
   cleanup candidates).
2. **Broken references** — layers bound to a variable that no longer exists.
3. **Hardcoded values** — properties set as raw values that could be bound to a
   variable (colors, corner radius, stroke weight, auto-layout spacing, typography).

From the results the user can **jump** to the exact layer on canvas, **replace** a
hardcoded value (or a whole group of them) with a variable, and **delete** unused
variables.

## 2. Goals & non-goals

### Goals (v1)
- Detect the three issue classes above with the property coverage in §5.
- One scan, then instant scope filtering (Selection / Page / Document).
- Group hardcoded values by value with per-occurrence drill-down.
- Navigate-to-layer, replace-with-variable (single + bulk per group), delete unused
  (single + bulk).
- A polished, light-mode UI matching the approved mockup (§8).
- Pure detection/grouping/matching logic extracted into a unit-tested module.

### Non-goals / explicitly deferred (YAGNI)
- **Gradient / image paints** — only `SOLID` paint colors are scanned in v1.
- **Mixed-style text** — text nodes whose `fontSize`/`lineHeight`/`letterSpacing`
  is `figma.mixed` are skipped for typography detection (no single value to
  report or bind). Noted in the UI.
- **Binding to library variables** — replace suggestions are **local variables
  only**. Importing a not-yet-local library variable to bind is deferred.
- **Fuzzy / nearest-color matching** — replace matching is exact-value + manual
  pick only.
- **Transitive unused** — a variable referenced only by another (itself unused)
  variable counts as *used* in v1 (conservative; never over-deletes).
- **Report export to canvas** — possible future feature; not in v1.

## 3. Key constraints & caveats

- **Unused detection is always whole-file.** A variable is only "unused" if
  *nothing anywhere* binds it, so the usage index requires scanning every page.
  The scope toggle (§5.4) therefore governs only the **hardcoded** and **broken**
  results; the **unused** result is always computed over the entire document.
- **Cross-file blind spot.** The plugin only sees usage within the current file.
  If the file is published as a library, a "locally unused" variable may still be
  consumed by other files. The Unused section shows a persistent caveat to this
  effect. Deletion is never automatic.
- **Only local, non-remote variables** are deletion/replace candidates.

## 4. Architecture & tooling

Self-contained folder mirroring the existing plugins (esbuild bundle → `dist/code.js`,
standalone `src/ui.html`, `documentAccess: "dynamic-page"`, `networkAccess: none`).

```
variable-auditor/
  manifest.json
  package.json          # build/watch (esbuild) + test (node --test)
  tsconfig.json
  .gitignore            # node_modules/, dist/ optional
  src/
    code.ts             # plugin entry: messaging + all figma-API glue
    ui.html             # self-contained UI (styles + Geist data-URI + Lucide SVGs + script)
    types.ts            # shared message + data shapes (imported by code.ts)
    analysis.ts         # PURE logic — no `figma` global
    analysis.test.ts    # node:test unit tests for analysis.ts
```

- **`analysis.ts` is pure** and holds everything testable: value normalization &
  keys, usage-index → unused-set computation, hardcoded grouping/sorting,
  variable-value resolution through alias chains, and exact-match candidate ranking.
  It receives plain data (never touches `figma`).
- **`code.ts`** does the `figma`-API work (traversal, `boundVariables` reads,
  navigation, binding, deletion) and delegates all decision logic to `analysis.ts`.
- **`ui.html`** is "dumb": it renders data the backend prepares (values are
  pre-formatted into display strings) and sends intent messages back. Geist /
  Geist Mono are embedded as `@font-face` data URIs; Lucide icons are inlined SVGs
  (no network — required by `networkAccess: none`).
- **Build/test** follow `word-counter`: `esbuild src/code.ts --bundle
  --outfile=dist/code.js --target=es6`; tests via `node --test` on
  `src/analysis.test.ts` using `node:test` + `node:assert` (no framework dep).

### Manifest
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

## 5. Detection engine

### 5.1 Single-pass scan
1. `await figma.loadAllPagesAsync()` (required under `dynamic-page` to reach all
   pages' nodes and `boundVariables`).
2. Load `getLocalVariablesAsync()` and `getLocalVariableCollectionsAsync()`.
3. Walk every page's node tree **once**, collecting into memory:
   - the **usage index** (all referenced variable IDs),
   - all **broken references** (tagged with `nodeId` + `pageId`),
   - all **hardcoded occurrences** (tagged with `nodeId` + `pageId` + field + value).
4. Compute results (§5.2–5.5) and keep the full result cached so scope changes
   re-filter instantly without re-traversing.

Performance: set `figma.skipInvisibleInstanceChildren = true` before traversal to
skip hidden instance sub-trees (documented tradeoff); post `scan-progress` messages
periodically for large files.

### 5.2 Usage index → unused
Referenced variable IDs come from two sources:
- **Node bindings:** for each scanned node, every entry in `node.boundVariables`
  (values are `VariableAlias | VariableAlias[]`) contributes its `.id`. Solid
  paints in `fills`/`strokes` are additionally checked for `paint.boundVariables.color`.
- **Variable aliases:** for each local variable, every mode value in `valuesByMode`
  that is a `{ type: 'VARIABLE_ALIAS', id }` contributes its `.id`.

`unused = localVariables.filter(v => !v.remote && !usedIds.has(v.id))`.

### 5.3 Broken references
While reading each node's `boundVariables`, resolve every referenced id via
`figma.variables.getVariableByIdAsync(id)` (results cached in a `Map` to avoid
duplicate lookups). A `null` result ⇒ broken reference; record
`{ nodeId, pageId, pageName, nodeName, field }`. Each broken reference is navigable.

### 5.4 Hardcoded values (scope-filtered)
A property is "hardcoded" when it has a concrete value **and** no variable binding.
Categories and fields:

| Category | Nodes | Fields | Notes |
|---|---|---|---|
| **Color** | any with `fills`/`strokes` | solid paint `.color` (+ opacity) | skip if paint has `boundVariables.color`; skip gradient/image |
| **Corner radius** | `cornerRadius`-bearing | `topLeft/Right`, `bottomLeft/Right` (or uniform) | skip value `0` |
| **Stroke weight** | nodes **with** strokes | `strokeWeight` (per-side if mixed) | only if strokes present |
| **Spacing** | `layoutMode !== 'NONE'` | `paddingLeft/Right/Top/Bottom`, `itemSpacing`, `counterAxisSpacing` | skip value `0` |
| **Typography** | `TEXT` | `fontSize`, `lineHeight`, `letterSpacing` | skip `figma.mixed` nodes |

Skipping zeros for radius/spacing avoids near-universal noise (binding a `0` is rare).

### 5.5 Scope filtering
The full cached result is filtered for display:
- **Document:** all occurrences.
- **Page:** `pageId === figma.currentPage.id`.
- **Selection:** `nodeId ∈ selectedSubtreeIds` (selection + all descendants,
  precomputed at scan time).

Changing scope in the UI re-filters the cache (fast); it does not re-traverse.
(Unused results ignore scope per §3.)

### 5.6 Grouping (hardcoded)
Occurrences are grouped by **category + value**:
- Color key: normalized `#RRGGBB` + alpha (e.g. `#FFFFFF @ 100%`).
- Number key: `category:value` (e.g. `radius:8`, `itemSpacing:16`, `fontSize:14`)
  so "Corner radius 8" and "Item spacing 16" are distinct groups (the unit a user
  bulk-replaces).

Each group carries `{ category, valueKey, label, colorHex?, count, occurrences[] }`.
Groups sort by descending count. Category **filter chips** in the UI toggle group
visibility client-side (no backend round-trip).

### 5.7 Replace matching (in `analysis.ts`)
Given a target value + kind, candidates are local variables of the matching
`resolvedType` (`COLOR` for colors, `FLOAT` for numbers). For each candidate,
resolve its value across all modes (following alias chains via a passed-in id→var
map). If any mode resolves to the target value it is an **exact match** (ranked
first, annotated with collection + mode); all other same-type variables are offered
below for manual selection, grouped by collection. Numeric comparison uses a small
epsilon.

## 6. Actions (`code.ts`)

- **Navigate:** `node = await figma.getNodeByIdAsync(nodeId)`; if missing → post a
  gentle "no longer exists — rescan" message. Else, if on another page,
  `await figma.setCurrentPageAsync(page)` (page fetched by `pageId`), then
  `figma.currentPage.selection = [node]` and
  `figma.viewport.scrollAndZoomIntoView([node])`.
- **Replace:** bind the chosen variable to each occurrence in the group.
  - Colors: `newPaint = figma.variables.setBoundVariableForPaint(paint, 'color',
    variable)`, then write back a cloned `fills`/`strokes` array at the paint index
    (the color occurrence records `fills`|`strokes` + paint index).
  - Numbers: `node.setBoundVariable(field, variable)` for the recorded field
    (radius corner / strokeWeight / padding / itemSpacing / fontSize / lineHeight /
    letterSpacing). Load fonts defensively before mutating text nodes.
  - Report `{ replaced, skipped }` with reasons (locked, mixed, node gone). Replaced
    occurrences are removed from the list optimistically.
- **Delete unused:** `variable.remove()` per selected id (single or bulk), behind a
  confirm. Acts on scan data; a Rescan reconciles staleness.

Broken references are **navigate-only** in v1 — the bound variable is gone, so
replace does not apply; the user jumps to the layer and fixes it in Figma. A
one-click "detach" fix is deferred (§11).

> Exact binding signatures are verified against the installed
> `@figma/plugin-typings` during implementation.

## 7. Message protocol (`types.ts`)

**UI → code:** `scan{scope}`, `setScope{scope}` (re-filter cache; full scan if
none), `navigate{nodeId,pageId}`, `getReplaceCandidates{target}`,
`replace{groupRef, variableId}`, `deleteVariables{ids[]}`.

**code → UI:** `scanProgress{scanned}`, `scanResult{scope, summary, unused[],
broken[], hardcoded[]}`, `replaceCandidates{target, exact[], all[]}`,
`actionResult{ok, message, removedIds?}`, `error{message}`.

Category filtering for hardcoded groups is handled entirely in the UI (it already
holds all groups).

## 8. UI & visual design (locked)

Reference mockup (approved): [`assets/variable-auditor-mockup.html`](./assets/variable-auditor-mockup.html)
— built and self-contained (Geist / Geist Mono from Fontsource embedded as
`@font-face` data URIs; Lucide icons inlined).

**Aesthetic:** premium light mode — Apple clarity + Revolut boldness, committed
single-theme (no dark mode in v1).
- **Palette:** ground `#F4F4F9` (cool off-white with faint corner washes), white
  cards, soft shadows (no glass). Brand gradient `linear-gradient(135deg,#A45CFF,
  #6C5CFF 50%,#4D8AFF)` used **only** on the logo, active/primary states, and the
  Replace CTA. Semantic dots: unused violet `#7C5CFF`, broken rose `#F0396B`,
  hardcoded amber `#E08600`, ok mint `#0FB981`.
- **Type:** `Geist` (variable) for UI, `Geist Mono` (variable) for raw values —
  both embedded as `@font-face` data URIs (offline-safe). Uppercase micro-labels
  with letter-spacing.
- **Icons:** Lucide, inlined as SVG (ghost = orphaned/unused, triangle-alert =
  broken, `code` = hardcoded, unlink = broken-row glyph, crosshair/locate = jump,
  refresh = rescan, chevrons, trash, info, arrow-left-right = replace).

**Layout (~400 px panel):**
- Header: gradient logo + title/subtitle + Rescan icon button.
- iOS-style segmented **scope control** (Selection / Page / Document; default Page).
- Three glass-free **metric chips**: Unused · Broken · Hardcoded counts.
- Scrollable **results** with three collapsible cards (rounded 16px, hairline
  border, soft shadow):
  1. **Unused variables** — library caveat banner; rows with color swatch or mono
     type-glyph, name, collection, value, per-row trash; section "Delete selected".
  2. **Broken references** — rows with unlink glyph, layer name, `field` +
     `missing` tag, page, locate button (navigate-only in v1).
  3. **Hardcoded values** — category filter chips; grouped rows (`#FFFFFF · 14
     layers`) that expand to per-occurrence rows each with a locate button; a
     gradient **Replace** action per group opening the variable picker.
- Footer: last-scan scope + issue count + status.
- **Replace picker:** an in-panel view showing the target value, exact-match
  suggestions on top, then all compatible variables grouped by collection, and a
  "Replace N layers" confirm; Cancel returns.

**Layout & scrolling:** the panel is a **fixed-height flex column** — header, scope,
metrics, and footer stay pinned while **only the results region scrolls**. Result
cards must be `flex-shrink: 0` so they keep full height instead of compressing (a
flex column would otherwise shrink them and clip content, breaking the scroll). This
must hold correctly with any number of accordions open. In the real plugin the body
is `height: 100vh`; the mockup uses a bounded height to emulate the plugin window.

**Interactions:** accordions animate via `grid-template-rows: 1fr↔0fr` (verified
working); hover states on rows/buttons; entrance fade/slide; all motion disabled
under `prefers-reduced-motion`. Empty states per section ("No unused variables").

## 9. Edge cases & error handling
- No selection under Selection scope → prompt to select.
- Empty file / no variables → friendly empty state.
- `figma.mixed` properties handled per §5.4.
- Locked nodes or instance-child fields that reject edits → counted as `skipped`
  in replace results, not a crash.
- Node or variable deleted between scan and action → detected on action; message
  suggests Rescan.
- Very large documents → progress messages; scope filtering avoids re-traversal.

## 10. Testing strategy
Pure unit tests in `src/analysis.test.ts` (`node --test`, `node:test` + `node:assert`):
- color → normalized hex/key (incl. alpha) and number formatting;
- usage-index → unused-set computation (used via node binding, used via alias,
  remote excluded, truly unused included);
- hardcoded grouping — correct keys, counts, and descending-count sort;
- variable-value resolution through alias chains (incl. missing target);
- exact-match candidate ranking (exact first, correct collection/mode annotation).

`figma`-dependent glue in `code.ts` is kept thin and exercised manually in Figma
(dev-mode import) during implementation, plus a verification pass driving a real
file with seeded unused/broken/hardcoded cases.

## 11. Future work
- One-click **detach** for broken references (`setBoundVariable(field, null)` —
  clears the dead binding, keeps the raw value). Deferred from v1; broken refs are
  navigate-only for now.
- Import + bind library variables (extends Replace to non-local variables).
- Gradient-stop and effect-color coverage.
- Transitive unused chains.
- Export an audit report frame to canvas (ties into the `component-docs` pattern).
```
