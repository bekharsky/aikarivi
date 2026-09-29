# Web app

The browser editor is a local-first React application. Vite builds its static
files into `docs/write/` for GitHub Pages. React, Radix UI primitives and Lucide
icons are bundled locally; runtime code and assets do not come from a CDN.

## Development

```sh
npm ci
npm test
npm run test:unit
npm run build
```

## Structure

- `src/app/` composes the document, timer and editor features.
- `src/components/ui/` contains the shared button, segmented control, select,
  popover and surface primitives. Radix provides keyboard and dismissal
  behavior for menus; feature components compose those primitives.
- `src/features/` contains the document and timer toolbars.
- `src/core/` owns browser-local documents, Markdown import/export and time
  formatting.
- `src/timer/` owns timer calculations and state.
- `src/editor/` owns the textarea interaction and paragraph/time transaction
  model. Its pure model has a separate Node test suite.
- `src/styles/tokens.css` defines the palette, spacing, type and layout tokens;
  shared UI styles are in `components.css`, with workspace composition in
  `app.css`.
- `sw-template.js` is compiled into a versioned offline shell during the build.

Notes remain in this browser's local storage under the existing
`aikarivi.web.v1` key. Exported Markdown is a portable copy; it is not used as
the live editing store.
