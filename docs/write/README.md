# Web UI

The app runs directly from static files on GitHub Pages. It uses HTML, CSS, and
plain JavaScript; there is no build step or external runtime dependency.

## Layers

| File | Responsibility |
| --- | --- |
| `tokens.css` | Semantic colors, typography, spacing, dimensions, radii, shadows, motion, and responsive token overrides. |
| `components.css` | Shared buttons, icons, inputs, control groups, segmented controls, separators, popover surfaces, menu items, and optional check indicators. |
| `components.js` | `Popover`, `SelectMenu`, and composable menu-item factories: toggling, exclusive opening, outside dismissal, focus, keyboard navigation, typeahead, selection, and viewport placement. |
| `styles.css` | App layout and editor geometry; visual values reference tokens. |
| `app.js` | Notes, local storage, timer state, import/export, and wiring app actions into components. |
| `editor-model.js` | Text transactions and timestamp metadata, independent of UI. |

## Controls

Use `ui-button`, `ui-input`, `ui-icon`, and the shared control modifiers for new
controls. Add visual values to `tokens.css` and refer to them with CSS variables.
Keep app-specific arrangement in `styles.css`.

Every dropdown uses a full-width `ui-dropdown-trigger`, a `ui-popover` surface,
and the shared `Popover` controller. Single-value selections use `SelectMenu`
instead of native `<select>` elements. `SelectMenu` composes `Popover` with plain
items from `createMenuItem`. Timestamp precision adds an optional leading
`createCheckIndicator` to the same item component. Document choices have no
checkboxes. Both share selected, hover, focus, and disabled states through
`setMenuItemSelected` and the same color tokens.

Menu choices support arrow keys, Home/End, typing a label, Enter/Space, and
Escape. Repeated trigger clicks and outside clicks dismiss the menu. Opening
another popover closes the previous one. Timer duration uses the same popover
surface with normal form keyboard behavior.

When changing shell files, update their versioned URLs in `index.html` and
`sw.js`, then increment the service-worker cache name so offline installs receive
the same components and tokens.
