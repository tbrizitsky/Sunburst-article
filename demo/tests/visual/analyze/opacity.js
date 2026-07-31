// Opacity invariants.
// Verifies that sector opacities obey the spec rules.
import { parseSectors } from "./parse-svg.js";

/**
 * Check that all opacities are in [0, 1].
 * Returns violations: [{ frame, p, fill, opacity }]
 */
export function checkOpacityBounds(frames) {
  const violations = [];

  for (let i = 0; i < frames.length; i++) {
    const { sectors } = parseSectors(frames[i]);
    for (const s of sectors) {
      if (s.opacity < -0.01 || s.opacity > 1.01) {
        violations.push({
          frame: i,
          p: i / (frames.length - 1),
          fill: s.fill,
          opacity: s.opacity,
        });
      }
    }
  }
  return violations;
}

/**
 * Check that sibling opacities decrease monotonically.
 * Siblings are sectors at ring 1 that are NOT the largest (wedge).
 * Returns violations: [{ frame, p, fill, opacity, prevOpacity }]
 */
export function checkSiblingOpacityDecreases(frames) {
  const violations = [];

  for (let i = 1; i < frames.length; i++) {
    const prev = parseSectors(frames[i - 1]);
    const curr = parseSectors(frames[i]);

    const prevRing1 = prev.sectors.filter(s => Math.round(s.ring) === 1);
    const currRing1 = curr.sectors.filter(s => Math.round(s.ring) === 1);

    const prevWedge = Math.max(...prevRing1.map(s => s.span), 0);
    const currWedge = Math.max(...currRing1.map(s => s.span), 0);

    const prevSiblings = prevRing1.filter(s => s.span < prevWedge - 0.1);
    const currSiblings = currRing1.filter(s => s.span < currWedge - 0.1);

    for (const ps of prevSiblings) {
      const cs = currSiblings.find(s => s.fill === ps.fill);
      if (cs && cs.opacity > ps.opacity + 0.05) {
        violations.push({
          frame: i,
          p: i / (frames.length - 1),
          fill: ps.fill,
          opacity: Math.round(cs.opacity * 1000) / 1000,
          prevOpacity: Math.round(ps.opacity * 1000) / 1000,
        });
      }
    }
  }
  return violations;
}

/**
 * Check that descendant opacities increase or stay at 1.
 * Returns violations: [{ frame, p, fill, opacity, prevOpacity }]
 */
export function checkDescendantOpacityIncreases(frames) {
  const violations = [];

  for (let i = 1; i < frames.length; i++) {
    const prev = parseSectors(frames[i - 1]);
    const curr = parseSectors(frames[i]);

    for (const ps of prev.sectors) {
      if (ps.ring <= 1.5) continue; // skip ring-1 sectors
      const cs = curr.sectors.find(s => s.fill === ps.fill);
      if (cs && cs.opacity < ps.opacity - 0.05 && cs.opacity < 0.99) {
        violations.push({
          frame: i,
          p: i / (frames.length - 1),
          fill: ps.fill,
          opacity: Math.round(cs.opacity * 1000) / 1000,
          prevOpacity: Math.round(ps.opacity * 1000) / 1000,
        });
      }
    }
  }
  return violations;
}
