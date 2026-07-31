# Sunburst Map — Specification

This spec defines the **semantics** of the Sunburst Map and the demo that implements it: what the map means and what the demo does.

Terms used in this spec are defined in `vocabulary.md`.

## 1. Overview

A Sunburst Map is a radial, space-filling visualization of a hierarchical (tree-structured) data set. 

The map is a set of concentric rings. The **root of the displayed tree** (the disk) is the center; its direct children occupy the first ring around it as sectors sized proportionally to their disk usage; each child's own children fill the next ring within the parent's angular span, and so on outward.

The user can hover a sector to see a hint with the object's name and size, and navigate by drilling into folders and going back up. See §10.

## 2. Data model

The demo visualizes a tree of nodes. Each node has:

- `name` — display label.
- `size` — in bytes. For a folder, this is the sum of its children's sizes. For a file, its own size.
- `type` — one of:
  - `file` — a leaf node (a single file).
  - `folder` — a node with children.
  - `free` — a single special node at the disk root representing unused disk space. Never appears inside folders.
  - `smaller` — a virtual node computed per level during layout (see §4), aggregating items too small to render individually. Not part of the source data.
- `children` — present only for folders.

Source data is a plain JS object (the synthetic disk image) — see §3.

## 3. Sample data

The demo ships with a single embedded synthetic file-system tree representing a disk ("Macintosh HD") with:

- A root folder containing several top-level folders and a few loose files.
- Multiple levels of nesting under some folders, mixing folders and files.
- A realistic size distribution: a few large items, many small ones (so the "smaller objects" bucket is exercised).
- A `free` node at the root with a sizable free-space value.

Exact folder/file names and sizes are the implementer's choice as long as the structure above is satisfied.

## 4. Layout

### Rings
- The root of the displayed tree is the center. Each depth level below it is one concentric ring, outward.
- Rings come in two tiers: **large rings** (the primary rings, closer to the center) and **small rings** (thinner rings farther out, for visualizing deeper levels). Both tiers use a fixed ring width; small rings are thinner than large rings.
- The number of large rings and small rings are parameters of the map. In principle there is no limit to the number of rings; in practice the count is capped at the configured large + small totals. Defaults are 5 large + 5 small.
- Each ring is divided into sectors, one per child of the corresponding level.
- Both files and folders are rendered as sectors. Only folders have sub-sectors in the next ring (files are leaves).
- A sector's angular span is proportional to its node's `size` relative to its parent's `size`.
- Children divide their parent's angular span proportionally, recursively.
- Large and small rings are identical except in geometry (ring width and inter-ring gaps). Color, hover, and sector layout rules apply equally to both.

