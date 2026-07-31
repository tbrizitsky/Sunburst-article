# Navigation Animation — Specification

This spec defines the **navigation animation** in detail. It implements the navigation defined in `sunburst-map.md` §10 and is built in `staging.md` Stage 5. The semantic behavior (what navigation *means*) stays in `sunburst-map.md`; this file covers *how it animates*.

> **Single source of truth.** This file is the **single source of truth for the demo's animation**. If any other document disagrees with this file about the demo's animation, this file wins.

## Model

A transition animates between two layouts of the same tree:

- **Old layout** — laid out from the **current folder** (the parent for a drill-in; the child for a back).
- **New layout** — laid out from the **target folder** (the clicked child for a drill-in; the parent for a back).

A single transition is parameterized by **progress `p ∈ [0,1]`**:

- `p = 0` → old layout (parent view), reproduced **exactly**.
- `p = 1` → new layout (child view), reproduced **exactly**.
- **Drill-in** plays `p: 0 → 1` (zoom *into* the clicked child).
- **Back** plays `p: 1 → 0` (the same interpolation run in reverse — zoom *out*).

Raw overall progress `p` is also referred to as `pAnim` in multi-level and any-to-any formulas below.

The transition is defined by the pair `(parent, child)` where `child` may be a **deep descendant** of `parent` (not just a direct child). When `child` is `depth` levels below `parent`, the entire ancestor chain expands simultaneously in a single fluid movement — no chain of single-level legs.

## Per-frame layout (partition-preserving zoom morph)

At every progress `p` the rendered sectors tile the map **without gaps or overlaps**: within each angular region the rings are radially contiguous, and within each radial band the sectors are angularly contiguous. These **hard invariants** hold at every frame:

1. **No petal without a visible parent** — a sector is rendered only if its parent (the ring inward, or the center for ring-1) is visible.
2. **No sector covers/crosses another** — no two rendered sectors overlap (radially *and* angularly) at any frame.
3. **Endpoints are exact** — `p = 0` reproduces the old layout and `p = 1` reproduces the new layout, sector for sector (geometry and opacity).

### Three-stage choreography

The animation is split into three conceptual stages that share the two timeline halves (`p ∈ [0, 0.5]` and `p ∈ (0.5, 1]`):

- **Pre-stage** (`p ∈ [0, 0.5]`): non-target sectors fade by opacity from `1 → 0` (`lerp(1, 0, p/0.5)`). **No geometry change** — spans and rings stay at their old-layout values. The target subtree stays at full opacity. The screen appears static except irrelevant content fading away.
- **Animation (morph)** (`p ∈ (0.5, 1]`): non-target sectors are already invisible (opacity 0). The target subtree moves as a continuous group — the child wedge grows `old → 360°`, non-target sectors shrink to 0 span, descendants slide inward by `depth · pMorph` (where `pMorph = easeInOut((p − 0.5) / 0.5)`). **The target subtree does not rotate** — its angular center stays fixed throughout.
- **Post-stage** (back only): after the morph on a back navigation, hidden sectors fade back in — the reverse of the pre-stage fade-out.

For **drill-in**: pre-stage runs first (`p = 0 → 0.5`), then the animation morph (`p = 0.5 → 1`). For **back**: the animation morph runs first (`p` reverses from `1 → 0.5`), then the post-stage fades content back in (`p` goes `0.5 → 0`).

