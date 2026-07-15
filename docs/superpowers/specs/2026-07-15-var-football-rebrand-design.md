# VAR football-VAR rebrand — design

**Goal:** Give "VAR — Variables Audit & Replace" a distinctive identity that nods to football's VAR (Video Assistant Referee) system, differentiating it in a crowded "Variable*" plugin category.

**Principle:** The football reference lives in the **mark** and a little **review language** — layered on the existing clean, light UI. No dark theme, no garish broadcast styling. Premium-broadcast, not cheesy.

## Mark (icon + in-plugin logo)

Replace the 3D box glyph with a **frame + check**: four corner brackets (the referee's hands framing the review "screen") enclosing a checkmark ("check complete / decision confirmed"). Even stroke weight. Verified legible from 512px down to 44px.

- SVG (24 viewBox, `stroke-width` ~1.8, round caps/joins):
  - `M8 4H5a2 2 0 0 0-2 2v2` · `M16 4h3a2 2 0 0 1 2 2v2` · `M21 16v2a2 2 0 0 1-2 2h-3` · `M8 20H5a2 2 0 0 1-2-2v-2` (brackets)
  - `M8.3 12.2 10.8 14.8 15.7 9.6` (check)
- Sits on the existing violet→blue gradient tile. Used in: `icon-{128,256,1024}.png`, `icon.html`, the cover tiles, and the ui.html header logo.

## Cover

Panel-forward hero unchanged in layout. New frame-check mark in the icon tile and panel logo. **No offside-line accent** (tried, read as arbitrary — dropped).

## In-plugin theming (light, existing palette)

- **Empty state:** frame-check icon in the violet-tint square; title **"Ready for review"**; sub **"Run a check on your selection, page, or document to surface unused variables, broken references, and hardcoded values."**; primary button **"Run check"** (frame-check glyph).
- **Scanning:** a light **"VAR REVIEW"** banner replacing the plain "Scanning…" text — a red "live" dot (`--rose`, soft ring), rose-ink uppercase letter-spaced label, and a right-aligned mono `checking N layers`.
- **All-clear footer:** **"CHECK COMPLETE"** (mint, uppercase, letter-spaced) **"— no issues found."**
- **Copy rule:** use "check" / "review", never "VAR check". Section names (Unused / Broken references / Unlinked library / Hardcoded values) stay **functional and unchanged**.

## Out of scope

Renaming the result sections into review-speak; any dark UI; offside-line graphics; changes to scan logic (`code.ts` untouched — the scanning banner only restyles the existing `scan-progress` display).

## Verification

- Icon re-rendered and checked at 128/256/1024 + 44/64 legibility.
- Cover re-rendered (1920×960).
- UI states (empty / reviewing / check-complete) rendered from the real CSS before wiring into `ui.html`.
- `tsc --noEmit` clean, `node --test` 19/19 (unchanged; UI-only edits), `dist/code.js` unchanged.
