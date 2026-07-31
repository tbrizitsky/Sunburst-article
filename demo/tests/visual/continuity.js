/**
 * Frame-continuity oracle — shared engine.
 *
 * Sweeps navigation transitions over p and asserts universal continuity
 * predicates on the emitted frames (item level, no SVG strings):
 *
 *   per frame:
 *     - no two visible sectors overlap (ring-window + angular sweep)
 *     - no node is visible twice (overdraw / duplicate-render)
 *   adjacent frames:
 *     - pop-in:  a node visible now must have been EMITTED last frame
 *                (emitted-but-invisible is fine: slivers/fades are continuous)
 *     - pop-out: a visible node vanishing must have span <= 3 deg last frame
 *                (near the end of a morph all legit remaining spans are tiny;
 *                vanish-by-shrink keeps the node emitted until span hits 0)
 *     - bucket count per frame must not jump (theta_min emission-gating class)
 *     - painted center opacity/border must not jump (fill suppressed when a
 *                ring-0 sector exists — mirrors buildCenterEl in SunburstMap)
 *   endpoints:
 *     - frame(0) == static layout(from), frame(1) == static layout(to)
 *       (visible sector tuples + painted center), i.e. no snap at handoff
 *
 * Synthetic smaller-objects buckets are fresh objects per frame, so they are
 * excluded from per-node membership tracking and covered by the bucket-count
 * and overlap predicates instead.
 */
import {
  computeSizes, layout, morphLayout, easeInOut, norm,
  CENTER_OPACITY, lerpAngle, virtualPosIn,
} from "../../src/layout.js";

// Sampled rawP values (component applies easing before the morph — mirrored here).
// Seam-straddling points: 0.5±0.01 (pre-stage/morph), 0.999/1 (shortcut), 0/0.02.
export const P_GRID = [0, 0.02, 0.1, 0.25, 0.49, 0.5, 0.51, 0.6, 0.75, 0.9, 0.99, 0.999, 1];

const RENDER_SPAN_CUTOFF = 0.2;  // Sector returns null at span <= 0.2
const RENDER_OP_CUTOFF = 0.01;   // Sector returns null at op <= 0.01
const OVERLAP_DEG = 5;           // same tolerance as flick.test.js
const RADIAL_TOUCH = 0.02;       // ring-distance < 1 means radial overlap; ignore boundary touches
const VANISH_SPAN_DEG = 3;
const VANISH_RING_EXEMPT = 0.2;  // ring~0 sectors hand off to the center circle at the shortcut
// Center op/border are lerps: bound adjacent jumps by slope x step (x1.5 margin).
// op slope <= co*2*2 = 0.6/rawP; border slope <= 1*2*2 = 4/rawP (easeInOut slope <= 2).
const CENTER_OP_SLOPE = 5.5; // pulse goes 0→0.5→0 during morph phase — steepest rise at pre-stage→morph boundary
const CENTER_BORDER_SLOPE = 4.2;
const BUCKET_COUNT_JUMP = 3;
const BUCKET_VISIBLE_OP = 0.5;   // fade-outs cross the render threshold legitimately; only count clearly-visible buckets
const ENDPOINT_CENTER_TOL = 0.02;
const CROSS_SPAN = 8;            // deg — a "pop" appears with substantial span at the crossing...
const CROSS_OP = 0.15;           // ...AND substantial opacity at once (growth/fade entrances cross one threshold at a time)
const SHORTCUT_SHIFT_DEG = 8;    // max median matched-sector angular shift near the endpoints
// Endpoint-adjacent grid steps: the animation must CONVERGE, not jump, near its
// start and end (the fixed-center → natural orientation snap class — a uniform
// rotation of the whole map in one frame). Mid-morph steps are exempt: fast
// rearrangement is legitimate there.
const CONVERGENCE_STEPS = new Set([1, 2, 3, 10, 11, 12]); // P_GRID steps: 0→.02, .02→.1, .1→.25 | .9→.99, .99→.999, .999→1
// Back-outs and any-to-any run the geometric morph at their START (reversed
// drill end / wedge composition): legit fast content motion there. Only the
// END is a convergence window for them.
const CONVERGENCE_STEPS_END_ONLY = new Set([10, 11, 12]);

