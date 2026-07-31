// Automatic visual render analysis.
// Renders animation frames in-memory and checks mathematical invariants against
// the spec (spec/animation.md). Frames are generated directly (not read from
// tests/visual/snapshots/) so this suite is independent of snapshot generation.

import { describe, it, expect } from "vitest";

import { parseSectors } from "./analyze/parse-svg.js";
import {
  checkNoOverlaps,
  checkPartitionSum,
} from "./analyze/partition.js";
import {
  checkChildWedgeGrows,
  checkCenterOpacityIncreases,
  checkCenterBorderDecreases,
} from "./analyze/monotonicity.js";
import {
  checkP0MatchesOld,
  checkP1MatchesNew,
  checkP0CenterIsRoot,
  checkP1CenterIsDrilled,
} from "./analyze/endpoints.js";
import {
  checkFractionalRings,
  checkRingBounds,
} from "./analyze/radial.js";
import {
  checkOpacityBounds,
} from "./analyze/opacity.js";
import {
  checkDrillBackSymmetry,
} from "./analyze/symmetry.js";

import { computeSizes, layout, easeInOut, CENTER_OPACITY, morphLayout, S, L, RING_RADII, ROOT_CENTER_BORDER } from "../../src/layout.js";
import { disk } from "../../src/sample-data.js";
import { clone, renderStatic, renderTransitionFrame, renderFrame } from "./helpers.js";

// ---- Frame generation ----

const DENSE = [
  0, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45,
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99, 1.0
];

// Drill frames: p = easeInOut(rawP). Back frames: the same interpolation run
// in reverse (p = 1 − easeInOut(rawP)), per spec/animation.md.
function renderFrames(getPair, back = false) {
  return DENSE.map((rawP) => {
    const p = easeInOut(rawP);
    const { parent, child } = getPair();
    return renderTransitionFrame(parent, child, back ? 1 - p : p);
  });
}

function rootUsersPair() {
  const root = clone(disk);
  computeSizes(root);
  layout(root);
  return { parent: root, child: root.children.find(c => c.name === "Users") };
}

function contentsResourcesPair() {
  const root = clone(disk);
  computeSizes(root);
  layout(root);
  const apps = root.children.find(c => c.name === "Applications");
  const xcode = apps?.children?.find(c => c.name === "Xcode.app");
  const contents = xcode?.children?.find(c => c.name === "Contents");
  const resources = contents?.children?.find(c => c.name === "Resources");
  return { parent: contents, child: resources };
}

function rootDevicesPair() {
  const root = clone(disk);
  computeSizes(root);
  layout(root);
  const library = root.children.find(c => c.name === "Library");
  const developer = library?.children?.find(c => c.name === "Developer");
  const coreSimulator = developer?.children?.find(c => c.name === "CoreSimulator");
  const devices = coreSimulator?.children?.find(c => c.name === "Devices");
  return { parent: root, child: devices };
}

// ---- Tests ----

describe("visual analysis — root ↔ Users (level 1)", () => {
  const drillFrames = renderFrames(rootUsersPair);
  const backFrames = renderFrames(rootUsersPair, true);

  it("has dense frames to analyze", () => {
    expect(drillFrames.length).toBeGreaterThan(0);
    expect(backFrames.length).toBeGreaterThan(0);
    for (const f of [...drillFrames, ...backFrames]) expect(f).toContain("<svg");
  });

  describe("partition integrity", () => {
    it("no sector overlaps at any frame", () => {
      for (let i = 0; i < drillFrames.length; i++) {
        const violations = checkNoOverlaps(parseSectors(drillFrames[i]).sectors);
        expect(violations).toEqual([]);
      }
    });

    it("endpoint frames: innermost ring is a full partition, outer rings don't over-cover", () => {
      for (const i of [0, drillFrames.length - 1]) {
        const violations = checkPartitionSum(parseSectors(drillFrames[i]).sectors);
        expect(violations).toEqual([]);
      }
    });
  });

  describe("monotonicity", () => {
    it("child wedge grows monotonically", () => {
      expect(checkChildWedgeGrows(drillFrames)).toEqual([]);
    });

    it("center opacity increases monotonically", () => {
      expect(checkCenterOpacityIncreases(drillFrames)).toEqual([]);
    });

    it("center border opacity decreases monotonically", () => {
      expect(checkCenterBorderDecreases(drillFrames)).toEqual([]);
    });
  });

  describe("endpoints", () => {
    it("p=0 has sectors matching old layout", () => {
      const root = clone(disk);
      computeSizes(root);
      const result = checkP0MatchesOld(drillFrames[0], root);
      expect(result).toBeNull();
    });

    it("p=1 has sectors", () => {
      const users = clone(disk).children.find(c => c.name === "Users");
      computeSizes(users);
      const result = checkP1MatchesNew(drillFrames[drillFrames.length - 1], users);
      expect(result).toBeNull();
    });

    it("p=0 center has root border", () => {
      const info = checkP0CenterIsRoot(drillFrames[0]);
      expect(info.hasBorder).toBe(true);
      expect(info.borderOpacity).toBeGreaterThan(0.9);
    });

    it("p=1 center appears at shortcut (matches static post-nav)", () => {
      const info = checkP1CenterIsDrilled(drillFrames[drillFrames.length - 1], CENTER_OPACITY);
      expect(info.hasBorder).toBe(false);
      expect(info.fillOpacity).toBeCloseTo(CENTER_OPACITY, 1);
    });
  });

  describe("radial slide", () => {
    it("has fractional rings during transition (real motion, not snap)", () => {
      const result = checkFractionalRings(drillFrames);
      expect(result.hasFractional).toBe(true);
    });

    it("all rings are within valid bounds [0, MAX_RING+1]", () => {
      expect(checkRingBounds(drillFrames)).toEqual([]);
    });
  });

  describe("opacity", () => {
    it("all sector opacities in [0, 1]", () => {
      expect(checkOpacityBounds(drillFrames)).toEqual([]);
    });
  });

  describe("symmetry", () => {
    it("drill-in and back produce symmetric sector layouts", () => {
      expect(checkDrillBackSymmetry(drillFrames, backFrames)).toEqual([]);
    });
  });
});

