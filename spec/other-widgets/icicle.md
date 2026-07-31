# Icicle widget (article embed & gallery)

## `<icicle>` directive

The `<icicle>` tag embeds an icicle (partition layout) visualization in the widget column (same slot as sunburst and treemap maps, scroll-activated). The body follows the same key/value format as `<sunburst>`.

Common fields (`data`, `controls`, `locked`, `caption`) behave the same as the `<sunburst>` directive (see [`sunburst.md`](sunburst.md)). Icicle-specific fields, tunables, and morph behavior are documented below.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `data` | string | no | Dataset name: `disk` (default) or `workstation`. |
| `controls` | list | no | Whitelist of icicle tunable names to expose as inline controls (same semantics as `<sunburst>`'s `controls`). |
| `locked` | map | no | Icicle tunables to pin (not exposed). |
| `caption` | string | no | Caption rendered between the embed and its controls. |

### Tunable names

| Name | Type | Default | Description |
|---|---|---|---|
| `coloring` | select: `wheel`, `size`, `lastUpdated`, `none` | `wheel` | Color encoding. |
| `colorModel` | select: `hsl`, `oklch` | `hsl` | Color model (ignored in `wheel` mode). |
| `morph` | slider (0–1) | 0 | **Sunburst** slider. 0 = pure sunburst, 1 = pure icicle. (Internal interpolation direction: 0 = icicle → 1 = sunburst; the slider displays the inverse so that 0 reads as sunburst.) The slider is flanked by two static labels — "Sunburst" (initial value, left) and "Icicle" (target value, right) — rendered identically; there is no numeric readout. Intermediate values interpolate cell geometry via radius-offset polar projection with per-sibling-group position blend. |
| `visibilityThreshold` | slider (0–10) | 0 | Minimum cell width in percent. Cells below are dropped. |

### Example

```markdown
The partition layout:

<icicle>
data: disk
controls:
  - coloring
  - morph
locked:
  coloring: wheel
caption: "Icicle (partition) layout — root at top, children below, width proportional to size."
</icicle>
```

### Morph behavior

The widget always renders an SVG morph component (`IcicleSunburstMorph`) that transitions between a cartesian icicle projection and a real sunburst layout. The morph uses **radius-offset polar interpolation**: the visible angle grows from a narrow sliver (θ_min = 0.2°) to the full 360°, with a corresponding radius offset C that projects the sliver into a near-rectangular icicle row at `morph = 0` and collapses to the true sunburst ring geometry at `morph = 1`. Within each parent's rendered range, each child's angular position blends between cursor-order packing (icicle endpoint: children packed contiguously from the parent's left edge in traversal order) and angular-order placement (sunburst endpoint: children at their static layout positions). Angular targets are **seam-unwrapped** per sibling group so that every sibling interpolates the same rigid rotation — the group slides as a unit, preserving pairwise contiguity at every frame.

**Hard invariant — no overlap:** at every morph value the rendered cells tile the map without overlaps. Within each ring the sectors are angularly contiguous; within each angular region the rings are radially contiguous. **Gaps:** the radial gap is the sunburst's `RADIAL_GAP` binding value, constant across the whole morph (the radial dimension is pixel-scaled at both endpoints, so rows separate exactly like the sunburst's rings at every morph value). The angular gap is the sunburst's `ANGLE_GAP` scaled by the visible-angle fraction — `ANGLE_GAP · visibleAngle/360` — so it is exactly `ANGLE_GAP` at the sunburst end (internal `morph = 1`, slider value 0, where `visibleAngle = 360°`) and shrinks proportionally toward the icicle end. It never reaches zero there because an absolute-degree gap would overflow the θ_min = 0.2° sliver and collapse every cell to zero width; the proportional form keeps cells visible while separating them at all sizes. Gaps are produced by insetting each sector by half the gap on each angular side and each radial side. The no-overlap invariant holds at every frame because the inset is symmetric and applied uniformly.

The morph affects **geometry only** — coloring, color model, and visibility threshold stay shared and active throughout the transition. At the icicle endpoint (slider value 1), cells form an icicle-like cartesian layout where each ring becomes a row of uniform height, width proportional to angular span. At the sunburst endpoint (slider value 0), cells form the real sunburst layout with proper ring geometry (proportional ring widths, existing gaps, the center circle, free space, and the smaller-objects bucket). The "smaller objects" bucket, free space, and gaps are part of the layout at both endpoints — they are not suppressed, and their cells morph alongside regular nodes.

**Slider presentation.** The slider is flanked by two static labels: **"Sunburst"** on the left (the initial value — slider 0 = sunburst, the default, so the article opens showing a sunburst) and **"Icicle"** on the right (the target value — slider 1 = icicle). Both labels are rendered identically (same `widget-control-label` class). The labels never change with the slider position; there is no numeric readout and no state badge.

## Gallery

### Data

Same tree structure as the sunburst (`demo/src/sample-data.js`). Nodes carry `{ name, type, size, children, mtime }`. Dataset selector switches between `disk` (default) and `workstation`.

### Layout algorithm

A single fixed layout — no algorithm selector. The root occupies the full width at the top. Each depth level occupies a horizontal band of equal height (`1 / maxDepth + 1`). Within each band children are placed left-to-right, width proportional to their size within the parent. Children sorted by size descending.

### Coloring

Same scheme as the treemap (see [`treemap.md`](treemap.md) §"Gallery — Coloring").

### Rendering

Each cell is an absolutely-positioned HTML `<div>` with a flat `hsl(...)` fill and a 1px uniform border (same theme-dependent values as treemap).

### Tunables

| Name | Type | Default | Description |
|---|---|---|---|
| `morph` | slider (0–1) | 0 | Sunburst slider. 0 = pure sunburst, 1 = pure icicle. Flanked by identical "Sunburst" / "Icicle" endpoint labels; no numeric readout. |
| `coloring` | select: `wheel`, `size`, `lastUpdated`, `none` | `wheel` | Color encoding. |
| `colorModel` | select: `hsl`, `oklch` | `hsl` | Color model (ignored in `wheel` mode). |
| `visibilityThreshold` | slider (0–10) | 0 | Minimum cell width in percent. Cells below are dropped. |
| `dataset` | select: `disk`, `workstation` | `disk` | Dataset. (Gallery-only; article directives use the `data` field.) |

### Interaction

- **Hover:** tooltip with node name + formatted size.
- Read-only (no navigation/drill-in).
