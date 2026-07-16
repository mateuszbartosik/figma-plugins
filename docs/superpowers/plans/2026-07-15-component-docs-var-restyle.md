# Component Docs — VAR Restyle + Doc Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the component-docs plugin PANEL to match the sibling plugin VAR's look-and-feel, and refine the on-canvas doc (readable description, accurate type pills, no-properties state) while keeping the doc output brand-neutral.

**Architecture:** The panel restyle is CSS/markup-only in `src/ui.html` — repoint the existing CSS custom properties to VAR's token values, embed VAR's Geist fonts, and apply VAR's header/card/button treatments; all element IDs and `<script>` behavior are preserved. The doc refinements are small logic edits in `src/code.ts`.

**Tech Stack:** TypeScript (strict), Figma Plugin API, esbuild, plain-HTML UI with inline `<style>`/`<script>`, base64-embedded Geist / Geist Mono fonts.

## Global Constraints

- `networkAccess: none` — fonts MUST be embedded (base64), no external font/CSS/asset requests.
- No unit-test harness; the Figma runtime can't run headless. **Per-task verification = `npx tsc --noEmit` (clean, exit 0) + `npm run build` (exit 0).** `ui.html` is not type-checked, but run both after every change. Behavioral/visual verification is the manual Figma smoke test (Task 5).
- All commands run from `D:\Work\figma-components\component-docs` unless noted; the Bash tool is Git Bash on Windows.
- **Preserve all stateful-update behavior and every element ID** referenced by the `ui.html` `<script>` (`view-empty`/`view-main`/`view-success`, `comp-name`/`comp-meta`/`comp-badge`, `opt-props`/`opt-variants`/`opt-variants-item`/`opt-notes`, `btn-generate`, `link-note`/`reveal-link`, `success-desc`, `btn-done`). Styling and header markup may change; IDs and script logic may not.
- The on-canvas doc frame stays **brand-neutral** — do NOT introduce VAR violet into `code.ts` output.
- VAR source for reference lives on the `variable-auditor` branch at `variable-auditor/src/ui.html`; read it via `git show variable-auditor:variable-auditor/src/ui.html`.

## VAR token values (authoritative — copy verbatim where used)

```
page #F4F4F9 · surface #FFFFFF · surface-2 #F5F5FB · track #EBEBF2
text #17161F · text-2 #6B6979 · text-3 #9B99A9
border rgba(22,20,50,.09) · border-2 rgba(22,20,50,.16) · hover #F5F5FB
violet #7C5CFF · violet-ink #5B3FD6
grad linear-gradient(135deg,#A45CFF 0%,#6C5CFF 50%,#4D8AFF 100%)
shadow-card 0 1px 2px rgba(24,20,50,.04),0 6px 16px -10px rgba(40,34,90,.14)
sans 'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif
mono 'Geist Mono',ui-monospace,Menlo,Consolas,monospace
```

---

## File Structure

- `component-docs/src/ui.html` (modify) — embed Geist fonts; repoint `:root`; restyle header, component card, options, primary button, link-note, success view. Tasks 1–2.
- `component-docs/src/code.ts` (modify) — description single readable color + no-properties line (Task 3); `INSTANCE_SWAP` → "Instance swap" + slot detection (Task 4).
- `component-docs/dist/code.js` (regenerate) — Task 5.

---

## Task 1: Embed Geist fonts + repoint design tokens

Adopt VAR's typography and palette at the CSS-variable level, so most existing rules inherit the new look with no per-rule edits. This is the foundation for Task 2.

**Files:**
- Modify: `component-docs/src/ui.html` — the `<style>` block: insert `@font-face` rules after `<style>`; replace the `:root{…}` block; change `body` font-family.

**Interfaces:**
- Consumes: nothing.
- Produces: CSS variables re-pointed to VAR values + new `--grad`, `--sans`, `--mono`, `--shadow-card`, `--border-2`; two embedded `@font-face` families `Geist` and `Geist Mono`. Task 2 relies on these.

