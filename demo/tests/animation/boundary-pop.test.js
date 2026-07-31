// Boundary pop-in/pop-out tests.
// Catches the most common visual glitch pattern — sectors that suddenly appear
// or disappear during transition, especially at two critical boundaries:
//   1. pre-stage→morph (p=0.5) — morph phase adds child's descendants gradually
//   2. morph→shortcut (p≈0.999) — morphLayout switches to exact layout(child)
//
// Key fact: the morph phase DOES introduce new sectors (child's descendants
// sliding into view). The invariant is that they appear gradually (fading in)
// and no unexpected sector pops in/out at a phase boundary.

import { describe, it, expect } from "vitest";
import {
  computeSizes, layout, morphLayout, easeInOut, lerpAngle, norm,
  subtreeNodes,
} from "../../src/layout.js";
import { disk } from "../../src/sample-data.js";
import { clone, renderTransitionFrame, renderStaticRotated } from "../visual/helpers.js";

const STEPS = 50;

function visibleItems(items) {
  return items.filter(it => !it.isCenter && it.op > 0.01 && it.span > 0.05);
}

function visibleNames(items) {
  return new Set(visibleItems(items).map(it => it.node.name));
}

// Build a rendered frame with interpolated rotation (mirrors SunburstMap.jsx).
function buildFrame(parent, child, rawP) {
  computeSizes(parent);
  layout(parent);
  const childCenter = norm(child._start + child._span / 2);
  const newOffset = norm(childCenter - 180);
  const p = easeInOut(rawP);
  const rotateAngle = lerpAngle(0, newOffset, p);
  return {
    svg: renderTransitionFrame(parent, child, p, rotateAngle),
    rotateAngle,
  };
}

const SCENARIOS = [
  ["root → Users", () => {
    const r = clone(disk); computeSizes(r); layout(r);
    return { parent: r, child: r.children.find(c => c.name === "Users") };
  }],
  ["root → Devices (multi-level)", () => {
    const r = clone(disk); computeSizes(r); layout(r);
    const lib = r.children.find(c => c.name === "Library");
    const dev = lib?.children?.find(c => c.name === "Developer");
    const cs = dev?.children?.find(c => c.name === "CoreSimulator");
    return { parent: r, child: cs?.children?.find(c => c.name === "Devices") };
  }],
  ["Contents → Resources (level 3→4)", () => {
    const r = clone(disk); computeSizes(r); layout(r);
    const apps = r.children.find(c => c.name === "Applications");
    const xc = apps?.children?.find(c => c.name === "Xcode.app");
    const ct = xc?.children?.find(c => c.name === "Contents");
    return { parent: ct, child: ct?.children?.find(c => c.name === "Resources") };
  }],
];

describe("boundary — pre-stage→morph (p=0.5) no unexpected sectors", () => {
  for (const [name, fn] of SCENARIOS) {
    it(`${name}: all new sectors at p=0.51 are child descendants (fading in)`, () => {
      const { parent, child } = fn();
      const childSub = subtreeNodes(child);
      const before = visibleNames(morphLayout(parent, child, 0.49));
      const after = visibleNames(morphLayout(parent, child, 0.51));
      for (const n of after) {
        if (!before.has(n)) {
          // New sector at morph onset must be a descendant of the child
          expect(childSub.has(n) || n === child.name).toBe(true);
        }
      }
    });

    it(`${name}: intermediate ancestors (path from parent→child, excluding siblings) fade to op ≤ 0.05 by p=0.51`, () => {
      const { parent, child } = fn();
      // Find intermediate ancestors in the path from parent to child
      // Walk child up: if child's _parent chain passes through nodes whose
      // _parent is also in the chain (excluding parent and child), those are
      // intermediate ancestors.
      const interAncestors = new Set();
      let node = child;
      while (node !== parent) {
        const p = node._parent || parent;
        if (p !== parent && p !== child) interAncestors.add(p.name);
        node = p;
      }
      if (interAncestors.size === 0) return; // no intermediate ancestors to check
      const items = morphLayout(parent, child, 0.51);
      for (const it of items) {
        if (interAncestors.has(it.node.name)) {
          expect(it.op).toBeLessThanOrEqual(0.05);
        }
      }
    });
  }
});

