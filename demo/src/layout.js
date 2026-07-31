// Pure layout algorithm for the Sunburst Map (no DOM).
// Implements spec/sunburst-map.md §4–§5 with constants from spec/staging.md.
//
// Tunables are accepted as an optional `opts` argument to layout() / morphLayout()
// (and ringTable()), defaulting to DEFAULT_TUNABLES = the binding constants. The
// dev-only DialKit panel (see spec/staging.md §"Debugging tools") overrides the
// structural controls live; coloring + visibility-threshold are applied render-side
// in SunburstMap. Tests / render-harness that omit opts get the binding behavior.

export const CX = 400;
export const CY = 400;
export const CENTER_WIDTH = 50;
export const LARGE_WIDTH = 50;
export const SMALL_WIDTH = 16;
export const LARGE_RINGS = 5;
export const SMALL_RINGS = 5;

// Sunburst Geometry widget (spec/other-widgets/sunburst-geometry.md):
// CARD_RADIUS is the max outer radius (viewBox units) before ringScale shrinks
// every ring uniformly to fit. RING_LANE_* style the boundary circles drawn at
// each ring. GEOMETRY_TWEEN_MS is the widget's transition glide duration.
export const CARD_RADIUS = 360;
export const RING_LANE_WIDTH = 1.0;
export const RING_LANE_OPACITY = 0.25;
export const GEOMETRY_TWEEN_MS = 200;

// Binding ring geometry (the spec'd two-tier: 5 large @50px + 5 small @16px).
export const RING_RADII = (() => {
  const arr = [];
  let r = 0;
  arr.push([r, r + CENTER_WIDTH]);
  r += CENTER_WIDTH;
  for (let i = 0; i < LARGE_RINGS; i++) { arr.push([r, r + LARGE_WIDTH]); r += LARGE_WIDTH; }
  for (let i = 0; i < SMALL_RINGS; i++) { arr.push([r, r + SMALL_WIDTH]); r += SMALL_WIDTH; }
  return arr;
})();
export const MAX_RING = RING_RADII.length - 1; // 10

// Cumulative outer-radius boundary at each ring index (binding; the default for
// radiusAt). ringTable(opts).bounds overrides this live when rings are tuned.
const BOUNDS = (() => { const b = [0]; for (const [, r1] of RING_RADII) b.push(r1); return b; })();

// Constants from spec/staging.md
export const THETA_MIN = 2; // degrees: below this an item folds into "smaller objects"
export const S = 60;
export const L = 58; // HSL lightness (%) — dark mode
export const LIGHT_L = 21.7; // HSL lightness (%) — light mode
export const OKLCH_L = 0.6;   // OKLCH lightness (roughly equivalent to HSL 58%)
export const OKLCH_L_LIGHT = 0.75; // OKLCH lightness for light mode (converted from HSL S=70, L=65)
export const OKLCH_C = 0.15;  // OKLCH chroma (medium saturation, comparable to S=60)
export const SMALLER_ALPHA = 0.5; // opacity for the smaller-objects bucket
export const ANGLE_GAP = 0.5; // degrees between sibling sectors
export const RADIAL_GAP = 1.5; // px between rings

// Grey tones (files + smaller objects are not hue-colored — see spec §5)
export const FILE_FILL = "hsl(0, 0%, 50%)";
export const SMALLER_FILL = "hsla(0, 0%, 50%, 0.5)";
export const ROOT_CENTER_BORDER = "hsl(0, 0%, 55%)";
export const CENTER_OPACITY = 0; // center is invisible in static view; pulses during animation
export const HOVER_OPACITY_DIP = 0.5; // default: reduce opacity by 50% on hover

export function norm(deg) { return ((deg % 360) + 360) % 360; }

export function computeSizes(node) {
  if (node.type === "folder") {
    let sum = 0;
    for (const c of node.children) sum += computeSizes(c);
    node.size = sum;
  }
  return node.size || 0;
}

// Sort a parent's real children by the chosen mode. (Free space is never sorted;
// the "smaller objects" bucket is always placed last regardless of mode.)
function sortReal(real, sorting) {
  if (sorting === "name") {
    return [...real].sort((a, b) => {
      const na = String(a.name || "").toLowerCase();
      const nb = String(b.name || "").toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });
  }
  return [...real].sort((a, b) => (b.size || 0) - (a.size || 0)); // size, largest first (spec §4)
}

// Ring geometry from tunables. Returns { table: [[r0,r1], ...] for rings 0..maxRings
// (index 0 = center), bounds: cumulative outer radii [0, r1_1, ...], maxRings }.
//
// Modes:
//   "small"  — binding two-tier: first min(LARGE_RINGS, maxRings) rings @LARGE_WIDTH,
//              the rest @SMALL_WIDTH. ringMultiplier is ignored.
//   "grow" / "shrink" — smooth gradient: innermost ring = 1.0×CENTER_WIDTH, outermost
//              = ringMultiplier×CENTER_WIDTH, linear by ring index. ringMultiplier>1
//              grows (outer wider); <1 shrinks (outer narrower). The mode is an intent
//              label; the multiplier's value relative to 1.0 sets the direction.
//   "geometric" — w_i = w_(i-1) × ringMultiplier, anchored at the center radius
//              (w_0 = CENTER_WIDTH). ringMultiplier is the growth rate per step.
//   ringScale  — uniform factor applied to ALL widths (center + rings). Used by the
//              Sunburst Geometry widget to bound zoom-out: ringScale = min(1,
//              CARD_RADIUS / totalRadius) keeps the map in-card without normalizing.
//   modeBlend  — continuous blend between the "geometric" and two-tier ("small")
//              width columns: w_i = lerp(wBase_i, wOther_i, modeBlend). modeBlend=0
//              is the base mode, modeBlend=1 is the other mode. Used by the Sunburst
//              Geometry widget to glide ring widths on the smallerRings toggle while
//              the outer edge stays pinned (ringScale derived live from the blended
//              total). Ignored by "grow"/"shrink".
export function ringTable(opts) {
  const maxRings = Math.max(1, Math.round(opts && opts.maxRings != null ? opts.maxRings : MAX_RING));
  const mode = (opts && opts.ringMode) || "small";
  const m = opts && opts.ringMultiplier != null ? opts.ringMultiplier : 1.0;
  const s = opts && opts.ringScale != null ? opts.ringScale : 1.0;
  const blend = opts && opts.modeBlend != null ? opts.modeBlend : 0;
  const largeCount = Math.min(LARGE_RINGS, maxRings);

  // The two base columns: geometric (rate-driven) and two-tier (binding).
  const geom = [CENTER_WIDTH];
  for (let i = 1; i <= maxRings; i++) geom.push(Math.max(1, geom[i - 1] * m));
  const tiered = [CENTER_WIDTH];
  for (let i = 1; i <= maxRings; i++) tiered.push(i <= largeCount ? LARGE_WIDTH : SMALL_WIDTH);

  let widths;
  if (mode === "grow" || mode === "shrink") {
    // smooth gradient: innermost = 1.0×CENTER_WIDTH, outermost = m×CENTER_WIDTH
    widths = [CENTER_WIDTH];
    for (let i = 1; i <= maxRings; i++) {
      const t = maxRings > 1 ? (i - 1) / (maxRings - 1) : 0;
      widths.push(Math.max(1, CENTER_WIDTH * (1.0 + (m - 1.0) * t)));
    }
  } else {
    // base = "geometric" or "small"; blend toward the other column
    const from = mode === "small" ? tiered : geom;
    const to = mode === "small" ? geom : tiered;
    widths = from.map((w, i) => Math.max(1, w + (to[i] - w) * blend));
  }
  const table = [];
  const bounds = [0];
  let r = 0;
  for (let i = 0; i <= maxRings; i++) {
    table.push([r, r + widths[i] * s]);
    r += widths[i] * s;
    bounds.push(r);
  }
  return { table, bounds, maxRings };
}