// Median angular shift (degrees) of sectors visible in both frames. A uniform
// rotation of the whole map moves the median by the rotation amount; ordinary
// per-sector motion rarely aligns the median.
function medianShift(prev, curr) {
  const vis = (items) => new Map(items.filter(isVisible)
    .filter((it) => it.span > 1)
    .map((it) => [it.node, it]));
  const m0 = vis(prev), m1 = vis(curr);
  const deltas = [];
  for (const [node, i0] of m0) {
    const i1 = m1.get(node);
    if (!i1 || i1.node.type === "smaller") continue;
    let d = Math.abs(norm(i1.start + i1.span / 2) - norm(i0.start + i0.span / 2));
    if (d > 180) d = 360 - d;
    deltas.push(d);
  }
  if (!deltas.length) return 0;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

// Bisect [rawP0, rawP1] for the first frame where `node` is visible and return
// its item there (or null). genFrame takes eased p; we sample at eased(rawP)
// midpoints — the same easing the component applies (Motion driver).
function findCrossing(genFrame, rawP0, rawP1, node) {
  let lo = rawP0, hi = rawP1;
  const visAt = (rawP) => genFrame(easeInOut(rawP)).find((it) => it.node === node && isVisible(it));
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    if (visAt(mid)) hi = mid; else lo = mid;
  }
  return visAt(hi) ?? null;
}

export const isVisible = (it) =>
  !it.isCenter && (it.op ?? 1) > RENDER_OP_CUTOFF && it.span > RENDER_SPAN_CUTOFF;

// Clone + size + lay out a dataset once; return root and all folders.
export function prepareDataset(data) {
  const root = JSON.parse(JSON.stringify(data));
  computeSizes(root);
  layout(root); // sets _parent chain + freezes _hue
  const folders = [];
  (function walk(n) { if (n.children) { folders.push(n); n.children.forEach(walk); } })(root);
  return { root, folders };
}

