// Parse rendered SVG back into a geometric model.
// Extracts sectors from <path> elements by reversing sectorPath().
import { RING_RADII, MAX_RING, RADIAL_GAP, ANGLE_GAP } from "../../../src/layout.js";

// Cumulative outer-radius boundaries (same table radiusAt() interpolates on).
const BOUNDS = [0, ...RING_RADII.map(([, r1]) => r1)];

/**
 * Invert radiusAt(): given a rendered OUTER radius, recover the (possibly
 * fractional) ring. radiusAt(rf) interpolates the outer radius on BOUNDS as
 * rf+1, so ring = (segment index + fraction) − 1. The renderer insets the
 * outer radius by RADIAL_GAP/2 (except at MAX_RING), so add it back first;
 * clamping handles the MAX_RING case (no inset there).
 */
function ringFromOuterRadius(renderedR1) {
  const r = Math.max(BOUNDS[0], Math.min(BOUNDS[BOUNDS.length - 1], renderedR1 + RADIAL_GAP / 2));
  for (let k = 0; k < BOUNDS.length - 1; k++) {
    if (r <= BOUNDS[k + 1] || k === BOUNDS.length - 2) {
      const f = (r - BOUNDS[k]) / (BOUNDS[k + 1] - BOUNDS[k]);
      return k + f - 1;
    }
  }
  return MAX_RING;
}

/**
 * Parse an SVG string and extract all rendered sectors.
 * Returns { center, sectors } where:
 *   center = { fill, fillOpacity, stroke, strokeOpacity, strokeWidth }
 *   sectors = [{ ring, start, span, opacity, fill }]
 */
export function parseSectors(svg) {
  // Parse center circle
  const circleMatch = svg.match(/<circle[^>]*>/);
  const center = {};
  if (circleMatch) {
    const c = circleMatch[0];
    center.fill = (c.match(/fill="([^"]+)"/) || [])[1] || "";
    center.fillOpacity = parseFloat((c.match(/fill-opacity="([^"]+)"/) || [])[1] || "0");
    center.stroke = (c.match(/stroke="([^"]+)"/) || [])[1] || "";
    center.strokeOpacity = parseFloat((c.match(/stroke-opacity="([^"]+)"/) || [])[1] || "0");
    center.strokeWidth = parseFloat((c.match(/stroke-width="([^"]+)"/) || [])[1] || "0");
  }

  // Parse sectors from <path> elements
  const sectors = [];
  const pathRegex = /<path d="([^"]+)" fill="([^"]+)" fill-opacity="([^"]+)"/g;
  let match;
  while ((match = pathRegex.exec(svg)) !== null) {
    const d = match[1];
    const fill = match[2];
    const opacity = parseFloat(match[3]);

    const sector = parsePathData(d);
    if (sector) {
      sectors.push({ ...sector, opacity, fill });
    }
  }

  return { center, sectors };
}

/**
 * Parse a single path's d attribute back to ring, start, span.
 * The path format is: M x0 y0 L x1 y1 A r1 r1 0 large sweep x2 y2 L x3 y3 A r0 r0 0 large 0 x0 y0 Z
 */
function parsePathData(d) {
  // Extract all numeric values
  const nums = d.match(/-?\d+\.?\d*/g);
  if (!nums || nums.length < 10) return null;

  const values = nums.map(Number);

  // The path has: M x0 y0 L x1 y1 A r1 r1 0 large sweep x2 y2 L x3 y3 A r0 r0 0 large 0 x0 y0 Z
  // Indices:     0  1    2  3    4  5     6     7   8  9    10 11   12 13    14    15 16 17
  // Actually the format varies. Let me parse more carefully.

  // Find the A commands to extract radii
  const parts = d.split(/(?=[MLA])/);
  let r0 = null, r1 = null;
  let x0 = null, y0 = null, x2 = null, y2 = null;

  for (const part of parts) {
    const cmd = part[0];
    const coords = part.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

    if (cmd === 'M') {
      x0 = coords[0];
      y0 = coords[1];
    } else if (cmd === 'A' && r1 === null) {
      // First arc: outer radius
      r1 = coords[0];
      x2 = coords[5];
      y2 = coords[6];
    } else if (cmd === 'A' && r0 === null) {
      // Second arc: inner radius
      r0 = coords[0];
    }
  }

  if (r0 === null || r1 === null || x0 === null || y0 === null || x2 === null || y2 === null) {
    return null;
  }

  // Recover the (possibly fractional) ring from the outer radius.
  const ring = ringFromOuterRadius(r1);

  // Compute angles from coordinates
  // Center is at (400, 400)
  const CX = 400, CY = 400;
  const toDeg = (x, y) => {
    const a = Math.atan2(x - CX, CY - y) * 180 / Math.PI;
    return ((a % 360) + 360) % 360;
  };

  const a0 = Math.round(toDeg(x0, y0) * 10) / 10;
  const a1 = Math.round(toDeg(x2, y2) * 10) / 10;

  // Compute span as the clockwise arc from a0 to a1
  let span = a1 - a0;
  if (span < 0) span += 360;

  // Account for ANGLE_GAP inset
  const start = a0 + ANGLE_GAP / 2;
  span = span - ANGLE_GAP;

  if (span <= 0) return null;

  return { ring, start: Math.round(((start % 360) + 360) % 360 * 100) / 100, span: Math.round(span * 100) / 100 };
}

/**
 * Group sectors by ring, clustering nearby fractional rings together.
 * Sectors within 'tolerance' of each other are considered the same ring.
 * Groups keep their (fractional) representative ring — distinct fractional
 * bands (e.g. 1.5 vs 2.0 during a transition) are NOT merged.
 */
export function groupByRing(sectors, tolerance = 0.2) {
  const sorted = [...sectors].sort((a, b) => a.ring - b.ring);
  const groups = [];

  for (const s of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(s.ring - g.ring) < tolerance) {
      g.sectors.push(s);
    } else {
      groups.push({ ring: s.ring, sectors: [s] });
    }
  }

  const result = new Map();
  for (const g of groups) {
    result.set(Math.round(g.ring * 100) / 100, g.sectors);
  }
  return result;
}
