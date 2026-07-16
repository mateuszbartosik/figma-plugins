# Component Docs — Stateful Updatable Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `component-docs` Figma plugin remember which doc frame documents which component, so re-running updates the existing doc in place (preserving position and the user's description) instead of creating a duplicate.

**Architecture:** State lives as `setPluginData` links on both the source component (`docId`) and the doc frame (`sourceId`, cached `description`, cached `options`). Selection detection resolves the link and reports a `generate | update` mode to the UI. `generateDocs` splits into build + place/link: generate creates and positions a new frame; update rebuilds content into the **same** frame node, preserving its position and carrying the user's description forward.

**Tech Stack:** TypeScript (strict), Figma Plugin API (`@figma/plugin-typings`), esbuild bundle, plain-HTML UI with `postMessage`.

## Global Constraints

- Language/build: TypeScript `strict: true`; bundle with `npm run build` (esbuild → `dist/code.js`). Source in `component-docs/src/`.
- `networkAccess: none` (manifest) — no network calls; all state is local `setPluginData`.
- No unit-test harness exists and the `figma` global is unavailable headlessly. **Per-task verification = `npx tsc --noEmit` + `npm run build` both succeeding.** Behavioral verification = manual Figma smoke test (Task 6).
- All commands run from `D:\Work\figma-components\component-docs` (the plugin dir) unless noted.
- Preserve existing layout/visual code in `code.ts` unchanged except where a task specifies.
- The description placeholder string is exactly `Add a description for this component…` (note the ellipsis character `…`, U+2026) and MUST match the existing value in `code.ts`.

---

## File Structure

- `component-docs/src/code.ts` (modify) — add state layer (plugin-data link helpers), extend selection detection, split generate/update, description preservation, reveal handler.
- `component-docs/src/ui.html` (modify) — update-mode rendering (button label, note, reveal link), options restore, extended message contract, done-view wording.

No new files: the plugin is intentionally two-file, and the added logic belongs with the code it extends.

---

## Task 1: State layer — plugin-data link helpers

Add the persistence primitives: constants, the `DocOptions` type, linking, safe node resolution, and meta read/write. These are pure additions used by every later task.

**Files:**
- Modify: `component-docs/src/code.ts` (add a new section after the `PropInfo` interface, around line 10)

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces:
  - `type DocOptions = { includeProps: boolean; includeVariants: boolean; includeNotes: boolean }`
  - `const DESC_PLACEHOLDER = 'Add a description for this component…'`
  - `function linkNodes(source: BaseNode, doc: BaseNode): void`
  - `async function resolveLiveNode(id: string): Promise<BaseNode | null>` — resolves an id to a node only if it still exists and is not removed; null otherwise.
  - `function saveDocMeta(doc: BaseNode, opts: DocOptions, description: string): void`
  - `function readDocOptions(doc: BaseNode): DocOptions | null`
  - `function readDocSourceId(doc: BaseNode): string` / `function readSourceDocId(source: BaseNode): string`
  - `function isDocFrame(node: BaseNode): boolean`

- [ ] **Step 1: Add the state section to `code.ts`**

Insert after the `PropInfo` interface block (after line 10), before `// ─── Fonts ───`:

```ts
// ─── State (plugin-data links) ──────────────────────────────────────────────

type DocOptions = { includeProps: boolean; includeVariants: boolean; includeNotes: boolean };

const DESC_PLACEHOLDER = 'Add a description for this component…';

// Keys are private to this plugin (setPluginData, not shared).
const KEY_DOC = 'docId';       // stored on the SOURCE component/set
const KEY_SOURCE = 'sourceId'; // stored on the DOC frame
const KEY_OPTS = 'options';    // stored on the DOC frame (JSON DocOptions)
const KEY_DESC = 'description'; // stored on the DOC frame (cached text)

/** Write the bidirectional link between a source component and its doc frame. */
function linkNodes(source: BaseNode, doc: BaseNode): void {
  source.setPluginData(KEY_DOC, doc.id);
  doc.setPluginData(KEY_SOURCE, source.id);
}

/** Resolve an id to a node only if it still exists and isn't removed. */
async function resolveLiveNode(id: string): Promise<BaseNode | null> {
  if (!id) return null;
  let node: BaseNode | null = null;
  try {
    node = await figma.getNodeByIdAsync(id);
  } catch {
    return null;
  }
  if (!node) return null;
  if (node.removed) return null;
  return node;
}

/** Cache the options + description used to build a doc. */
function saveDocMeta(doc: BaseNode, opts: DocOptions, description: string): void {
  doc.setPluginData(KEY_OPTS, JSON.stringify(opts));
  doc.setPluginData(KEY_DESC, description);
}

/** Read the cached options from a doc frame, or null if absent/corrupt. */
function readDocOptions(doc: BaseNode): DocOptions | null {
  const raw = doc.getPluginData(KEY_OPTS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DocOptions;
  } catch {
    return null;
  }
}

function readDocSourceId(doc: BaseNode): string {
  return doc.getPluginData(KEY_SOURCE);
}

function readSourceDocId(source: BaseNode): string {
  return source.getPluginData(KEY_DOC);
}

/** True if this node was generated by us (carries a sourceId link). */
function isDocFrame(node: BaseNode): boolean {
  return node.getPluginData(KEY_SOURCE) !== '';
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Unused-symbol warnings are not errors under this config; `noUnusedLocals` is not set.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: writes `dist/code.js`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/code.ts
git commit -m "feat(component-docs): add plugin-data state layer for doc links"
```

---

## Task 2: Selection detection with mode resolution

Extend `getSelectionInfo` so it resolves the link and reports `generate | update`, and so selecting a doc frame resolves back to its source. This drives the UI.

**Files:**
- Modify: `component-docs/src/code.ts` — replace `getSelectionInfo` (lines 430-444).

**Interfaces:**
- Consumes: `resolveLiveNode`, `readSourceDocId`, `readDocSourceId`, `readDocOptions`, `isDocFrame`, `DocOptions` (Task 1).
- Produces: `getSelectionInfo` now returns
  ```ts
  {
    id: string;              // SOURCE component/set id (what 'generate' acts on)
    name: string;
    type: 'COMPONENT' | 'COMPONENT_SET';
    propCount: number;
    variantCount: number;
    mode: 'generate' | 'update';
    docId: string | null;    // live doc id when mode === 'update'
    options: DocOptions | null; // cached options when mode === 'update'
  } | null
  ```
  The UI (Task 5) consumes `mode`, `docId`, `options`.

- [ ] **Step 1: Replace `getSelectionInfo`**

Replace the whole function (lines 430-444) with:

```ts
async function getSelectionInfo() {
  const sel = figma.currentPage.selection;
  if (!sel.length) return null;
  const selected = sel[0];

  // Resolve to the SOURCE component/set. Selecting a doc frame resolves back
  // to its source; selecting a component uses it directly.
  let source: ComponentNode | ComponentSetNode | null = null;
  let docNode: BaseNode | null = null;

  if (selected.type === 'COMPONENT' || selected.type === 'COMPONENT_SET') {
    source = selected as ComponentNode | ComponentSetNode;
    const docId = readSourceDocId(source);
    docNode = await resolveLiveNode(docId);
  } else if (isDocFrame(selected)) {
    const resolvedSource = await resolveLiveNode(readDocSourceId(selected));
    if (
      resolvedSource &&
      (resolvedSource.type === 'COMPONENT' || resolvedSource.type === 'COMPONENT_SET')
    ) {
      source = resolvedSource as ComponentNode | ComponentSetNode;
      docNode = selected;
    }
  }

  if (!source) return null;

  const hasLiveDoc = docNode !== null;
  const defs = source.componentPropertyDefinitions ?? {};

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    propCount: Object.keys(defs).length,
    variantCount: source.type === 'COMPONENT_SET' ? (source as ComponentSetNode).children.length : 0,
    mode: hasLiveDoc ? ('update' as const) : ('generate' as const),
    docId: hasLiveDoc ? docNode!.id : null,
    options: hasLiveDoc ? readDocOptions(docNode!) : null,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/code.ts
git commit -m "feat(component-docs): resolve doc links in selection detection"
```

---