- [ ] **Step 1: Extract VAR's two `@font-face` rules to a temp file**

The Geist and Geist Mono `@font-face` rules are self-contained single lines (lines 2–3) of VAR's `ui.html`. From `D:\Work\figma-components`:

```bash
git show variable-auditor:variable-auditor/src/ui.html | sed -n '2,3p' > "C:/Users/MATEUS~1/AppData/Local/Temp/claude/D--Work-figma-components/c68aa969-d74f-4988-98e2-f0c6459f3e31/scratchpad/geist-fonts.css"
```

Verify the file has exactly 2 lines, both containing `@font-face` and `base64`:

```bash
SCRATCH="C:/Users/MATEUS~1/AppData/Local/Temp/claude/D--Work-figma-components/c68aa969-d74f-4988-98e2-f0c6459f3e31/scratchpad"
wc -l "$SCRATCH/geist-fonts.css"        # expect 2
grep -c "@font-face" "$SCRATCH/geist-fonts.css"  # expect 2
grep -c "base64"     "$SCRATCH/geist-fonts.css"  # expect 2
```

- [ ] **Step 2: Insert the font rules right after `<style>` in ui.html**

The fonts are ~40KB each — insert programmatically, do NOT paste into an Edit. From `D:\Work\figma-components\component-docs`:

```bash
SCRATCH="C:/Users/MATEUS~1/AppData/Local/Temp/claude/D--Work-figma-components/c68aa969-d74f-4988-98e2-f0c6459f3e31/scratchpad"
awk '/<style>/{print; while((getline line < "'"$SCRATCH"'/geist-fonts.css")>0) print line; next}1' src/ui.html > "$SCRATCH/ui.tmp" && mv "$SCRATCH/ui.tmp" src/ui.html
```

Verify the fonts now live inside ui.html and the file still ends correctly:

```bash
grep -c "@font-face" src/ui.html   # expect 2
tail -1 src/ui.html                # expect </html>
```

- [ ] **Step 3: Replace the `:root{…}` block**

Find the existing `:root {` block (currently the light/blue palette) and replace the entire block with:

```css
    :root {
      --bg: #F4F4F9;
      --surface: #FFFFFF;
      --bg-secondary: #F5F5FB;
      --bg-hover: #F5F5FB;
      --track: #EBEBF2;
      --border: rgba(22,20,50,.09);
      --border-2: rgba(22,20,50,.16);
      --text: #17161F;
      --text-secondary: #6B6979;
      --text-tertiary: #9B99A9;
      --accent: #7C5CFF;
      --accent-hover: #5B3FD6;
      --accent-light: rgba(124,92,255,.10);
      --success-bg: #E7F8F1;
      --success: #0FB981;
      --grad: linear-gradient(135deg,#A45CFF 0%,#6C5CFF 50%,#4D8AFF 100%);
      --sans: 'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
      --mono: 'Geist Mono',ui-monospace,Menlo,Consolas,monospace;
      --shadow-card: 0 1px 2px rgba(24,20,50,.04),0 6px 16px -10px rgba(40,34,90,.14);
      --radius: 12px;
      --radius-sm: 10px;
    }
```

(There are two identical `:focus-visible` rules in the file bracketing the old `:root`; leave them as-is — only the `:root` block changes.)

- [ ] **Step 4: Point `body` at the Geist sans stack**

In the `body { … }` rule, replace the `font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;` line with:

```css
      font-family: var(--sans);
```

- [ ] **Step 5: Verify tsc + build**

```bash
npx tsc --noEmit   # exit 0, clean
npm run build      # exit 0
```

- [ ] **Step 6: Commit**

```bash
git add src/ui.html
git commit -m "feat(component-docs): embed Geist fonts, adopt VAR design tokens"
```

---

## Task 2: Restyle header, card, button, note, success to VAR

Apply VAR's chrome on top of the Task 1 tokens: a logo + title + subtitle header (across all three views), card shadow, the gradient primary button, and violet-tinted accents.

