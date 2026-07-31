# Sunburst Hue — Specification

This spec defines a **sunburst widget with a surrounding HSL hue color ring** used as an educational visual aid in the article (see `article.md` §"Long time ago …") and as an embed card in the Embeds gallery.

## 1. Overview

The Sunburst Hue widget displays a **folder-only sunburst map** (wheel coloring, size sorting, ring modes — files, smaller-objects, and free space are hidden, leaving gaps) alongside a **static HSL color wheel** that rings the outside of the sunburst. The color ring shows how each folder sector's angular position maps to a hue in the HSL spectrum (red at 0°, green at 120°, blue at 240°, etc.). The ring uses the same saturation and lightness values as the map's folder fills, so each sector's color visually matches the ring at its angular position.

**Key properties:**

| Aspect | Value |
|--------|-------|
| Max rings | 5 (uniform, following the `small` ring mode) |
| Interactions | Pointer line — thin red line on hover/click/tap, no drill-in or animation |
| Coloring | `wheel` (hue from angular position, frozen on first placement) |
| Sorting | By size (descending) |
| Controls | Hue offset slider (0–360°), Color model selector (HSL / okLCH), Hue ring toggle, Depth S/L toggle — gated by `controls` directive field |
| Color ring | Full 0–360° HSL hue spectrum, 12px thick, immediately outside the outermost ring, rendered as 60 SVG arc segments (6° each) inside the SVG. Uses the same color formula as the main map's folder fills (`toColorString` with `model: "hsl"`, `df: 1`). |
| Visible sectors | Folders only — files, smaller-objects bucket, and free space are hidden (their angular space becomes gaps) |
| Dataset | Fixed to `disk` |

## 2. Layout

### Sunburst

Layout follows `sunburst-map.md` §4 with `maxRings: 5` and `ringMode: small`:

- Center circle: 50px radius
- Rings 1–5: 50px each (all large, since 5 ≤ LARGE_RINGS)
- Total sunburst radius: 300px from center
- Ring gaps, angular gaps, free-space anchoring: match the main spec

### Color ring

- Gap from outermost ring: **4px**
- Thickness: **12px**
- Inner radius: 304px, outer radius: 316px
- Rendered as **60 SVG arc segments** (6° each), drawn as `<path>` elements inside the SVG, below the sector paths. Each segment covers 6° + 0.2° overlap (0.1° overshoot on each side) to prevent anti-aliasing seams between adjacent segments. The overlap is harmless — the later-drawn segment's color fills the overlap zone, creating a visually continuous ring.
- Each segment is filled with `toColorString(hue, { model: "hsl", df: 1, theme, lightSaturation: 70, lightLightness: 65 })` where `hue` is the segment's midpoint angle. The light-mode overrides are only used when `theme === "light"`.
- Concentric with the sunburst center (CX=400, CY=400)
- The ring is part of the SVG — no CSS overlay, no mask, no conic-gradient

### ViewBox

The SVG viewBox tightly bounds the color ring outer edge with 4px margin, centered at (400, 400):

- Total radius from center: 316px
- ViewBox extent: 640×640 (bounds: `80 80 640 640`)

## 3. Color

### Sunburst sectors

Same as `sunburst-map.md` §5, but **only folder-typed nodes are rendered**. Files, smaller-objects, and free space sectors are hidden (omitted from the DOM), leaving empty gaps at their angular positions. The root center circle is rendered with its transparent fill and `hsl(0, 0%, 55%)` 1.2px stroke.

| Object | Fill |
|--------|------|
| Folder | `toColorString(node._hue, { model: "hsl", df: 1, theme })` — same as the main map's default rendering |
| File | Hidden (gap) |
| Smaller objects | Hidden (gap) |
| Free space | Hidden (gap) |
| Center (root) | Transparent fill, `hsl(0, 0%, 55%)` 1.2px stroke |

Hues are frozen on first placement (the `_hue` field set by `layout()`) as in the main spec.

Sector radii apply `RADIAL_GAP` (1.5px) the same way as the main map: each sector's inner radius is inset by `RADIAL_GAP/2` from the ring boundary (except the innermost ring), and the outer radius is inset by `RADIAL_GAP/2` (except the outermost ring). This creates a 1.5px visual gap between adjacent rings, matching the main sunburst map's appearance.

### Color ring

Full HSL color wheel matching the map's folder saturation and lightness:

- Rendered as **60 SVG `<path>` arc segments** (6° each), inside the SVG
- Each segment at angle h (spanning h − 0.1° to h + 6° + 0.1°) is filled with `toColorString(h + 3, { model: "hsl", df: 1, theme, lightSaturation: 70, lightLightness: 65 })`. The 0.1° overshoot on each side prevents anti-aliasing seams between adjacent segments.
  - Dark mode: `hsl(h+3, 60%, 58%)`
  - Light mode: `hsl(h+3, 70%, 65%)` (via `lightSaturation`/`lightLightness` overrides)
- The `toColorString` function (from `layout.js`) guarantees the same color formula as the main map's folder fills — matching saturation, lightness, and color model
- Segments overlap by 0.2° at each boundary; the later-drawn segment's color fills the overlap zone, creating a visually continuous ring
- 0° is at 12 o'clock, proceeding clockwise — matching the sunburst's angle convention