## Task 3: Split generate/update, preserve frame identity

Refactor `generateDocs` so the built content can be placed into a **new** frame (generate) or swapped into the **existing** frame (update), preserving the existing frame's position. Write links and cache options on both paths.

**Files:**
- Modify: `component-docs/src/code.ts` — `generateDocs` (lines 310-426) and the message handler's `done` payload (lines 454-460).

**Interfaces:**
- Consumes: `linkNodes`, `resolveLiveNode`, `readSourceDocId`, `saveDocMeta`, `readSourceDocId`, `DocOptions`, `DESC_PLACEHOLDER` (Tasks 1-2).
- Produces: `generateDocs(nodeId, options)` returns `{ propCount: number; variantCount: number; mode: 'generate' | 'update' }`.
- New helper: `function transferChildren(from: FrameNode, to: FrameNode): void`.

- [ ] **Step 1: Add the `transferChildren` helper**

Insert just above `generateDocs` (before line 310, after `buildVariantGrid`):

```ts
/** Move all children from `from` into `to`, replacing `to`'s existing children. */
function transferChildren(from: FrameNode, to: FrameNode): void {
  for (const child of [...to.children]) child.remove();
  for (const child of [...from.children]) to.appendChild(child);
}
```

- [ ] **Step 2: Rework the tail of `generateDocs` (placement + linking)**

The build code (lines 310-414 that assemble the `doc` frame and its sections) stays as-is. **Replace** the final placement block (lines 416-425):

```ts
  // Place on canvas
  const bounds = comp.absoluteBoundingBox!;
  doc.x = bounds.x + bounds.width + 80;
  doc.y = bounds.y;

  figma.currentPage.appendChild(doc);
  figma.currentPage.selection = [doc];
  figma.viewport.scrollAndZoomIntoView([doc]);

  return { propCount: props.length, variantCount };
```

with:

```ts
  // ── Step 3: place — update existing frame in place, or create a new one ───
  const existingDoc = await resolveLiveNode(readSourceDocId(comp));
  const isUpdate = existingDoc !== null && existingDoc.type === 'FRAME';

  let finalDoc: FrameNode;
  if (isUpdate) {
    const target = existingDoc as FrameNode;
    transferChildren(doc, target); // move freshly built children into the kept frame
    doc.remove();                  // discard the empty shell
    target.name = doc.name;        // refresh name in case the component was renamed
    finalDoc = target;             // position preserved — do NOT reposition
  } else {
    const bounds = comp.absoluteBoundingBox!;
    doc.x = bounds.x + bounds.width + 80;
    doc.y = bounds.y;
    figma.currentPage.appendChild(doc);
    finalDoc = doc;
  }

  linkNodes(comp, finalDoc);
  saveDocMeta(finalDoc, options, descriptionText);

  figma.currentPage.selection = [finalDoc];
  figma.viewport.scrollAndZoomIntoView([finalDoc]);

  return { propCount: props.length, variantCount, mode: isUpdate ? 'update' : 'generate' };
```

Note: `descriptionText` is introduced in Task 4. Until Task 4 lands, define it as a stub at the top of `generateDocs` so this task compiles on its own — add this line right after `await loadFonts();` (line 320):

```ts
  let descriptionText = DESC_PLACEHOLDER; // replaced with preservation logic in Task 4
```

- [ ] **Step 3: Update the `done` message payload**

In the message handler (lines 454-460), the result already spreads via `{ type: 'done', ...result }`, so `mode` flows through automatically. No change needed beyond confirming `result` includes `mode` (it now does).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/code.ts
git commit -m "feat(component-docs): update docs in place, preserving frame identity"
```

---

## Task 4: Description preservation

Carry the user's written description forward on update. Read the current description text node from the existing doc; if it differs from the placeholder, reuse it. Render it in normal color when present.

**Files:**
- Modify: `component-docs/src/code.ts` — the description-section build block (lines 377-384) and the `descriptionText` stub from Task 3.

**Interfaces:**
- Consumes: `resolveLiveNode`, `readSourceDocId`, `DESC_PLACEHOLDER` (Tasks 1, 3).
- Produces: `async function readExistingDescription(source: BaseNode): Promise<string>` — returns the user's description text, or `DESC_PLACEHOLDER` if none/untouched.

- [ ] **Step 1: Add `readExistingDescription`**

Insert above `generateDocs`:

```ts
/**
 * Read the user-authored description from the source's existing doc, if any.
 * Returns DESC_PLACEHOLDER when there is no live doc or it was never edited.
 */
