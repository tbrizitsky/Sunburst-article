// Edge case verification.
// Verifies correct behavior for empty folders, single children, etc.
import { parseSectors } from "./parse-svg.js";

/**
 * Check that an empty folder transition produces no sectors at any frame.
 * Returns violations: [{ frame, p, sectorCount }]
 */
export function checkEmptyFolderNoSectors(frames) {
  const violations = [];

  for (let i = 0; i < frames.length; i++) {
    const { sectors } = parseSectors(frames[i]);
    if (sectors.length > 0) {
      violations.push({
        frame: i,
        p: i / (frames.length - 1),
        sectorCount: sectors.length,
      });
    }
  }
  return violations;
}

/**
 * Check that a single-child transition has exactly one sector at ring 1
 * that grows to 360°.
 * Returns { violations, wedgeSpans }
 */
export function checkSingleChildGrowsTo360(frames) {
  const violations = [];
  const wedgeSpans = [];

  for (let i = 0; i < frames.length; i++) {
    const { sectors } = parseSectors(frames[i]);
    const ring1 = sectors.filter(s => Math.round(s.ring) === 1);

    if (ring1.length > 1) {
      violations.push({
        frame: i,
        p: i / (frames.length - 1),
        ring1Count: ring1.length,
        issue: "expected exactly 1 ring-1 sector",
      });
    }

    if (ring1.length > 0) {
      wedgeSpans.push({
        p: i / (frames.length - 1),
        span: Math.round(ring1[0].span * 100) / 100,
      });
    }
  }

  // Check that the last frame has wedge at 360°
  if (wedgeSpans.length > 0) {
    const last = wedgeSpans[wedgeSpans.length - 1];
    if (last.span < 350) {
      violations.push({
        issue: `wedge at p=1 is ${last.span}°, expected ~360°`,
      });
    }
  }

  return { violations, wedgeSpans };
}

/**
 * Check that an all-small folder transition produces no children ring sectors.
 * Returns violations: [{ frame, p, sectorCount }]
 */
export function checkAllSmallNoChildrenRing(frames) {
  const violations = [];

  for (let i = 0; i < frames.length; i++) {
    const { sectors } = parseSectors(frames[i]);
    // Children ring sectors would be at ring >= 2
    const childrenRing = sectors.filter(s => s.ring >= 2);
    if (childrenRing.length > 0) {
      violations.push({
        frame: i,
        p: i / (frames.length - 1),
        childrenRingCount: childrenRing.length,
      });
    }
  }
  return violations;
}
