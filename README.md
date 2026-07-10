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

Audits variable hygiene in a file. Scans for **unused variables**, **broken references** (layers bound to a deleted variable), and **hardcoded values** (colors, corner radius, stroke weight, auto-layout spacing, and typography that aren't bound to a variable). Scope the scan to the current selection, page, or whole document, then:

- **Jump** to any layer on canvas from the plugin
- **Replace** a hardcoded value — or a whole group of them — with a matching variable (exact matches suggested first)
- **Delete** unused variables in one click

Results group identical values together (e.g. `#FFFFFF · 14 layers`) so large files stay manageable.

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