async function readExistingDescription(source: BaseNode): Promise<string> {
  const doc = await resolveLiveNode(readSourceDocId(source));
  if (!doc || doc.type !== 'FRAME') return DESC_PLACEHOLDER;
  const section = (doc as FrameNode).findOne(
    (n) => n.type === 'FRAME' && n.name === 'description-section',
  ) as FrameNode | null;
  if (!section) return DESC_PLACEHOLDER;
  const valueNode = section.children.find((n) => n.type === 'TEXT') as TextNode | undefined;
  if (!valueNode) return DESC_PLACEHOLDER;
  const text = valueNode.characters.trim();
  return text && text !== DESC_PLACEHOLDER ? valueNode.characters : DESC_PLACEHOLDER;
}
```

Note: `description-section` currently has its label (`DESCRIPTION`) as the first TEXT and the value as the second. `children.find(TEXT)` would return the label. Fix by selecting the value node explicitly — the value is the LAST text node in the section. Use:

```ts
  const texts = section.children.filter((n) => n.type === 'TEXT') as TextNode[];
  const valueNode = texts[texts.length - 1];
  if (!valueNode) return DESC_PLACEHOLDER;
```

(Replace the single-`find` line above with this filter-and-last approach.)

- [ ] **Step 2: Replace the Task 3 stub with a real read**

In `generateDocs`, replace:

```ts
  let descriptionText = DESC_PLACEHOLDER; // replaced with preservation logic in Task 4
```

with:

```ts
  const descriptionText = await readExistingDescription(comp);
```

- [ ] **Step 3: Render the preserved description**

Replace the description block (lines 377-384):

```ts
  // Description
  if (options.includeNotes) {
    const notesSection = frame('description-section');
    vStack(notesSection, docW, 8, PAD_H, 20);
    notesSection.appendChild(txt('DESCRIPTION', 10, 'Bold', '#AAAAAA'));
    notesSection.appendChild(txt('Add a description for this component…', 13, 'Regular', '#CCCCCC'));
    doc.appendChild(notesSection);
    doc.appendChild(hr(docW));
  }