// The production navigation graph: a folder is reachable iff it is a big child
// (span >= THETA_MIN) in its parent's OWN layout, walking down from the root.
// Sub-THETA_MIN folders render only inside the "smaller objects" bucket, which
// is not drillable — so transitions to/from them are unreachable in the UI.
export function reachableFolders(root) {
  const reachable = [];
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const f = queue.shift();
    reachable.push(f);
    for (const n of layout(f)) {
      if (n._ring === 1 && n.type === "folder" && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return reachable;
}

// Drill edges of the reachable graph: (parent, child) where child is a big
// folder child in layout(parent).
export function reachableEdges(root) {
  const edges = [];
  for (const parent of reachableFolders(root)) {
    for (const n of layout(parent)) {
      if (n._ring === 1 && n.type === "folder") edges.push([parent, n]);
    }
  }
  return edges;
}

// Static post-navigation view of a node, in the same tuple space as morph frames.
export function staticView(node, rootNode, rotation = 0) {
  const items = layout(node)
    .filter(n => n._ring >= 1)
    .map(n => ({ node: n, ring: n._ring, start: norm(n._start + rotation), span: n._span, op: 1 }));
  const isRoot = node === rootNode;
  return {
    tuples: tuples(items),
    center: { op: isRoot ? 0 : CENTER_OPACITY, border: isRoot ? 1 : 0 },
  };
}

// Drill/back frame generator mirroring the component (SunburstMap): the morph
// emits frames in the parent's frame; the SVG rotation interpolates the angular
// offset from oldOffset (pre-nav static view, 0 for an un-rotated start) to
// newOffset (post-nav static view, rotated by childCenter − 180). Without this
// wrapper the p≥0.999 shortcut (natural orientation) differs from the morph's
// fixed-center end by design — the rotation is what makes them continuous.
// A node's _start/_span are stale if it was not placed by the LATEST layout of
// `ancestor` (fields persist across layouts of other roots). The placed set of
// layout() is the only reliable placement test.
export function placedPosIn(ancestor, node, sorting) {
  const placed = new Set(layout(ancestor));
  return placed.has(node)
    ? { start: node._start, span: node._span }
    : virtualPosIn(ancestor, node, sorting);
}

export function drillFrames(parent, child, rootNode) {
  const cv = placedPosIn(parent, child, "size");
  const childCenter = norm(cv.start + cv.span / 2);
  const newOffset = norm(childCenter - 180);
  // Mirror the component's rotation: frozen during pre-stage (p≤0.5),
  // interpolated during morph (p>0.5) using eased progress — matching
  // morphLayout's anchor unwind (both use easeInOut(pMorphRaw)).
  const genFrame = (p) => {
    const rot = p <= 0.5 ? 0 : lerpAngle(0, newOffset, easeInOut((p - 0.5) * 2));
    return morphLayout(parent, child, p).map(it => ({ ...it, start: norm(it.start + rot) }));
  };
  // Rotation changes only during the morph half (p>0.5) with eased progress:
  // instantaneous rate is 2× the eased derivative.
  const easedMorphT = (rawP) => Math.max(0, easeInOut((rawP - 0.5) * 2));
  const rotationAllowance = (i) =>
    Math.abs(newOffset) * Math.abs(easedMorphT(P_GRID[i]) - easedMorphT(P_GRID[i - 1])) * 3 + 5;
  return {
    genFrame,
    fromView: staticView(parent, rootNode, 0),
    toView: staticView(child, rootNode, newOffset),
    rotationAllowance,
  };
}

// Any-to-any / back-out allowance: designed rotation (SVG interpolation,
// emission-anchor travel, arc convergence) decelerates smoothly into the
// endpoint — measured tails ≤ ~19° in the last grid step. The snap class
// (uniform rotation jump: observed 70–140° in one step) sits far above.
const FLAT_SHIFT_ALLOWANCE = 25;
export const anyToAnyRotationAllowance = () => FLAT_SHIFT_ALLOWANCE;

// Transition frame setup mirroring the component's navigateTo routing:
//  - from is an ancestor of to → drill-down (startAnim): frames unwound to
//    natural + SVG rotation oldOffset → newOffset (childCenter − 180).
//  - to is an ancestor of from → back-out (startAnim reversed): frames = the
//    forward drill played backwards; the from-view is rotated by its own
//    drill's offset; ends at natural layout(to).
//  - otherwise → true any-to-any: frames carry fromCenter; ends at layout(to)
//    rotated by fromCenter.
export function anyToAnyFrames(from, to, rootNode) {
  const anc = new Set();
  let n = from;
  while (n) { anc.add(n); n = n._parent; }
  const isAncestor = (a, b) => { let x = b; while (x) { if (x === a) return true; x = x._parent; } return false; };

  if (isAncestor(from, to)) {
    // Drill-down (same as the drill oracle).
    const df = drillFrames(from, to, rootNode);
    return { type: 'single', ...df };
  }

  if (isAncestor(to, from)) {
    // Back-out: the from-view carries its producing drill's offset.
    const fv = placedPosIn(to, from, "size");
    const fromCenter = norm(fv.start + fv.span / 2);
    const oldOffset = norm(fromCenter - 180);
    // Mirror component rotation: morph phase (p<0.5 in test space, compP>0.5)
    // interpolates oldOffset→0 using eased progress; post-stage (p≥0.5) frozen at 0.
    const genFrame = (p) => {
      const rot = p < 0.5 ? lerpAngle(0, oldOffset, easeInOut(1 - 2 * p)) : 0;
      return morphLayout(to, from, 1 - p).map(it => ({ ...it, start: norm(it.start + rot) }));
    };
    return {
      type: 'single',
      genFrame,
      fromView: staticView(from, rootNode, oldOffset),
      toView: staticView(to, rootNode, 0),
      rotationAllowance: anyToAnyRotationAllowance,
      convergenceSteps: CONVERGENCE_STEPS_END_ONLY,
    };
  }

  let common = to;
  while (common && !anc.has(common)) common = common._parent;
  if (!common) common = rootNode;

  // Leg 1: back-out from `from` to `common`.
  const fv = placedPosIn(common, from, "size");
  const fromCenter = norm(fv.start + fv.span / 2);
  const oldOffset = norm(fromCenter - 180);
  const leg1Gen = (p) => {
    const rot = p < 0.5 ? lerpAngle(0, oldOffset, easeInOut(1 - 2 * p)) : 0;
    return morphLayout(common, from, 1 - p).map(it => ({ ...it, start: norm(it.start + rot) }));
  };

  // Leg 2: drill-in from `common` to `to`.
  const tv = placedPosIn(common, to, "size");
  const toCenter = norm(tv.start + tv.span / 2);
  const newOffset = norm(toCenter - 180);
  const leg2Gen = (p) => {
    const rot = p <= 0.5 ? 0 : lerpAngle(0, newOffset, easeInOut((p - 0.5) * 2));
    return morphLayout(common, to, p).map(it => ({ ...it, start: norm(it.start + rot) }));
  };

  return {
    type: 'dual',
    leg1: {
      genFrame: leg1Gen,
      fromView: staticView(from, rootNode, oldOffset),
      toView: staticView(common, rootNode, 0),
      rotationAllowance: anyToAnyRotationAllowance,
      convergenceSteps: CONVERGENCE_STEPS_END_ONLY,
    },
    leg2: {
      genFrame: leg2Gen,
      fromView: staticView(common, rootNode, 0),
      toView: staticView(to, rootNode, newOffset),
      rotationAllowance: anyToAnyRotationAllowance,
      convergenceSteps: CONVERGENCE_STEPS_END_ONLY,
    },
  };
}

// The painted center opacity: buildCenterEl suppresses the circle fill when any
// ring-0 sector exists; then the ring-0 sector's own op paints the disc.
function centerPaint(items) {
  const ci = items.find(it => it.isCenter);
  if (!ci) return { op: 0, border: 0 };
  const ring0 = items.find(it => !it.isCenter && it.ring <= 0 && isVisible(it));
  const hasRing0 = items.some(it => !it.isCenter && it.ring <= 0);
  return {
    op: hasRing0 ? (ring0 ? (ring0.op ?? 1) : 0) : (ci.op ?? 0),
    border: ci.borderOp ?? 0,
  };
}

function tuples(items) {
  return items.filter(isVisible)
    .map(it => {
      // Wrap-aware rounding: 359.9995 rounds to 360, which must alias to 0.
      const r2 = (x) => { const v = Math.round(x * 100) / 100; return v === 360 ? 0 : v; };
      const r3 = (x) => { const v = Math.round(x * 1000) / 1000; return v === 360 ? 0 : v; };
      return `${it.node.type}|${r2(it.ring)}|${r3(norm(it.start))}|${r3(it.span)}`;
    })
    .sort();
}

// Arc overlap (degrees, clockwise, may wrap) — same algorithm as flick.test.js.
function angularOverlap(a0, a1, b0, b1) {
  const A0 = a0, A1 = a1 < a0 ? a1 + 360 : a1;
  const B0 = b0, B1 = b1 < b0 ? b1 + 360 : b1;
  let maxOverlap = 0;
  for (const shift of [0, -360, 360]) {
    const o = Math.min(A1 + shift, B1) - Math.max(A0 + shift, B0);
    if (o > maxOverlap) maxOverlap = o;
  }
  for (const shift of [0, -360, 360]) {
    const o = Math.min(B1 + shift, A1) - Math.max(B0 + shift, A0);
    if (o > maxOverlap) maxOverlap = o;
  }
  return Math.max(0, maxOverlap);
}

function diffSummary(a, b, name) {
  const setA = new Set(a), setB = new Set(b);
  const onlyA = a.filter(x => !setB.has(x)).slice(0, 5);
  const onlyB = b.filter(x => !setA.has(x)).slice(0, 5);
  return `${name}: only-in-frame=[${onlyA.join("; ")}] only-in-static=[${onlyB.join("; ")}]`;
}

const MAX_PER_TRANSITION = 20;

/**
 * Check one transition. genFrame receives eased p and returns morph items.
 * fromView / toView are staticView() results for the two endpoints.
 * opts.rotationAllowance(stepIdx) — degrees of median sector shift allowed for
 * the designed rotation (SVG rotation interpolation / arc convergence) in that
 * grid step; the snap class (uniform rotation JUMP) exceeds it by an order of
 * magnitude.
 * Returns an array of violations: { kind, label, msg }.
 */
export function checkTransition(label, genFrame, fromView, toView, opts = {}) {
  const rotationAllowance = opts.rotationAllowance ?? (() => SHORTCUT_SHIFT_DEG);
  const convergenceSteps = opts.convergenceSteps ?? CONVERGENCE_STEPS;
  const v = [];
  const push = (kind, msg) => { if (v.length < MAX_PER_TRANSITION) v.push({ kind, label, msg }); };
  const frames = P_GRID.map(rawP => genFrame(easeInOut(rawP)));

  // ---- per-frame predicates ----
  for (let i = 0; i < frames.length; i++) {
    const items = frames[i];
    const vis = items.filter(isVisible);
    const seen = new Set();
    for (const it of vis) {
      if (seen.has(it.node)) {
        push("double-visible", `p=${P_GRID[i]} node "${it.node.name}" visible twice`);
      } else seen.add(it.node);
    }
    const sorted = [...vis].sort((a, b) => a.ring - b.ring);
    for (let a = 0; a < sorted.length; a++) {
      const A = sorted[a];
      // Radial intervals [ring, ring+1] must overlap by more than RADIAL_TOUCH —
      // sliding rings differ by exactly 1 (boundary touch, zero area).
      for (let b = a + 1; b < sorted.length && sorted[b].ring < A.ring + 1 - RADIAL_TOUCH; b++) {
        const B = sorted[b];
        const ov = angularOverlap(norm(A.start), norm(A.start + A.span), norm(B.start), norm(B.start + B.span));
        if (ov >= OVERLAP_DEG) {
          push("overlap", `p=${P_GRID[i]} "${A.node.name}" vs "${B.node.name}" ${ov.toFixed(1)}deg rings ${A.ring.toFixed(2)}/${B.ring.toFixed(2)}`);
        }
      }
    }
  }

  // ---- adjacent-frame predicates ----
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1], curr = frames[i];
    const step = P_GRID[i] - P_GRID[i - 1];
    const prevEmitted = new Map(), currEmitted = new Map();
    for (const it of prev) if (!it.isCenter && it.node.type !== "smaller") prevEmitted.set(it.node, it);
    for (const it of curr) if (!it.isCenter && it.node.type !== "smaller") currEmitted.set(it.node, it);
    for (const it of currEmitted.values()) {
      if (isVisible(it) && it.ring >= VANISH_RING_EXEMPT && !prevEmitted.has(it.node)) {
        // Coarse-grid candidate: nodes enter visibility either by growing
        // through the 0.2° span cutoff (any op) or fading through the 0.01 op
        // cutoff (any span) — both continuous by construction. A real pop
        // appears with substantial span AND opacity at once. Bisect to the
        // actual crossing frame and apply the thresholds there, where the
        // grid-step growth rate can't mask them.
        const crossing = findCrossing(genFrame, P_GRID[i - 1], P_GRID[i], it.node);
        if (crossing && crossing.span > CROSS_SPAN && (crossing.op ?? 1) > CROSS_OP) {
          push("pop-in", `p ${P_GRID[i - 1]}→${P_GRID[i]} "${it.node.name}" appears at crossing (span ${crossing.span.toFixed(2)}, op ${(crossing.op ?? 1).toFixed(2)})`);
        }
      }
    }
    for (const it of prevEmitted.values()) {
      if (isVisible(it) && !currEmitted.has(it.node) && it.span > VANISH_SPAN_DEG && it.ring >= VANISH_RING_EXEMPT) {
        push("pop-out", `p ${P_GRID[i - 1]}→${P_GRID[i]} "${it.node.name}" vanishes (span ${it.span.toFixed(2)}, op ${(it.op ?? 1).toFixed(2)})`);
      }
    }
    // Grey-area continuity: the historical bucket bug class (buckets vanishing
    // from full opacity — emission gating) DROPS the opacity-weighted bucket
    // span instantly. Growth is unbounded (the expanding child wedge carries the
    // bucket with it), so only drops are checked. Shrinkage is bounded: opacity
    // fades move ≤ greyPrev×(4·step) and migrating-share release moves ≤ one
    // wedge's worth of lerp (≤ 360×4·step); θ_min slack covers the rest.
    const greyPrev = prev.reduce((a, it) => a + (it.node.type === "smaller" && !it.isCenter ? it.span * (it.op ?? 1) : 0), 0);
    const greyCurr = curr.reduce((a, it) => a + (it.node.type === "smaller" && !it.isCenter ? it.span * (it.op ?? 1) : 0), 0);
    const greyDropBound = (greyPrev + 360) * 4 * step + 2;
    if (greyPrev - greyCurr > greyDropBound) {
      push("bucket-jump", `p ${P_GRID[i - 1]}→${P_GRID[i]} grey span drop ${greyPrev.toFixed(1)}→${greyCurr.toFixed(1)} (bound ${greyDropBound.toFixed(1)})`);
    }
    const cp0 = centerPaint(prev), cp1 = centerPaint(curr);
    if (Math.abs(cp1.op - cp0.op) > CENTER_OP_SLOPE * step * 1.5) {
      push("center-jump", `p ${P_GRID[i - 1]}→${P_GRID[i]} center op ${cp0.op.toFixed(3)}→${cp1.op.toFixed(3)}`);
    }
    if (Math.abs(cp1.border - cp0.border) > CENTER_BORDER_SLOPE * step * 1.5) {
      push("border-jump", `p ${P_GRID[i - 1]}→${P_GRID[i]} center border ${cp0.border.toFixed(3)}→${cp1.border.toFixed(3)}`);
    }
    if (convergenceSteps.has(i)) {
      const ms = medianShift(prev, curr);
      if (ms > rotationAllowance(i)) {
        push("global-shift", `p ${P_GRID[i - 1]}→${P_GRID[i]} median sector shift ${ms.toFixed(1)}° (allowance ${rotationAllowance(i).toFixed(1)}°, uniform rotation snap)`);
      }
    }
  }

  // ---- endpoint identity ----
  const t0 = tuples(frames[0]);
  const t1 = tuples(frames[frames.length - 1]);
  if (t0.join("\n") !== fromView.tuples.join("\n")) {
    push("endpoint-start", diffSummary(t0, fromView.tuples, "frame(0) vs static(from)"));
  }
  if (t1.join("\n") !== toView.tuples.join("\n")) {
    push("endpoint-end", diffSummary(t1, toView.tuples, "frame(1) vs static(to)"));
  }
  const c0 = centerPaint(frames[0]), c1 = centerPaint(frames[frames.length - 1]);
  if (Math.abs(c0.op - fromView.center.op) > ENDPOINT_CENTER_TOL ||
      Math.abs(c0.border - fromView.center.border) > ENDPOINT_CENTER_TOL) {
    push("endpoint-center-start", `frame(0) center op=${c0.op.toFixed(3)} border=${c0.border.toFixed(3)} vs static op=${fromView.center.op} border=${fromView.center.border}`);
  }
  if (Math.abs(c1.op - toView.center.op) > ENDPOINT_CENTER_TOL ||
      Math.abs(c1.border - toView.center.border) > ENDPOINT_CENTER_TOL) {
    push("endpoint-center-end", `frame(1) center op=${c1.op.toFixed(3)} border=${c1.border.toFixed(3)} vs static op=${toView.center.op} border=${toView.center.border}`);
  }
  return v;
}

