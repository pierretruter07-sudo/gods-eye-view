# UI layout map

One map decides where every on-screen panel goes, so panels never sit on top
of each other. The code is `src/shell/layout.js` (the map and the rules) and
the "Screen map" section at the end of `src/ui/styles/shell.css`.

## Zones

```
┌──────────────────────────── top bar ────────────────────────────┐
│             │   band (descent checklist, when on)    │          │
│ left column │            title (asset name)          │ right    │
│             │                                        │ column   │
│ triage      │                                        │ sheets   │
│ layers      │              clear centre              │ drawer   │
│ descent     │            (the asset itself)          │ alert    │
│ checklist   │                                        │ exercise │
│ asset cards │                                        │ package  │
│ (tl, bl)    │                                        │ asset    │
│             │                                        │ cards    │
│             │         button bar (actions)           │ (tr, br) │
├─────────────┴──────────── caption ─────────────────────┴──────────┤
│ credits (Cesium / Esri / Google, always visible)                 │
└──────────────────────────────────────────────────────────────────┘
```

| Zone | What lives there |
|---|---|
| Top bar | The bar with mode, search, Layers, Triage, Director and Audit |
| Band | The opening-descent checklist: a slim strip directly under the top bar that pushes everything below it down |
| Title | The focused asset's name and status, the Exercise banner, toasts |
| Left column | Triage, Layers, the asset view's left cards |
| Right column | The analyst-sheet drawer, the Director's alert card, the exercise package, the asset view's right cards |
| Button bar | The focused asset's actions (at the foot of the asset view) |
| Caption | The Director's spoken line, directly above the credits |
| Credits | Map and data credits, bottom-left, always visible. The provider terms require them. |
| Centre | Modal cards: the welcome card and the loading screen |

## Who gives way

Each side column has one owner at a time. Highest priority first:

- **Left:** Triage, then Layers, then the asset cards.
- **Right:** the sheets drawer, then the alert card, then the asset cards.

A panel that loses its column hides until the column is free again. Panels
you opened yourself always beat the Director's own panels.

- **No asset card is ever hidden on screens wider than 900 px.** The descent
  checklist takes the band, not a column. When the drawer opens, the asset
  view shrinks to the space beside it, all four cards stack in its left
  column (which scrolls if needed), and the button bar wraps instead of
  running underneath. The camera's "Expand view" drawer is wide, about half
  the screen.
- **The caption and the asset view** stack: the credits strip is reserved at the
  very bottom, the caption sits on it, and the asset view (with its button bar)
  ends above the caption.
- **On tablets and phones (≤ 900 px wide),** the drawer drops from the top, the
  asset cards wait while it is open, and the descent checklist becomes a row
  of numbered dots (≤ 760 px).

## Stacking order

Lowest first: globe and world labels, then credits, the asset view, panels,
the drawer, the top bar and caption, toasts, and finally modals. The values
are published as `--z-*` CSS variables from `LAYERS` in `layout.js`.

## Keeping it this way

- **A new fixed panel must be added to `OVERLAYS` in `layout.js`.** The unit
  test `src/shell/layout.test.mjs` fails if any `position: fixed` rule in the
  style sheets is missing from the map.
- **Panels position themselves only from the published variables** (`--gev-top`,
  `--gev-bottom`, `--gev-credits-h`, `--gev-caption-h`, `--gev-header-h`) and
  the column owners (`body[data-gev-left]`, `body[data-gev-right]`). They
  never position against another panel.
- **The overlap check runs before every UI review.** It renders the app at six
  screen sizes in about fourteen states (welcome, idle, layers, triage, asset
  cards, cards with drawer, camera, Director with caption, descent with
  drawer, alert, Exercise, AUDIT). It measures every visible panel, fails on
  any overlap or panel off screen, and produces a contact sheet of
  screenshots.