```

with:

```ts
  // Description
  if (options.includeNotes) {
    const hasDesc = descriptionText !== DESC_PLACEHOLDER;
    const notesSection = frame('description-section');
    vStack(notesSection, docW, 8, PAD_H, 20);
    notesSection.appendChild(txt('DESCRIPTION', 10, 'Bold', '#AAAAAA'));
    notesSection.appendChild(
      txt(descriptionText, 13, 'Regular', hasDesc ? '#1A1A1A' : '#CCCCCC'),
    );
    doc.appendChild(notesSection);
    doc.appendChild(hr(docW));
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/code.ts
git commit -m "feat(component-docs): preserve user description across updates"
```

---

## Task 5: UI — update mode, options restore, reveal

Reflect the mode in the panel: button label, a "linked doc" note, a Reveal link, and restore the checkboxes to the doc's cached options. Add the `reveal` message and its handler.

**Files:**
- Modify: `component-docs/src/ui.html` — comp-card / options / footer markup and the `<script>` message handling.
- Modify: `component-docs/src/code.ts` — handle the new `reveal` message in `figma.ui.onmessage` (after the `generate` block, around line 466).

**Interfaces:**
- Consumes: `context` message now carries `mode`, `docId`, `options` (Task 2); `done` message carries `mode` (Task 3).
- Produces: UI emits `{ type: 'reveal', docId: string }`; `code.ts` resolves and zooms to it.

- [ ] **Step 1: Add a note + reveal link to the main view markup**

In `ui.html`, inside `#view-main`, add a status line under the comp-card (after line 223, before `<div class="options">`):

```html
  <div class="link-note" id="link-note" style="display:none; margin:10px 16px 0; padding:8px 12px; background:var(--accent-light); border-radius:var(--radius-sm); font-size:11px; color:var(--accent); display:flex; align-items:center; justify-content:space-between; gap:8px;">
    <span>Linked doc found — will update in place</span>
    <a href="#" id="reveal-link" style="color:var(--accent); font-weight:600; text-decoration:underline; white-space:nowrap;">Reveal</a>
  </div>
```

(The inline `display:none` is toggled to `flex` in script; when shown, script sets `display:flex`.)

- [ ] **Step 2: Extend the script state + context handler**

In the `<script>`, add to the top state vars (after line 274 `let isSet = false;`):

```js
  let currentMode = 'generate';
  let currentDocId = null;
```

Replace the `context` handler block (lines 317-346) so it sets mode, restores options, and toggles the note:

```js
    if (msg.type === 'context') {
      const { info } = msg;
      currentNodeId = info.id;
      isSet = info.type === 'COMPONENT_SET';
      currentMode = info.mode;
      currentDocId = info.docId;

      document.getElementById('comp-name').textContent = info.name;
      document.getElementById('comp-badge').textContent = isSet ? 'Component Set' : 'Component';

      const parts = [];
      if (info.propCount > 0) parts.push(`${info.propCount} ${info.propCount === 1 ? 'property' : 'properties'}`);
      if (isSet && info.variantCount > 0) parts.push(`${info.variantCount} variants`);
      document.getElementById('comp-meta').textContent = parts.length ? parts.join('  ·  ') : 'No properties';

      const variantsItem  = document.getElementById('opt-variants-item');
      const variantsCheck = document.getElementById('opt-variants');
      if (!isSet) {
        variantsItem.classList.add('disabled');
        variantsCheck.checked = false;
      } else {
        variantsItem.classList.remove('disabled');
        variantsCheck.checked = true;
      }

      // Restore checkboxes to the doc's last-used options (update mode only)
      if (currentMode === 'update' && info.options) {
        document.getElementById('opt-props').checked = !!info.options.includeProps;
        document.getElementById('opt-notes').checked = !!info.options.includeNotes;
        if (isSet) variantsCheck.checked = !!info.options.includeVariants;
      }

      // Mode-dependent affordances
      const note = document.getElementById('link-note');
      note.style.display = currentMode === 'update' ? 'flex' : 'none';

      const btn = document.getElementById('btn-generate');
      btn.disabled = false;
      btn.textContent = currentMode === 'update' ? 'Update Documentation' : 'Generate Documentation';

      show('view-main');
      return;
    }
```

- [ ] **Step 3: Wire the Reveal link and update the generate handler's busy label**

Add a listener (near the other `addEventListener` calls, after line 301):

```js
  document.getElementById('reveal-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentDocId) {
      parent.postMessage({ pluginMessage: { type: 'reveal', docId: currentDocId } }, 'https://www.figma.com');
    }
  });
```

In the generate click handler (lines 285-301), replace the busy label line `btn.textContent = 'Generating…';` with:

```js
    btn.textContent = currentMode === 'update' ? 'Updating…' : 'Generating…';
```

And in the `error` handler (lines 358-363), replace the reset label so it respects mode:

```js
    if (msg.type === 'error') {
      const btn = document.getElementById('btn-generate');
      btn.disabled = false;
      btn.textContent = currentMode === 'update' ? 'Update Documentation' : 'Generate Documentation';
      return;
    }
```

- [ ] **Step 4: Mode-aware success wording**

Replace the `done` handler (lines 348-356):

```js
    if (msg.type === 'done') {
      const parts = [];
      if (msg.propCount > 0) parts.push(`${msg.propCount} ${msg.propCount === 1 ? 'property' : 'properties'}`);
      if (msg.variantCount > 0) parts.push(`${msg.variantCount} variants`);
      const verb = msg.mode === 'update' ? 'Updated' : 'Documented';
      const tail = msg.mode === 'update' ? 'the frame was updated in place.' : 'the frame is ready on your canvas.';
      document.getElementById('success-desc').textContent =
        `${verb} ${parts.join(' and ')} — ${tail}`;
      document.querySelector('#view-success h2').textContent =
        msg.mode === 'update' ? 'Documentation updated!' : 'Documentation generated!';
      show('view-success');
      return;
    }
```

- [ ] **Step 5: Handle `reveal` in `code.ts`**

In `figma.ui.onmessage`, add after the `generate` block (after line 466, before the `close` block):

```ts
  if (msg.type === 'reveal') {
    const doc = await resolveLiveNode(msg.docId as string);
    if (doc && doc.type === 'FRAME') {
      figma.currentPage.selection = [doc as FrameNode];
      figma.viewport.scrollAndZoomIntoView([doc as FrameNode]);
    }
  }
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/code.ts src/ui.html
git commit -m "feat(component-docs): update-mode UI, options restore, reveal link"
```

---

## Task 6: Manual smoke test in Figma

No automated behavioral test is possible (no headless `figma`). Verify end-to-end in Figma, then commit the built output.

**Files:**
- Verify only; commit `dist/code.js` if not already committed.

- [ ] **Step 1: Load the built plugin in Figma**

Ensure `npm run build` has produced current `dist/code.js`. In the Figma desktop app: Plugins → Development → import `component-docs/manifest.json` (if not already imported), then run **Component Docs**.

- [ ] **Step 2: Generate**

Select a Component Set → panel shows **Generate Documentation** → click → a doc frame appears 80px to the right.
Expected: doc renders as before (header, properties, variants).

- [ ] **Step 3: Edit + move + change source**

Type a real description into the doc's DESCRIPTION field. Drag the doc to a new position. On the source, add/rename a variant or property.

- [ ] **Step 4: Update in place**

Re-select the source component.
Expected: button reads **Update Documentation**; the "Linked doc found" note is visible; **Reveal** zooms to the doc. Click **Update**.
Expected: the **same** frame updates — position unchanged, your description text intact, the variant/property change reflected. No duplicate frame is created.

- [ ] **Step 5: Options restore + toggle**

Confirm the checkboxes reflect what the doc was last built with. Toggle **Variant previews** off → Update.
Expected: the variants section disappears from the same frame.

- [ ] **Step 6: Doc-frame selection**

Select the doc frame directly (not the source).
Expected: panel shows **Update Documentation** for the resolved source; Update works from here too.

- [ ] **Step 7: Stale-link fallback**

Delete the doc frame. Re-select the source.
Expected: button reads **Generate Documentation**; clicking creates a fresh doc.

- [ ] **Step 8: Commit built output**

```bash
git add dist/code.js
git commit -m "build(component-docs): rebuild dist for stateful updates"
```

---

## Self-Review

**Spec coverage:**
- §1 The link (state) → Task 1 (helpers), Task 3 (`linkNodes`/`saveDocMeta` on both paths). Stale-link handling → `resolveLiveNode` (Task 1), used in Tasks 2/3/4/5.
- §2 Detection & panel flow → Task 2 (mode + doc-frame resolution), Task 5 (button label, note, reveal, options restore).
- §3 Update mechanism → Task 3 (build vs place/link split, `transferChildren`, frame identity preserved, position untouched on update).
- §4 Description preservation → Task 4 (`readExistingDescription`, canvas-truth read, cache via `saveDocMeta`).
- §5 Error handling → `resolveLiveNode` never throws (try/catch + `removed` check); doc-frame-with-dead-source returns null → idle state (Task 2).
- Testing → Task 6 manual smoke test mirrors the spec's six checks.

**Placeholder scan:** No TBD/TODO in delivered code. The only intentional stub (`descriptionText` in Task 3) is explicitly introduced and then replaced in Task 4, with both steps shown in full — this keeps Task 3 independently buildable.

**Type consistency:** `DocOptions` shape is identical in Tasks 1/2/3/5. `resolveLiveNode` returns `BaseNode | null` everywhere. `generateDocs` return type `{ propCount, variantCount, mode }` matches the `done` payload consumed in Task 5. `readExistingDescription` returns `string`; `descriptionText` is `string`; both feed `saveDocMeta(doc, opts, description: string)`. Message types (`context`/`done`/`error`/`reveal`) are consistent between `code.ts` and `ui.html`.