### Sorting
- Within each parent, children are sorted by **size, largest first** (the map's default).
- Sorting is a **tunable**: `size` (default) or `name` (case-insensitive alphabetical). The sort order only changes the angular **order** of children — it never changes spans, rings, colors, or which sectors are placed.
- The **"smaller objects"** bucket (see below) is always placed **last** in its ring.
- An **animated** re-sort exists only in the Sunburst MVP widget (`other-widgets/sunburst-mvp.md`, `animation.md` §"Sort morph"). Everywhere else, changing the sort order is a hard cut.

### Free space
- At the disk root only, the `free` node is rendered as a distinct, fully transparent sector, visually separating it from real items.
- Folders below the root have no `free` sector.

### "Smaller objects"
- At each level, items whose sector would be too small to be individually useful are consolidated into a single `smaller` bucket for that level.
- `smaller.size` = the sum of the consolidated items' sizes.
- `smaller` is rendered as one sector in that ring, **last** in the ring (see Sorting).
- **All-small rule**: if a folder's children consolidate to *only* a `smaller` bucket (every child below the display threshold), the children ring is **not rendered** — the folder shows no sub-sectors.
- The size threshold is an implementation choice.

### Max depth
- In principle the number of rings is unlimited. In practice the map renders up to the configured number of large rings plus the configured number of small rings (default center + 5 large + 5 small = 11 visible levels). Levels deeper than the outermost small ring are not shown.

### Coordinate convention
- Angles are measured clockwise from 12 o'clock. The start angle for the first sector is an implementation choice.

### Gaps
- Adjacent rings and adjacent sibling sectors are visually separated by gaps. Gap width is an implementation choice and may differ between the large-ring and small-ring regions.

## 5. Color

Color conveys the *kind* of object, so different object types are visually distinct.

- **Folders**: hue-coded by the angular position of their sector; sibling folders generally differ in hue. This encodes position, not size.
- **Files**: rendered with a **neutral, non-hue** appearance, distinct from folders, so they are not mistaken for folders.
- **Smaller objects**: rendered with a **muted, non-hue** appearance, more transparent than files, so they read as a consolidated bucket and are not mistaken for folders.
- **Center**: shows the **current folder's** (frozen) hue; invisible at rest (`CENTER_OPACITY = 0`), pulses on hover only. The **root** has no hue (it is never a sector), so the **root center is fully transparent** with a tiny grey inner border.
- **Free space**: fully transparent (it is not an object).

Specific tones, opacities, the center border, and hue/S/L values are visual details — see `staging.md` (Visual appearance).

## 6. Interactions

- **Hover** a sector: a hint is shown displaying the object's `name` and `size`.

Hint styling and sector highlight behavior are implementation choices.

## 7. Edge cases

- **Empty folder**: renders as a sector with no sub-sectors in the next ring.
- **Single child**: occupies the full 360° of its ring.
- **Zero-size items**: excluded from layout.
- **Free space only at root**.
- **Very deep tree**: levels beyond the outermost small ring are not rendered (see §4).

### ViewBox
- The SVG viewBox auto-tightens to the dataset's maximum tree depth (clamped to the configured ring count). Empty outer rings beyond the deepest rendered content are not included in the viewBox, so the map doesn't waste space around its perimeter.
- A small 4px margin is added around the outermost rendered ring to prevent visual clipping from stroke widths and anti-aliasing.
- The viewBox is computed once from the full dataset's depth so it stays stable across navigations — drilling in/out never changes the SVG aspect ratio.

## 8. Demo app

- **Scope**: a single-page web app that renders the map as inline SVG, served over a local dev server during development.
- **Composition**: the map alone.
- **Sample data**: embedded as a JS object (see §3).
- **Viewport**: desktop.

Framework, build tooling, file structure, and styling are implementation choices — see `staging.md`.

## 9. Out of scope (this version)

The following are intentionally excluded from this version of the spec and demo, though they may be added later: labels on sectors and sidebar. They are introduced progressively per `staging.md`.

## 10. Navigation

Navigation lets the user change the **current folder** — the folder shown at the center, whose descendants fill the rings. Initially the current folder is the disk root.

### Triggers
- **Click a folder sector** → drill into that folder; it becomes the current folder. Clicking any visible folder (direct child or descendant) animates smoothly — no hard cuts.
- **Click the center** → go up to the current folder's parent (the enclosing folder).
- **At the root**, clicking the center does nothing (no parent).
- **Click a file sector** → no navigation (files are not drillable).
- Sidebar rows (when present, Stage 4) drill into the corresponding folder.

### Re-layout on navigation
- When the current folder changes, the map re-renders from the new current folder's perspective: it spans 360°, its direct children fill ring 1 (proportional, size-sorted, smaller-objects last), and so on outward.
- **Free space exists only at the disk root**; drilled-in folders have no free-space sector.
- Ring structure, sorting, and "smaller objects" rules are unchanged.

### Color on navigation
- **Hues are frozen at the initial full-disk build** (per §5): a folder keeps its hue at every navigation level — drilling in does not recompute colors.
- **Center** shows the **current folder's** (frozen) hue; invisible at rest (`CENTER_OPACITY = 0`), pulses on hover only. At the root (no hue) it stays fully transparent with its grey border.
- Files stay grey; smaller objects stay grey + transparent.

### Animation
- Navigation transitions are animated per `animation.md` (the dedicated animation spec): a drill-in zooms into the clicked sector; back reverses it; hues stay frozen; deterministic; no sector overlap at any frame. A center circle is rendered throughout the animation (as a zero-level sector), interpolating hue and opacity so the root center fades out smoothly (not popping). Clicking any folder (direct child or deep descendant) animates as a single fluid movement — no chain of legs, no hard cuts. Breadcrumb navigation between non-ancestor folders uses a quadratic blend through the common ancestor. Built in Stage 5 (`staging.md`).

### Edge cases
- **Root**: center click is a no-op.
- **Empty folder**: drills in to a center with empty rings.
- **Drilling into a file**: not allowed (no-op).
- **Very deep drill**: still bounded by max ring depth; deeper levels collapse as usual.

### History (optional, future)
- A history stack may add **Back** (previously-viewed folder) and **Forward** (re-enter). The first version is drill-in + up only.
