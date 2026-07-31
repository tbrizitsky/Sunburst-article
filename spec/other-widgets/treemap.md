# Treemap widget (article embed & gallery)

## `<treemap>` directive

The `<treemap>` tag embeds a treemap visualization in the widget column (same slot as sunburst maps, scroll-activated). The body follows the same key/value format as `<sunburst>`.

Common fields (`data`, `controls`, `locked`, `caption`) behave the same as the `<sunburst>` directive (see [`sunburst.md`](sunburst.md)). Treemap-specific fields and tunables are documented below.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `data` | string | no | Dataset name: `disk` (default) or `workstation`. |
| `controls` | list | no | Whitelist of treemap tunable names to expose as inline controls (same semantics as `<sunburst>`'s `controls`). |
| `locked` | map | no | Treemap tunables to pin (not exposed). |
| `caption` | string | no | Caption rendered between the embed and its controls. |

### Tunable names

| Name | Type | Default | Description |
|---|---|---|---|
| `algorithm` | select: `sliceAndDice`, `squarified`, `strip`, `stableSquarified` | `stableSquarified` | Layout algorithm. |
| `cushion` | toggle | `false` | Cushion bevel shading on/off. |
| `coloring` | select: `wheel`, `size`, `lastUpdated`, `none` | `wheel` | Color encoding. |
| `colorModel` | select: `hsl`, `oklch` | `hsl` | Color model (ignored in `wheel` mode). |
| `visibilityThreshold` | slider (0–10) | 0 | Removes children whose `size / parent.size × 100 < threshold` before layout and redistributes freed space to remaining siblings. |

### Example

```markdown
The original treemap:

<treemap>
data: disk
controls:
  - algorithm
  - cushion
  - coloring
locked:
  algorithm: sliceAndDice
  cushion: false
  coloring: wheel
caption: "Slice-and-dice (Shneiderman 1992) — flat fills, categorical color by top-level folder."
</treemap>
```

## Gallery

### Data

Same tree structure as the sunburst (`demo/src/sample-data.js`). Nodes carry `{ name, type, size, children, mtime }`. Dataset selector switches between `disk` (default) and `workstation`.

### Layout algorithm

Selectable. Default: `stableSquarified`.

| Algorithm | Reference | Description |
|---|---|---|
| `sliceAndDice` | Shneiderman 1992 (§3.2) | Alternating subdivision direction per depth level: depth 1 → vertical slices (width split), depth 2 → horizontal (height split), depth 3 → vertical, and so on. Children sorted by size descending; each child receives a proportional slice along the current direction. The original treemap algorithm. |
| `squarified` | Bruls, Huizing, van Wijk 2000 ("Squarified Treemaps") | Greedy aspect-ratio-improving layout. Children sorted by size descending; the row is built incrementally and laid out along the shorter side of the remaining rectangle when adding the next child would worsen the worst aspect ratio. Produces near-square rectangles. |
| `strip` | Shneiderman 2001 ("Ordered Treemap Layouts") | Variant of squarified that preserves order: rectangles are laid out in horizontal strips of fixed height, each strip filled left-to-right with the next batch of children. Stable under updates and preserves ordering better than pure squarified. |
| `stableSquarified` | Squarified + row-partition cache (implementation) | Same greedy aspect-ratio-improving partition as `squarified`, but the row partition (which children share a row) is computed once per `(depth, node name, sorted child names)` and cached across re-renders. On subsequent layouts with the same data but a different bounding box, the cached partition is reused — cells stay in the same row and only their dimensions adjust, so the layout is stable under widget re-renders (no shuffling). Default. |

Common: minimum rendered size 2 px in either dimension (below which recursion stops). The `free` space placeholder (`type: "free"`) is excluded from the layout.

### Coloring

Color encodes top-level category membership, not per-node identity — matching the common treemap convention (e.g., Singapore exports, Newsmap, financial treemaps) and GrandPerspective's "by top-level folder" mapping. The 1991 Shneiderman & Johnson paper used categorical color by file type; no named palette is recoverable from the paper, so the default `wheel` palette is GrandPerspective's 8-color set (blue, red, green, cyan, magenta, orange, yellow, purple) assigned round-robin to top-level folders. All descendants inherit the parent's palette color.

| Mode | Description |
|---|---|
| `wheel` | GrandPerspective 8-color palette, round-robin by top-level folder. Always HSL. |
| `size` | Size-ramped hue: `sizeHue(size, maxSize)` (same as sunburst). |
| `lastUpdated` | Mtime-ramped hue: `lastUpdatedHue(mtime, minMtime, maxMtime)` (same as sunburst). |
| `none` | Monochromatic grey. |

Default: `wheel`. In `wheel` mode the color model selector has no effect; in `size`/`lastUpdated` modes it switches between HSL and OKLCH as in the sunburst.

### Rendering

Each rectangle is an absolutely-positioned HTML `<div>`. Two rendering modes, toggled by the `cushion` tunable (default: `false`):

| Mode | Description |
|---|---|
| `cushion: false` (default) | **Flat fill** with a solid `hsl(...)`/`oklch(...)` background. Matches the Shneiderman 1992 paper's flat rectangles + borders. |
| `cushion: true` | **Cushion bevel** (GrandPerspective-style): a `linear-gradient(135deg, ...)` going from light bottom-left (lightness +20%) through the base color (mid) to dark top-right (lightness −20%). |

In both modes the border is a 1px uniform stroke: `rgba(255,255,255,0.2)` in dark mode, `rgba(0,0,0,0.12)` in light mode. Theme-dependent border colors are applied consistently across all depths.

### Tunables

| Name | Type | Default | Description |
|---|---|---|---|
| `algorithm` | select: `sliceAndDice`, `squarified`, `strip`, `stableSquarified` | `stableSquarified` | Layout algorithm. |
| `cushion` | toggle | `false` | Cushion bevel shading on/off. |
| `coloring` | select: `wheel`, `size`, `lastUpdated`, `none` | `wheel` | Color encoding. |
| `colorModel` | select: `hsl`, `oklch` | `hsl` | Color model (ignored in `wheel` mode). |
| `visibilityThreshold` | slider (0–10) | 0 | Removes children whose `size / parent.size × 100 < threshold` before layout and redistributes freed space to remaining siblings. |
| `dataset` | select: `disk`, `workstation` | `disk` | Dataset. (Gallery-only; article directives use the `data` field.) |

### Interaction

- **Hover:** tooltip with node name + formatted size.
- Read-only (no navigation/drill-in).
