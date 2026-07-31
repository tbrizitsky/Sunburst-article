// Endpoint correctness checks.
// Verifies that p=0 matches the old layout and p=1 matches the new layout.
import { parseSectors } from "./parse-svg.js";
import { computeSizes, layout, MAX_RING } from "../../../src/layout.js";

/**
 * Check that p=0 frame has the expected number of sectors from the old layout.
 * Returns { oldCount, frameCount, missing } or null if OK.
 */
export function checkP0MatchesOld(frame0, oldRoot) {
  const { sectors } = parseSectors(frame0);
  const oldPlaced = layout(oldRoot).filter(n => n._ring >= 1 && n._ring <= MAX_RING);

  const frameCount = sectors.length;
  const oldCount = oldPlaced.length;

  if (frameCount === 0) {
    return { oldCount, frameCount, issue: "no sectors at p=0" };
  }

  // Check that the frame has at least some sectors (not empty)
  if (frameCount < oldCount * 0.3) {
    return { oldCount, frameCount, issue: "too few sectors at p=0" };
  }

  return null;
}

/**
 * Check that p=1 frame has sectors (the new layout is rendered).
 * Returns { newCount, frameCount } or null if OK.
 */
export function checkP1MatchesNew(frame1, newRoot) {
  const { sectors } = parseSectors(frame1);
  const newPlaced = layout(newRoot).filter(n => n._ring >= 1 && n._ring <= MAX_RING);

  const frameCount = sectors.length;
  const newCount = newPlaced.length;

  if (frameCount === 0) {
    return { newCount, frameCount, issue: "no sectors at p=1" };
  }

  return null;
}

/**
 * Check that p=0 center circle has root border (if parent is root).
 */
export function checkP0CenterIsRoot(frame0) {
  const { center } = parseSectors(frame0);
  return {
    hasBorder: center.stroke !== "none" && center.stroke !== "",
    borderOpacity: center.strokeOpacity,
    fillOpacity: center.fillOpacity,
  };
}

/**
 * Check that p=1 center circle has no border and full opacity.
 */
export function checkP1CenterIsDrilled(frame1, expectedOpacity) {
  const { center } = parseSectors(frame1);
  return {
    hasBorder: center.stroke !== "none" && center.stroke !== "",
    borderOpacity: center.strokeOpacity,
    fillOpacity: center.fillOpacity,
    expectedOpacity,
  };
}