The color ring acts as a static reference: at angle θ on the map, the ring at θ shows the same hsl(θ, sat%, light%) as the folder at that angle (same saturation and lightness), making the connection between angular position and color visually direct.

## 4. Interactions

### Pointer line

When the user's pointer enters, clicks, or taps a folder sector, a **thin red radial line** is drawn from the sector's outer edge to the color ring's outer edge, rendered on top of all sectors:

- **Start**: `(CX, CY)` — the sunburst center
- **End**: `(CX + ringOuter · sin(θ), CY − ringOuter · cos(θ))`
- **Style**: `stroke="#e00"`, `strokeWidth=1.5`, solid line
- **Z-order**: rendered last in the SVG (on top of all sector paths and the color ring)
- **Visibility**: shown while hovering / after click/tap; hidden on mouse leave or clicking/tapping the SVG background
- **Single line**: only one line at a time (the most recently activated sector)

The pointer line visually connects a sector to its corresponding hue on the color ring. It is purely reactive — no click navigation, no animation, no persistent selection. On touch devices, tapping a sector shows the line; tapping the background hides it.

### Other interactions

**None.** The widget has no click navigation, no animation, no dataset switching. The color ring does not respond to input.

## 5. Controls

The widget supports a `controls` directive field (same pattern as the `<sunburst>` directive) that lists which controls to show. If omitted, all controls are visible.

| Control key | Label | Type | Description |
|-------------|-------|------|-------------|
| `hueOffset` | Hue offset | Range slider (0–360°) | Rotates all hues on both sector fills and the color ring via `(hue + offset) % 360`. Does not modify layout tree `_hue` values. |
| `colorModel` | Color model | Select (HSL / okLCH) | Switches the color space used by `toColorString`. See §10 for details. |
| `showRing` | Hue ring | Toggle | Shows or hides the outer color ring. When off, only the folder sectors and pointer line are visible. |
| `depthSL` | Depth S/L | Toggle | When enabled, saturation and lightness decrease per ring depth (step of 8 per ring) in HSL mode. Only affects HSL rendering; no effect in OKLCH mode. |

### Usage examples

Show only the hue offset slider:
```html
<sunburst-hue controls="[hueOffset]" />
```

Show only the color model selector:
```html
<sunburst-hue controls="[colorModel]" />
```

Show both (default when `controls` is omitted):
```html
<sunburst-hue controls="[hueOffset, colorModel]" />
```

## 6. Dataset

Uses the same `disk` dataset from `sample-data.js`. No dataset selector is exposed.

## 7. Article Usage

Three instances are placed in `article.md`:

1. At line 73, replacing the side note `[side note: display color wheel on top of the map]` — shows only the hue offset slider:

```html
<sunburst-hue controls="[hueOffset]" caption="The color ring maps angular position to hue — each folder's fill matches the ring at its angle" />
```

2. At line 80, after the paragraph comparing HSL and okLCH — shows only the color model selector:

```html
<sunburst-hue controls="[colorModel]" caption="Switch between HSL and okLCH to see how the color space choice affects the map's appearance" />
```

3. At line 84, after the question about varying S and L by depth — shows only the Depth S/L toggle, with the hue ring hidden, in HSL mode:

```html
<sunburst-hue showRing="false" controls="[depthSL]" caption="none" />
```

This instance pairs with the paragraph asking "why aren't we using S and L components for outer rings?" — the reader can toggle depth-based coloring and see why it doesn't improve the visualization.

## 8. Demo App (Embeds gallery)

- **Placement**: Inside the "Embeds" tab, alongside Treemap, Icicle, Stasko, Sunburst MVP, and Sunburst Hue widgets
- **Controls**: All — hue offset slider, color model selector, hue ring toggle, and depth S/L toggle exposed
- **Directive**: `{ data: "disk", controls: ["hueOffset", "colorModel", "showRing", "depthSL"] }`
- Caption: "Sunburst with color ring"

## 9. Edge Cases

- An empty root with no children renders as a single center circle with the full color ring outside
- A single-child folder occupies the full 360° of its ring, and the color ring remains unchanged
- Gaps from hidden sectors (files, smaller objects, free space) show the SVG background; no visible sector paths are rendered in those angular regions

## 10. Color Model Selector

A select control rendered below the map in `.sunburst-widget-controls`, using the shared `.widget-control` styling (a base-ui `Select` — a trigger button opening a styled popup list — via `WidgetSelect` in `demo/src/widget-controls.jsx`). The label reads "Color model."

**Options:**

| Label | `model` value passed to `toColorString` |
|-------|----------------------------------------|
| HSL   | `hsl` (default) — classic HSL color space |
| okLCH | `oklch` — perceptually uniform OKLCH color space |

- Switching the selector updates both the sector fills and the color ring segments in real time.
- The widget stores the selected model as `colorModel` state, initialized from the directive attribute `colorModel` (default `"HSL"`). Example: `<sunburst-hue colorModel="okLCH" />`.
- The `df: 1` (deficiency filter) setting is preserved across both models.
- In HSL mode, light-theme overrides (`lightSaturation: 70`, `lightLightness: 65`) are applied. In OKLCH mode, the default OKLCH light-theme constants from `toColorString` are used.

## 11. Out of Scope

- Click, drill-in, keyboard navigation, or animation
- Dataset switching
- Color ring reacting to changes in coloring mode (always shows the wheel at the map's folder S/L values)
