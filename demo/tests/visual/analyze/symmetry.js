// Symmetry checks.
// Verifies that drill-in and back produce symmetric sector layouts.
import { parseSectors } from "./parse-svg.js";

/**
 * Check that drill-in at p and back at 1-p produce the same sector layout.
 * Compares sector count, ring distribution, and span sums.
 * Returns violations: [{ p, drillCount, backCount, drillRing1Span, backRing1Span }]
 */
export function checkDrillBackSymmetry(drillFrames, backFrames) {
  const violations = [];

  if (drillFrames.length !== backFrames.length) {
    return [{
      issue: "frame count mismatch",
      drillCount: drillFrames.length,
      backCount: backFrames.length,
    }];
  }

  const n = drillFrames.length;

  for (let i = 0; i < n; i++) {
    const drill = parseSectors(drillFrames[i]);
    const back = parseSectors(backFrames[n - 1 - i]); // reversed

    const drillCount = drill.sectors.length;
    const backCount = back.sectors.length;

    // Sector counts should be similar (allow small differences from center circle)
    if (Math.abs(drillCount - backCount) > 2) {
      violations.push({
        p: i / (n - 1),
        drillCount,
        backCount,
        issue: "sector count mismatch",
      });
      continue;
    }

    // Ring-1 total span should match
    const drillRing1 = drill.sectors.filter(s => Math.round(s.ring) === 1);
    const backRing1 = back.sectors.filter(s => Math.round(s.ring) === 1);
    const drillSpan = drillRing1.reduce((sum, s) => sum + s.span, 0);
    const backSpan = backRing1.reduce((sum, s) => sum + s.span, 0);

    if (Math.abs(drillSpan - backSpan) > 2) {
      violations.push({
        p: i / (n - 1),
        drillRing1Span: Math.round(drillSpan * 100) / 100,
        backRing1Span: Math.round(backSpan * 100) / 100,
        issue: "ring-1 span mismatch",
      });
    }
  }

  return violations;
}

/**
 * Check that reversing the frame sequence produces the same frames in reverse.
 * Returns violations: [{ p, issue }]
 */
export function checkFrameReversibility(frames) {
  const violations = [];
  const n = frames.length;

  for (let i = 0; i < Math.floor(n / 2); i++) {
    const forward = parseSectors(frames[i]);
    const backward = parseSectors(frames[n - 1 - i]);

    // Sector counts should match
    if (Math.abs(forward.sectors.length - backward.sectors.length) > 2) {
      violations.push({
        p: i / (n - 1),
        forwardCount: forward.sectors.length,
        backwardCount: backward.sectors.length,
        issue: "sector count not symmetric",
      });
    }
  }

  return violations;
}