export function computeTreeDepth(node) {
  if (!node.children || node.children.length === 0) return 1;
  let maxChildDepth = 0;
  for (const c of node.children) {
    maxChildDepth = Math.max(maxChildDepth, computeTreeDepth(c));
  }
  return 1 + maxChildDepth;
}

// Compute the tight bounding box around the sunburst sectors without mutating data.
// Uses the root-level free space (centered at 180°) to determine the angular
// extent of real items, then computes the bounding box of the arc at max radius.
function computeTightBounds(root, opts) {
  const mr = opts && opts.maxRings != null ? opts.maxRings : MAX_RING;
  const rt = ringTable(opts);
  const totalRadius = rt.bounds[mr + 1] || rt.bounds[rt.bounds.length - 1] || 0;

  // Find the angular extent of real (non-free) sectors at the root level.
  // Free space is always centered at 180° (bottom of the circle).
  const freeChild = root.children && root.children.find(c => c.type === "free");
  const freeSpan = freeChild ? (freeChild.size / root.size) * 360 : 0;
  const realSpan = 360 - freeSpan;

  if (realSpan <= 0 || realSpan >= 360) {
    // Full circle or degenerate — use the full radius bounds.
    return {
      left: 400 - totalRadius,
      top: 400 - totalRadius,
      right: 400 + totalRadius,
      bottom: 400 + totalRadius,
    };
  }

  // Real items span from startAngle to endAngle (clockwise), with free space
  // centered at 180°.
  const startAngle = norm(180 + freeSpan / 2);
  const endAngle = norm(180 - freeSpan / 2);

  // Compute bounding box by sampling the arc at regular intervals.
  const toRad = (d) => (d * Math.PI) / 180;
  const cx = 400, cy = 400;
  let minX = cx, minY = cy, maxX = cx, maxY = cy;

  // Determine the angular distance going clockwise from startAngle to endAngle.
  let arcLen;
  if (endAngle > startAngle) {
    arcLen = endAngle - startAngle;
  } else {
    arcLen = 360 - startAngle + endAngle;
  }

  const numSamples = 64;
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const angle = norm(startAngle + t * arcLen);
    const rad = toRad(angle);
    const x = cx + totalRadius * Math.sin(rad);
    const y = cy - totalRadius * Math.cos(rad);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { left: minX, top: minY, right: maxX, bottom: maxY };
}

// Natural pixel size for the SVG container based on ring geometry.
// Returns { naturalPx, viewBox } where naturalPx is the CSS pixel dimension
// (minimum 200px) and viewBox is the SVG viewBox string tightly bounding the rings.
// When `data` is provided, the viewBox auto-tightens to the dataset's max tree
// depth (clamped to opts.maxRings) so empty outer rings don't waste space.
//
// Interactive widgets (opts.interactions !== false) navigate: drilling in fills
// the full 360° circle (free space exists only at root), so the viewBox must
// bound the full circle at the deepest ring, centered at (CX, CY), and stay
// stable across navigations (spec/sunburst-map.md §"ViewBox"). Non-interactive
// widgets never navigate, so their viewBox trims the root free-space gap
// (spec/staging-article.md "Widget whitespace trimming").
export function widgetNaturalSize(opts = {}, data) {
  const rt = ringTable(opts);
  let effectiveRings = rt.maxRings;
  if (data) {
    const depth = computeTreeDepth(data);
    effectiveRings = Math.max(1, Math.min(rt.maxRings, depth - 1));
  }
  const optsWithRings = { ...opts, maxRings: effectiveRings };
  const margin = opts.viewBoxMargin !== undefined ? opts.viewBoxMargin : (data ? 4 : 0);

  if (opts.interactions !== false) {
    const outerRadius = rt.bounds[effectiveRings + 1] || rt.bounds[rt.bounds.length - 1] || 0;
    const half = outerRadius + margin;
    const side = 2 * half;
    return {
      naturalPx: Math.max(200, side),
      viewBox: `${CX - half} ${CY - half} ${side} ${side}`,
    };
  }

  // Compute tight bounding box around actual sectors (not full 360° circle).
  // This trims whitespace from gaps in the sunburst (e.g., free space at 180°).
  const bounds = computeTightBounds(data, optsWithRings);
  const vw = (bounds.right - bounds.left) + 2 * margin;
  const vh = (bounds.bottom - bounds.top) + 2 * margin;
  const naturalPx = Math.max(200, Math.max(vw, vh));
  const viewBox = `${bounds.left - margin} ${bounds.top - margin} ${vw} ${vh}`;
  return { naturalPx, viewBox };
}

// Hue as a function of size (the "size" coloring mode). Log₁₀ ramp so the range
// from bytes to GB spreads across the hue wheel; smallest→0°, largest→300° (avoids
// the 360° wrap). `maxSize` is the reference (the disk-root size).
export function sizeHue(size, maxSize) {
  if (!size || size <= 0) return 0;
  const hi = Math.max(Math.log10((maxSize || size) + 1), 1);
  const v = Math.log10(size + 1) / hi;
  return norm(v * 300);
}

