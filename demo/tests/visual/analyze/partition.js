// Partition integrity checks.
// Verifies that sectors at each ring form a contiguous, non-overlapping partition.
import { groupByRing } from "./parse-svg.js";
import { ANGLE_GAP } from "../../../src/layout.js";

/**
 * Check that no two sectors at the same ring overlap angularly.
 * Returns array of violations: [{ ring, sectorA, sectorB, overlap }]
 */
export function checkNoOverlaps(sectors) {
  const violations = [];
  const byRing = groupByRing(sectors);

  for (const [ring, ringSectors] of byRing) {
    for (let a = 0; a < ringSectors.length; a++) {
      for (let b = a + 1; b < ringSectors.length; b++) {
        const A = ringSectors[a], B = ringSectors[b];
        const a0 = A.start, a1 = A.start + A.span;
        const b0 = B.start, b1 = B.start + B.span;

        // Check if intervals overlap (accounting for wrap-around)
        const overlap = intervalOverlap(a0, a1, b0, b1);
        if (overlap > 5) {
          violations.push({
            ring,
            sectorA: A.fill,
            sectorB: B.fill,
            overlap: Math.round(overlap * 100) / 100,
            a0: Math.round(a0), a1: Math.round(a1),
            b0: Math.round(b0), b1: Math.round(b1),
          });
        }
      }
    }
  }
  return violations;
}

/**
 * Check partition sums per ring band.
 * Per spec/animation.md, only the innermost ring band is a full partition
 * (it tiles the whole circle at the endpoints). Outer bands cover only the
 * angular regions where a visible parent exists, so they must not EXCEED a
 * full partition (over-coverage would mean overlapping sectors).
 * Only meaningful at endpoint frames (integer rings).
 * Returns array of violations: [{ ring, totalSpan, expected, sectorCount }]
 */
export function checkPartitionSum(sectors) {
  const violations = [];
  const byRing = groupByRing(sectors);
  const rings = [...byRing.keys()].sort((a, b) => a - b);

  rings.forEach((ring, idx) => {
    const ringSectors = byRing.get(ring);
    const totalSpan = ringSectors.reduce((sum, s) => sum + s.span, 0);
    const expected = 360 - ANGLE_GAP * ringSectors.length;

    if (idx === 0) {
      // Innermost band: full partition. Free space renders fully transparent
      // (fill-opacity 0), so the parser can't see it — allow its span to be
      // missing at the root view.
      const shortfall = expected - totalSpan;
      if (Math.abs(shortfall) > 5 && !(shortfall > 5 && shortfall <= 180)) {
        violations.push({
          ring,
          totalSpan: Math.round(totalSpan * 100) / 100,
          expected: Math.round(expected * 100) / 100,
          sectorCount: ringSectors.length,
        });
      }
    } else if (totalSpan > expected + 5) {
      // Outer bands: partial coverage allowed, over-coverage is not
      violations.push({
        ring,
        totalSpan: Math.round(totalSpan * 100) / 100,
        expected: Math.round(expected * 100) / 100,
        sectorCount: ringSectors.length,
        issue: "over-coverage",
      });
    }
  });
  return violations;
}

/**
 * Check that adjacent sectors at the same ring have consistent gaps.
 * Returns array of violations: [{ ring, gap, between, maxAllowed }]
 */
export function checkGapConsistency(sectors) {
  const violations = [];
  const byRing = groupByRing(sectors);

  for (const [ring, ringSectors] of byRing) {
    if (ringSectors.length < 2) continue;

    // Sort by start angle
    const sorted = [...ringSectors].sort((a, b) => a.start - b.start);

    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      const next = sorted[(i + 1) % sorted.length];
      const currEnd = curr.start + curr.span;
      let gap = next.start - currEnd;
      if (gap < 0) gap += 360; // wrap-around

      if (gap > ANGLE_GAP + 1 || gap < -0.5) {
        violations.push({
          ring,
          gap: Math.round(gap * 100) / 100,
          maxAllowed: ANGLE_GAP,
          between: `${curr.fill} → ${next.fill}`,
        });
      }
    }
  }
  return violations;
}

function intervalOverlap(a0, a1, b0, b1) {
  // Handle wrap-around: if a1 < a0, the interval wraps
  if (a1 < a0) a1 += 360;
  if (b1 < b0) b1 += 360;

  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  return Math.max(0, overlap);
}