This three-stage model preserves the hard invariants (partition, no overlap) because:
- During pre-stage, spans are unchanged (sector boundaries don't move), so the old-layout partition is preserved by definition.
- During the morph phase, non-target sectors are invisible (opacity 0) and their spans shrink proportionally — child span + sibling spans = 360° just as in the single-phase model. The only difference is non-target sectors are not visible during their span change. Endpoints are exact (p = 0 reproduces old layout, p = 1 reproduces new layout).

> **Note:** The `pMorph = 0` boundary at `p = 0.5` separates the pre-stage from the morph. This means `p = 0.5` is a **static frame** identical to the old layout except non-target sectors are fully transparent — no ongoing morph at the midpoint. The overall progress `p` is still eased by Motion (the parent tween), so the pre-stage eases in and the morph phase eases in/out, creating smooth acceleration across the boundary.

### Ring 1 — fixed child center, proportional sibling packing

Ring-1 keeps the **old clockwise order** — `[free (root only), real children sorted by size]` — but instead of a directional anchor rotation, the child's **angular center** is **fixed** at its old-layout position: `childCenter = oldChildStart + oldChildSpan / 2`. The child expands **symmetrically** around this fixed center. Siblings are **proportionally packed** into the remaining angular space, preserving the old clockwise order without rigid rotation of the whole ring.

Concretely, at progress `p`:
1. `childSpan = lerp(oldChildSpan, 360, easeInOut(p))`
2. `childStart = childCenter − childSpan / 2`, `childEnd = childStart + childSpan`
3. The child occupies `[childStart, childEnd)`.
4. The remaining angular region `[childEnd, childStart)` (the complement, spanning `360° − childSpan`) is filled by siblings in the old clockwise order, each with span `rawOld · (1 − easeInOut(p))` — this is **proportional packing**: the whole non-child space shrinks linearly toward 0 while preserving each sibling's relative share.
5. After-child items (clockwise from the child) are placed first from `childEnd`; before-child items follow, wrapping to `childStart`.

This keeps the child's angular center **stationary** throughout the animation. The child grows outward in both directions simultaneously; siblings flow around it, compressing proportionally. The partition invariant holds at every frame (`childSpan + sum(siblingSpans) = 360°`).

> **Post-navigation angular continuity.** At `p = 1` the child wedge spans 360° centered on `childCenter`, so the child's subtree starts at `childCenter − 180°`. The static post-navigation layout (`layout(child)`) starts children at 0° (per `staging.md`). To avoid a rotation flick at animation end, **both the static and morph views apply the rotation as an SVG `transform="rotate(offset 400 400)"`** on the wrapping `<g>` — not by baking the offset into sector starts. The `p ≥ 0.999` shortcut (which returns `layout(child)` for byte-exact endpoint matching) returns **un-rotated** sector starts; the SVG rotation handles the visual alignment.
>
> The rotation follows the **same phase structure** as the geometry — **frozen during pre-stage** (`p ∈ [0, 0.5]`, `rotateAngle = oldOffset`), then **interpolated during the morph** (`p ∈ (0.5, 1]`) using the same `pMorph` timing as the geometry's angular expansion and ring sliding. Both the SVG rotation and `morphLayout`'s internal anchor unwind use `pMorph` timing: `anchorCenter = lerpAngle(childCenter, 180, pMorph)` and `rotateAngle = lerpAngle(newOffset, oldOffset, pMorph)`. Pre-stage is therefore a **pure opacity phase with no visual movement** — no sector rotates, drifts, or shifts. At `p = 0.5` the morph begins with `pMorph = easeInOut(0) = 0` (zero derivative), so there is no velocity discontinuity at the phase boundary despite the frozen→rotating transition. Keeping the rotation/anchor unwind on the same clock as the geometry (`pMorph`) eliminates the viewport drift that arises in multi-level (`depth > 1`) morphs, where the deepest descendant's center lerps from its old position toward `anchorCenter` using `pMorph` timing — a different curve from `easeInOut(p)` would cause a CW-then-CCW drift visible in the 50–70% progress range. The SVG rotation bridges the coordinate gap between the morph's fixed-center end state and the 0°-based static layout.
>
> **No internal rotation.** The target subtree does not rotate during the animation. Its angular center (`childCenter`) remains stationary throughout the morph: the child expands symmetrically around its fixed center with no drifting toward 180°. The SVG `<g>` rotation is a viewport alignment, not a morph-geometry rotation — it rotates all sectors uniformly and is not reflected in the morph's per-sector angular positions.

- The **child** is a **rendered sector** at its packed position:
  - **span** — grows `old → 360°` (`lerp(rawOld, 360, p)`), where `rawOld = childSize/parentSize · 360`.
  - **ring** — slides inward `1 → 1 − depth · e(p)`. For `depth = 1` (direct child), this is `1 → 0` as before. For `depth > 1`, the child slides further (e.g., `depth = 4`: `1 → −3`). **Not rendered** at `ring ≤ 0` (the center circle covers ring 0).
  - **opacity** — eases from `1` to `CENTER_OPACITY` (currently `0`) as the child slides toward ring 0; at `p = 1` the sector is suppressed and the center circle (a zero-level fully-wrapped sector) takes over, which is also at opacity `0` — the center is invisible at rest and only pulses briefly during the morph.
- The **siblings** (free + real non-child) are sectors at **ring 1** packed proportionally as above, with spans `rawOld · (1 − e(p))`, at **full opacity** (they vanish by shrinking, not fading; the renderer drops sub-0.2° slivers).

The `θ_min` consolidation is **applied throughout the animation** (`emitBucket = smallerObjects`, always on): sub-threshold items fold into the "smaller objects" bucket at every frame. Sibling buckets fade out with their siblings during pre-stage (`op → 0` by p=0.5, invisible during morph); child-subtree buckets persist at `op=1` throughout the morph, sliding inward and growing with the expanding child wedge. The all-small rule (`if (big.length === 0) return`) is enforced always — all-small folders never show a children ring. At the shortcut endpoint the bucket matches `layout(child)` exactly. This eliminates the pre-stage/morph boundary flick where child-subtree buckets at `op=1` would vanish when bucket emission toggled off.

### Child's subtree (inside the child wedge)

The child's descendants fill the growing child wedge:

- **ring** — a descendant at old ring `d` renders at ring `d − depth · e(p)`: with `depth = 1`, the child's children `2 → 1`, grandchildren `3 → 2`. With `depth = 4`, the child's children `5 → 1`, grandchildren `6 → 2`. Sectors at `ring ≤ 0` are **not rendered** (the center circle covers ring 0). At `p = 1` every descendant is at its new-layout ring, matching the static relayout — no snap.
- **span** — proportional to the parent's current span: `size/parentNodeSize · parentSpan(p)`. This telescopes down the subtree: at `p = 0` it matches the old layout at every depth; at `p = 1` the new layout.
- **placement** — cumulative (contiguous) within the child wedge, in size-sorted order, "smaller objects" bucket last.
- **θ_min consolidation** — membership is anchored to the **end layout**: a child whose end span (`size/childSize · 360°`) is ≥ θ_min is an individual sector throughout the morph; a child below θ_min in the end layout stays in the "smaller objects" bucket throughout. Sectors that were folded into the old bucket (or folded away by the all-small rule) but are big in the end layout are **migrating**: they grow out of the bucket from span 0 at their sorted position (`span = size/parentNodeSize · parentSpan(p) · pMorph`), while the bucket keeps their not-yet-grown share (`× (1 − pMorph)`) — the partition holds at every p, the p = 0 frame matches the old layout exactly, and there are no bucket↔sector swaps mid-flight.
- **opacity** — `1` for sectors individually rendered in the old layout. Sectors not individually rendered in the old layout — **deep descendants** beyond max-ring (within it in the new layout), sub-θ_min items, and content of all-small-folded rings — **fade in** (`opacity = pMorph`) instead of popping in. The same applies to a bucket whose ring was folded away in the old view; a bucket that existed in the old view stays at `1`. Nodes deeper than `oldRing > MAX_RING + depth` are not rendered.

### Sibling subtrees (old-only)

A sibling's descendants slide inward by `depth · p` (same as the branch) and shrink with their parent:

- **ring** — a descendant at old ring `d` renders at ring `d − depth · e(p)` (universal radial slide by depth). At `p = 1` siblings have `0` span so they are invisible regardless of ring.

- **span** — `lerp(rawOld, 0, easeInOut(p))`, where `rawOld = size/parentSize · 360` (this telescopes: it matches the old-layout span at every depth).
- **placement** — cumulative within the parent sector's current span, so a sibling's subtree shrinks as one contiguous block.
- **θ_min consolidation** — applied throughout the animation (`emitBucket = smallerObjects`, always on): sub-threshold items fold into the "smaller objects" bucket at every frame.
- **opacity** — `1` (shrink-only, like ring-1 siblings).

### Nodes beyond max-ring in both layouts

Not rendered.

### Render order

Order does not affect correctness (sectors never overlap), but child-subtree sectors are drawn after sibling sectors so the expanding child is on top.

## Geometry

- A **fractional ring** (interpolated) maps to radii via the cumulative ring-boundary table, so a sector crossing the large/small tier boundary interpolates its radii correctly.
- Gaps are inset as in the static view (between rings and between sibling sectors).
- The center circle is rendered at full radius throughout; sectors at `ring ≤ 0` are withheld (the center covers that zone). The center's fill and opacity interpolate independently per "Center circle during animation" below.

## Timing & easing

- **Duration**: `DURATION_MS = 500` ms (base duration, ±250 ms per phase).
- **Speed**: a `slowAnimation` toggle controls playback speed: off = `0.5×` (default), on = `0.1×`. Effective duration = `DURATION_MS / animationSpeed`.
- **Easing**: asymmetric curve `[0.25, 0, 0.55, 1]` for the outer Motion tween — starts fast in response to user click, then decelerates smoothly. The morph phase applies `easeInOutQuad` internally (`pMorph = easeInOut(pMorphRaw)`) for geometric interpolation; the pre-stage opacity fade uses the raw `pPre = p / 0.5`. The outer asymmetric curve makes the pre-stage fade-out feel responsive while the morph phase lands gently.
- **Deterministic**: the same `(parent, child)` transition always animates identically — the animation is driven by progress `p` (a pure function of elapsed time), not by real-time variance.

### Implementation (binding for the demo)

Progress `p` is driven by **Motion** (`animate(p0, p1, transition)` from the `motion` package), not a manual rAF tick. The transition is the **binding** tween — `{type:'tween', ease: [0.25, 0, 0.55, 1]}` (asymmetric, starts fast) and `duration = DURATION_MS / animationSpeed`. The speed toggle (`slowAnimation`) is exposed in the DialKit panel (default off = 0.5×).

Hard invariant: the rendered `p` is **clamped to `[0,1]`** before `morphLayout` consumes it. The morph is only defined for `p ∈ [0,1]` (`ring = d − depth · pMorph` would go `<1` past `p=1`); the clamp protects geometry regardless of the driver.

## Center circle during navigation

The center fill is invisible at rest (`CENTER_OPACITY = 0` — the static binding). During navigation it stays invisible throughout — no pulse phase:

- **fill hue**: during the morph, the hue interpolates from parent to child via `lerpAngle` when both have a hue; when the parent is root (no hue), the child's hue is used directly.
- **fillOpacity**: `0` at all phases — pre-stage, morph, and post-stage. The center circle never appears during animation.
- **stroke (border)**: **pre-stage phase** transition: the root's grey border (`ROOT_CENTER_BORDER`) fades out (`strokeOpacity: 1 → 0, lerp(1, 0, pPre)`) when drilling from root; absent when the parent is non-root. Hidden during the morph phase. On back, fades in during the back's pre-stage phase.
- **pointer events**: always `all`, with `cursor: pointer` — clicking the center triggers back-navigation at any point during the animation.

### Center hover pulse (static view)

In the static view (no animation running), the center circle pulses on hover the same way sectors do (see "Hover pulse" above). The cosine-wave hover pulse is applied to fillOpacity, oscillating from `0` (rest) up to `HOVER_OPACITY_DIP` (peak) and back, matching the same `pulseDuration` as sectors. This provides visual feedback that the center is interactive (clicking navigates back to the parent folder).

## Color during animation

- **Hues are frozen** (`sunburst-map.md` §5): never recomputed during the animation. Folder fills keep their frozen `_hue`; files and smaller objects stay grey; free space stays transparent.
- The **child** (becoming the center) renders at full opacity as a sector; the center circle handles the final muted state independently.
- The **center circle** is animated separately (see "Center circle during animation" above).
- Free space exists only at the disk root and shrinks away with the other ring-1 siblings when drilling in from root.

## Hover pulse

When the cursor enters a sector, a **continuous pulse** oscillates the sector's fill opacity with a sine wave, period **`pulseDuration` ms** (default 500, DialKit-exposed). The pulse modulates the hover dip:

- `pulseFactor(t) = (1 + cos(2π · t / pulseDuration)) / 2` where `t` is time elapsed since hover start. This oscillates from `0` (default opacity, `cos = 1`) to `1` (fully dipped, `cos = −1`).
- Effective hover dip at any moment = `hoverOpacityDip · pulseFactor(t)`.
- The pulse is driven by `requestAnimationFrame` not CSS transitions — CSS `transition` on `fill-opacity` is suppressed while the pulse is active.

The pulse is **suppressed during navigation animation** (including the pre-stage phase). When an animation starts, any active pulse stops immediately (the rAF loop is cancelled and the hover dip resets to 0). The pulse resumes after the animation completes, provided the cursor is still on the sector.

If the sector is not being hovered when clicked, the drill fires immediately.

## Interaction during animation

- **Clicks** (drill-in / back) are **accepted during a running animation** and **queued** (latest-wins, queue depth 1): a new click replaces any previously queued navigation. The current animation always **runs to completion**; the queued navigation starts immediately after the current one settles.
- **Hover hints** and the **hover pulse** are suppressed during a running animation (including the pre-stage phase). Hover events are ignored while an animation is active.

## Edge cases

- **Root**: back is a no-op (no parent). Drill-in from root animates the center circle — the grey border fades out and the child's hue fades in.
- **Empty folder** drilled into: animates to a center with empty rings.
- **Very deep drill**: descendants beyond max-ring fade in/out as they cross the max-ring boundary.
- **Single child** occupying 360°: the child wedge grows from its old span to 360°; its descendants slide inward.
- **All-small folder** (children below θ_min): no children ring is rendered; the center transitions to the new hue.

## Multi-level transitions

Clicking a folder sector that is a **deep descendant** (not a direct child) of the current folder animates as a **single fluid movement** — not a chain of single-level legs. The ancestor chain from the current folder to the clicked folder expands simultaneously in a telescoping cascade. The radial slide shifts by `depth · pAnim` (where `depth` is the number of levels between them), so at `p = 1` every node is at its new-layout ring.

### Telescoping angular expansion

At each level of the ancestor chain, the path-child (the ancestor on the path to the clicked folder) expands to fill its parent's current span, while its siblings shrink to 0. This cascades from ring 1 downward:

- Ring 1: `chain[0]` (the direct child of the parent on the path) expands `old → 360°`. Siblings shrink.
- Ring 2: `chain[1]` expands to fill `chain[0]`'s current span. `chain[1]`'s siblings shrink.
- Ring `k`: `chain[k-1]` expands to fill `chain[k-2]`'s current span. Etc.

The deepest descendant's angular center is **fixed** throughout — all ancestors recenter around it.

### Intermediate ancestor opacity

Intermediate ancestors (chain nodes except the final child) fade out during the pre-stage phase, same as siblings — `opacity = lerp(1, 0, pPre)`. They are invisible by `p = 0.5` and remain suppressed throughout the morph. The final child (the clicked folder) fades to `CENTER_OPACITY` (currently `0`) as it slides to ring 0; the center circle (zero-level sector) is also at opacity `0` throughout navigation — the hover pulse (see "Center hover pulse" above) is the only time the center becomes visible.

## Any-to-any transitions

Breadcrumb navigation between two folders that are **not** in an ancestor-descendant relationship (e.g., programmatic/replay navigation from Devices to Applications) is decomposed into **at most two** of the transitions above, through their **common ancestor**:

1. **Back-out** from `from` to the common ancestor — `morphLayout(common, from, 1 − p)` (a multi-level back, as in §"Multi-level transitions").
2. **Drill-in** from the common ancestor to `to` — `morphLayout(common, to, p)` (a multi-level drill).

The two legs are played **sequentially**: leg 1 runs to completion (settling at the common ancestor), then leg 2 starts immediately from there. Each leg is the single-fluid-movement multi-level morph described above — never a chain of single-level legs. The common ancestor is the only intermediate state shown; for sibling folders it is the root (a full zoom-out, then zoom-in).

There is **no separate any-to-any morph**. Reusing the drill/back morph means every hard invariant (partition, no overlap, endpoints exact) and the rotation-continuity rule (§"Post-navigation angular continuity") applies to each leg unchanged — the first leg's `newOffset` becomes the second leg's `oldOffset`, so the rotation stays continuous across the whole transition. No wedge blend, no angular remap, no independent rotation model is needed.

**Hard requirement**: transitions from/to any folder on the map use this two-leg drill/back composition (or a single leg when one folder is an ancestor of the other) — never a hard cut or a separate any-to-any frame model.

**Opt-out (article embeds only)**: the article sunburst widget accepts an `animateNavigation` tunable (default true; see `other-widgets/sunburst.md`). When set false, navigation does a hard cut — the target folder becomes current immediately, no morph — so an embed can demonstrate the "no transition" experience. This is an explicit per-embed opt-out, not a map behavior: the primary map and the binding invariants above are unchanged, and `animateNavigation` defaults to true everywhere.

## Sort morph (Sunburst MVP widget)

A second, smaller animation class used **only** by the Sunburst MVP widget's "Sort by size" toggle (see `other-widgets/sunburst-mvp.md`). It animates a **re-ordering** of sectors at a fixed root — unlike the navigation morph above, which re-roots the map. Its scope is deliberately narrow: the animated sort exists only for the MVP toggle. The DialKit `sorting` select and any `<sunburst>` widget `sorting` control remain **hard cuts** (no animation).

### Model

- **Source layout** — `layout(root, { sorting: "name" })`, the toggle's off state.
- **Target layout** — `layout(root, { sorting: "size" })`, the toggle's on state.
- Both layouts place the **same set of sectors** with the **same spans and rings**: sorting is order-only, so it changes nothing but each sibling's **start angle**.
- A single progress `p ∈ [0, 1]` is driven by Motion with the binding tween (`ease: EASE`, `duration: DURATION_MS`, no `slowAnimation` multiplier). `p = 0` reproduces the name layout exactly; `p = 1` reproduces the size layout exactly.
- Each sector's start angle is `lerpAngle(nameStart, sizeStart, p)` — the **shortest arc** between its two slots. Spans, rings, radii, and colors are constant across the morph.
- The root's free-space sector stays anchored at 180° (bottom) throughout; the map's SVG is **not** group-rotated (no `angularOffset`).

### Hard invariants

1. **Identity continuity** — every sector present in either layout stays a single continuous element; no sector pops in or out (the placed sets are identical, since sorting is order-only).
2. **Endpoint exactness** — `p = 0` ≡ `layout(root, { sorting: "name" })` and `p = 1` ≡ `layout(root, { sorting: "size" })`, sector for sector.
3. **Determinism** — the same toggle flip always animates identically.
4. **Crossing allowed** — this animation class **deliberately relaxes** the navigation morph's "no two sectors overlap at any frame" invariant (hard invariant 2 above). Re-ordering a ring is a permutation: adjacent sectors must pass each other at some frame. Crossings are transient and the endpoints are exact.

### Timing & interruptibility

- Same binding timing as navigation: `DURATION_MS = 500` ms and `EASE = [0.25, 0, 0.55, 1]`. No `slowAnimation` multiplier.
- **Interruptible**: flipping the toggle mid-flight retargets the tween from the current `p` to the new endpoint (0 or 1). There is no queue.
- `prefers-reduced-motion` → hard cut (jump straight to the target layout).

### Colors

Hues are frozen (`sunburst-map.md` §5). If the sort morph is ever rendered with a hue-coloring mode, a sector's frozen `_hue` **travels with the sector** as it re-sorts — sorting never changes a sector's color. The MVP renders `coloring: none`, so all sectors are grey regardless.