// Hue as a function of mtime (the "lastUpdated" coloring mode). Green (120°) for
// the newest content, red (0°) for the oldest, linear across the dataset's
// [minMtime, maxMtime] range. Anchored to the whole dataset's min/max so a folder's
// color is stable per dataset (not per current view). `node.mtime` is the max child
// mtime propagated by computeMtimes() in sample-data.js.
export function lastUpdatedHue(mtime, minMtime, maxMtime) {
  if (mtime === undefined || mtime === null) return 0;
  const span = (maxMtime - minMtime) || 1;
  const v = (mtime - minMtime) / span; // 0 (oldest) → 1 (newest)
  return norm(v * 120); // 0° (red) → 120° (green)
}

// Lay out the tree, returning a flat list of placed nodes (each with _ring, _start, _span).
export function layout(root, opts) {
  const mr = opts && opts.maxRings != null ? opts.maxRings : MAX_RING;
  const tm = opts && opts.THETA_MIN != null ? opts.THETA_MIN : THETA_MIN;
  // Prevent orphan sectors: ensure the effective threshold is at least the
  // rendering minimum (0.2°), so sectors too thin to render are not placed.
  const effectiveTm = Math.max(tm, 0.2);
  const sorting = (opts && opts.sorting) || "size";
  const smallerObjects = opts && opts.smallerObjects != null ? opts.smallerObjects : true;
  const ringCull = opts && opts.ringCull != null ? opts.ringCull : true;
  const placed = [];

  function place(node, ring, start, span) {
    node._ring = ring;
    node._start = start;
    node._span = span;
    if (ring <= mr) placed.push(node);
    // Freeze each folder's hue on first placement as a sector (ring >= 1), per spec §5.
    // Used only when coloring === "wheel" (render-side); the "size" mode ignores _hue.
    if (ring > 0 && node.type === "folder" && node._hue === undefined) {
      node._hue = norm(start + span / 2);
    }
    if (node.type === "folder" && node.children) {
      for (const c of node.children) c._parent = node;
      layoutChildren(node, ring + 1, start, span);
    }
  }

  function layoutChildren(parent, childRing, parentStart, parentSpan) {
    const children = parent.children;
    const freeChild = children.find((c) => c.type === "free");
    const real = children.filter((c) => c.type !== "free");
    const sorted = sortReal(real, sorting);
    const ps = parent.size;

    let ws, wspan;
    if (freeChild) {
      // Free space: bisector anchored at 180° (bottom). Real items fill the rest clockwise.
      const fs = (freeChild.size / ps) * parentSpan;
      place(freeChild, childRing, norm(180 - fs / 2), fs);
      ws = norm(180 + fs / 2);
      wspan = parentSpan - fs;
    } else {
      ws = parentStart;
      wspan = parentSpan;
    }

    const spans = sorted.map((c) => ({ c, s: (c.size / ps) * parentSpan }));

    // Always filter by the threshold. ringCull only controls the ring-skip guard:
    // when false, the ring always renders (even if only the bucket survives the
    // filter), letting "Display single children" show the aggregated bucket
    // rather than vanishing the ring entirely.
    const big = spans.filter((x) => x.s >= effectiveTm);

    // ringCull=true (default): skip the ring when every child is below threshold
    // (spec §4 all-small rule). ringCull=false: render whatever the filter produced
    // (possibly just the bucket).
    if (big.length === 0 && ringCull) return;

    let cursor = ws;
    for (const x of big) {
      place(x.c, childRing, cursor, x.s);
      cursor = norm(cursor + x.s);
    }

    if (smallerObjects) {
      const smallerSize = spans.filter((x) => x.s < effectiveTm).reduce((a, x) => a + x.c.size, 0);
      if (smallerSize > 0) {
        const smallerNode = { name: "smaller objects", type: "smaller", size: smallerSize };
        place(smallerNode, childRing, cursor, (smallerSize / ps) * parentSpan);
      }
    }
  }

  place(root, 0, 0, 360);
  return placed;
}

export function hueOf(node) { return norm(node._start + node._span / 2); }

export function sectorPath(r0, r1, a0, a1) {
  const toRad = (d) => (d * Math.PI) / 180;
  const pt = (r, a) => [CX + r * Math.sin(toRad(a)), CY - r * Math.cos(toRad(a))];
  const sweep = a1 - a0;
  const large = sweep > 180 ? 1 : 0;
  const [x0, y0] = pt(r0, a0);
  const [x1, y1] = pt(r1, a0);
  const [x2, y2] = pt(r1, a1);
  const [x3, y3] = pt(r0, a1);
  return `M ${x0} ${y0} L ${x1} ${y1} A ${r1} ${r1} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r0} ${r0} 0 ${large} 0 ${x0} ${y0} Z`;
}

export function formatSize(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b >= 1e3) return (b / 1e3).toFixed(1) + " KB";
  return b + " B";
}

export function depthFactor(ring, maxRings, enabled) {
  if (!enabled) return 1;
  return Math.max(0.2, 1 - (ring / Math.max(1, maxRings)) * 0.4);
}

export function toColorString(hue, { model = 'hsl', df = 1, theme = 'dark', lightSaturation, lightLightness, lightOklchLightness, lightOklchChroma, saturation: satOverride, lightness: lightOverride } = {}) {
  if (model === 'oklch') {
    const oL = theme === 'light' ? (lightOklchLightness ?? OKLCH_L_LIGHT) : OKLCH_L;
    const oC = theme === 'light' ? (lightOklchChroma ?? OKLCH_C) : OKLCH_C;
    return `oklch(${oL.toFixed(3)} ${(oC * Math.max(0.1, df)).toFixed(3)} ${hue.toFixed(1)})`;
  }
  const sat = satOverride ?? (theme === 'light' ? (lightSaturation ?? S) : S);
  const light = lightOverride ?? (theme === 'light' ? (lightLightness ?? LIGHT_L) : L);
  return `hsl(${hue.toFixed(1)}, ${(sat * Math.max(0.1, df)).toFixed(0)}%, ${light}%)`;
}

