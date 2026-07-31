# Sunburst Playground — Specification

A simplified sunburst widget for educational exploration, rendered via `<sunburst-playground>` in the article and as a card in the Embeds gallery.

## 1. Overview

The playground is a stripped-down version of the main sunburst map, designed to let readers experiment with individual features (file visibility, smaller-objects aggregation) without the complexity of full navigation.

| Aspect | Value |
|--------|-------|
| Dataset | `disk` (fixed, no selector) |
| Max rings | 5 |
| Sorting | By size (descending) |
| Coloring | `wheel` (hue from angular position) |
| Interactions | Hover tooltips only — no pulse, no click (read-only map) |
| Show files | Toggle — when on, files render as individual sectors; when off, files are stripped from the tree and folders expand to fill the angular space |
| Smaller objects | Toggle — when on with files enabled, sub-threshold items are aggregated into a bucket sector; when off, all items render individually (hairline) |

## 2. Controls

| Control key | Label | Type | Description |
|-------------|-------|------|-------------|
| `files` | Show files | Toggle | When on: renders all files as individual sectors at their natural angular span. The full disk tree is used and `filesSpecial=true`. When off: file nodes are stripped from a clone of the disk tree before layout — folders expand to fill the angular space that files would have occupied. |
| `smallerObjects` | Aggregate small | Toggle | When on (and files enabled): sub-`θ_min` items are grouped into a smaller-objects bucket sector at reduced opacity. When off: all items render individually (`THETA_MIN=0`, `smallerObjects=false`). Has no visible effect when files are off (no file sectors to aggregate). |

Transitions between states are hard cuts (no smooth animation), following the same rules as the main sunburst's `filesSpecial` toggle.

### Usage example

```html
<sunburst-playground controls="[files, smallerObjects]" caption="Toggle files to see folders expand, and aggregation to compare hairline vs. bucket" />
```

## 3. Layout

Same ring geometry as the main sunburst (`ringMode: small`, `maxRings: 5`):

- Ring 0 (center): 50px radius
- Rings 1–5: 50px each
- Total radius: 300px

When files toggle is off, file nodes are stripped from a cloned tree before `computeSizes` and `layout` run, so the layout algorithm only sees folder nodes. Folders expand to fill the angular range that files previously occupied.

ViewBox is computed via `widgetNaturalSize()` with 4px margin, tightly bounding the rendered sectors.

## 4. Color

Same `wheel` coloring as the main sunburst — hue from angular position, frozen on first placement. No other coloring modes are exposed.

Files render achromatically (grey, via `filesSpecial=true`) when visible, matching the main sunburst convention.

## 5. Interactions

- **Hover**: enabled — hovering a sector (or the center circle) shows a name and size tooltip
- **Click**: disabled — clicking any sector does nothing (no drill morph, no navigation)
- **Pulse**: disabled — no opacity dip on hover

The playground renders `SunburstMap` with `interactions="tooltips"` — a hover-tooltips-only mode (tooltip handlers attached, no pulse, no click navigation) — and a no-op `onNavigate` callback.

## 6. Dataset

Uses the same `disk` dataset from `sample-data.js`. A fresh clone is created on each layout to avoid mutating the original.

## 7. Article Usage

Inserted at `article.md` line 102, after the paragraph about adding hover overlays and before the question about files:

```html
<sunburst-playground controls="[files]" caption="Toggle files on to see them as hairline sectors between folders" />
```

Only the Show files toggle is exposed in the article. The Aggregate small toggle is available in the Embeds gallery.

## 8. Demo App (Embeds gallery)

- **Placement**: Inside the "Embeds" tab, alongside Treemap, Icicle, Stasko, Sunburst MVP, Sunburst Hue, and Sunburst Playground widgets
- **Controls**: Show files toggle and Aggregate small toggle both exposed
- **Directive**: `{ controls: ["files", "smallerObjects"], caption: "Sunburst Playground" }`

## 9. Edge Cases

- Show files toggle on with an empty folders-only tree: no visible change (no files to render)
- Show files toggle off: the map shows only folder sectors, filling the angles that files would have occupied
- Smaller objects toggle with show-files off: no visible effect (no file sectors to aggregate)
- Smaller objects toggle with files on and all files above threshold: no aggregation occurs (bucket is empty)
- Hovering any sector (folder or file) shows its name and size
- Clicking any sector does nothing (read-only map)

## 10. Out of Scope

- Navigation, breadcrumb, up/drill buttons
- Click-to-drill morph (the map is read-only; only hover tooltips are interactive)
- Hover pulse (opacity dip on hover)
- Dataset switching
- Coloring mode selection (always `wheel`)
- Ring geometry tuning (always `small` mode, 5 rings)
- Smooth animation for files/smaller-objects toggles (hard cuts only, matching main sunburst behavior)
