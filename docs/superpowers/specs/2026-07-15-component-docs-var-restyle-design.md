# Component Docs — VAR-matching restyle + doc refinements

**Date:** 2026-07-15
**Plugin:** `component-docs` (Figma plugin)
**Status:** Approved design
**Builds on:** `2026-07-15-component-docs-stateful-updates-design.md` (branch `component-docs-stateful`)

## Problem

Follow-up refinement round after the stateful-updates work:

1. The generated doc's Description field paints typed text in a near-invisible
   light gray (`#CCCCCC`), because typed characters inherit the placeholder's
   fill — you must manually recolor to read what you wrote.
2. Instance-swap properties (and slots) show a generic "Instance" type pill,
   which doesn't match Figma's own "Instance swap" terminology.
3. The plugin panel uses generic styling (system fonts, blue accent) that
   doesn't match the sibling plugin **VAR — Variables Audit & Replace**. The
   user wants all their plugins to share one look-and-feel.

## Goals

- Description text is readable at all times (no manual recolor).
- Type pill matches Figma terminology; true slots labeled precisely where the
  API allows.
- The plugin **panel** matches VAR's look-and-feel exactly.
- The on-canvas **doc output stays brand-neutral** (no VAR violet), so it's
  presentable in any file it's dropped into.

## Non-goals (YAGNI)

- No VAR restyle of the on-canvas doc frame (explicitly panel-only).
- No shared style package across plugins — each Figma plugin stays
  self-contained; VAR's tokens/fonts are replicated into component-docs.
- No live reaction to canvas typing (a plugin can't observe keystrokes; the
  description color is simply readable from the start).
- No change to the stateful-update behavior, message contract, or link model.

## Design

### 1. Panel restyle to VAR look-and-feel

Rebuild the styling of `component-docs/src/ui.html` to match VAR, preserving
**every behavior** from the stateful-updates work: Update-mode button label
flip, the "linked doc found" note, the Reveal link, options restore on update,
and mode-aware success copy.

**Design tokens** — adopt VAR's `:root` verbatim:
- Page `#F4F4F9`; surfaces `#FFFFFF` / `#F5F5FB`; track `#EBEBF2`.
- Text `#17161F` / `#6B6979` / `#9B99A9`.
- Borders `rgba(22,20,50,.09)` / `rgba(22,20,50,.16)`; hover `#F5F5FB`.
- Accent violet `#7C5CFF` (ink `#5B3FD6`); gradient
  `linear-gradient(135deg,#A45CFF 0%,#6C5CFF 50%,#4D8AFF 100%)`.
- Card shadow `0 1px 2px rgba(24,20,50,.04),0 6px 16px -10px rgba(40,34,90,.14)`.
- Radii 10–14px.

**Typography** — embed **Geist** and **Geist Mono**. Lift the two base64
`@font-face` blocks verbatim from VAR's `ui.html` (branch `variable-auditor`,
`variable-auditor/src/ui.html`) so the panels are pixel-identical and remain
self-contained/offline (`networkAccess: none`). `--sans` = Geist stack,
`--mono` = Geist Mono stack.

**Header** — VAR's pattern: a logo mark + `.app-title` ("Component Docs",
15px/600, letter-spacing -.015em) + `.app-sub` ("Component & variant
documentation", 11px, `--text-2`). Reuse the existing hexagon glyph as the mark,
tinted violet. This replaces the current `.header h1 + p` block; the same header
appears across all three views (as today).

**Components:**
- Component card → VAR card: `--surface-2` bg, tinted border, radius 14, shadow.
- Options checkboxes → `accent-color: var(--violet)`; rows use `--hover` on hover.
- Primary button → `.btn-primary`: gradient bg, white text, radius 12,
  `box-shadow: 0 10px 24px -10px rgba(108,92,255,.7)`, `active { transform:
  scale(.98) }`, `disabled { opacity:.7 }`.
- The "linked doc found" note → violet surface tint (`--accent-light`
  equivalent using the violet at low alpha); the Reveal link uses `--violet-ink`.
- Success view → restyled to match (violet check accent), keeping the
  mode-aware `h2`/description text.

Keep the existing three-view structure (`view-empty` / `view-main` /
`view-success`) and all element IDs and script logic; only styling/markup-chrome
changes. Any ID the script references must continue to exist.

### 2. Canvas doc refinements (brand-neutral)

In `component-docs/src/code.ts`:

- **Description contrast:** in the description-render block, paint the value
  node a single readable tone `#6E6E6E` unconditionally — remove the
  `hasDesc ? '#1A1A1A' : '#CCCCCC'` conditional. Typed text is legible
  immediately. The DESCRIPTION label (`#AAAAAA`) is unchanged. State
  preservation (`readExistingDescription`) is unaffected: it compares the text
  string to `DESC_PLACEHOLDER`, never the color.
- **No-properties line:** when `options.includeProps` is on but the component
  has zero properties, render a subtle line "No configurable properties"
  (`#CCCCCC`/`#AAAAAA`, matching existing muted-text style) under the
  `PROPERTIES (0)` heading, instead of omitting the section. Today the
  Properties section only renders when `props.length > 0`; this adds the
  empty-state branch. (The heading count and section visibility stay consistent
  with the existing metaParts logic.)

### 3. Type pill accuracy

In `component-docs/src/code.ts`:

- Add an explicit `INSTANCE_SWAP` entry to `TYPE_STYLES` (or the `typeStyle`
  resolver) with label **"Instance swap"**, so it no longer falls through to the
  generic default. Choose a color consistent with the existing palette (the
  current default blue `#EFF6FF`/`#2563EB` is fine to keep for this type).
- **Slot detection:** verify in-Figma what property type a true Figma Slot
  reports. If slots are distinguishable from ordinary instance-swap properties,
  add a dedicated **"Slot"** pill; if they are indistinguishable (i.e. surface
  as `INSTANCE_SWAP`), they remain under "Instance swap" and no separate
  detection is added. The implementation must degrade gracefully to the
  "Instance swap" label when detection isn't possible.
- The `◆` component badge for resolved instance-swap default component names is
  unchanged.

## Testing

Same gates as prior work (no unit-test harness; Figma can't run headless):
`npx tsc --noEmit` (clean) + `npm run build` (exit 0) per change.

Behavioral verification is a manual in-Figma smoke test:
1. Panel visually matches VAR (Geist type, violet accent, gradient button,
   lavender page, card treatment, header logo+title+sub).
2. All stateful-update behavior still works after the restyle: Update-mode
   button flip, linked-doc note, Reveal, options restore, mode-aware success.
3. Description text is readable immediately when typed (no manual recolor).
4. A property-less component shows "No configurable properties."
5. Instance-swap properties show "Instance swap"; slots show the verified label.

## Affected files

- `component-docs/src/ui.html` — full panel restyle (tokens, Geist fonts,
  header, cards, button, note, success view). Behavior/IDs preserved.
- `component-docs/src/code.ts` — description single readable color;
  no-properties line; `INSTANCE_SWAP` → "Instance swap" (+ optional slot pill).
- Build via `npm run build` (esbuild → `dist/code.js`).
