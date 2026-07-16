# Component Docs — Stateful, Updatable Docs

**Date:** 2026-07-15
**Plugin:** `component-docs` (Figma plugin)
**Status:** Approved design

## Problem

The `component-docs` plugin generates a documentation frame from a selected
Component or Component Set and drops it beside the source. There is no link
between a doc and its source: re-running always creates a **new** frame, so the
user must manually delete the stale doc before regenerating.

The user wants the plugin to *hold state* so that a doc placed on the canvas can
be **updated in place** — no manual delete-and-regenerate cycle.

## Goals

- A doc frame "knows" which component it documents, and vice versa.
- Re-running on a component with an existing doc **updates that doc in place**
  instead of duplicating it.
- User-authored content (the description) survives updates.
- The doc stays wherever the user moved it; updating never repositions it.

## Non-goals (YAGNI)

- No cross-file linking or network sync (manifest is `networkAccess: none`).
- No versioning/history of docs.
- No auto-update on component change (update is user-triggered via the button).
- No preservation of arbitrary manual edits to generated content beyond the
  description (props/variants are always rebuilt from the component).

## Design

### 1. The link (state)

State is stored as **plugin data** (`setPluginData`) on both nodes, under a
namespaced key prefix (e.g. `componentDocs:`):

- On the **source** Component/ComponentSet:
  - `docId` → the doc frame's node ID.
- On the **doc** frame:
  - `sourceId` → the source component's node ID.
  - `description` → cached description text (see §4).
  - `options` → JSON of the last-used `{ includeProps, includeVariants, includeNotes }`.

The link is **bidirectional**: selecting either node lets the plugin find its
counterpart. IDs are stable across renames and moves, and plugin data is local
to the file.

**Stale-link handling:** any stored ID is resolved with `getNodeByIdAsync`
before use. If the counterpart no longer exists (deleted), the link is treated
as broken and the plugin falls back to fresh generation. This is the primary
failure mode and is handled explicitly.

### 2. Detection & panel flow

`getSelectionInfo` is extended to resolve the link and report the mode to the UI:

- **Component with a live linked doc** → UI shows **"Update Documentation"**, a
  note *"Linked doc found — will update in place"*, and a **Reveal doc** link
  (scrolls/zooms to the doc). Checkboxes are restored to the `options` the doc
  was last built with.
- **Component with no live doc** (no link, or link is stale) → UI shows
  **"Generate Documentation"** (current behavior).
- **Doc frame selected directly** → resolve its `sourceId` back to the source
  component and present the same **Update** view, so the user can update from
  either side. If the source is missing/stale, show an informative empty/idle
  state.

The UI message contract gains a `mode: 'generate' | 'update'` field and the
restored `options`, plus (in update mode) the `docId`/`sourceId` needed for the
Reveal action.

### 3. Update mechanism

`generateDocs` is split into two responsibilities:

- **build**: constructs the doc frame and its children (existing layout code,
  unchanged).
- **place/link**: positions and wires up plugin data.

Two paths:

- **Generate (no live link):** build a new doc, position it beside the source
  (current logic: `bounds.x + bounds.width + 80`, `bounds.y`), write both
  plugin-data links and the cached options.
- **Update (live link):** build the new content, then **swap children into the
  existing frame** — remove the existing frame's children and append the freshly
  built ones, keeping the **same frame node**. This preserves the frame's
  position, name, and any user resizing. Re-write the links and refresh cached
  options/description.

Keeping the same node is what makes it read as an *update* rather than a
*replace*: the frame stays put and the link never breaks.

Implementation note: the cleanest way to reuse the layout code is to build the
content into a fresh detached frame, then either (a) move its children into the
existing frame and discard the shell, or (b) copy computed layout properties.
Approach (a) is preferred for simplicity. The exact mechanics are settled during
implementation; the invariant is **the persisted doc frame node identity is
preserved on update**.

### 4. Description preservation

The description is user-authored (edited directly on the canvas), so the canvas
is the source of truth:

- Before rebuilding, locate the doc's description text node and read its current
  text.
- If the text is **not** the placeholder (`Add a description for this
  component…`), carry it into the rebuilt description section and cache it in
  the doc's `description` plugin data.
- If it *is* the placeholder (untouched), regenerate the placeholder as today.

This guarantees written descriptions survive every update while untouched
placeholders behave as before.

### 5. Error handling

- Broken links (deleted counterpart) → silent fallback to generate; never throw.
- Doc frame selected but source deleted → informative idle state, no crash.
- Existing `generateDocs` validation (must be Component/ComponentSet) is retained
  for the generate path. The update path may be entered from a doc-frame
  selection, in which case validation targets the resolved source.

## Testing

Figma plugins cannot run headless in this environment, so verification is a
**manual smoke test in Figma** (consistent with how the VAR plugin was
verified):

1. Generate docs on a Component Set → doc appears beside it.
2. Edit the description; move the doc elsewhere; tweak a variant on the source.
3. Re-select the source → button reads **Update**; click it → the **same** frame
   updates in place, description intact, position unchanged, variant change
   reflected.
4. Delete the doc frame → re-select source → button reads **Generate**; clicking
   creates a fresh doc.
5. Select the doc frame directly → **Update** view appears; Reveal/update works.
6. Toggle a section checkbox off, update → that section is removed from the doc.

## Affected files

- `component-docs/src/code.ts` — link read/write, detection, generate/update
  split, description preservation.
- `component-docs/src/ui.html` — Update mode (button label, note, Reveal link),
  options restore, extended message contract.
- Build via existing `npm run build` (esbuild → `dist/code.js`).