/** Aggregate violations by kind for a bounded failure message. */
export function summarize(violations) {
  const byKind = new Map();
  for (const v of violations) {
    if (!byKind.has(v.kind)) byKind.set(v.kind, { count: 0, examples: [] });
    const e = byKind.get(v.kind);
    e.count++;
    if (e.examples.length < 3) e.examples.push(`${v.label}: ${v.msg}`);
  }
  return [...byKind.entries()]
    .map(([kind, e]) => `${kind}: ${e.count}\n    ${e.examples.join("\n    ")}`)
    .join("\n  ");
}

/**
 * Shared runner for the exhaustive any-to-any oracle. Split across many test
 * FILES (vitest parallelizes files, not tests within a file). shardOf picks
 * the from-folder indices this file covers.
 */
export function runAnyToAnyShards({ name, data, fileIndex, fileCount, shardsPerFile = 4 }, expect) {
  const { root } = prepareDataset(data);
  const folders = reachableFolders(root);
  const totalShards = fileCount * shardsPerFile;
  const myShards = [];
  for (let s = fileIndex * shardsPerFile; s < (fileIndex + 1) * shardsPerFile; s++) myShards.push(s);
  for (const s of myShards) {
    const violations = [];
    let pairs = 0;
    for (let ai = 0; ai < folders.length; ai++) {
      if (ai % totalShards !== s) continue;
      const a = folders[ai];
      for (const b of folders) {
        if (a === b) continue;
        pairs++;
        const result = anyToAnyFrames(a, b, root);
        if (result.type === 'dual') {
          violations.push(...checkTransition(
            `${name}: ${a.name}→${b.name} (back-out)`,
            result.leg1.genFrame,
            result.leg1.fromView, result.leg1.toView,
            { rotationAllowance: result.leg1.rotationAllowance, convergenceSteps: result.leg1.convergenceSteps },
          ));
          violations.push(...checkTransition(
            `${name}: ${a.name}→${b.name} (drill-in)`,
            result.leg2.genFrame,
            result.leg2.fromView, result.leg2.toView,
            { rotationAllowance: result.leg2.rotationAllowance, convergenceSteps: result.leg2.convergenceSteps },
          ));
          // Boundary continuity: leg1 end must match leg2 start (both settle at common)
          if (result.leg1.toView.tuples.join(",") !== result.leg2.fromView.tuples.join(",")) {
            violations.push({ kind: "boundary-mismatch", label: `${name}: ${a.name}→${b.name}`, msg: "leg1 end and leg2 start tuples differ" });
          }
          if (Math.abs(result.leg1.toView.center.op - result.leg2.fromView.center.op) > 0.02) {
            violations.push({ kind: "boundary-center", label: `${name}: ${a.name}→${b.name}`, msg: `center op ${result.leg1.toView.center.op.toFixed(3)} vs ${result.leg2.fromView.center.op.toFixed(3)}` });
          }
        } else {
          violations.push(...checkTransition(
            `${name}: ${a.name}→${b.name}`,
            result.genFrame,
            result.fromView, result.toView,
            { rotationAllowance: result.rotationAllowance, convergenceSteps: result.convergenceSteps },
          ));
        }
      }
    }
    expect(violations.length, `reachable=${folders.length} pairs=${pairs} shard=${s + 1}/${totalShards}\n  ${summarize(violations)}`).toBe(0);
  }
}