// ---- animation helpers (Stage 5) ----
export const GREY = "hsl(0, 0%, 50%)";
export const GREY_LIGHT = "hsl(0, 0%, 57.5%)";
export const NONE_COLOR = "hsl(0, 0%, 83%)";
export const NONE_COLOR_LIGHT = "#808080";
export const ROOT_CENTER_BORDER_LIGHT = "hsl(0, 0%, 52.8%)";
export const DURATION_MS = 500;
export const ANIMATION_SPEED = 0.5; // default speed (slowAnimation off = 0.5×; on = 0.1×)
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

// The animation's progress p is driven by Motion (see SunburstMap.jsx). The default
// tween easing (DEFAULT_TUNABLES.EASE below) approximates easeInOut, so behavior is
// unchanged when the DialKit panel is at defaults. Motion evaluates the bezier.

export function lerpAngle(a, b, t) {
  const d = (((b - a) % 360) + 540) % 360 - 180; // shortest delta in [-180,180]
  return (((a + d * t) % 360) + 360) % 360;
}

// Map a (possibly fractional) ring to [r0, r1] radii via a cumulative bounds table.
// `bounds` defaults to the binding BOUNDS so callers without tunables get spec geometry.
export function radiusAt(rf, bounds) {
  const b = bounds || BOUNDS;
  const k = Math.max(0, Math.min(b.length - 2, Math.floor(rf)));
  const f = rf - k;
  const r0 = b[k] + f * (b[k + 1] - b[k]);
  const k2 = Math.max(0, Math.min(b.length - 2, Math.floor(rf + 1)));
  const f2 = rf + 1 - k2;
  const r1 = b[k2] + f2 * (b[k2 + 1] - b[k2]);
  return [r0, r1];
}

export function snapshotAll(root) {
  const m = new Map();
  const walk = (n) => { m.set(n, { ring: n._ring, start: n._start, span: n._span }); if (n.children) for (const c of n.children) walk(c); };
  walk(root);
  return m;
}

export function subtreeNodes(root) {
  const s = new Set();
  const walk = (n) => { s.add(n); if (n.children) for (const c of n.children) walk(c); };
  walk(root);
  return s;
}

// Binding tunable defaults. DialKit overrides the structural ones live; the binding
// values remain the source of truth (overrides are session-only, reset on reload;
// promote tuned values via DialKit's JSON export — see spec/staging.md).
export const DEFAULT_TUNABLES = {
  // structural (DialKit-exposed)
  maxRings: MAX_RING,
  ringMode: "small",
  ringMultiplier: 1.0,
  sorting: "size",
  coloring: "wheel",
  colorModel: "hsl",
  depthColor: false,
  render: "full",
  interactions: true,
  filesSpecial: true,
  visibilityThreshold: 0,
  smallerObjects: true,
  animateNavigation: true, // false = navigation hard-cuts (article embeds only)
  // light-mode color tuning (DialKit-exposed)
  lightSaturation: 70,
  lightLightness: 65,
  lightOklchLightness: OKLCH_L_LIGHT,
  lightOklchChroma: OKLCH_C,
  // binding (not DialKit-exposed; kept here for the animation driver)
  THETA_MIN,
  DURATION_MS,
  EASE: [0.25, 0, 0.55, 1], // asymmetric: fast start, gentle deceleration
  hoverOpacityDip: HOVER_OPACITY_DIP,
  animationSpeed: ANIMATION_SPEED,
};

// Sunburst MVP widget fixed config (spec/other-widgets/sunburst-mvp.md §1). A
// static read-only map whose only control is the "Sort by size" toggle; `sortP`
// (not listed here) is driven by the toggle animation and read by SunburstMap's
// sort-morph render mode. `sortBySize` defaults to off → name order.
export const MVP_TUNABLES = {
  maxRings: 5,
  ringMode: "small",
  smallerObjects: false,
  filesSpecial: false,
  coloring: "none",
  THETA_MIN: 0,
  interactions: false,
};

// Would-be angular position (start, span) of `node` within `ancestor`'s layout
// frame, telescoped via the static placement rules (sorted children, cumulative
// cursor, free-space anchoring at root). Used for nodes that are sub-θ_min
// (unplaced) in ancestor's view — their static position is inside the bucket,
// and the sorted-cursor position is the continuous convention for the morph's
// anchoring. Self-sufficient: lays out `ancestor` and trusts only ITS placed
// set — a chain link's _start/_span may be stale from a layout rooted elsewhere.
export function virtualPosIn(ancestor, node, sorting) {
  const placedSet = new Set(layout(ancestor));
  const chain = [];
  let n = node;
  while (n && n !== ancestor) { chain.unshift(n); n = n._parent; }
  let curStart = ancestor._start ?? 0, curSpan = ancestor._span ?? 360, holder = ancestor;
  for (const link of chain) {
    if (placedSet.has(link)) {
      curStart = link._start; curSpan = link._span; holder = link;
      continue;
    }
    const holderSize = holder.size || 1;
    const freeChild = holder === ancestor && holder.children
      ? holder.children.find((c) => c.type === "free") : null;
    let ws = curStart, wspan = curSpan;
    if (freeChild) {
      const fs = (freeChild.size / holderSize) * curSpan;
      ws = norm(180 + fs / 2);
      wspan = curSpan - fs;
    }
    const children = sortReal(holder.children.filter((c) => c.type !== "free"), sorting);
    let cur = ws, found = null;
    for (const c of children) {
      const cSpan = (c.size / holderSize) * wspan;
      if (c === link) { found = { start: norm(cur), span: cSpan }; break; }
      cur = norm(cur + cSpan);
    }
    if (!found) return { start: 0, span: 0 };
    curStart = found.start; curSpan = found.span; holder = link;
  }
  return { start: curStart, span: curSpan };
}

