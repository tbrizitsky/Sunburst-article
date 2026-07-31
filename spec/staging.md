# Demo Staging Spec

This spec describes how the **demo** is built in stages toward an end state of a **DaisyDisk-like navigable Sunburst Map** that follows `sunburst-map.md`. It also pins the **demo's implementation-specific values** (tech stack, file layout, constants). It is binding for the demo.

## Three-layer separation

- `sunburst-map.md` — semantic spec: what the map *means* (implementation-agnostic).
- `staging.md` (this file) — demo implementation spec: how the demo is built and which specific values it uses. Binding for the demo.

## Tech stack & project structure

- **Stack**: Vite + React + inline SVG. (React enables React Grab's source-mapped visual debugging; Vite provides the dev server + source maps.) Debug mode is togglable at runtime (see Debug flag below).
- **Files** (in `demo/`):
  - `index.html` — Vite entry.
  - `vite.config.js` — Vite config (React plugin).
  - `src/main.jsx` — React entry; mounts the app wrapped in `<DebugProvider>`; loads React Grab when debug is on.
  - `src/App.jsx` — page composition; uses `useDebug()` to show article-only or full debug UI.
  - `src/debug.js` — debug flag resolution: URL param > localStorage > VITE_DEBUG env var.
  - `src/DebugContext.jsx` — React context, `DebugProvider`, `useDebug` hook, keyboard shortcut toggle.
  - `src/SunburstMap.jsx` — layout + SVG rendering of rings/sectors (per §4–§5) + hover hint.
  - `src/layout.js` — pure layout algorithm (sizes, proportional placement, smaller-objects consolidation).
  - `src/sample-data.js` — the synthetic disk tree (per `sunburst-map.md` §3).
  - `src/styles.css` — styling (design system with CSS custom properties, dark/light mode support).
  - `src/article.css` — article-specific styling (widget controls, prose typography, design system).
  - `package.json` — React + Vite deps; `react-grab` as a devDependency.
- **Run**: `npm install` then `npm run dev` (Vite dev server on `localhost`). React Grab works on the dev server (not `file://`).
- **Viewport**: responsive — ≥1024px two-column (map on left, sidebar on right); <1024px single-column (widgets rendered inline in prose flow).
- **Composition**: map on the left; sidebar on the right (sidebar appears at stage 4; before that, map alone).
- **Principle — prefer math over code**: When implementing a visualization or widget effect (layout, animation, color mapping, geometry), find a simple mathematical formula first. A small formula beats a large switch/if-else chain and is easier to verify, less likely to drift, and trivially framerate-independent. Reach for control flow only when the math can't express the behavior.

| Concern | Value |
|---|---|
| Large rings | 5 (fixed width) |
| Small rings | 5 (fixed width, thinner than large rings) |
| Max visible levels | center + 5 large + 5 small = 11 |
| Max depth | don't render beyond the outermost small ring |
| Coordinate convention | angles clockwise from 12 o'clock |
| Free-space sector (root only) | bisector anchored at 180° (bottom); real root-level items start at 180° + free_span/2 and proceed clockwise |
| Folder start angle (non-root) | items start at 0° (top), clockwise, filling 360° |
| `CENTER_WIDTH` | 50 (px, ring 0 radius) |
| `LARGE_WIDTH` | 50 (px, large ring width) |
| `SMALL_WIDTH` | 16 (px, small ring width) |
| `CX`, `CY` | 400, 400 (viewport center — hard invariant, must never shift) |
| `CENTER_OPACITY` | 0 (invisible at rest; pulses on hover only — see `animation.md` §"Center hover pulse") |
| `ROOT_CENTER_BORDER` | `hsl(0, 0%, 55%)` (root center border color) |
| Display threshold `θ_min` | 2° (below this, items fold into the "smaller objects" bucket) |
| `ANGLE_GAP` | 0.5° (angular gap between sibling sectors) |
| `RADIAL_GAP` | 1.5 px (radial gap between rings) |
| `OKLCH_L` | 0.6 (OKLCH lightness for folder hues, roughly equivalent to `L`=58%) |
| `OKLCH_C` | 0.15 (OKLCH chroma for folder hues, comparable to `S`=60) |
| `EASE` | `[0.25, 0, 0.55, 1]` (asymmetric — fast start, gentle deceleration) |
| Smaller-objects placement | last sector in its ring; if *all* children fold into smaller objects, the children ring is not rendered |
| Sorting | children sorted by size, largest first; smaller-objects bucket always last |
| Ring widths | fixed per tier; exact px chosen during implementation (small < large) |
| Labels (from stage 2) | radial, shown only when sector span ≥ 8° and radial width fits the text; ellipsis truncation |
| Hover hint (from stage 1) | shows the object's `name` and `size` |

## Visual appearance

How each object looks in each state (binding for the demo; tones are tunable). This is the visual counterpart to the semantic color rules in `sunburst-map.md` §5.

| Object | State | Appearance |
|---|---|---|
| Folder | any | hue from its sector center: `hsl((start + span/2) mod 360, 60%, 58%)` (fixed `S = 60%`, `L = 58%`) |
| File | any | neutral grey: `hsl(0, 0%, 50%)` |
| Smaller objects | any | grey at reduced opacity: `hsla(0, 0%, 50%, 0.5)` (more transparent than files) |
| Free space | root only | fully transparent (no fill) |
| Center | root (no hue) | fully transparent + tiny grey inner border: `hsl(0, 0%, 55%)`, ~1.2 px |
| Center | drilled-in (has hue) | invisible at rest (`hsla(hue, 60%, 58%, 0)`); pulses on hover only (cosine wave, peaks at `hoverOpacityDip`) |
| Gaps | between rings & sibling sectors | present; width may differ between large-ring and small-ring regions |

## Stages

### Stage 0 — Scaffold
- **Goal**: project skeleton + synthetic sample data; the page loads.
- **Scope delta**: none (no map yet).
- **Implementation notes**: create the four files; populate `sample-data.js` with a synthetic "Macintosh HD" tree satisfying `sunburst-map.md` §3 (multiple top-level folders, 3–5 levels of nesting, a few large + many small items, a `free` node at root).
- **Verification**: opening `index.html` shows a blank styled page; `sample-data.js` loads and the tree is parseable (e.g. logged to console).

### Stage 1 — Static sunburst + hover hints
- **Goal**: render the full-disk sunburst per the semantic spec; hover shows name + size.
- **Scope delta**: implements `sunburst-map.md` §1–§8 (the current v1 scope). No §9 items enter yet.
- **Implementation notes**: SVG layout — large + small rings, proportional sectors, hue from each sector's center with fixed S/L, free space as a transparent sector at the bottom, "smaller objects" consolidation at `θ_min = 2°` rendered at alpha 0.5, gaps between rings and sibling sectors. Hover hint: a DOM element showing `name` + `size`, shown on sector hover.
- **Verification**: the full disk renders; sectors are proportional; colors follow the hue rule; free space is transparent; smaller objects are muted; hovering any sector shows its name and size.

### Stage 2 — Labels
- **Goal**: identify sectors by name on the map.
- **Scope delta**: brings **labels on sectors** in from `sunburst-map.md` §9.
- **Implementation notes**: labels drawn inside sectors, rotated to follow the arc; shown only when sector span ≥ 8° and the radial width fits the text; truncate long names with an ellipsis.
- **Verification**: large sectors show names; small sectors (below 8°) hide labels; long names truncate with `…`.

### Stage 3 — Drill-in + back
- **Goal**: DaisyDisk-like navigation (per `sunburst-map.md` §10).
- **Scope delta**: brings **navigation** into scope (drill-in + up). Removed from the out-of-scope list (§9).
- **Implementation notes**: maintain a `currentFolder` state (initially the disk root). Click a folder sector → set `currentFolder` to it and re-render (it spans 360°, its children fill ring 1, etc.); click the center → set `currentFolder` to its parent (no-op at root). Hard cut (no animation — animation is stage 5). Re-run layout from `currentFolder`; **free space only at root** (drilled-in folders have no `free` sector). Hues are frozen at first placement as a sector (per §5/§10), so folders keep their color across navigation. The center shows the current folder's (frozen) hue when drilled in (transparent + grey border at root, per Visual appearance). Folders whose children all fold into smaller objects render no children ring (spec §4). Files are not drillable.
- **Verification**: clicking a folder re-centers on it and shows its children; clicking the center returns to the parent; colors stay stable across navigation; clicking a file does nothing; drilling into a folder shows no free-space sector; at root, center click is a no-op.

### Stage 4 — Sidebar
- **Goal**: a sortable current-level list, DaisyDisk-style.
- **Scope delta**: brings **sidebar** in from `sunburst-map.md` §9.
- **Implementation notes**: the sidebar lists the current center's direct children sorted by size descending; each row shows a color dot (matching the sector hue) + name + size + share of the current folder; clicking a folder row drills in (mirrors clicking its sector).
- **Verification**: the sidebar updates on every navigation; rows are sorted by size; color dots match the sectors; clicking a folder row drills in.

### Stage 5 — Navigation animation
- **Goal**: smooth, deterministic navigation transitions, per `animation.md`.
- **Scope delta**: brings **animation** into scope (removed from `sunburst-map.md` §9).
- **Implementation notes**: see `animation.md` for the full model (the partition-preserving zoom morph: the child sector grows to 360° while sliding inward to become the center, descendants slide inward by `depth` rings, siblings shrink in place; multi-level transitions are a single movement, not a chain of legs; any-to-any transitions decompose into a back-out then a drill-in through the common ancestor — no separate any-to-any morph; center circle is a zero-level sector). In the demo: `startAnim` runs a `requestAnimationFrame` loop; `layout.js` provides the helpers (`lerp`, `easeInOut`, `lerpAngle`, `radiusAt`, `morphLayout`, `DURATION_MS`).
- **Verification**: drilling in animates the clicked sector expanding to the center and its children fanning out, siblings fading; back reverses it; colors stay stable; repeating the same navigation animates identically.

## Debug flag

All debugging tools (mode toggle, React Grab, DialKit, DialTimeline, embeds gallery) are gated behind a single **debug flag**. When debug is off, the app renders the article only — no mode switcher, no sunburst demo, no debugging widgets.

**Resolution priority** (first match wins):

1. **URL param**: `?debug=false` or `?debug=true` (bare `?debug` = true)
2. **localStorage**: `sunburst:debug` key set via runtime toggle
3. **Build env**: `VITE_DEBUG` env var (`true`/`1` = on)
4. **Default**: false (debug off)

**Runtime toggle**: `` Ctrl+` `` toggles debug on/off live. The toggle writes to localStorage and triggers a React re-render — the article-only view swaps in/out without a page reload.

**Build-time control**: set `VITE_DEBUG=false` in production builds (or omit it for the default off state). Debug can still be re-enabled at runtime via URL param or localStorage toggle.

**Implementation**: `demo/src/debug.js` exports `getDebug()` (sync read of the resolution chain) and `setDebug()` (writes localStorage). `demo/src/DebugContext.jsx` provides a React context with `useDebug()` hook and the keyboard shortcut handler. `demo/src/main.jsx` wraps the app in `<DebugProvider>` and loads `react-grab` conditionally via `getDebug()` at module level.

## Debugging tools

Debugging tools are wired into the demo for visual debugging during staging. None change `sunburst-map.md` / `animation.md` semantics. They complement each other: **React Grab points** the agent at a UI element that looks wrong; **DialKit tunes** the relevant constant live to see the effect; **DialTimeline scrubs** the navigation transition frame by frame.

### React Grab — "point at this"

[React Grab](https://www.react-grab.com) maps a grabbed UI element to its component + source location (e.g. a sector → `Sector` in `SunburstMap.jsx`).

- **Purpose**: the user selects a UI element in the browser (hover + ⌘C) and optionally types a comment; React Grab copies the element's component + source context, which the agent reads to locate and fix the relevant code. Used for hands-free visual debugging of the sunburst map.
- **Install** (dev-only): `react-grab` is a devDependency in `demo/package.json` (`npm install` installs it with the rest).
- **Wire**: `src/main.jsx` loads React Grab via `if (getDebug()) { import("react-grab") }`. The `getDebug()` call runs at module evaluation time, so react-grab is only imported when the debug flag resolves to true — no runtime toggle can unload it, but it won't load on first paint when debug is off. Activating debug after load requires a page reload to load react-grab.
- **Serve over localhost**: React Grab's runtime requires the Vite dev server's `http` origin (it does not initialize on `file://`). Run `npm run dev` and open the printed `localhost` URL. Convenience script: `npm run grab` runs `react-grab pull --max-age 0`.
- **Agent side**: the agent receives grabs by running `npx react-grab@latest pull --max-age 0` (per the `react-grab` agent skill), acting on each grab's `content` (component + source references) and `prompt` (the user's typed instruction).
- **Scope**: dev-only.

