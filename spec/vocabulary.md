# Vocabulary

Glossary of terms used in this project's specs and demo. Kept in sync with `sunburst-map.md`, `animation.md`, `staging.md`, and the demo code.

## Animation

### pre-stage phase
The first half of a navigation transition on a drill-in (`p ∈ [0, 0.5]`). During pre-stage, non-target sectors (siblings, intermediate ancestors) fade by opacity from `1 → 0` (`lerp(1, 0, p/0.5)`), and the center circle transitions (fill opacity, border). **No geometry change** — spans and rings stay at their old-layout values. The target subtree stays at its old span at full opacity. Progress within the pre-stage is `pPre = p / 0.5` (raw, not eased by `easeInOut`; the parent Motion tween provides overall easing). For back navigation the phases swap: morph runs first (`p: 1 → 0.5`), then post-stage (`p: 0.5 → 0`). See `animation.md` §"Three-stage choreography".

### morph phase (animation stage)
The second half of a navigation transition (`p ∈ (0.5, 1]`). Geometry morphs — the target subtree moves as a continuous group: the child wedge grows `old → 360°`, non-target sectors shrink to 0 span, descendants slide inward by `depth · pMorph` rings. **No internal rotation** — the target subtree's angular center stays fixed. Non-target sectors are already invisible (opacity 0 from pre-stage). Progress within the morph is `pMorph = easeInOut(pMorphRaw)` where `pMorphRaw = max(0, (p − 0.5) / 0.5)`. See `animation.md` §"Three-stage choreography".

### post-stage phase
The phase after the morph on a back navigation (`p ∈ [0.5, 0]` in reverse timeline). Non-target sectors (siblings, intermediate ancestors) that were hidden during the drill-in fade back in — opacity `0 → 1` (`lerp(0, 1, 1 − p/0.5)`). This is the reverse of the pre-stage fade-out, restoring the old context. See `animation.md` §"Three-stage choreography".

### pPre
Pre-stage progress: `pPre = min(1, p / 0.5)`. Goes `0 → 1` during pre-stage, stays at `1` during morph. Used for opacity fades (siblings, intermediate ancestors, center circle).

### pMorph
Morph progress: `pMorph = easeInOut(pMorphRaw)` where `pMorphRaw = max(0, (p − 0.5) / 0.5)`. `0` during pre-stage, `0 → 1` during morph (eased). Used for geometry interpolation (spans, rings, angular positions).

### pAnim
Raw overall progress `p`. Used in multi-level formulas (e.g. `depth · pAnim` for the radial slide). Synonym for `p`; not eased per-phase. See `animation.md` §"Multi-level transitions".

### fixed child center (no internal rotation)
The child's angular center `childCenter = oldChildStart + oldChildSpan / 2` stays stationary throughout the animation. The child expands symmetrically around this center; siblings are proportionally packed into the remaining angular space. **No drifting toward 180°** — the target subtree does not rotate. The SVG `<g>` rotation is a viewport alignment, not a morph-geometry rotation. See `animation.md` §"Ring 1 — fixed child center".

### angular offset
`norm(childCenter − 180)` where `childCenter` is the navigation target's angular center in the parent view. The rotation applied as an SVG `transform` on the `<g>` wrapping all sectors. This is a **viewport-only** convenience — it aligns the morph's fixed-center end state (where the target subtree stayed at its pre-navigation angular position) with the 0°-based static post-navigation layout. The morph's internal geometry does NOT rotate; the SVG rotation bridges the coordinate gap. During the morph phase it interpolates `lerpAngle(oldOffset, newOffset, tMorph)`; during the static pre-stage/post-stage it is frozen at the endpoint value (a static frame does not visibly rotate). See `animation.md` §"Post-navigation angular continuity".

### zero-level sector (center circle)
The center circle is treated as a sector at ring 0, span 360°, emitted by `morphLayout` with `isCenter: true`. Its fill/hue/opacity transition independently of the geometric morph. See `animation.md` §"Center circle during navigation".

### sort morph
A second animation class, used only by the Sunburst MVP widget's "Sort by size" toggle. It interpolates between the name-sorted and size-sorted layouts of the same root: both place the same sectors with the same spans/rings, so each sector's start angle rotates along the shortest arc (`lerpAngle`) while everything else stays constant. Unlike the navigation morph it is **not** partition-preserving — sectors may transiently cross. See `animation.md` §"Sort morph".

## Layout

### θ_min (display threshold)
`2°` (binding). Items whose sector span is below this fold into the "smaller objects" bucket. See `staging.md` §"Implementation constants".

### smaller objects bucket
A virtual `smaller` node aggregating sub-`θ_min` items at a given level. Rendered as one sector, last in its ring, at reduced opacity. See `sunburst-map.md` §4.

### frozen hue
A folder's `_hue`, computed once on first placement as a sector (ring ≥ 1) from its angular center: `norm(start + span/2)`. Never recomputed during navigation or animation. See `sunburst-map.md` §5.

### partition invariant
At every animation frame, the rendered sectors tile the map without gaps or overlaps: within each angular region rings are radially contiguous, within each radial band sectors are angularly contiguous. See `animation.md` §"Per-frame layout".

## Debugging

### live mode
The map's default display mode: the rendered tree is `layout(current)` — the folder in the breadcrumb. The only exceptions are a running navigation animation (which commits `current` on completion) and preview mode. See `staging.md` §"DialTimeline".

### preview mode
A dev-only debugging view: while the DialTimeline transport is active (scrubbed or playing) and no real animation is running, the map renders the morph of the current (parent, child) pair at the scrubbed `p` instead of `layout(current)`. Always signalled by a "Preview" badge and a dimmed breadcrumb; any navigation request exits it. See `staging.md` §"DialTimeline".

## Article

### affordance badge
A one-time "Play with me" pill overlay shown on interactive article widgets (widgets that accept a click or a control change) until the reader's first interaction: a click anywhere in the widget, a control change, or keyboard focus entering a control. Article-only — never rendered in the Embeds gallery. See `staging-article.md` §"Widget affordance badge".

### played state
The stored per-widget flag (`localStorage` key `sunburst:article:played:{type}:{index}`) recording that a widget's affordance badge was already dismissed. Written synchronously on the first interaction; clearing site storage resets all played states.

### breadcrumb
The path from the root folder to the current folder, shown above the map as a chain of names — ancestors clickable, the current folder the non-clickable last item. In the article sunburst widget it is opt-in (`breadcrumb: true`); clicking an ancestor navigates to it, morphing when `animateNavigation` is on and hard-cutting when off. The demo mode's breadcrumb uses the same component. See `other-widgets/sunburst.md` and `staging.md` §"DialTimeline".

### widget controls
The article's inline controls (sliders, selects, toggles). Implemented as unstyled Base UI primitives (`Slider`, `Select`, `Switch`) wrapped once in `demo/src/widget-controls.jsx` (`WidgetSlider`, `WidgetSelect`, `WidgetToggle`) and shared by every article widget and the Embeds gallery. All styling lives in `article.css` under the `.widget-slider-*` / `.widget-select*` / `.widget-switch` selectors. See `staging-article.md` §"Widget controls".