describe("boundary — during pre-stage (p<0.5) non-child sectors only fade out", () => {
  for (const [name, fn] of SCENARIOS) {
    it(`${name}: non-child-subtree sector opacities are non-increasing in pre-stage`, () => {
      const { parent, child } = fn();
      const childSub = subtreeNodes(child);
      // Collect opacities for non-child nodes across pre-stage (p = eased(0) to eased(0.5))
      let prevOps = new Map();
      for (let i = 0; i <= STEPS / 2; i++) {
        const p = easeInOut(i / STEPS); // goes from 0 to ~0.5
        const items = morphLayout(parent, child, p);
        const ops = new Map();
        for (const it of items) {
          if (childSub.has(it.node.name) || it.node.name === child.name) continue;
          ops.set(it.node.name, it.op);
        }
        if (i > 0) {
          for (const [name, op] of ops) {
            if (prevOps.has(name)) {
              expect(op).toBeLessThanOrEqual(prevOps.get(name) + 0.01);
            }
          }
        }
        prevOps = ops;
      }
    });
  }
});

describe("boundary — rotation continuity", () => {
  it("root → Users: adjacent frame rotation angles differ by < 10°", () => {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const users = root.children.find(c => c.name === "Users");
    let prev = null;
    for (let i = 0; i <= STEPS; i++) {
      const frame = buildFrame(root, users, i / STEPS);
      if (prev !== null) {
        expect(Math.abs(frame.rotateAngle - prev)).toBeLessThan(10);
      }
      prev = frame.rotateAngle;
    }
  });
});

function centerOp(svg) {
  const m = svg.match(/<circle[^>]*fill-opacity="([\d.]+)"/);
  return m ? parseFloat(m[1]) : 0;
}

function buildMorphFrame(parent, child, rawP) {
  computeSizes(parent);
  layout(parent);
  const childCenter = norm(child._start + child._span / 2);
  const newOffset = norm(childCenter - 180);
  const p = easeInOut(rawP);
  const rotateAngle = lerpAngle(0, newOffset, p);
  return { svg: renderTransitionFrame(parent, child, p, rotateAngle), rotateAngle, newOffset };
}

describe("boundary — center opacity continuity (Bug B)", () => {
  it("root → Users: center op is continuous across morph→shortcut (no op jump at p=0.999)", () => {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const users = root.children.find(c => c.name === "Users");
    const { svg: justBefore } = buildMorphFrame(root, users, 0.998);
    const { svg: shortcut } = buildMorphFrame(root, users, 0.999);
    const opBefore = centerOp(justBefore);
    const opShortcut = centerOp(shortcut);
    expect(Math.abs(opShortcut - opBefore)).toBeLessThan(0.1);
    expect(opShortcut).toBeCloseTo(0, 2);
  });

  it("root → Users: shortcut p=1 center op matches static post-nav (both 0)", () => {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const users = root.children.find(c => c.name === "Users");
    const { svg: shortcut } = buildMorphFrame(root, users, 1.0);
    const postNavSvg = renderStaticRotated(root, users);
    expect(centerOp(shortcut)).toBeCloseTo(0, 2);
    expect(centerOp(postNavSvg)).toBeCloseTo(0, 2);
  });

  it("root → Users: center op varies smoothly across the whole animation (max adjacent jump ≤ 0.15)", () => {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const users = root.children.find(c => c.name === "Users");
    const ops = [];
    for (let i = 0; i <= 100; i++) {
      const rawP = i / 100;
      const { svg } = buildMorphFrame(root, users, rawP);
      ops.push(centerOp(svg));
    }
    let maxJump = 0;
    for (let i = 1; i < ops.length; i++) {
      const j = Math.abs(ops[i] - ops[i - 1]);
      if (j > maxJump) maxJump = j;
    }
    expect(maxJump).toBeLessThanOrEqual(0.15);
  });

  it("root → Users: center opacity at p=0.49 and p=0.51 differ by < 0.15 (pre-stage→morph boundary)", () => {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const users = root.children.find(c => c.name === "Users");
    const { svg: preStage } = buildMorphFrame(root, users, 0.49);
    const { svg: morphStart } = buildMorphFrame(root, users, 0.51);
    expect(Math.abs(centerOp(preStage) - centerOp(morphStart))).toBeLessThan(0.15);
  });
});

describe("boundary — shortcut (p≈0.999) sector continuity", () => {
  for (const [name, fn] of SCENARIOS) {
    it(`${name}: all child-subtree sectors at shortcut were visible at p=0.998`, () => {
      const { parent, child } = fn();
      const at = visibleNames(morphLayout(parent, child, 0.999));
      const before = visibleNames(morphLayout(parent, child, 0.998));
      for (const n of at) {
        expect(before.has(n)).toBe(true);
      }
    });
  }
});