describe("visual analysis — Contents ↔ Resources (level 3→4)", () => {
  const drillFrames = renderFrames(contentsResourcesPair);
  const backFrames = renderFrames(contentsResourcesPair, true);

  it("has dense frames to analyze", () => {
    expect(drillFrames.length).toBeGreaterThan(0);
    expect(backFrames.length).toBeGreaterThan(0);
    for (const f of [...drillFrames, ...backFrames]) expect(f).toContain("<svg");
  });

  describe("partition integrity", () => {
    it("no sector overlaps at any frame", () => {
      for (let i = 0; i < drillFrames.length; i++) {
        const violations = checkNoOverlaps(parseSectors(drillFrames[i]).sectors);
        expect(violations).toEqual([]);
      }
    });

    it("endpoint frames: innermost ring is a full partition, outer rings don't over-cover", () => {
      for (const i of [0, drillFrames.length - 1]) {
        const violations = checkPartitionSum(parseSectors(drillFrames[i]).sectors);
        expect(violations).toEqual([]);
      }
    });
  });

  describe("monotonicity", () => {
    it("child wedge grows monotonically", () => {
      expect(checkChildWedgeGrows(drillFrames)).toEqual([]);
    });
  });

  describe("radial slide", () => {
    it("has fractional rings during transition", () => {
      const result = checkFractionalRings(drillFrames);
      expect(result.hasFractional).toBe(true);
    });

    it("all rings are within valid bounds", () => {
      expect(checkRingBounds(drillFrames)).toEqual([]);
    });
  });

  describe("opacity", () => {
    it("all sector opacities in [0, 1]", () => {
      expect(checkOpacityBounds(drillFrames)).toEqual([]);
    });
  });

  describe("symmetry", () => {
    it("drill-in and back produce symmetric sector layouts", () => {
      expect(checkDrillBackSymmetry(drillFrames, backFrames)).toEqual([]);
    });
  });
});

describe("visual analysis — root ↔ Devices (level 1→4, multi-level)", () => {
  const drillFrames = renderFrames(rootDevicesPair);
  const backFrames = renderFrames(rootDevicesPair, true);

  it("has dense frames to analyze", () => {
    expect(drillFrames.length).toBeGreaterThan(0);
    expect(backFrames.length).toBeGreaterThan(0);
    for (const f of [...drillFrames, ...backFrames]) expect(f).toContain("<svg");
  });

  describe("partition integrity", () => {
    it("no sector overlaps at any frame", () => {
      for (let i = 0; i < drillFrames.length; i++) {
        const violations = checkNoOverlaps(parseSectors(drillFrames[i]).sectors);
        expect(violations).toEqual([]);
      }
    });
  });

  describe("radial slide", () => {
    it("has fractional rings during transition", () => {
      const result = checkFractionalRings(drillFrames);
      expect(result.hasFractional).toBe(true);
    });

    it("all rings are within valid bounds", () => {
      expect(checkRingBounds(drillFrames)).toEqual([]);
    });
  });

  describe("opacity", () => {
    it("all sector opacities in [0, 1]", () => {
      expect(checkOpacityBounds(drillFrames)).toEqual([]);
    });
  });

  describe("symmetry", () => {
    it("drill-in and back produce symmetric sector layouts", () => {
      expect(checkDrillBackSymmetry(drillFrames, backFrames)).toEqual([]);
    });
  });

  describe("intermediate ancestor fade-out", () => {
    it("intermediate ancestors (Library, Developer, CoreSimulator) are ≤ 0.05 opacity at p=0.5", () => {
      const { parent: root, child: devices } = rootDevicesPair();
      const items = morphLayout(root, devices, 0.5);
      const fadeNames = ["Library", "Developer", "CoreSimulator"];
      for (const it of items) {
        if (fadeNames.includes(it.node.name)) {
          expect(it.op).toBeLessThanOrEqual(0.05);
        }
      }
    });
  });
});

describe("visual analysis — edge cases", () => {
  it("empty folder has no sectors", () => {
    const empty = { name: "empty", type: "folder", size: 0, children: [] };
    computeSizes(empty);
    const { sectors } = parseSectors(renderStatic(empty, empty));
    expect(sectors.length).toBe(0);
  });

  it("single child occupies full 360°", () => {
    const single = {
      name: "root", type: "folder", size: 0, children: [
        { name: "only", type: "file", size: 100 },
      ],
    };
    computeSizes(single);
    const { sectors } = parseSectors(renderStatic(single, single));
    const ring1 = sectors.filter(s => Math.round(s.ring) === 1);
    expect(ring1.length).toBe(1);
    expect(ring1[0].span).toBeGreaterThan(350);
  });
});
