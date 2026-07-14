# figma-plugins

Figma plugins I built to scratch my own itch — hopefully useful to others too.

## Plugins

### [`component-docs`](./component-docs)

Generates a documentation frame directly on the canvas from an existing component's properties and variants. Select any **Component** or **Component Set**, choose what to include, and the plugin builds a structured frame with:

- **Properties table** — all component properties with type tags (Variant, Boolean, Text, Instance) and their options or default values
- **Variant previews** — live instances of every variant laid out in a wrap grid
- **Description placeholder** — an editable text field for documenting usage and intent

The frame width adapts to the widest variant so nothing clips or overflows.

### [`variable-auditor`](./variable-auditor)

Audits variable hygiene in a file. Scans for four categories of issues:

1. **Unused variables** — variables bound to no layers
2. **Broken references** — layers bound to a deleted variable
3. **Unlinked library variables** — layers bound to variables from libraries not enabled in the current file (requires `teamlibrary` permission)
4. **Hardcoded values** — colors (including gradient stops and shadow effects), corner radius, stroke weight, auto-layout spacing, and typography not bound to a variable

Run scans on demand, scoped to the current selection, page, or whole document. Configure which checks to run in per-property **Settings**. Results group identical values together (e.g. `#FFFFFF · 14 layers`) for manageable browsing in large files.

For each result, you can:

- **Navigate** to any layer on canvas and highlight it
- **Step through** results with prev/next buttons
- **Select all** matching instances on canvas at once
- **Replace** hardcoded values with matching variables (exact matches suggested first; library variable candidates ranked by proximity)
- **Delete** unused variables with one-click confirmation or bulk delete
- **Detach** broken references (one click per item)

See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for third-party assets embedded in the plugin UI.

**Note:** The `manifest.json` `id` value is a development placeholder. Figma assigns the real plugin id on first publish.

## Installation

Each plugin is loaded locally via Figma's developer mode — no Figma Community listing required.

1. Clone the repo
   ```bash
   git clone https://github.com/mateuszbartosik/figma-plugins.git
   ```
2. Open the plugin folder and install dependencies
   ```bash
   cd component-docs
   npm install
   npm run build
   ```
3. In Figma, go to **Plugins → Development → Import plugin from manifest** and select the `manifest.json` inside the plugin folder.

