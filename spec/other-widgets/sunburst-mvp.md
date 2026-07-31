# Sunburst MVP — Specification

A minimal, single-purpose sunburst widget for demonstrating the effect of **sort order** on the map's readability. Rendered via `<sunburst-mvp>` in the article and as the "Sunburst MVP" card in the Embeds gallery.

## 1. Overview

The MVP is the simplest possible interactive sunburst: a static, read-only map — folders only, no files, no smaller-objects bucket, no hover, no navigation — whose **only** control is a "Sort by size" toggle. Off by default: children render sorted **by name**. Flipping the toggle animates every level into **size-descending** order. Nothing else about the map changes.

| Aspect | Value |
|--------|-------|
| Dataset | `disk` (fixed, no selector) |
| Max rings | 5 (`small` mode) |
| Default sorting | By name (case-insensitive alphabetical) |
| Files | Hidden (`filesSpecial: false`) — folders only |
| Smaller objects | Disabled (`smallerObjects: false`) |
| Display threshold | `θ_min = 0` — every folder renders individually |
| Coloring | `none` (monochromatic grey) |
| Interactions | None — no hover, no tooltip, no click, no navigation, no pulse |
| Controls | "Sort by size" toggle only |

## 2. Controls

| Control | Label | Type | Description |
|---------|-------|------|-------------|
| `sortBySize` | Sort by size | Toggle | Off (default): children sorted by name. On: children sorted by size, largest first. |

The toggle is **always rendered** — it is the widget's entire point. It is not gated by a `controls` directive list.

## 3. Layout

Same ring geometry as the main sunburst (`ringMode: small`, `maxRings: 5`, `CENTER_WIDTH`, etc. — see `staging.md` §"Implementation constants"). Because sorting does not change sizes, the name-sorted and size-sorted layouts place the **same sectors with the same spans and rings**; only each sector's start angle differs. The root's free-space sector stays anchored at 180° (bottom) in both layouts and throughout the animation.

## 4. Color

`coloring: none` — all folders render in the same monochromatic grey (`NONE_COLOR`). Sorting never changes a sector's color; if the sort morph is ever rendered with a hue-coloring mode, frozen hues travel with their sectors (see `animation.md` §"Sort morph").

## 5. The sort morph

Flipping the toggle animates the re-ordering per `animation.md` §"Sort morph". In short:

- All levels re-sort **simultaneously** in one global tween.
- Each sector rotates along the **shortest arc** to its size-sorted (or name-sorted) slot; neighbors may **transiently cross** — a deliberate exception to the navigation morph's no-overlap invariant.
- Progress `p` (0 = name layout, 1 = size layout) is driven by Motion with the binding tween (`EASE`, `DURATION_MS`).
- **Interruptible**: flipping mid-flight retargets the tween from the current progress.
- `prefers-reduced-motion`: hard cut (jump straight to the target layout).

## 6. Interactions

None beyond the toggle. There is no hover tooltip, no hover pulse, no click drilling, no center navigation, no breadcrumb. The map is read-only; the toggle is the only thing the reader can do.

## 7. Article usage

Inserted in `article.md` §"Building a frame" as a single widget replacing the two static name-vs-size comparison widgets:

```html
<sunburst-mvp caption="a sunburst, sorted by name — flip the toggle to sort by size" />
```

The surrounding prose invites the reader to flip the toggle. Because the MVP renders `coloring: none`, it does not promise colors here; the color story is told by the `<sunburst-hue>` widgets further down.

## 8. Demo app (Embeds gallery)

- **Placement**: the "Sunburst MVP" card, alongside Treemap, Icicle, Original Stasko, Sunburst with color ring, Sunburst Playground, and Sunburst Geometry.
- **Directive**: `{ data: "disk", caption: "Sunburst MVP" }`.

## 9. Edge cases

- **Already size-sorted under name order**: the two layouts coincide; the animation has nothing to move.
- **Rapid toggling**: the tween retargets from the current progress; nothing queues.
- **Free space**: stays anchored at 180° (bottom) throughout the animation.

## 10. Out of scope

- Navigation (drill-in, back, breadcrumb), hover, pulse, tooltips.
- Dataset switching, file visibility, smaller-objects aggregation, display threshold, coloring, ring geometry tuning.
- Animated sorting outside this widget: the DialKit `sorting` select and any `<sunburst>` widget `sorting` control remain hard cuts.
