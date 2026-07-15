# Variable Auditor — Community listing kit

Draft assets & copy for publishing to the Figma Community. Regenerate the PNGs
from the HTML sources with headless Chrome (see **Regenerating** below).

## Assets

| File | Use | Size |
| --- | --- | --- |
| `icon-128.png` | Plugin icon (Figma requires 128×128) | 128×128, transparent |
| `icon-256.png` | Hi-dpi icon preview | 256×256, transparent |
| `icon-1024.png` | Icon master (downscale as needed) | 1024×1024, transparent |
| `cover.png` | Community cover art | 1920×960 |
| `icon.html`, `cover.src.html` | Editable sources (plugin design tokens + Geist) | — |

## Copy

**Name:** Variable Auditor

**Tagline:** Find orphaned variables and hardcoded values — and fix them in a click.

**Description:**

> Keep your Figma variables clean. Variable Auditor scans a selection, a page,
> or the whole file and surfaces four kinds of hygiene issues:
>
> - **Unused variables** — local variables nothing references
> - **Broken references** — bindings whose variable no longer exists
> - **Unlinked library variables** — bound to a library that isn't enabled in this file
> - **Hardcoded values** — colors (incl. gradient stops & shadows), corner radius,
>   stroke weight, auto-layout spacing, and typography
>
> From the results you can jump to any layer, step through them one by one, select
> every matching layer at once, replace a hardcoded value with a matching **local or
> library** variable (nearest matches suggested first), delete unused variables, or
> detach broken bindings. Choose exactly which checks and properties to scan.
>
> Runs 100% on-device — no network access, no tracking.

**Tags:** variables · design tokens · design systems · cleanup · audit · hardcoded values · maintenance · tokens · housekeeping

## Publishing checklist

- [ ] In Figma: right-click the plugin → **Publish** (or Plugins → Development → Publish)
- [ ] Icon: upload `icon-128.png`
- [ ] Cover art: upload `cover.png`
- [ ] Paste name, tagline, description, tags above
- [ ] Figma assigns the real plugin `id` on publish (the `manifest.json` id is a dev placeholder)
- [ ] Confirm `LICENSE` + `THIRD-PARTY-NOTICES.md` ship with the source

## Regenerating the PNGs

Headless Chrome renders the HTML sources to PNG. Chrome loads `file://` directly, so
no local server is needed. Run these from inside this folder.

1. Inline the fonts into `cover.html` so it is self-contained (`cover.src.html` ships
   with `__GEIST_*__` placeholders; `geist-sans.woff2` / `geist-mono.woff2` are Fontsource):

   ```
   node -e "const fs=require('fs');let h=fs.readFileSync('cover.src.html','utf8');h=h.replace('__GEIST_SANS__',fs.readFileSync('geist-sans.woff2').toString('base64')).replace('__GEIST_MONO__',fs.readFileSync('geist-mono.woff2').toString('base64'));fs.writeFileSync('cover.html',h)"
   ```

2. Render (use an absolute `file://` path to the HTML):

   ```
   # cover — 1920×960
   chrome --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
     --screenshot=cover.png --window-size=1920,960 "file:///ABS/PATH/cover.html"

   # icon — rendered at 2× to 1024×1024, transparent (icon.html has no external fonts)
   chrome --headless --disable-gpu --default-background-color=00000000 \
     --force-device-scale-factor=2 --screenshot=icon-1024.png --window-size=512,512 "file:///ABS/PATH/icon.html"
   ```

3. Downscale `icon-1024.png` to 128×128 (and 256×256) with any high-quality bicubic resampler for the Figma icon.
