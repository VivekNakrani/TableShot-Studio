# TableShot Studio

TableShot Studio is a lightweight web app that turns **table-formatted Markdown** into high-quality **PNG** and **SVG** exports.

It is designed for quick visual table generation with live preview, precise sizing controls, and customizable styling.

## Demo Use Cases

- Social media cards with pricing/feature tables
- Docs/blog visuals
- Team dashboards and reporting snapshots
- Transparent table exports for design tools

## Features

- Table-only Markdown parser (with alignment support)
  - `:---` (left), `:---:` (center), `---:` (right)
- Real-time preview with debounce (~250ms)
- Canvas controls
  - Manual width/height
  - Lock aspect ratio
  - Fit to canvas (auto content bounds)
- Table labels
  - Title (center top)
  - Caption (left bottom)
- Styling controls
  - Typography, spacing, border radius/width
  - Colors with HEX input + swatch
- Background modes
  - No background (transparent)
  - Solid
  - Gradient
  - Image URL
- Export formats
  - PNG (default 2x density, optional 1x/3x)
  - SVG
- Font loader via URL (`woff2/woff/ttf`)

## Project Structure

- `index.html` - App layout and controls
- `styles.css` - UI styling and responsive layout
- `app.js` - Parsing, rendering, state handling, and export logic

## Run Locally

No build step required.

1. Clone/download this repo.
2. Open `index.html` in a modern browser.


## Usage

1. Paste a valid Markdown table in the editor.
2. Configure canvas size or enable **Fit to canvas**.
3. Style the table in Essential / Advanced / Expert sections.
4. Export as PNG or SVG.

## Notes and Limitations

- Input must be a Markdown table (header + separator row required).
- For remote assets (background images/fonts), CORS rules apply.
- During export, the app attempts to inline external assets. If blocked by CORS, those assets may be skipped and a message is shown.
- For best text fidelity, ensure fonts are loaded before export.

## License

MIT