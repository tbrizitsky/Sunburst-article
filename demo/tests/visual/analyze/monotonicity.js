// Monotonicity invariants.
// Verifies that animation properties change in the correct direction across frames.
import { parseSectors } from "./parse-svg.js";

/**
 * Check that the child wedge span grows monotonically during drill-in.
 * The child is identified by its fill: in the final frame it is the innermost
 * sector (ring 0 — it has become the center). Its span is then tracked across
 * all frames (it renders at ring 1−p, so a ring filter would lose it).
 * Returns violations: [{ p, span, prevSpan }]
 */
export function checkChildWedgeGrows(frames) {
  const violations = [];
  if (frames.length === 0) return violations;

  // Identify the child sector: the innermost sector in the final frame
  // (at p=1 it has become the center at ring 0).
  const last = parseSectors(frames[frames.length - 1]);
  let childFill = null;
  let minRing = Infinity;
  for (const s of last.sectors) {
    if (s.ring < minRing) {
      minRing = s.ring;
      childFill = s.fill;
    }
  }
  if (childFill === null) return violations;

  let prevWedge = 0;
  for (let i = 0; i < frames.length; i++) {
    const { sectors } = parseSectors(frames[i]);
    // Track the child by fill. Its hue can collide with a descendant's (hues
    // derive from angular position, and the wedge's center is fixed), so take
    // the sector at the SMALLEST ring — the child is always innermost.
    const child = sectors
      .filter((s) => s.fill === childFill)
      .sort((a, b) => a.ring - b.ring)[0];
    if (!child) continue;
    const wedge = child.span;

    if (wedge < prevWedge - 1 && i > 0) {
      violations.push({
        frame: i,
        p: Math.round(i / (frames.length - 1) * 1000) / 1000,
        span: Math.round(wedge * 100) / 100,
        prevSpan: Math.round(prevWedge * 100) / 100,
      });
    }
    prevWedge = Math.max(prevWedge, wedge);
  }
  return violations;
}

/**
 * Check that sibling sectors (non-wedge at ring 1) shrink monotonically.
 * Returns violations: [{ p, sector, span, prevSpan }]
 */
export function checkSiblingsShrink(frames) {
  const violations = [];

  for (let i = 1; i < frames.length; i++) {
    const prev = parseSectors(frames[i - 1]);
    const curr = parseSectors(frames[i]);

    const prevRing1 = prev.sectors.filter(s => Math.round(s.ring) === 1);
    const currRing1 = curr.sectors.filter(s => Math.round(s.ring) === 1);

    // Find the wedge (largest span) and exclude it
    const prevWedge = Math.max(...prevRing1.map(s => s.span), 0);
    const currWedge = Math.max(...currRing1.map(s => s.span), 0);

    const prevSiblings = prevRing1.filter(s => s.span < prevWedge - 0.1);
    const currSiblings = currRing1.filter(s => s.span < currWedge - 0.1);

    // Match siblings by fill color
    for (const ps of prevSiblings) {
      const cs = currSiblings.find(s => s.fill === ps.fill);
      if (cs && cs.span > ps.span + 0.5) {
        violations.push({
          frame: i,
          p: i / (frames.length - 1),
          sector: ps.fill,
          span: Math.round(cs.span * 100) / 100,
          prevSpan: Math.round(ps.span * 100) / 100,
        });
      }
    }
  }
  return violations;
}

/**
 * Check that descendant rings decrease monotonically (slide inward).
 * Returns violations: [{ p, fill, ring, prevRing }]
 */
export function checkDescendantRingsDecrease(frames) {
  const violations = [];

  for (let i = 1; i < frames.length; i++) {
    const prev = parseSectors(frames[i - 1]);
    const curr = parseSectors(frames[i]);

    // Match sectors by fill color
    for (const ps of prev.sectors) {
      const cs = curr.sectors.find(s => s.fill === ps.fill);
      if (cs && cs.ring > ps.ring + 0.1) {
        violations.push({
          frame: i,
          p: i / (frames.length - 1),
          fill: ps.fill,
          ring: Math.round(cs.ring * 100) / 100,
          prevRing: Math.round(ps.ring * 100) / 100,
        });
      }
    }
  }
  return violations;
}

/**
 * Check that center circle opacity increases monotonically (drill-in from root)
 * during the pre-stage phase (p <= 0.5). Center is suppressed (opacity = 0)
 * during the morph phase (p > 0.5), so only pre-stage frames are checked.
 * Returns violations: [{ p, opacity, prevOpacity }]
 */
export function checkCenterOpacityIncreases(frames) {
  const violations = [];
  let prevOp = -1;

  for (let i = 0; i < frames.length; i++) {
    const { center } = parseSectors(frames[i]);
    const op = center.fillOpacity;
    const p = frames.length > 1 ? i / (frames.length - 1) : 0;

    if (p > 0.5) break;

    if (prevOp >= 0 && op < prevOp - 0.01) {
      violations.push({
        frame: i,
        p: Math.round(p * 1000) / 1000,
        opacity: Math.round(op * 1000) / 1000,
        prevOpacity: Math.round(prevOp * 1000) / 1000,
      });
    }
    prevOp = op;
  }
  return violations;
}

/**
 * Check that center border opacity decreases monotonically (drill-in from root)
 * during the pre-stage phase (p <= 0.5). Border is suppressed (opacity = 0)
 * during the morph phase (p > 0.5), so only pre-stage frames are checked.
 * Returns violations: [{ p, borderOpacity, prevBorderOpacity }]
 */
export function checkCenterBorderDecreases(frames) {
  const violations = [];
  let prevOp = 2;

  for (let i = 0; i < frames.length; i++) {
    const { center } = parseSectors(frames[i]);
    const op = center.strokeOpacity;
    const p = frames.length > 1 ? i / (frames.length - 1) : 0;

    if (p > 0.5) break;

    if (prevOp <= 1 && op > prevOp + 0.01) {
      violations.push({
        frame: i,
        p: Math.round(p * 1000) / 1000,
        borderOpacity: Math.round(op * 1000) / 1000,
        prevBorderOpacity: Math.round(prevOp * 1000) / 1000,
      });
    }
    prevOp = op;
  }
  return violations;
}
