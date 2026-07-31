// Radial slide verification.
// Verifies that descendant rings decrease as p increases (the zoom).
import { parseSectors } from "./parse-svg.js";
import { MAX_RING } from "../../../src/layout.js";

/**
 * Check that at least one sector has a fractional ring during the transition
 * (proves real motion, not a snap).
 * Returns { hasFractional, fractionalRings: [...] }
 */
export function checkFractionalRings(frames) {
  const fractionalRings = [];

  for (let i = 0; i < frames.length; i++) {
    const { sectors } = parseSectors(frames[i]);
    for (const s of sectors) {
      if (!Number.isInteger(s.ring) && s.ring > 0 && s.ring <= MAX_RING + 1) {
        fractionalRings.push({
          frame: i,
          p: i / (frames.length - 1),
          ring: Math.round(s.ring * 100) / 100,
          fill: s.fill,
        });
      }
    }
  }

  return {
    hasFractional: fractionalRings.length > 0,
    count: fractionalRings.length,
    sample: fractionalRings.slice(0, 5),
  };
}

/**
 * Check that all sector rings are within valid bounds [0, MAX_RING + 1].
 * The child sector slides to ring 0 as it becomes the center (spec/animation.md).
 * Returns violations: [{ frame, p, fill, ring }]
 */
export function checkRingBounds(frames) {
  const violations = [];

  for (let i = 0; i < frames.length; i++) {
    const { sectors } = parseSectors(frames[i]);
    for (const s of sectors) {
      if (s.ring < -0.01 || s.ring > MAX_RING + 1.5) {
        violations.push({
          frame: i,
          p: i / (frames.length - 1),
          fill: s.fill,
          ring: Math.round(s.ring * 100) / 100,
        });
      }
    }
  }
  return violations;
}

/**
 * Check that the average ring of child-descendant sectors decreases as p increases.
 * Returns violations: [{ p, avgRing, prevAvgRing }]
 */
export function checkRadialSlide(frames) {
  const violations = [];
  let prevAvg = null;

  for (let i = 0; i < frames.length; i++) {
    const { sectors } = parseSectors(frames[i]);
    // Child descendants are sectors at ring > 1 (not the wedge or siblings at ring 1)
    const descendants = sectors.filter(s => s.ring > 1.5);
    if (descendants.length === 0) continue;

    const avgRing = descendants.reduce((sum, s) => sum + s.ring, 0) / descendants.length;

    if (prevAvg !== null && avgRing > prevAvg + 0.1) {
      violations.push({
        frame: i,
        p: i / (frames.length - 1),
        avgRing: Math.round(avgRing * 100) / 100,
        prevAvgRing: Math.round(prevAvg * 100) / 100,
      });
    }
    prevAvg = avgRing;
  }
  return violations;
}

