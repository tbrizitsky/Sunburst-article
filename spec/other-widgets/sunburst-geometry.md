# Sunburst Geometry — Specification

A widget for demonstrating configurable ring geometry (ring count, growth rate, two-tier small-ring mode), rendered via `<sunburst-geometry>` in the article and as a card in the Embeds gallery.

## 1. Overview

The geometry widget lets readers experiment with three ring parameters to understand how ring count and width affect the sunburst's appearance and space usage. It is based on the primary sunburst map but with navigation and hover pulse disabled.

| Aspect | Value |
|--------|-------|
| Dataset | `disk` (fixed, no selector) |
| Sorting | By size (descending) |
| Coloring | `wheel` (hue from angular position) |
| Interactions | None (no hover, no click, no navigation, no pulse) |
| ViewBox | Fixed `0 0 800 800`, center-anchored at (400, 400). Never re-anchors; ring widths render at true scale up to `CARD_RADIUS`, beyond which a uniform `ringScale` shrinks them to fit (bounded zoom-out, no zoom-in) |
| Ring lanes | Thin boundary circle at every ring boundary (`ringLanes=true`) |
| Transition | Animated: growth rate glides and the smaller-rings toggle glides ring widths (modeBlend) while the outer edge stays pinned; ring count pops the new outer ring in place (inner rings don't move) |

## 2. Controls

| Control key | Label | Type | Range | Default | Description |
|-------------|-------|------|-------|---------|-------------|
| `ringLevels` | Ring levels | Slider | 1–15 | 5 | Number of concentric ring levels to render |
| `growthRate` | Growth rate | Slider | 0.3–1.2 | 1.0 | Multiplier for successive ring widths (geometric progression from center outward). Only active when Smaller outer rings is OFF. |
| `smallerRings` | Smaller outer rings | Toggle | — | OFF | When ON: reallocates ring width — each ring's width glides from the geometric progression toward the two-tier configuration (5 large rings at 50px, the rest at 16px) so the larger rings get more room while the outer rings thin out. When OFF: ring widths follow the growth rate. Ring count and the map's outer edge do not change; only radii change. |

The growth rate slider is disabled (visually inert) when Smaller outer rings is ON.

### Interaction: ringLevels × smallerRings

When smallerRings is ON and ringLevels ≤ 5: all levels render as large rings (50px each). Small rings only appear when ringLevels > 5, with the first 5 being large and the remainder small.

### Transition animation

Every control change animates over `GEOMETRY_TWEEN_MS` (200ms, ease-out cubic):

- **Growth rate** changes glide the `ringMultiplier` continuously from its current displayed value to the new one — ring widths morph, never cut.
- **Ring scale** is a pure function of the current widths, not a separately tweened value: `ringScale = min(1, CARD_RADIUS / totalRadius)` recomputed every frame from the live (possibly blended, possibly gliding) ring widths. Because it is derived, the outer edge is *exactly* pinned at `CARD_RADIUS` at every frame while the map overflows — nothing to chase, no transient overflow.
- **Ring count** changes are a structural pop: the new outermost ring appears at full width at the outer edge while the existing rings stay exactly where they are (in geometric/two-tier modes ring widths do not depend on count). Because `ringScale` is derived live, the fit is exact in the same frame — the map instantly re-fits so the outer edge stays at `CARD_RADIUS`. This is the deliberate tradeoff: count changes do not relayout inner rings.
- **Smaller outer rings** toggle glides a `modeBlend` 0→1: each ring's width lerps from its geometric value to its two-tier value over `GEOMETRY_TWEEN_MS`. Since `totalRadius` changes continuously and `ringScale` is derived live, the outer edge stays pinned while the inner (large) rings grow and the outer (small) rings thin out — a space-reallocation, not a zoom and not a re-fit. The growth rate is *not* forced toward 1.0 by the toggle — it keeps its current value (the geometric column still uses it; the two-tier column ignores it) and the slider is only disabled while `smallerRings` is ON.

## 3. Layout / Ring Geometry

Ring widths are computed by `ringTable()` in `layout.js`. Two modes, plus a continuous blend between them:

### Geometric mode (smallerRings OFF, default)

Ring 0 (center) is fixed at 50px. Each subsequent ring's width equals the previous ring's width multiplied by `growthRate`:

```
w₀ = 50
w₁ = w₀ × growthRate
w₂ = w₁ × growthRate
...
wₙ = wₙ₋₁ × growthRate
```

At growthRate = 1.0, all rings are 50px wide (uniform). At growthRate < 1.0, rings taper inward (narrower toward the outside). At growthRate > 1.0, rings flare outward (wider toward the outside).

Ring widths are clamped to a minimum of 1px.

### Small-rings mode (smallerRings ON)

Uses the binding two-tier configuration from `ringTable`'s `"small"` mode:

- Rings 1–5 (or fewer if ringLevels < 5): 50px wide
- Remaining rings (6+): 16px wide

### Smaller-rings blend (modeBlend)

`ringTable()` accepts an optional `modeBlend` (0..1) that lerps each ring's width between the geometric and two-tier columns:

```
wᵢ = (1 − modeBlend) × wᵢ^geometric + modeBlend × wᵢ^two-tier
```

`modeBlend = 0` reproduces the geometric column exactly; `modeBlend = 1` reproduces the two-tier column exactly; intermediate values are per-ring linear interpolations. `grow`/`shrink` modes ignore `modeBlend`. The smaller-rings toggle drives `modeBlend` 0↔1 over `GEOMETRY_TWEEN_MS`, so ring count stays constant and every ring's radius glides continuously — the reallocation story: larger rings widen, outer rings thin out.

### Hybrid fit (ringScale)

Ring widths are absolute (computed above) and render at true scale in a fixed, center-anchored viewBox (`0 0 800 800`, center at 400,400). To avoid overflowing the card at high ring counts / high growth rates, a single uniform scale factor is applied to **all** ring widths:

```
ringScale = min(1, CARD_RADIUS / totalRadius)
```

where `totalRadius` is the sum of all ring widths (center + ringLevels rings) and `CARD_RADIUS` is a binding constant (see §"Binding values"). When the map fits (ringScale = 1), rings render at absolute width — no zoom-in ever. When it would overflow, ringScale < 1 shrinks every ring equally so the outermost ring sits at `CARD_RADIUS`. This is bounded zoom-out, not normalization: widths keep their true proportions, and small maps stay small (centered) rather than being stretched to fill.

`ringScale` is passed to `ringTable()` via opts. It is derived live from the current (gliding/blended) total radius — never tweened separately — so the outer edge is pinned at `CARD_RADIUS` at every frame (see §2).

### Bounding box

Fixed `0 0 800 800`, center-anchored at (400,400) — the disk center never moves, so control changes never re-anchor the map. (The primary widget's `widgetNaturalSize()` tight-fit is *not* used here; its sector-bbox centering drifts when ring count changes, which is the jarring "excessive zoom" this model eliminates.)

## 4. Ring lanes

Thin concentric circles drawn at **every ring boundary** (each ring's outer radius), above the sectors. Their purpose: make the ring count legible at a glance — more rings = more boundary circles — and show how the growth rate stretches the spacing between boundaries.

| Binding | Value | Meaning |
|---------|-------|---------|
| `RING_LANE_WIDTH` | 1.0 | Stroke width (px) of each boundary circle |
| `RING_LANE_OPACITY` | 0.25 | Stroke opacity (subtle, doesn't fight the sectors) |
| Lane color | Theme grey (`GREY` dark / `GREY_LIGHT` light) | Matches the file-grey convention |

Lanes are drawn at the outer radius of every ring, from the center outward (`bounds[1..]`, including the outermost edge), and are `pointer-events: none`. They are enabled only by the `ringLanes` tunable — the primary map and other widgets never show them.

## 5. Color

Same `wheel` coloring as the main sunburst — hue from angular position, frozen on first placement. No other coloring modes are exposed.

Files render achromatically (grey, via `filesSpecial=true`) matching the main sunburst convention.

## 6. Interactions

- **Hover**: disabled (no tooltip, no pulse)
- **Click**: disabled (no navigation)
- **Center pulse**: disabled

The widget renders `SunburstMap` with `interactions=false` and a no-op `onNavigate`. Unlike the sunburst-playground (which enables hover tooltips via `interactions="tooltips"`), this widget is fully read-only.

## 7. Dataset

Uses the same `disk` dataset from `sample-data.js`. A fresh clone is created for each layout to avoid mutating the original.

## 8. Article Usage

Three instances in the "Going deeper" section, each demonstrating one dimension of ring geometry. Each embeds fixed defaults via directive attributes (`ringLevels`, `growthRate`, `smallerRings` are optional attribute defaults parsed by `parseInlineTagAttributes` — `"5"` → `5`, `"false"` → `false`) and exposes a single control, so the prose narrative and the interactive demo stay aligned.

1. After the Stasko/Filelight paragraph (`article.md` line 135): uniform rings at growth rate 1, count is the only variable.

```html
<sunburst-geometry controls="[ringLevels]" growthRate="1" smallerRings="false" caption="Drag the ring count to see how more rings eat up space" />
```

2. After the "weight reduction" paragraph (line 141): five rings, growth rate is the only variable — the reader can try the taper idea.

```html
<sunburst-geometry controls="[growthRate]" ringLevels="5" smallerRings="false" caption="Try the 'weight reduction' idea: taper the ring widths from the center outward with the growth rate" />
```

3. After the 10-level two-tier paragraph (line 145): ten rings at growth rate 1, the smaller-rings toggle is the only variable — the reader can switch between the geometric progression and the two-tier 5-large/5-small configuration to see the space-reallocation: the outer edge stays put while the five large rings gain room and the five thin rings appear.

```html
<sunburst-geometry controls="[smallerRings]" ringLevels="10" growthRate="1" caption="Toggle smaller rings: all ten rings stay, but the outer five thin out so the inner five gain room" />
```

## 9. Demo App (Embeds gallery)

- **Placement**: Inside the "Embeds" tab, alongside Treemap, Icicle, Stasko, Sunburst MVP, Sunburst Hue, and Sunburst Playground widgets
- **Controls**: All three controls exposed: `ringLevels`, `growthRate`, `smallerRings`
- **Directive**: `{ controls: ["ringLevels", "growthRate", "smallerRings"], caption: "Sunburst Geometry" }`

## 10. Edge Cases

- ringLevels = 1: single center ring only (50px). Small map, centered, at absolute width (ringScale = 1) — no zoom-in to fill the card.
- growthRate = 0.3 with 15 rings: outer rings rapidly shrink below 1px minimum. The map shows mostly constant-width rings (clamped). The reader can discover the minimum-width floor.
- growthRate = 1.2 (slider max) with 15 rings: outer rings become extremely thick. Total radius exceeds `CARD_RADIUS`, so ringScale < 1 shrinks every ring uniformly to fit — the map stays centered and in-card, and the lanes show how the outer rings dominate.
- smallerRings ON with ringLevels = 3: 3 large rings, no small rings (the small tier never activates).
- smallerRings ON with ringLevels = 10: 5 large + 5 small rings (the binding default).
- Switching smallerRings ON when growthRate was at an extreme: the toggle glides widths toward the two-tier binding, so the final state is purely two-tier (the growth rate has no visible effect while fully ON) and the transition passes continuously through intermediate widths. The growth rate itself is untouched.
- Ring count change: the new outermost ring pops in at full width; inner rings do not move (widths are count-independent). `ringScale` is derived live, so the map re-fits in the same frame with no transient overflow.

## 11. Binding Values

New binding constants introduced by this widget:

| Constant | Value | Location | Conformance |
|----------|-------|----------|-------------|
| `CARD_RADIUS` | 360 | `layout.js` | `tests/spec/conformance.test.js` |
| `RING_LANE_WIDTH` | 1.0 | `layout.js` | `tests/spec/conformance.test.js` |
| `RING_LANE_OPACITY` | 0.25 | `layout.js` | `tests/spec/conformance.test.js` |
| `GEOMETRY_TWEEN_MS` | 200 | `layout.js` | `tests/spec/conformance.test.js` |

## 12. Out of Scope

- Navigation, breadcrumb, up/drill buttons
- Dataset switching
- Coloring mode selection (always `wheel`)
- File/smaller-objects toggles (always files ON, smaller-objects ON)
- Full-morph ring-count animation (new rings pop in; only scale/rate glide — see §2)
