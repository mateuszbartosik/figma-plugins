# Variable Auditor v1.0 (Community-ready) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the working Variable Auditor plugin to a Community-ready v1.0: replace hardcoded values with *library* variables (not just local), batch/step-through auditing, better performance, wider coverage, and launch hardening.

**Architecture:** Incremental changes to the existing self-contained plugin (`variable-auditor/`): pure logic in `analysis.ts` (unit-tested), all `figma`-API glue in `code.ts`, self-contained `ui.html`. No new build tooling. Extends the existing message protocol in `types.ts`.

**Tech Stack:** TypeScript, esbuild, `@figma/plugin-typings`, `node:test`. Existing manifest: `documentAccess: "dynamic-page"`, `networkAccess: none`, `permissions: ["teamlibrary"]`.

**Base:** current branch `variable-auditor` HEAD (`c00f7e1`). Builds on the shipped feature set (unused / broken / unlinked / hardcoded detection; scope toggle; per-check + per-property settings; scan-on-demand; delete + replace-local; navigate + last-row highlight).

## Global Constraints
- Only touch `variable-auditor/` (never `icomoon-to-icons/` or sibling plugins). Docs may be updated under `docs/`.
- Every task keeps the gates green from inside `variable-auditor/`: `npm run build`, `npx tsc --noEmit` (exit 0), `npm test`.
- Preserve the locked light-mode aesthetic (Geist, Lucide, CSS tokens, soft-shadow cards, fixed-height flex scroll). No dark mode in this milestone.
- Pure decision logic goes in `analysis.ts` with `node:test` coverage; `figma`/DOM code is verified by build + `tsc` + in-Figma/browser checks (headless can't run Figma).
- Keep `networkAccess: none`. Keep the `teamlibrary` permission.
- UI is "dumb": backend pre-formats display strings; UI renders + posts intents.

## Design decisions (please review — these shape the build)
1. **Library-variable replace = browse + import, not value-auto-match.** Auto-matching a hardcoded value against *library* variables would require importing every candidate to resolve its value (expensive, pollutes the file). So: **local** variables keep exact-value + nearest-match ranking; **library** variables are offered as a **searchable, browse-by-collection list** (attached libraries only, filtered to the matching `resolvedType`), and the chosen one is `importVariableByKeyAsync`-ed then bound. A search box filters both local and library candidates by name.
2. **Nearest-match applies to local color/number variables only** (via a pure color-distance / numeric-distance ranking). Library vars are name-search only.
3. **"Select all" is per current page.** Figma selection is single-page; a group can span pages. "Select all" selects the group's occurrences on `figma.currentPage`; if none are on the current page, it switches to the page holding the most and selects those, then `figma.notify`s the cross-page counts.
4. **Step-through** walks the flat, in-display-order list of navigable occurrences (broken + unlinked + hardcoded) with next/prev, reusing the existing `markCurrent` highlight and `navigate`.
5. **Gradient-stop & effect (shadow) colors:** detect + navigate in v1; **replace stays solid-paint-only** (binding gradient stops/effects is deferred — noted in UI).
6. **Performance:** actions update the cached scan in place (no full re-traversal); `teamLibrary` result cached per session; scan progress surfaced in the footer.
7. **Branding/listing assets** (icon, cover art, name/tagline, description, tags, published plugin `id`) are handled in a separate track with the user — **not** in this code plan. Task 11 covers only the in-repo licensing/attribution + README + the manifest-id placeholder note.

## File structure (touched)
```
variable-auditor/
  manifest.json      # (Task 11) id placeholder note only; permissions unchanged
  src/
    types.ts         # new message + data shapes (library candidates, select-all, detach, step-through, progress)
    analysis.ts      # + colorDistance/nearestByValue ranking; label helpers (pure, tested)
    analysis.test.ts # + tests for the new pure logic
    code.ts          # library-candidate fetch/import/bind; detach; select-all; gradient/effect color scan; incremental cache updates; teamLibrary cache; notify
    ui.html          # replace-picker redesign (search + library browse + near matches); step-through bar; select-all buttons; detach button; progress in footer; label fix
  README (repo root) # (Task 11) usage + attribution
  LICENSE, THIRD-PARTY-NOTICES.md (repo root)  # (Task 11)
docs/superpowers/specs/2026-07-09-variable-auditor-design.md  # keep in sync
```

---

## Phase A — Performance & quick fixes

### Task 1: Incremental updates, teamLibrary cache, progress in footer
**Files:** Modify `variable-auditor/src/code.ts`, `variable-auditor/src/ui.html`.

**Interfaces:**
- Produces: after `delete-variables` / `replace`, the backend posts a fresh `scan-result` computed from the **cached** `lastScan` (mutated in place) — NOT a re-traversal. Adds `{ type: 'scan-progress', scanned, total? }` surfacing.

- [ ] **Step 1 — teamLibrary session cache:** In `code.ts`, add module `let attachedKeysCache: Set<string> | null = null;`. In `fullScan`, compute attached keys only if `attachedKeysCache === null` (else reuse); expose a way to reset it on an explicit user rescan (the header Rescan / `scan` message sets `attachedKeysCache = null` before scanning so an explicit rescan re-reads libraries; `set-scope` / action-driven updates reuse the cache).
- [ ] **Step 2 — incremental delete:** In the `delete-variables` handler, after removing variables, mutate `lastScan.unused` to drop the removed ids (instead of the UI triggering a full rescan). Post `{ type:'scan-result', result: filterByScope(lastScope) }` directly.
- [ ] **Step 3 — incremental replace:** In the `replace` handler, after binding, keep the existing optimistic removal of the replaced `valueKey` occurrences from `lastScan.occurrencesAll`; also, if the bound variable id is present in `lastScan.unused`, drop it (it's now used). Post the updated `scan-result` from cache (no re-traversal).
- [ ] **Step 4 — UI stops force-rescanning on action:** In `ui.html` `window.onmessage`, the `action-result` handler should NOT call `rescan()` anymore (the backend now posts an updated `scan-result`). Keep the toast. Verify delete/replace still visually update via the pushed `scan-result`.
- [ ] **Step 5 — progress in footer:** In `ui.html`, handle `scan-progress` by setting `#foot-status` to `Scanning… <scanned>` (busy). On `scan-result`, restore the normal footer text. Confirm the spinner + count show on a large scan.
- [ ] **Step 6 — gates + commit:** `npm run build`, `npx tsc --noEmit`, `npm test` (unchanged count). Manually confirm in browser (simulated messages) that delete/replace update the list with no extra `scan` message posted. Commit: `perf(variable-auditor): update results in place after actions; cache teamLibrary; show scan progress`.

**Verification note (headless):** browser-simulate a `scan-result`, then post `action-result` and assert the UI no longer posts a `scan` message; the controller drives this.

### Task 2: Correct color-group label (fills vs strokes)
**Files:** Modify `variable-auditor/src/ui.html`.

- [ ] **Step 1:** In `renderHardcoded`, the color group meta currently reads `'Fill color · N layers'` regardless of whether occurrences are fills or strokes. Change it to a neutral `'Color · N layers'` (color groups merge fills + strokes by value, so "Fill color" is inaccurate).
- [ ] **Step 2 — gates + commit:** build + tsc + test. Commit: `fix(variable-auditor): label color groups generically (fills+strokes)`.

---

## Phase B — Coverage gaps

### Task 3: Detect gradient-stop and effect (shadow) colors
**Files:** Modify `variable-auditor/src/code.ts` (+ `types.ts` if occurrence needs new sub-fields).

**Interfaces:**
- Produces: hardcoded color occurrences for `GRADIENT_*` paint stops and for shadow effects. These are **navigate-only** (not replaceable in v1). Encode enough on the `Occurrence` to navigate (nodeId/pageId) and to know it's non-replaceable — add an optional `replaceable?: boolean` (default true; false for gradient-stop/effect colors).

- [ ] **Step 1 — gradient stops:** In `pushColorOccurrences` (or a sibling), when a paint is `GRADIENT_LINEAR/RADIAL/ANGULAR/DIAMOND`, iterate `paint.gradientStops`; for each stop with no bound variable, push a color occurrence (`colorHex` from stop.color, `replaceable: false`, field e.g. `fills[gradientStop]`). Keep solid handling unchanged.
- [ ] **Step 2 — effect colors:** For nodes with `effects`, iterate `DROP_SHADOW`/`INNER_SHADOW` effects; if the effect's color isn't bound (`effect.boundVariables?.color` absent), push a color occurrence (`colorHex` from effect.color, `replaceable: false`, field `effects`). Gate under `props.color`.
- [ ] **Step 3 — UI:** In the replace flow, when a group/occurrence is `replaceable: false`, hide/disable the "Replace" button for that group (show a small "shadow/gradient" hint). Navigation still works.
- [ ] **Step 4 — gates + commit:** build + tsc + test; browser-verify a simulated gradient/effect color group renders and its Replace is suppressed. Commit: `feat(variable-auditor): scan gradient-stop and shadow effect colors (navigate-only)`.

### Task 4: Detach action for broken references
**Files:** Modify `variable-auditor/src/code.ts`, `variable-auditor/src/ui.html`, `types.ts`.

**Interfaces:**
- Consumes (UI→plugin): `{ type: 'detach'; nodeId: string; field: string }`.
- Produces: clears the dead binding via `node.setBoundVariable(field, null)`, then updates the cached broken list (drops that ref) and posts the refreshed `scan-result`.

- [ ] **Step 1 — types:** add the `detach` message to `UIToPlugin`.
- [ ] **Step 2 — backend:** handle `detach`: `getNodeByIdAsync`, `node.setBoundVariable(field, null)` in try/catch; on success remove the matching ref from `lastScan.brokenAll`; post updated `scan-result`; `figma.notify('Detached binding')`.
- [ ] **Step 3 — UI:** on broken-reference rows add a small "Detach" `.mini` (unlink icon variant) next to Locate → `post({ type:'detach', nodeId, field })`.
- [ ] **Step 4 — gates + commit:** build + tsc + test; browser-verify the detach button posts the right message. Commit: `feat(variable-auditor): detach action for broken references`.

---

## Phase C — Replace with library variables

### Task 5: Local nearest-match ranking (pure)
**Files:** Modify `variable-auditor/src/analysis.ts`, `variable-auditor/src/analysis.test.ts`.

**Interfaces:**
- Produces:
  - `colorDistance(a: RGBA, b: RGBA): number` — Euclidean distance in RGB (0..~1.75), alpha included.
  - Extend `rankCandidates` (or add `rankByNearness`) so that when there is no exact match, candidates are additionally sorted by nearness (color distance for COLOR targets, `|Δ|` for numbers) and each carries a `near?: boolean` flag for the closest few (e.g. top 3 within a threshold).

- [ ] **Step 1 — failing tests:** add tests: `colorDistance` (identical → 0; black vs white → max; near colors ordered), and that `rankCandidates` marks the closest non-exact color/number candidate(s) with `near: true` and orders them by distance.
- [ ] **Step 2 — run RED, implement, run GREEN** (per TDD): implement `colorDistance` + the nearness ranking; keep existing exact-match behavior and tests passing.
- [ ] **Step 3 — commit:** `feat(variable-auditor): nearest-match ranking for local variable suggestions`.

### Task 6: Backend — library variable candidates + import + bind
**Files:** Modify `variable-auditor/src/code.ts`, `variable-auditor/src/types.ts`.

**Interfaces:**
- Consumes (UI→plugin): `{ type:'get-candidates'; category; valueKey }` (existing) — response extended; and `{ type:'replace'; category; valueKey; variableId?; libraryKey? }` — either a local `variableId` or a library `libraryKey` (import first).
- Produces (plugin→UI): `candidates` message extended to `{ exact: CandidateVariable[]; near: CandidateVariable[]; local: CandidateVariable[]; library: LibraryCandidate[] }` where `LibraryCandidate = { key, name, collectionName, resolvedType, valuePreview? }`.

- [ ] **Step 1 — types:** add `LibraryCandidate`; extend the `candidates` message and the `replace` message per above.
- [ ] **Step 2 — library candidate fetch:** in `get-candidates`, after building local candidates (exact/near/all), also gather library candidates: for each attached collection from `getAvailableLibraryVariableCollectionsAsync()`, `getVariablesInLibraryCollectionAsync(key)` filtered to the matching `resolvedType`; map to `LibraryCandidate` (`key`, `name`, `collectionName`, `resolvedType`). Wrap in try/catch (teamLibrary unavailable → empty library list). Cap/paginate defensively (e.g. first ~500) and rely on UI search.
- [ ] **Step 3 — replace via library key:** in `replace`, if `libraryKey` is provided, `const v = await figma.variables.importVariableByKeyAsync(libraryKey)` then bind exactly like a local variable (`setBoundVariableForPaint` for color, `setBoundVariable` for numbers; load fonts for text). If `variableId` is provided, bind the local var (existing path). Update the cache + post `scan-result`; `figma.notify` the replaced/skipped counts.
- [ ] **Step 4 — gates + commit:** build + tsc + test. Commit: `feat(variable-auditor): offer & bind library variables in replace (import-on-pick)`.

### Task 7: Replace picker UI — search + sections + library browse
**Files:** Modify `variable-auditor/src/ui.html`.

- [ ] **Step 1 — picker layout:** redesign the picker sheet to show, for the target value: a **search input** (filters by name, live); an **Exact matches** section (local, from `candidates.exact`); a **Closest** section (local `near`); an **All local** section; and a **Library** section grouped by collection (`candidates.library`), each row showing name + collection. Preserve the existing overlay/sheet styling and the target-value header.
- [ ] **Step 2 — actions:** clicking a local candidate posts `{ type:'replace', category, valueKey, variableId }`; clicking a library candidate posts `{ type:'replace', category, valueKey, libraryKey }`. Close the picker on pick. Search filters all sections client-side by name substring.
- [ ] **Step 3 — empty/edge:** if no local matches and no library candidates (or teamLibrary unavailable), show "No matching variables — browse or check enabled libraries." Suppress Replace entirely for `replaceable:false` groups (from Task 3).
- [ ] **Step 4 — gates + commit:** build + tsc; browser-verify with a simulated `candidates` payload (exact/near/local/library) that sections render, search filters, and the correct `replace` message (variableId vs libraryKey) is posted. Commit: `feat(variable-auditor): replace picker with search, nearest matches, and library browse`.

---

## Phase D — Batch + step-through UX

### Task 8: Select-all-on-canvas per group
**Files:** Modify `variable-auditor/src/code.ts`, `variable-auditor/src/ui.html`, `types.ts`.

**Interfaces:**
- Consumes: `{ type:'select-nodes'; nodeIds: string[] }`.
- Produces: selects the subset of `nodeIds` on the current page; if none are on the current page, `setCurrentPageAsync` to the page containing the most, then select those; `figma.notify('Selected X of Y (rest on other pages)')`; `scrollAndZoomIntoView` the selection.

- [ ] **Step 1 — types + backend:** add `select-nodes`; implement per the interface using `getNodeByIdAsync` for each id, grouping by page, choosing the current page (or the most-populated page if none current), setting `figma.currentPage.selection`, notify, zoom.
- [ ] **Step 2 — UI:** add a "Select all" (N) action to each hardcoded group head, each unlinked group head, and the broken section header → `post({ type:'select-nodes', nodeIds:[...occurrence nodeIds in that group...] })`.
- [ ] **Step 3 — gates + commit:** build + tsc; browser-verify the correct nodeIds are posted. Commit: `feat(variable-auditor): select all layers in a group on canvas`.

### Task 9: Step-through (next/prev) over occurrences
**Files:** Modify `variable-auditor/src/ui.html`.

- [ ] **Step 1 — model:** after a `scan-result` renders, build an ordered array of navigable occurrence rows (broken rows, then unlinked occurrence rows, then hardcoded occurrence rows — in DOM order). Track a current index.
- [ ] **Step 2 — controls:** add a compact prev/next control (e.g., in the footer, shown only when there are ≥1 navigable occurrences) that advances the index, calls the same navigate (`post navigate`) + `markCurrent` + scrolls that row into view within `.results`. Clicking a row's Locate also updates the index so prev/next continues from there.
- [ ] **Step 3 — gates + commit:** build + tsc; browser-verify next/prev cycles through occurrences, highlighting + posting navigate for each, wrapping or stopping at ends (stop at ends). Commit: `feat(variable-auditor): step through occurrences with next/prev`.

---

## Phase E — Launch hardening

### Task 10: Canvas notifications + error/empty hardening
**Files:** Modify `variable-auditor/src/code.ts`, `variable-auditor/src/ui.html`.

- [ ] **Step 1 — notify:** `figma.notify` on delete ("Deleted N variables"), replace ("Replaced N, skipped M"), select-nodes, detach, and navigate-missing ("Layer no longer exists"). Keep the in-UI toasts too.
- [ ] **Step 2 — empty/edge states:** verify graceful handling for: file with zero variables (unused/broken empty states already exist — confirm no crash), `teamLibrary` unavailable (unlinked empty + a subtle note "library status unavailable"), a scan that finds nothing in any category (a friendly "All clear" state). Add a one-line "library status unavailable" note in the unlinked section when the teamLibrary fetch failed (pass a flag in `scan-result`, e.g. `teamLibraryOk: boolean`).
- [ ] **Step 3 — types:** add `teamLibraryOk?: boolean` to `ScanResult`; set it in `fullScan`.
- [ ] **Step 4 — gates + commit:** build + tsc + test; browser-verify the notes/states. Commit: `feat(variable-auditor): canvas notifications and hardened empty/error states`.

### Task 11: Licensing, attribution, README, manifest id
**Files:** Create `LICENSE` (repo root, if absent), `THIRD-PARTY-NOTICES.md` (repo root); modify `README.md`, `variable-auditor/manifest.json`.

- [ ] **Step 1 — license:** if the repo has no root `LICENSE`, add one (MIT, matching the author). If one exists, leave it.
- [ ] **Step 2 — attribution:** create `THIRD-PARTY-NOTICES.md` crediting **Geist** (SIL OFL 1.1, Vercel) and **Lucide** (ISC) used in `variable-auditor/src/ui.html`, with license text/links.
- [ ] **Step 3 — README:** update the `variable-auditor` section to document all four checks + the settings/scope/replace/select/step-through features, and note the third-party assets.
- [ ] **Step 4 — manifest id:** add a comment/README note that `id` (`variable-auditor-dev`) is a dev placeholder; Figma assigns the real id on first publish. (Do NOT invent an id.)
- [ ] **Step 5 — commit:** `docs(variable-auditor): license, third-party attribution, README for v1`.

---

## Out of scope for this plan (separate track)
Community **listing assets** — 128px plugin icon, cover art, display name/tagline, description copy, tags — and clicking Publish. These need design + the user's input; handled interactively after the code lands (icon/cover can be generated then).

## Self-review
- **Coverage of the 4 chosen workstreams:** library-variable replace (Tasks 5–7), batch + step-through (Tasks 8–9), performance (Task 1), launch prep + gaps (Tasks 2, 3, 4, 10, 11). ✓
- **Placeholder scan:** no "TBD/handle errors" hand-waving; each task states concrete behavior. Figma-glue tasks specify the exact API calls; pure-logic tasks (Task 5) use TDD with real assertions.
- **Type consistency:** new shapes (`LibraryCandidate`, `near`/`library` on candidates, `replaceable?` on Occurrence, `teamLibraryOk?` on ScanResult, `detach`/`select-nodes` messages) are defined in the task that introduces them (types.ts) and consumed by later tasks. `replace` accepts `variableId | libraryKey`.
- **Sequencing:** Phase A/B are low-risk and independent; Phase C depends on Task 5 (ranking) before Task 6/7; Phase D independent; Phase E last. Each task is independently reviewable and shippable.