**Files:**
- Modify: `component-docs/src/ui.html` — header markup in all three views + these CSS rules: `.header`, `.header h1`, `.header p`, `.comp-card`, `.comp-icon`, `.btn-primary`, `.btn-primary:hover`.

**Interfaces:**
- Consumes: Task 1 tokens (`--grad`, `--shadow-card`, `--accent`, `--sans`, radii).
- Produces: final panel styling. No new IDs.

- [ ] **Step 1: Replace the three `.header` markup blocks**

The file has three identical header blocks (one per view):

```html
  <div class="header">
    <h1>Component Docs</h1>
    <p>Generates a documentation frame from your component's properties and variants</p>
  </div>
```

Replace **each** occurrence with (use `replace_all` since all three are identical):

```html
  <div class="header">
    <div class="logo">
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5L14.5 5.25V10.75L8 14.5L1.5 10.75V5.25L8 1.5Z" stroke="currentColor" stroke-width="1.4"/>
        <circle cx="8" cy="8" r="1.8" fill="currentColor"/>
      </svg>
    </div>
    <div class="htxt">
      <div class="app-title">Component Docs</div>
      <div class="app-sub">Component &amp; variant documentation</div>
    </div>
  </div>
```

- [ ] **Step 2: Replace the header CSS rules**

Replace the three existing rules — `.header { … }`, `.header h1 { … }`, `.header p { … }` — with:

```css
    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 16px 16px 14px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .logo {
      width: 30px; height: 30px; border-radius: 9px;
      background: var(--accent-light);
      color: var(--accent);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .htxt { min-width: 0; }
    .app-title { font-size: 15px; font-weight: 600; letter-spacing: -.015em; color: var(--text); }
    .app-sub { font-size: 11px; color: var(--text-secondary); margin-top: 1px; letter-spacing: -.005em; }
```

- [ ] **Step 3: Give the component card a shadow and the icon/badge violet accents**

Replace the `.comp-card { … }` rule by appending a shadow (keep its other properties), i.e. replace it with:

```css
    .comp-card {
      margin: 14px 16px 0;
      padding: 12px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-card);
      display: flex;
      align-items: center;
      gap: 10px;
    }
```

(`.comp-icon` already uses `background: var(--accent-light)` and `.comp-icon svg { color: var(--accent) }`, and `.badge` already uses `var(--accent-light)`/`var(--accent)` — these now resolve to violet automatically. Do not edit them.)

- [ ] **Step 4: Make the primary button use the gradient**

Replace the `.btn-primary { … }` and `.btn-primary:hover:not(:disabled) { … }` rules with:

```css
    .btn-primary {
      background: var(--grad);
      color: #fff;
      box-shadow: 0 10px 24px -10px rgba(108,92,255,.7);
    }
    .btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
    .btn-primary:active:not(:disabled) { transform: scale(.98); }
```

(The base `.btn` rule already sets width/padding/radius/font/transition; `.btn-primary` only overrides background/color/shadow. `.btn:disabled { opacity:.5 }` stays.)

- [ ] **Step 5: Verify tsc + build**

```bash
npx tsc --noEmit   # exit 0
npm run build      # exit 0
```

- [ ] **Step 6: Commit**

```bash
git add src/ui.html
git commit -m "feat(component-docs): VAR-style header, card, gradient button"
```

---

## Task 3: Canvas doc — readable description + no-properties line

Two brand-neutral refinements to the generated frame in `code.ts`.

**Files:**
- Modify: `component-docs/src/code.ts` — description render block (currently lines 465–475) and properties section (currently lines 477–484). Locate by content; line numbers may shift.

**Interfaces:**
- Consumes: existing `txt`, `frame`, `vStack`, `buildPropsTable`, `DESC_PLACEHOLDER`, `PAD_H`, `docW`, `contentW`, `props`, `options`.
- Produces: no new exports.

- [ ] **Step 1: Paint the description a single readable color**

Replace this block:

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

with (single readable tone always; `hasDesc` removed):