### DialKit — "explore structure"

[DialKit](https://joshpuckett.me/dialkit) is a floating control panel that wires selects / sliders / toggles to the demo's **structural layout** knobs, so ring geometry, sorting, coloring, visibility, and the smaller-objects bucket can be explored live in the browser. (Earlier iterations exposed animation/visual tuning; those have been removed — the panel now focuses on structural exploration. Animation timing is binding, driven by Motion from constants.)

- **Purpose**: explore structural/layout alternatives (ring count, ring sizing model, sort order, coloring, anti-moire threshold, smaller-objects bucket) without re-running `npm run dev`. These **deviate from `sunburst-map.md` §4/§5** when changed — they are explorations, not spec'd behavior.
- **Install** (dev-only): `dialkit` and `motion` are devDependencies in `demo/package.json`.
- **Wire**: `src/DemoMode.jsx` renders `<DialRoot>` and `<DialTimeline>` conditionally on `useDebug()`. `src/SunburstMap.jsx` calls `useDialKit("Sunburst", config)` to register the panel folder. The demo respects the OS dark/light mode preference in real time via `prefers-color-scheme`.
- **Reactivity**: structural tunables flow from `useDialKit` into `layout.js` via the `opts` argument to `layout()` / `morphLayout()` (default `DEFAULT_TUNABLES`, the binding values). Ring geometry is computed by `ringTable(opts)` (radii table + cumulative `bounds`), consumed by `radiusAt(rf, bounds)` and `Sector`. `layout()` output is recomputed via `useMemo` keyed on `maxRings` / `sorting` / `smallerObjects`; the ring table on `maxRings` / `ringMode` / `ringMultiplier`. **Coloring** and the **visibility threshold** are applied render-side (`fillFor` / an items filter).
- **Animation driver**: progress `p` is driven by **Motion** (`animate(p0, p1, transition)`), with a **binding** tween (`ease = [0.25,0,0.55,1]` asymmetric, `duration = DURATION_MS = 500 ms` at 1× speed; effective `= DURATION_MS / animationSpeed`) — **not** DialKit-tunable. `onUpdate` clamps `a.p` to `[0,1]` (the morph is only defined for `p ∈ [0,1]`) and re-renders; `onComplete` commits the target folder.

#### Exposed controls

Controls are organized into logical collapsible groups via DialKit's nested object support. Groups start collapsed by default.

All controls **default to the binding behavior** (the values in `layout.js` / §"Implementation constants"). Overrides are **session-only** — not persisted; reload resets to binding. **Promotion** of a tuned value is manual: use DialKit's JSON export, then update `layout.js` / `staging.md`. This keeps the spec-first rule intact (DialKit never silently changes the binding spec).

**Dataset** (top-level, always visible):

| Control | Type | Default | Options | Effect |
|---|---|---|---|---|
| `dataset` | select | `disk` | `disk`/`workstation` | source data tree; resets current to root on change |

**Layout** (collapsible):

| Control | Type | Default | Range / step | Effect |
|---|---|---|---|---|
| `maxRings` | slider (int) | 10 | 1–20, 1 | ring count excluding center; recomputes `ringTable` |
| `ringMode` | select | `small` | `small`/`grow`/`shrink` | ring-width model |
| `ringMultiplier` | slider | 1.0 | 0.5–1.5, 0.05 | outer-ring width in center-width units (grow/shrink only) |
| `sorting` | select | `size` | `size`/`name` | child sort within a parent (hard cut — no animation; the animated sort morph is exclusive to the Sunburst MVP widget, see `other-widgets/sunburst-mvp.md` / `animation.md` §"Sort morph") |

**Appearance** (collapsible):

| Control | Type | Default | Range / step | Effect |
|---|---|---|---|---|
| `coloring` | select | `wheel` | `wheel`/`size`/`lastUpdated`/`none` | hue source (angle-frozen vs size-ramp vs mtime-ramp vs monochromatic) |
| `colorModel` | select | `hsl` | `hsl`/`oklch` | color space: HSL (`hsl(h, s%, l%)`) or OKLCH (`oklch(l c h)`); OKLCH uses binding `OKLCH_L` and `OKLCH_C` constants |
| `depthColor` | toggle | off | on/off | when on, outer rings get progressively less chroma — S decreases in HSL mode, C decreases in OKLCH mode; center circle unaffected |
| `render` | select | `full` | `full`/`wireframe` | render mode (fill vs stroke-only 1px) |
| `visibilityThreshold` | slider | 0° | 0–10°, 0.5 | hide sectors narrower than this (anti-moire) |

**Objects** (collapsible):

| Control | Type | Default | Effect |
|---|---|---|---|
| `smallerObjects` | toggle | on | emit the "smaller objects" bucket |
| `filesSpecial` | toggle | on | show file-type and "smaller objects" sectors; when off, navigation hard-cuts (no animation) |

**Interaction** (collapsible):

| Control | Type | Default | Range / step | Effect |
|---|---|---|---|---|
| `interactions` | toggle | on | on/off | enable hover (pulse, tooltip) and click (drill, navigate-up). As an internal opt (not the tunable), also accepts the mode `"tooltips"` — hover-tooltip handlers only, no pulse, no click — used by the read-only sunburst-playground |
| `hoverOpacityDip` | slider | 0.5 | 0–1, 0.05 | fraction by which sector opacity dips on hover |
| `centerOpacity` | slider | 0 | 0–1, 0.05 | center circle fill opacity (0 = invisible at rest; pulses on hover only) |
| `pulseDuration` | slider | 500 | 100–2000, 50 | hover pulse period (ms) |
| `slowAnimation` | toggle | off | on/off | when on, animation plays at 0.1× speed (for close visual inspection); off = 0.5× (default) |

**Ring-width models.** `small` = binding two-tier (`min(LARGE_RINGS, maxRings)` rings @`LARGE_WIDTH`, the rest @`SMALL_WIDTH`). `grow`/`shrink` = smooth gradient: innermost ring = `1.0 × CENTER_WIDTH`, outermost = `ringMultiplier × CENTER_WIDTH`, linear by ring index; `ringMultiplier > 1` grows (outer wider), `< 1` shrinks (outer narrower) — the mode is an intent label, the multiplier's value relative to 1.0 sets direction. `ringMultiplier` is ignored in `small` mode. An optional `modeBlend` (0..1, geometry widget only) lerps each ring's width between the geometric and two-tier columns (see `sunburst-geometry.md` §3) — used by the smaller-rings toggle so ring widths reallocate without changing ring count.

**Coloring.** `wheel` = the spec's frozen angle-based `_hue` (§5). `size` = `sizeHue(size, maxSize)` (log₁₀ ramp, smallest→0°, largest→300°, no wrap) — **debug-only; deviates from §5's frozen hues** (a folder's color then changes with the level, since size is relative). `lastUpdated` = `lastUpdatedHue(mtime, minMtime, maxMtime)` — green (120°) for the newest content, red (0°) for the oldest, linear across the dataset's min/max mtime (anchored to the whole dataset so a folder's color is stable per dataset). `mtimes` are assigned deterministically per-leaf in `sample-data.js` (base date 2026-07-23, rng-derived offset in [0, 365 days]), then propagated up as max(child mtime) by `computeMtimes()`. `none` = all sectors use a monochromatic light grey (`hsl(0, 0%, 70%)`), no hue variation.

**Render.** `full` = standard fill-based rendering (binding). `wireframe` = no fill, stroke-only at 1px width with no alpha; center circle also uses stroke. Useful for inspecting sector boundaries.

**Datasets.** `disk` = synthetic macOS hard drive (7 levels deep, ~300 nodes). `workstation` = developer workstation with deep nesting (14+ levels, ~700 nodes) — heavy on small files in node_modules, homebrew, Python site-packages, and Xcode derived data. Switching resets current to the dataset root. Article widgets default to `disk` via the `data` directive field.

**Visibility threshold** is **separate from `θ_min`**: `θ_min` (binding, not exposed) folds sub-threshold items into the "smaller objects" bucket; `visibilityThreshold` is a render-time hide — any sector with `span < visibilityThreshold` isn't drawn (including the bucket if it's tiny). With `smallerObjects` off, sub-`θ_min` items aren't bucketed and the angular gap is left empty.

**`filesSpecial` and animation.** The toggle is intended for static exploration. When `filesSpecial` is off, navigation uses a **hard cut** (the target folder becomes current immediately, no morph): the morph renders file/smaller sectors at full opacity alongside folders, which conflicts with the toggle hiding them, so the animation is skipped. Layout sorting still respects the `sorting` tunable for all children (files included) regardless of `filesSpecial` — the render-side filter only hides file/smaller sectors, it does not affect layout order.

#### DialTimeline

A **DialTimeline** dock is mounted in demo mode for the "Zoom" transition. It visualizes the current `(parent, child)` pair as an editable curve and lets the user scrub or replay the transition.

- **Purpose**: inspect/adjust the easing curve for the drill/back animation and verify the morph at any `p`. It is purely an editor — the authored curve is read by `useDialTimeline` and fed into Motion when the real animation runs.
- **Wire**: `DemoMode` renders `<DialTimeline pairLabel="parent ⟶ child" />`. The `pairLabel` is shown in each timeline section's toolbar (left of the transport buttons), so the source → target of the scrubbed transition is always visible.
- **Wire**: `SunburstMap` registers the timeline with a **stable id `sunburst-zoom`** (so tests/tooling can address the transport deterministically); `DemoMode` renders `<DialTimeline pairLabel="parent ⟶ child" />` so the source → target of the scrubbed transition is always visible.
- **Live vs. preview mode**: when the playhead is away from 0 and no navigation animation is running, the map renders a **preview** of the stored pair at the scrubbed `p` rather than the live `current` folder. A running navigation animation always takes precedence over the preview. `SunburstMap` dims the breadcrumb and shows a "Preview" badge while previewing (the breadcrumb keeps showing `current`, which the map temporarily isn't). Any navigation (sector click, center click, breadcrumb click, recording playback, dataset switch) exits preview mode (`pause + seek 0`) first, so the transition always starts from live state.
- **Replay**: pressing Play from time 0 replays the transition from `current`'s parent to `current` — **re-planned at replay time, never from a stale stored pair**, so replay can never show a tree that disagrees with the committed navigation state. When the real animation starts the transport is reset (`pause + seek 0`); the animation itself (driven by Motion with the timeline's edited curve) is the preview, and the map returns to live mode when it completes.
- **Invariant**: when the transport is idle at `time = 0` and no animation is running, the map is in live mode — the rendered tree equals `layout(current)`. Enforced by component tests (`demo/tests/component/SunburstMap.test.jsx`).
- **Recording bar**: a small dev-only bar (Record / Play / Clear) captures live navigation events (drill, back, breadcrumb) with their elapsed timing and replays them through the same imperative `navigateTo` path, using the existing animation queue. It is a debugging convenience, not part of the spec'd navigation behavior.
- **Toolbar**: the "Add timeline version" button is hidden in this demo; only the transport controls (play/pause, replay), preset/version selector, copy-parameters button, and the source → target pair label remain.

#### Intentionally NOT exposed

Viewport/center (`CX`, `CY`, `CENTER_WIDTH`), the `small`-mode tier widths (`LARGE_WIDTH`, `SMALL_WIDTH`, `LARGE_RINGS`), and all animation/visual/color constants (`DURATION_MS`, easing, `θ_min`, `ANGLE_GAP`, `RADIAL_GAP`, `S`, `L`) are **binding**. `CENTER_WIDTH` anchors the grow/shrink gradient ("center ring units"), so it stays fixed. The center position (`CX=400, CY=400`) is a hard invariant — it must not shift during any transition.

- **Scope**: debug-only.

## End state

A single-page web demo with a spec-compliant Sunburst Map and DaisyDisk-like navigation: hover hints, labels, drill-in, back, sidebar, and (optionally) transition animations.

## Relationship to the semantic spec

- `sunburst-map.md` defines behavior; this file defines how the demo is built and which values it uses.
- Stage 1 implements the current v1 scope (`sunburst-map.md` §1–§8). Stages 2–5 expand scope by bringing items from `sunburst-map.md` §9 into the demo.
- If the demo and the semantic spec disagree, the semantic spec wins (per `AGENTS.md`).