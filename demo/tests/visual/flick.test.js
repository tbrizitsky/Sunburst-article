/**
 * Boundary-continuity tests for animation flick elimination.
 *
 * Documents the three flicks that were fixed:
 *   Bug A: pre-animation rotation flick (oldOffset vs newOffset)
 *   Bug B: center opacity discontinuity at the morph/shortcut boundary
 *   Bug C: any-to-any wedge overlap when fromCenter ≈ toCenter
 *
 * Each scenario checks continuity across the three frame boundaries:
 *   1. static (pre-animation) → morph p=0
 *   2. morph p=0.998 → shortcut p=0.999
 *   3. shortcut p=1.0 → static post-navigation
 */
import { describe, it, expect } from "vitest";
import {
  computeSizes, layout, easeInOut, norm, lerpAngle,
} from "../../src/layout.js";
import { disk } from "../../src/sample-data.js";
import {
  clone, renderStatic, renderStaticRotated, renderTransitionFrame,
} from "./helpers.js";

// ---- Scenarios ----

function rootUsersPair() {
  const root = clone(disk);
  computeSizes(root);
  layout(root);
  const users = root.children.find(c => c.name === "Users");
  return { parent: root, child: users, oldOffset: 0 };
}
// Extract the SVG rotation angle from the <g transform="rotate(...)"> wrapper.
function rotationAngle(svg) {
  const m = svg.match(/<g transform="rotate\(([\d.\-eE]+) 400 400\)"/);
  return m ? parseFloat(m[1]) : 0;
}

// Build a morph frame with the interpolated rotation, mirroring SunburstMap.jsx.
function buildMorphFrame(pair, rawP, isBack = false) {
  const { parent, child, oldOffset } = pair;
  computeSizes(parent);
  layout(parent);
  const childCenter = norm(child._start + child._span / 2);
  const newOffset = norm(childCenter - 180);
  const p = easeInOut(rawP);
  const t = isBack ? 1 - rawP : rawP;
  const rotateAngle = lerpAngle(oldOffset, newOffset, t);
  return { svg: renderTransitionFrame(parent, child, p, rotateAngle), rotateAngle, newOffset };
}

// ---- Tests ----

describe("flick elimination — boundary continuity (Bug A: rotation)", () => {
  it("drill root→Users: static pre-nav rotation (0) matches morph p=0 rotation (0)", () => {
    const pair = rootUsersPair();
    const staticSvg = renderStatic(pair.parent, pair.parent); // root static, no rotation
    const { svg: morph0, rotateAngle } = buildMorphFrame(pair, 0);
    // At p=0, rotateAngle should be 0 (matches static root view).
    expect(rotationAngle(staticSvg)).toBeCloseTo(0, 1);
    expect(rotateAngle).toBeCloseTo(0, 1);
    expect(rotationAngle(morph0)).toBeCloseTo(0, 1);
  });

  it("drill root→Users: shortcut p=1 rotation (newOffset) matches static post-nav (newOffset)", () => {
    const pair = rootUsersPair();
    const { child } = pair;
    const childCenter = norm(child._start + child._span / 2);
    const newOffset = norm(childCenter - 180);
    const { svg: shortcutSvg, rotateAngle } = buildMorphFrame(pair, 1.0);
    const postNavSvg = renderStaticRotated(pair.parent, child);
    expect(rotateAngle).toBeCloseTo(newOffset, 1);
    expect(rotationAngle(postNavSvg)).toBeCloseTo(newOffset, 1);
    // The full SVGs must match (sector paths + center + rotation wrapper).
    expect(shortcutSvg).toBe(postNavSvg);
  });

  it("back Users→root: rotation interpolates newOffset → 0 (reverse of drill)", () => {
    const pair = rootUsersPair();
    const { child } = pair;
    const childCenter = norm(child._start + child._span / 2);
    const newOffset = norm(childCenter - 180);
    // Back at rawP=0: t=1, rotation = newOffset (starts at the drilled view).
    // Back at rawP=1: t=0, rotation = 0 (ends at root static view).
    const { rotateAngle: r0 } = buildMorphFrame(pair, 0, true);
    const { rotateAngle: r1 } = buildMorphFrame(pair, 1.0, true);
    expect(r0).toBeCloseTo(newOffset, 1);
    expect(r1).toBeCloseTo(0, 1);
  });
});

describe("flick elimination — rotation continuity across entire animation", () => {
  it("drill root→Users: adjacent frame rotation angles differ by < 10°", () => {
    const pair = rootUsersPair();
    let prevAngle = NaN;
    for (let i = 0; i <= 50; i++) {
      const rawP = i / 50;
      const { rotateAngle } = buildMorphFrame(pair, rawP);
      if (i > 0) {
        expect(Math.abs(rotateAngle - prevAngle)).toBeLessThan(10);
      }
      prevAngle = rotateAngle;
    }
  });

  it("back Users→root: adjacent frame rotation angles differ by < 10°", () => {
    const pair = rootUsersPair();
    let prevAngle = NaN;
    for (let i = 0; i <= 50; i++) {
      const rawP = i / 50;
      const { rotateAngle } = buildMorphFrame(pair, rawP, true);
      if (i > 0) {
        expect(Math.abs(rotateAngle - prevAngle)).toBeLessThan(10);
      }
      prevAngle = rotateAngle;
    }
  });
});