```ts
  // Description
  if (options.includeNotes) {
    const notesSection = frame('description-section');
    vStack(notesSection, docW, 8, PAD_H, 20);
    notesSection.appendChild(txt('DESCRIPTION', 10, 'Bold', '#AAAAAA'));
    notesSection.appendChild(txt(descriptionText, 13, 'Regular', '#6E6E6E'));
    doc.appendChild(notesSection);
    doc.appendChild(hr(docW));
  }
```

- [ ] **Step 2: Add the no-properties empty line**

Replace the properties block:

```ts
  // Properties
  if (options.includeProps && props.length > 0) {
    const propsSection = frame('properties-section');
    vStack(propsSection, docW, 12, PAD_H, 20);
    propsSection.appendChild(txt(`PROPERTIES (${props.length})`, 10, 'Bold', '#AAAAAA'));
    propsSection.appendChild(buildPropsTable(props, contentW));
    doc.appendChild(propsSection);
  }
```

with (render the section whenever `includeProps` is on; show a muted line when empty):

```ts
  // Properties
  if (options.includeProps) {
    const propsSection = frame('properties-section');
    vStack(propsSection, docW, 12, PAD_H, 20);
    propsSection.appendChild(txt(`PROPERTIES (${props.length})`, 10, 'Bold', '#AAAAAA'));
    if (props.length > 0) {
      propsSection.appendChild(buildPropsTable(props, contentW));
    } else {
      propsSection.appendChild(txt('No configurable properties', 13, 'Regular', '#CCCCCC'));
    }
    doc.appendChild(propsSection);
  }
```

- [ ] **Step 3: Verify tsc + build**

```bash
npx tsc --noEmit   # exit 0
npm run build      # exit 0
```

- [ ] **Step 4: Commit**

```bash
git add src/code.ts
git commit -m "fix(component-docs): readable description color + no-properties line"
```

---

## Task 4: Type pill — "Instance swap" + slot detection

Make `INSTANCE_SWAP` an explicit, correctly-labeled type, and detect true Figma Slots where the API allows.

**Files:**
- Modify: `component-docs/src/code.ts` — `TYPE_STYLES` / `typeStyle` (currently lines 309–317), and the prop-mapping in `generateDocs` where `PropInfo.type` is assigned (the `Object.entries(defs).map(...)` block).

**Interfaces:**
- Consumes: `PropInfo` type, `def.type` from `componentPropertyDefinitions`.
- Produces: pill labels "Instance swap" and (conditionally) "Slot".

- [ ] **Step 1: Verify how a Slot surfaces (in-Figma investigation)**

There is no headless way to confirm this. Add a temporary diagnostic to log the raw property type for the selected component, build, and ask the human to run it on a component that has a slot, then report the logged `type` value. Add this line at the top of the `Object.entries(defs).map(async ([rawName, def]) => {` callback in `generateDocs`:

```ts
      console.log('[component-docs] prop', rawName, 'type=', def.type);
```

Build (`npm run build`), then STOP and report DONE_WITH_CONCERNS asking the controller/human to: run the plugin on a component containing a slot, open the plugin console, and report what `type=` prints for the slot. Do not guess. The answer decides Step 2.

- [ ] **Step 2: Add the explicit label(s)**

Once the slot's reported type is known:

Add an explicit `INSTANCE_SWAP` entry so it no longer falls through to the default. Replace:

```ts
const TYPE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  VARIANT: { bg: '#F3EEFF', fg: '#7C3AED', label: 'Variant' },
  BOOLEAN: { bg: '#F0FDF9', fg: '#0D9488', label: 'Boolean' },
  TEXT:    { bg: '#FFFBEB', fg: '#B45309', label: 'Text' },
};

function typeStyle(type: string) {
  return TYPE_STYLES[type] ?? { bg: '#EFF6FF', fg: '#2563EB', label: 'Instance' };
}
```

with:

```ts
const TYPE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  VARIANT:       { bg: '#F3EEFF', fg: '#7C3AED', label: 'Variant' },
  BOOLEAN:       { bg: '#F0FDF9', fg: '#0D9488', label: 'Boolean' },
  TEXT:          { bg: '#FFFBEB', fg: '#B45309', label: 'Text' },
  INSTANCE_SWAP: { bg: '#EFF6FF', fg: '#2563EB', label: 'Instance swap' },
  SLOT:          { bg: '#EEF2FF', fg: '#4338CA', label: 'Slot' },
};

function typeStyle(type: string) {
  return TYPE_STYLES[type] ?? { bg: '#EFF6FF', fg: '#2563EB', label: 'Instance swap' };
}
```

**Conditional on Step 1's finding:**
- If slots report a **distinct** type string (e.g. the log shows something other than `INSTANCE_SWAP`), map that string to the `SLOT` entry: in the prop-mapping block, when `def.type` equals the slot's reported value, set `PropInfo.type` to `'SLOT'` (widen the `PropInfo.type` union to include `'SLOT'` and `'INSTANCE_SWAP'` if not already, and cast accordingly). Keep the `TYPE_STYLES.SLOT` entry.
- If slots are **indistinguishable** from instance-swap (log shows `INSTANCE_SWAP`), REMOVE the `SLOT` entry from `TYPE_STYLES` (leave it out — no dead code) and rely on the "Instance swap" label. Note this outcome in the report.

- [ ] **Step 3: Remove the diagnostic log**

Delete the `console.log('[component-docs] prop', …)` line added in Step 1.

- [ ] **Step 4: Verify tsc + build**

```bash
npx tsc --noEmit   # exit 0
npm run build      # exit 0
```

- [ ] **Step 5: Commit**

```bash
git add src/code.ts
git commit -m "feat(component-docs): label instance-swap properties + slots accurately"
```

---

## Task 5: Rebuild dist + manual smoke test

**Files:**
- Regenerate + commit `component-docs/dist/code.js`; verify in Figma.

- [ ] **Step 1: Rebuild dist from current source**

```bash
npm run build   # exit 0
```

- [ ] **Step 2: Manual in-Figma smoke test**

Import/run the plugin (Plugins → Development → `component-docs/manifest.json`). Verify:
1. Panel matches VAR: Geist type, lavender page, violet accent, gradient primary button, logo + "Component Docs" / "Component & variant documentation" header, card with soft shadow.
2. Stateful-update behavior intact: select a component → Generate; re-select → button flips to **Update** with the linked-doc note + working **Reveal**; options restore; success copy is mode-aware.
3. On the canvas doc, a typed description is readable immediately (no manual recolor).
4. A component with no properties shows "No configurable properties".
5. Instance-swap properties show the "Instance swap" pill (and "Slot", if Task 4 Step 1 found slots distinguishable).

- [ ] **Step 3: Commit built output**

```bash
git add dist/code.js
git commit -m "build(component-docs): rebuild dist for VAR restyle"
```

---

## Self-Review

**Spec coverage:**
- §1 Panel restyle → Task 1 (fonts + tokens + body) and Task 2 (header, card, button, note/success inherit via tokens). Behavior/ID preservation is a Global Constraint and enforced in Task 2's markup-only header change.
- §2 Canvas doc refinements → Task 3 (single-color description; no-properties line).
- §3 Type pill accuracy → Task 4 ("Instance swap" + slot detection with graceful degradation).
- Testing → Task 5 (build + manual smoke covering all five spec checks).

**Placeholder scan:** No TBD/TODO. The one investigative step (Task 4 Step 1) is a real, necessary in-Figma probe with an explicit branch for each outcome and a diagnostic that is removed in Step 3 — not a placeholder.

**Type consistency:** `TYPE_STYLES` keys are strings matched against `def.type`; the `SLOT` branch widens `PropInfo.type` only if Step 1 confirms a distinct type, otherwise the `SLOT` entry is removed (no dead code). `typeStyle`'s fallback label changes from "Instance" to "Instance swap" consistently. The link-note and success view are unchanged in markup and inherit the new tokens (no ID or script changes), consistent with the Global Constraint.