// Partition-preserving transition layout (animation.md hard invariants). See
// spec/animation.md for the full model. `opts` is the same tunables object used by
// layout() (maxRings / THETA_MIN / sorting / smallerObjects).
//
// Multi-level morph: handles `child` being a deep descendant of `parent` (not just
// a direct child). The ancestor chain from `parent` to `child` expands simultaneously
// in a telescoping cascade. Radial slide shifts by `depth * pAnim` so at p=1 every
// node is at its new-layout ring — no snap on relayout. The deepest descendant's
// angular center is fixed; all ancestors recenter around it.
export function morphLayout(parent, child, p, opts, suppressSiblings = false) {
  const mr = opts && opts.maxRings != null ? opts.maxRings : MAX_RING;
  const tm = opts && opts.THETA_MIN != null ? opts.THETA_MIN : THETA_MIN;
  const sorting = (opts && opts.sorting) || "size";
  const smallerObjects = opts && opts.smallerObjects != null ? opts.smallerObjects : true;
  const co = (opts && opts.centerOpacity) ?? CENTER_OPACITY;
  // Clear stale placement fields so `node._span === undefined` reliably means
  // "not rendered in the old layout" (sub-θ_min or all-small-guarded content).
  // The morph fades such content in (op = pMorph) instead of popping it in at
  // full opacity when it crosses θ_min (spec/animation.md §"θ_min consolidation").
  (function wipe(n) { n._ring = n._start = n._span = undefined; if (n.children) for (const c of n.children) wipe(c); })(parent);
  layout(parent, opts); // sets _ring/_start/_span/_parent (old) on placed nodes

  // At p≥0.999 return the exact static layout — no morph. The morph's anchor
  // unwinds to the natural orientation (180°) as pMorph → 1, so the shortcut
  // is continuous with the morph path's end (spec/animation.md §"Post-navigation
  // angular continuity").
  if (p >= 0.999) {
    const finalLayout = layout(child, opts);
    return [
      ...finalLayout.filter(n => n._ring >= 1).map(n => ({
        node: n, ring: n._ring, start: n._start, span: n._span, op: 1,
      })),
      {
        node: child, ring: 0, start: 0, span: 360,
        op: 0,
        isCenter: true,
        centerHue: child._hue ?? 0,
        borderOp: 0,
      },
    ];
  }
  const parentSize = parent.size || 1;
  const childSize = child.size || 1;
  const placed = [];

  // Two-phase model (spec/animation.md §Pre-stage):
  // Phase 1 (p ∈ [0, 0.5], pre-stage): siblings fade by opacity. No geometry change.
  // Phase 2 (p ∈ (0.5, 1], morph): geometry morphs — siblings already invisible.
  const pPre = Math.min(1, p / 0.5);               // 0→1 during pre-stage, 1 during morph
  const pMorphRaw = Math.max(0, (p - 0.5) / 0.5);  // 0 during pre-stage, 0→1 during morph
  const pMorph = easeInOut(pMorphRaw);              // eased morph progress (0→1)

  // Build ancestor chain: chain[0] = direct child of parent at ring 1, ..., chain[depth-1] = child.
  const chain = [];
  {
    let n = child;
    while (n !== parent) {
      if (!n._parent) { chain.length = 0; break; }
      chain.unshift(n);
      n = n._parent;
    }
  }
  const depth = chain.length;
  const pSlide = depth * pMorph; // universal radial slide by depth

  // Fast lookups for chain membership.
  const chainMap = new Map(chain.map((n, i) => [n, i]));

  // Would-be positions for chain nodes that are sub-θ_min (unplaced) in
  // layout(parent) — reachable via any-to-any delegation. Telescoped via the
  // static placement rules so childCenter and cascade anchors stay continuous.
  const vPosCache = new Map();
  const posOf = (node) => {
    if (node._start !== undefined && node._span !== undefined) return { start: node._start, span: node._span };
    if (!vPosCache.has(node)) vPosCache.set(node, virtualPosIn(parent, node, sorting));
    return vPosCache.get(node);
  };

  // Fix child's (deepest descendant's) angular center — the morph starts
  // fixed-center (childCenter in the parent's frame) and UNWINDS to the natural
  // orientation (180°, i.e. layout(child)'s own center) as easeInOut(p) → 1.
  // The unwind tracks the SVG rotation (which also uses easeInOut(p)) so the
  // child stays at its original viewport center at every p — the two cancel
  // exactly for ALL sectors, not just the child. Without the unwind, the p≥0.999
  // shortcut (natural layout) would snap the whole map by (childCenter − 180)
  // in the last frames — the component's SVG rotation only aligns the endpoints,
  // not the approach path (spec/animation.md §"Post-navigation angular continuity").
  const childCenter = (() => { const v = posOf(child); return norm(v.start + v.span / 2); })();
  const anchorCenter = lerpAngle(childCenter, 180, pMorph);

  // Ring-1 path-child is chain[0] (direct child of parent on the path to child).
  const ring1Child = depth > 0 ? chain[0] : child;

  // Ring-1 in OLD clockwise order: [free (root only), real sorted by size]
  const freeChild = parent.children.find((c) => c.type === "free");
  const ring1 = [];
  if (freeChild) ring1.push({ c: freeChild, isChild: false, isFree: true });
  const real = sortReal(parent.children.filter((c) => c.type !== "free"), sorting);
  for (const c of real) ring1.push({ c, isChild: c === ring1Child, isFree: false });

  for (const it of ring1) {
    const rawOld = (it.c.size / parentSize) * 360;
    it.span = it.isChild ? lerp(rawOld, 360, pMorph) : lerp(rawOld, 0, pMorph);
  }

  const childIdx = ring1.findIndex(it => it.isChild);

  // θ_min consolidation for ring-1 (bucket emitted throughout the animation).
  // The path-child NEVER folds into the bucket: it is the navigation target and
  // must render as a sector throughout. A sub-θ_min path-child (reachable via
  // any-to-any delegation — e.g. back-navigation to a high ancestor) grows out
  // of the bucket from span 0, and the bucket keeps its not-yet-grown share —
  // same migrating model as the child's subtree (spec §"θ_min consolidation").
  const emitBucketR1 = smallerObjects;
  const freeItem = freeChild ? ring1[0] : null;
  const realItems = freeItem ? ring1.slice(1) : ring1;
  const childItemR1 = childIdx >= 0 ? ring1[childIdx] : null;
  const rawOldChild = childItemR1 ? (childItemR1.c.size / parentSize) * 360 : 0;
  const oldBigChild = childItemR1
    ? childItemR1.c._span !== undefined && childItemR1.c._span >= tm
    : true;
  const bigItems = realItems.filter((it) => it.span >= tm);
  const smallItems = realItems.filter((it) => it.span > 0 && it.span < tm && !it.isChild);

  const consolidatedRing1 = [];
  if (freeItem) consolidatedRing1.push(freeItem);
  consolidatedRing1.push(...bigItems);
  const childInBig = childItemR1 && bigItems.includes(childItemR1);
  if (childItemR1 && !childInBig) consolidatedRing1.push(childItemR1);
  if (emitBucketR1 && (smallItems.length > 0 || (childItemR1 && !oldBigChild))) {
    const migrateSpan = oldBigChild ? 0 : rawOldChild * (1 - pMorph);
    const smallerSpan = smallItems.reduce((a, it) => a + it.span, 0) + migrateSpan;
    const smallerNode = { name: "smaller objects", type: "smaller", size: smallItems.reduce((a, it) => a + it.c.size, 0) + (oldBigChild ? 0 : childItemR1.c.size) };
    consolidatedRing1.push({ c: smallerNode, isChild: false, isFree: false, span: smallerSpan, isSmallerBucket: true });
  }
  if (!emitBucketR1) {
    for (const it of smallItems) consolidatedRing1.push(it);
  }

  const childConsIdx = consolidatedRing1.findIndex(it => it.isChild);
  const afterItems = childConsIdx >= 0 ? consolidatedRing1.slice(childConsIdx + 1) : [];
  const beforeItems = childConsIdx >= 0 ? consolidatedRing1.slice(0, childConsIdx) : [];

  // Place ring-1 items with fixed-center packing.
  if (childIdx >= 0) {
    const childItem = ring1[childIdx];
    // Sub-θ_min path-child: grows from span 0 out of the bucket's LEADING edge
    // (the position right after the big siblings — the static bucket start), so
    // the p=0 frame matches the old layout exactly.
    const childSpan = oldBigChild ? childItem.span : 360 * pMorph;
    // Big child: the center stays at anchorCenter throughout (fixed-center
    // invariant). Sub-θ_min child: lerp from old-layout bucket start to
    // the fixed-center position so p=0 sibling packing matches the layout.
    // For a big direct child (depth=1), the wedge center stays at anchorCenter
    // throughout — childStart = anchorCenter - childSpan/2. For multi-level
    // (depth>1) anchorCenter is the DEEP child's center, not the ring-1
    // child's, so we must lerp from the old-layout start to avoid a p=0 jump.
    // Sub-θ_min children also use the lerp: their 0-span start at p=0 must sit
    // at the bucket leading edge (right after big siblings), not at anchorCenter.
    const childStart = oldBigChild && depth === 1
      ? norm(anchorCenter - childSpan / 2)
      : (() => {
          const oldStart = oldBigChild
            ? posOf(ring1Child).start
            : (() => {
                const fs = freeItem ? (freeItem.c.size / parentSize) * 360 : 0;
                const ws0 = freeItem ? norm(180 + fs / 2) : 0;
                return norm(ws0 + bigItems.reduce((a, it) => a + (it.c.size / parentSize) * 360, 0));
              })();
          return norm(lerpAngle(oldStart, norm(anchorCenter - childSpan / 2), pMorph));
        })();

    placeSector(ring1Child, 1, childStart, childSpan, true);

    let cur = norm(childStart + childSpan);
    for (const it of afterItems) {
      if (it.span > 0) { placeSector(it.c, 1, cur, it.span, false); cur = norm(cur + it.span); }
    }
    for (const it of beforeItems) {
      if (it.span > 0) { placeSector(it.c, 1, cur, it.span, false); cur = norm(cur + it.span); }
    }
  } else {
    // Fallback: child not found in ring-1 (shouldn't happen with _parent chain).
    let cur = childCenter;
    for (const it of consolidatedRing1) {
      if (it.span > 0) { placeSector(it.c, 1, cur, it.span, false); cur = norm(cur + it.span); }
    }
  }

  // Emit center circle as a zero-level sector (spec: "center circle as zero-level
  // fully-wrapped sector"). Hue interpolates from parent to child; opacity
  // transitions per spec/animation.md §"Center circle during animation".
  const parentHue = parent._hue;
  const childHue = child._hue ?? 0;
  const hasParentHue = parentHue !== undefined;
  const centerHue = hasParentHue ? lerpAngle(parentHue, childHue, pMorph) : childHue;
  // Center circle is invisible throughout the navigation (CENTER_OPACITY=0).
  // Hover pulse is handled in SunburstMap.jsx (static view only).
  const centerOp = 0;
  const borderOp = hasParentHue ? 0 : (p <= 0.5 ? lerp(1, 0, pPre) : 0);
  placed.push({
    node: child, ring: 0, start: 0, span: 360, op: centerOp,
    isCenter: true, centerHue, borderOp,
  });

  return placed;

  function placeSector(node, oldRing, start, span, inChild, sibOp) {
    const chainIdx = chainMap.get(node);
    const isFinalChild = chainIdx === depth - 1;
    const isIntermediate = chainIdx >= 0 && chainIdx < depth - 1;

    if (!inChild) {
      // Sibling: slides inward by depth, shrinks at full opacity. In any-to-any
      // wedge composition (suppressSiblings) siblings are hidden — the from/to
      // wedges must contain only their own subtrees (other content lives in the
      // third wedge), otherwise the same node renders in two wedges at once.
      if (span <= 0) return;
      const ring = oldRing - pSlide;
      if (ring > 0) placed.push({ node, ring, start, span, op: sibOp ?? (suppressSiblings ? 0 : lerp(1, 0, pPre)) });
      placeChildren(node, oldRing, start, span, false);
      return;
    }

    // Branch: slides inward by depth.
    const ring = oldRing - pSlide;
    let op;
    if (isFinalChild) {
      op = lerp(1, co, pMorphRaw);
    } else if (isIntermediate) {
      // Intermediate ancestor: fade during pre-stage (same as siblings) — but
      // only if it was visible in the old layout. A sub-θ_min chain node was
      // folded into the bucket: keep it hidden (its subtree's path-child grows
      // out of the bucket instead).
      op = (node._span !== undefined && node._span >= tm) ? lerp(1, 0, pPre) : 0;
    } else if (oldRing <= mr && node._span !== undefined && node._span >= tm) {
      op = 1;
    } else if (oldRing <= mr + depth) {
      // Not individually rendered in the old layout: beyond max-ring in the old
      // layout but within it in the new one (newRing = oldRing − depth ≤ mr at
      // p=1), or sub-θ_min / folded away in the old layout. Fade in during the
      // morph (spec §"Very deep drill") so the rendered set converges to the
      // static post-navigation layout with no fragment pop-in.
      op = pMorph;
    } else {
      // Beyond max-ring in BOTH layouts: not rendered (recurse only).
      if (node.children) placeChildren(node, oldRing, start, span, true);
      return;
    }
    if (ring > 0 || isFinalChild) {
      placed.push({ node, ring: Math.max(0, ring), start, span, op });
    }
    placeChildren(node, oldRing, start, span, true);
  }

  function placeChildren(node, oldRing, start, span, inChild) {
    if (!node.children) return;
    const nextOldRing = oldRing + 1;
    const emitBucket = smallerObjects;

    const nodeChainIdx = chainMap.get(node);
    const isIntermediateAncestor = inChild && nodeChainIdx >= 0 && nodeChainIdx < depth - 1;

    if (!inChild) {
      // Sibling descendants: slide inward by depth, shrink at full opacity.
      // Spans are proportional to the parent's CURRENT span (the `span` arg),
      // not the old root-relative span — this keeps children within the parent's
      // shrinking wedge and prevents cross-subtree overlaps.
      if (nextOldRing > mr) return;
      const children = sortReal(node.children.filter((c) => c.type !== "free"), sorting);
      const parentOldSpan = node._span || 1;
      const items = children.map((c) => {
        const cOldSpan = (c.size / (node.size || 1)) * parentOldSpan;
        const ratio = cOldSpan / parentOldSpan;
        const curSpan = ratio * span; // proportional to parent's current span
        return { c, span: lerp(curSpan, 0, pMorph), inChild: false };
      });
      const big = items.filter((it) => it.span >= tm);
      if (big.length === 0) return;
      let cur = start;
      for (const it of big) { placeSector(it.c, nextOldRing, cur, it.span, false); cur = norm(cur + it.span); }
      if (emitBucket) {
        const small = items.filter((it) => it.span < tm && it.span > 0);
        if (small.length > 0) {
          const smallerSpan = small.reduce((a, it) => a + it.span, 0);
          const smallerNode = { name: "smaller objects", type: "smaller", size: small.reduce((a, it) => a + it.c.size, 0) };
            const bucketRing = nextOldRing - pSlide;
            const fade = Math.min(1, bucketRing);
            if (bucketRing > 0) placed.push({ node: smallerNode, ring: bucketRing, start: cur, span: smallerSpan, op: (suppressSiblings ? 0 : lerp(1, 0, pPre)) * fade });
        }
      }
      return;
    }

    if (isIntermediateAncestor) {
      // Intermediate ancestor's children: path-child expands to fill parent's
      // current span, siblings shrink to 0. Fixed-center packing around childCenter.
      const nextPathChild = chain[nodeChainIdx + 1];
      const children = sortReal(node.children.filter((c) => c.type !== "free"), sorting);
      const parentOldSpan = node._span || 1;
      // Was this ancestor's children ring rendered in the old layout? A sub-θ_min
      // chain node may itself be placed (big) while its children all fold away
      // (all-small rule) — or be unplaced entirely. Either way the ring was never
      // visible in the old view, and its non-path content also doesn't exist in
      // the end view — so it stays hidden throughout (op 0). Only an old-visible
      // ring fades out during the pre-stage.
      const ringOldVisible = children.some((c) => c._span !== undefined && c._span >= tm);
      const siblingOp = !suppressSiblings && ringOldVisible ? lerp(1, 0, pPre) : 0;
      // Sub-θ_min path-child (reachable via any-to-any delegation): grows from
      // span 0 out of the bucket's leading edge; the bucket keeps its share.
      const pathOldBig = nextPathChild._span !== undefined && nextPathChild._span >= tm;
      const items = children.map((c) => {
        const isPath = c === nextPathChild;
        const cOldSpan = (c.size / (node.size || 1)) * parentOldSpan;
        const ratio = cOldSpan / parentOldSpan;
        const curSpan = ratio * span; // proportional to parent's current span
        return { c, isPath, curSpan, span: isPath ? (pathOldBig ? lerp(curSpan, span, pMorph) : span * pMorph) : lerp(curSpan, 0, pMorph) };
      });
      const big = items.filter((it) => it.isPath || it.span >= tm);
      if (big.length === 0) return;

      const pathItem = big.find(it => it.isPath);

      if (pathItem) {
        // The wedge is a sub-arc (parent's current span), not the full circle:
        // siblings BEFORE the path-child (in sorted order) must pack ENDING at
        // pathStart, not after it — otherwise they overflow the wedge into the
        // next sibling's region and the p=0 frame diverges from the old layout.
        const beforeItems = big.slice(0, big.indexOf(pathItem));
        const spanBefore = beforeItems.reduce((a, it) => a + it.span, 0);
        let pathStart;
        if (pathOldBig) {
          // Final child: position directly at anchorCenter so the viewport
          // cancelation (anchorCenter + SVG rotation = fixed) is exact — no lerp
          // from oldStart, which would create a p*(1-p) drift when paired with
          // the pMorph-gated rotation. At pMorph=0, anchorCenter=childCenter and
          // span=oldSpan, so anchorCenter - span/2 = oldStart — no p=0 jump.
          // Intermediate ancestors keep the lerp from oldStart to avoid perturbing
          // their sibling-packing partition (spec/animation.md §Multi-level).
          const isFinalChild = pathItem.c === child;
          if (isFinalChild) {
            pathStart = norm(anchorCenter - pathItem.span / 2);
          } else {
            const oldStart = posOf(pathItem.c).start;
            const fixedStart = norm(anchorCenter - pathItem.span / 2);
            pathStart = norm(lerpAngle(oldStart, fixedStart, pMorph));
          }
        } else {
          // Sub-θ_min path-child: sits at the bucket's leading edge (right after
          // the big siblings) so the p=0 frame matches the old layout exactly.
          pathStart = norm(start + spanBefore);
        }
        let cur = norm(pathStart - spanBefore);
        for (const it of big) {
          if (it.isPath) placeSector(it.c, nextOldRing, pathStart, it.span, true);
          else if (it.span > 0) placeSector(it.c, nextOldRing, cur, it.span, false, siblingOp);
          cur = norm(cur + it.span);
        }
        if (emitBucket) {
          const small = items.filter((it) => !it.isPath && it.span < tm && it.span > 0);
          const migrateSpan = pathOldBig ? 0 : pathItem.curSpan * (1 - pMorph);
          const smallerSpan = small.reduce((a, it) => a + it.span, 0) + migrateSpan;
          if (smallerSpan > 0) {
            const smallerNode = { name: "smaller objects", type: "smaller", size: small.reduce((a, it) => a + it.c.size, 0) + (pathOldBig ? 0 : pathItem.c.size) };
            const bucketRing = nextOldRing - pSlide;
            const fade = Math.min(1, bucketRing);
            if (bucketRing > 0) placed.push({ node: smallerNode, ring: bucketRing, start: cur, span: smallerSpan, op: siblingOp * fade });
          }
        }
      } else {
        let cur = start;
        for (const it of big) { placeSector(it.c, nextOldRing, cur, it.span, false, siblingOp); cur = norm(cur + it.span); }
      }
      return;
    }

    // Final child's descendants (or depth=1 regular branch): children keep a
    // fixed size-ratio of the parent's current (growing) span, so they tile the
    // parent's wedge at every p — no overflow.
    // Depth-scaled cap: nodes up to oldRing = mr + depth end within max-ring in
    // the new layout (newRing = oldRing − depth at p=1), so they must be
    // rendered here; anything deeper is beyond max-ring in both layouts.
    if (nextOldRing > mr + depth) return;
    const children = sortReal(node.children.filter((c) => c.type !== "free"), sorting);
    // The old view rendered this children ring at all only if at least one
    // child was big (spec §4 all-small rule); otherwise no bucket existed and
    // the whole ring fades in with the morph.
    const anyOldBig = children.some((c) => c._span !== undefined && c._span >= tm);
    const items = children.map((c) => {
      const ratio = c.size / (node.size || 1);
      // θ_min membership is anchored to the END layout (endSpan = size-ratio of
      // the drilled child's 360°): a child big in the end state is an individual
      // sector throughout; a child small in the end state stays in the bucket
      // throughout. No mid-morph bucket↔sector swaps (spec §"θ_min consolidation").
      const endSmall = (c.size / childSize) * 360 < tm;
      const oldBig = c._span !== undefined && c._span >= tm;
      const baseSpan = ratio * span; // fixed size-ratio of the parent's current span
      // Old-big sectors keep their share. Migrating sectors (big in the end
      // state, folded into the old bucket) GROW out of the bucket from span 0
      // (×pMorph) at their sorted position — symmetric with siblings vanishing
      // by shrinking — so the p=0 frame matches the old layout exactly and the
      // bucket shrinks continuously as they leave it.
      return { c, endSmall, oldBig, baseSpan, span: oldBig ? baseSpan : baseSpan * pMorph, inChild: true };
    });
    const big = items.filter((it) => !it.endSmall && it.span > 0);
    // All-small rule (spec §4): if no child is big in the end layout, skip the
    // ring entirely — no individual items, no bucket. The sibling-descendant and
    // intermediate-ancestor branches already enforce this (lines 619, 660); this
    // branch was missing it, causing all-small rings to flicker a bucket during
    // the morph that vanishes at the static layout commit (onComplete).
    if (!items.some(it => !it.endSmall)) return;
    const small = items.filter((it) => it.endSmall);
    let cur = start;
    for (const it of big) { placeSector(it.c, nextOldRing, cur, it.span, true); cur = norm(cur + it.span); }
    if (emitBucket) {
      // The bucket holds end-small children plus the not-yet-grown share of
      // migrating children ((1 − pMorph) of their span) — partition holds at
      // every p. When the old view folded the whole ring away (all-small rule)
      // the bucket fades in with the morph instead of popping in.
      const migrating = items.filter((it) => !it.endSmall && !it.oldBig);
      const migrateSpan = migrating.reduce((a, it) => a + it.baseSpan, 0) * (1 - pMorph);
      const smallerSpan = small.reduce((a, it) => a + it.baseSpan, 0) + migrateSpan;
      if (smallerSpan > 0) {
        const smallerNode = { name: "smaller objects", type: "smaller", size: small.reduce((a, it) => a + it.c.size, 0) + migrating.reduce((a, it) => a + it.c.size, 0) };
        // Old-visible only if the old view rendered this ring at all (children
        // big AND the ring within max-ring — placement fields are set beyond
        // max-ring but nothing renders there). Otherwise fade in with the morph.
        const oldVisible = anyOldBig && nextOldRing <= mr;
        // Ring-0 zone is covered by the center circle — the bucket at ring ≤ 0
        // would render near the center and overlap with the center circle. Fade
        // bucket opacity to 0 as its ring approaches 0 so the shortcut handoff
        // absorbs the pop-in invisibly.
        const bucketRing = nextOldRing - pSlide;
        const fade = Math.min(1, bucketRing);
        if (bucketRing > 0) placed.push({ node: smallerNode, ring: bucketRing, start: cur, span: smallerSpan, op: (oldVisible ? 1 : pMorph) * fade });
      }
    }
  }
}

// Any-to-any transitions are no longer a separate morph: the navigation layer
// (SunburstMap.jsx) decomposes any (from, to) into a back-out to the common
// ancestor followed by a drill-in to the target — both reuse morphLayout above.
// See spec/animation.md §"Any-to-any transitions".

// Sort morph (spec/animation.md §"Sort morph"; used only by the Sunburst MVP
// widget's "Sort by size" toggle). Interpolates between the name-sorted and
// size-sorted layouts of the SAME root: both layouts place the same sectors with
// the same spans and rings (sorting is order-only), so each sector's start angle
// rotates along the shortest arc (lerpAngle) while ring/span/opacity stay
// constant. `p` is the eased progress driven by Motion: 0 = name layout, 1 =
// size layout. Crossings are transient and allowed; the free-space sector stays
// anchored at 180°. Returns morphLayout-style items { node, ring, start, span,
// op } for p ∈ [0, 1].
export function sortLayout(root, p, opts) {
  const namePlaced = layout(root, { ...(opts || {}), sorting: "name" });
  const from = new Map();
  for (const n of namePlaced) from.set(n, { ring: n._ring, start: n._start, span: n._span });
  const sizePlaced = layout(root, { ...(opts || {}), sorting: "size" });
  const to = new Map();
  for (const n of sizePlaced) to.set(n, { ring: n._ring, start: n._start, span: n._span });
  const items = [];
  for (const n of namePlaced) {
    const f = from.get(n);
    const t = to.get(n);
    if (!t || !f || f.ring < 1) continue;
    items.push({ node: n, ring: f.ring, start: lerpAngle(f.start, t.start, p), span: f.span, op: 1 });
  }
  return items;
}