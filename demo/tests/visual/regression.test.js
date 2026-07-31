import { describe, it, expect } from "vitest";
import { computeSizes, layout, easeInOut, norm, lerpAngle } from "../../src/layout.js";
import { disk } from "../../src/sample-data.js";
import {
  clone, renderStatic, renderStaticRotated, renderTransitionFrame,
  readBaseline, writeBaseline,
} from "./helpers.js";

/**
 * Snapshot regression tests.
 *
 * First run (no baselines): writes baselines and passes.
 * Subsequent runs: generates SVGs and diffs against baselines — any byte-level
 * difference fails the test, catching unintended visual changes.
 *
 * To update baselines after an intentional change:
 *   rm -rf tests/visual/baselines && npx vitest run tests/visual/regression.test.js
 */

// ---- Helpers ----

// Round every numeric literal to a fixed precision before comparing. SVG path
// coordinates carry last-digit float noise that varies between CPU architectures
// (arm64 vs x64), so byte-exact comparison would fail on CI runners. Real visual
// changes are many orders of magnitude larger than 1e-6 px, so this preserves the
// regression-detection purpose while making baselines architecture-independent.
const FLOAT_PRECISION = 6;
function normalizeFloats(svg) {
  return svg.replace(/-?\d+\.\d+/g, (m) => Number(m).toFixed(FLOAT_PRECISION));
}

function assertMatchesBaseline(name, svg) {
  const baseline = readBaseline(name);
  if (baseline === null) {
    writeBaseline(name, svg);
    return { created: true };
  }
  expect(normalizeFloats(svg)).toBe(normalizeFloats(baseline));
  return { created: false };
}

// ---- Scenarios ----

const STATIC_SCENARIOS = [
  {
    name: "01-root-static",
    build() {
      const root = clone(disk);
      computeSizes(root);
      return renderStatic(root, root);
    },
  },
  {
    name: "02-applications-static",
    build() {
      const root = clone(disk);
      computeSizes(root);
      layout(root);
      const apps = root.children.find(c => c.name === "Applications");
      return renderStatic(root, apps);
    },
  },
];

// Common progress points for animation regression tests.
// Includes key boundaries: 0.505 (morph phase onset), 0.999 (p≥0.999 shortcut boundary).
const ANIM_PROGRESS = [0, 0.1, 0.25, 0.5, 0.505, 0.75, 0.9, 0.999, 1.0];

// Animation: root ↔ Users (level 1)
const ANIMATION_ROOT_USERS = {
  name: "03-drill-root-users",
  progressPoints: ANIM_PROGRESS,
  buildFrame(rawP) {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const users = root.children.find(c => c.name === "Users");
    const p = easeInOut(rawP);
    // oldOffset = 0 (root, no rotation); newOffset = norm(childCenter - 180).
    const childCenter = norm(users._start + users._span / 2);
    const newOffset = norm(childCenter - 180);
    // Phase-gated rotation using pMorph timing, matching morphLayout's
    // anchorCenter (which also uses pMorph). Frozen at oldOffset during
    // pre-stage (p≤0.5), interpolated during morph (p>0.5).
    const pMorph = easeInOut(Math.max(0, (p - 0.5) / 0.5));
    const rotateAngle = lerpAngle(0, newOffset, pMorph);
    return renderTransitionFrame(root, users, p, rotateAngle);
  },
};

// Animation: Users → root (back)
const ANIMATION_USERS_ROOT = {
  name: "04-back-users-root",
  progressPoints: ANIM_PROGRESS,
  buildFrame(rawP) {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const users = root.children.find(c => c.name === "Users");
    const p = easeInOut(rawP);
    // Back: t goes 1→0 as rawP goes 0→1 (animation reverses).
    const childCenter = norm(users._start + users._span / 2);
    const newOffset = norm(childCenter - 180);
    // Back: pMorph based on the reversed progress (1-p), matching morphLayout's
    // anchorCenter. Morph phase: pMorph goes 1→0 as rawP goes 0→0.5 so rotation
    // interpolates newOffset→0. Post-stage (rawP>0.5): pMorph=0, rotation=0.
    const morphP = 1 - p;
    const pMorph = easeInOut(Math.max(0, (morphP - 0.5) / 0.5));
    const rotateAngle = lerpAngle(newOffset, 0, pMorph);
    return renderTransitionFrame(root, users, morphP, rotateAngle);
  },
};

// Animation: Contents → Resources (level 3 → 4)
const ANIMATION_DEEP_DRILL = {
  name: "05-drill-contents-resources",
  progressPoints: ANIM_PROGRESS,
  buildFrame(rawP) {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const apps = root.children.find(c => c.name === "Applications");
    const xcode = apps?.children?.find(c => c.name === "Xcode.app");
    const contents = xcode?.children?.find(c => c.name === "Contents");
    const resources = contents?.children?.find(c => c.name === "Resources");
    if (!contents || !resources) return "";
    // Layout Contents as root to get Resources' position (for newOffset).
    computeSizes(contents);
    layout(contents);
    const childCenter = norm(resources._start + resources._span / 2);
    const newOffset = norm(childCenter - 180);
    // oldOffset: the test simulates drilling from an un-rotated Contents view
    // (Contents is not placed in the full-disk layout — it folds into "smaller
    // objects" — so its prior rotation is undefined; we use 0, matching a fresh
    // current-folder view). This keeps the rotation interpolation well-defined.
    const oldOffset = 0;
    const p = easeInOut(rawP);
    const pMorph = easeInOut(Math.max(0, (p - 0.5) / 0.5));
    const rotateAngle = lerpAngle(oldOffset, newOffset, pMorph);
    return renderTransitionFrame(contents, resources, p, rotateAngle);
  },
};

// Animation: Resources → Contents (back)
const ANIMATION_DEEP_BACK = {
  name: "06-back-resources-contents",
  progressPoints: ANIM_PROGRESS,
  buildFrame(rawP) {
    const root = clone(disk);
    computeSizes(root);
    layout(root);
    const apps = root.children.find(c => c.name === "Applications");
    const xcode = apps?.children?.find(c => c.name === "Xcode.app");
    const contents = xcode?.children?.find(c => c.name === "Contents");
    const resources = contents?.children?.find(c => c.name === "Resources");
    if (!contents || !resources) return "";
    computeSizes(contents);
    layout(contents);
    const childCenter = norm(resources._start + resources._span / 2);
    const newOffset = norm(childCenter - 180);
    const oldOffset = 0;
    const p = easeInOut(rawP);
    const morphP = 1 - p;
    const pMorph = easeInOut(Math.max(0, (morphP - 0.5) / 0.5));
    const rotateAngle = lerpAngle(newOffset, oldOffset, pMorph);
    return renderTransitionFrame(contents, resources, morphP, rotateAngle);
  },
};

const ALL_ANIMATION_SCENARIOS = [
  ANIMATION_ROOT_USERS,
  ANIMATION_USERS_ROOT,
  ANIMATION_DEEP_DRILL,
  ANIMATION_DEEP_BACK,
];

const EDGE_SCENARIOS = [
  {
    name: "07-empty-folder",
    build() {
      const empty = { name: "empty", type: "folder", size: 0, children: [] };
      computeSizes(empty);
      return renderStatic(empty, empty);
    },
  },
  {
    name: "08-single-child",
    build() {
      const single = {
        name: "root", type: "folder", size: 0,
        children: [{ name: "only", type: "file", size: 100 }],
      };
      computeSizes(single);
      return renderStatic(single, single);
    },
  },
];

// ---- Tests ----

describe("snapshot regression — static views", () => {
  let created = 0;

  for (const scenario of STATIC_SCENARIOS) {
    it(`${scenario.name} matches baseline`, () => {
      const svg = scenario.build();
      expect(svg).not.toContain("NaN");
      expect(svg).toContain("<svg");
      const result = assertMatchesBaseline(`${scenario.name}.svg`, svg);
      if (result.created) created++;
    });
  }

  it("reports baseline creation status", () => {
    if (created > 0) {
      console.log(`  ⚠ ${created} baseline(s) created — run again to verify regression detection`);
    }
  });
});

describe("snapshot regression — animation frames", () => {
  let created = 0;

  for (const scenario of ALL_ANIMATION_SCENARIOS) {
    for (const rawP of scenario.progressPoints) {
      const padded = rawP.toFixed(3).replace(".", "_");
      const name = `${scenario.name}-p${padded}`;

      it(`${name} matches baseline (raw p=${rawP})`, () => {
        const svg = scenario.buildFrame(rawP);
        if (!svg) return; // skip if deep folder not found
        expect(svg).not.toContain("NaN");
        expect(svg).toContain("<svg");
        expect(svg).toContain("<circle");
        const result = assertMatchesBaseline(`${name}.svg`, svg);
        if (result.created) created++;
      });
    }
  }

  it("reports baseline creation status", () => {
    if (created > 0) {
      console.log(`  ⚠ ${created} baseline(s) created — run again to verify regression detection`);
    }
  });
});

describe("snapshot regression — edge cases", () => {
  let created = 0;

  for (const scenario of EDGE_SCENARIOS) {
    it(`${scenario.name} matches baseline`, () => {
      const svg = scenario.build();
      expect(svg).toContain("<svg");
      const result = assertMatchesBaseline(`${scenario.name}.svg`, svg);
      if (result.created) created++;
    });
  }

  it("reports baseline creation status", () => {
    if (created > 0) {
      console.log(`  ⚠ ${created} baseline(s) created — run again to verify regression detection`);
    }
  });
});

describe("snapshot regression — no new NaN or infinite values", () => {
  it("all static SVGs are finite", () => {
    for (const scenario of STATIC_SCENARIOS) {
      const svg = scenario.build();
      expect(svg).not.toMatch(/NaN/);
      expect(svg).not.toMatch(/Infinity/);
      expect(svg).not.toMatch(/-Infinity/);
    }
  });

  it("all animation SVGs are finite", () => {
    for (const scenario of ALL_ANIMATION_SCENARIOS) {
      for (const rawP of scenario.progressPoints) {
        const svg = scenario.buildFrame(rawP);
        if (!svg) continue;
        expect(svg).not.toMatch(/NaN/);
        expect(svg).not.toMatch(/Infinity/);
        expect(svg).not.toMatch(/-Infinity/);
      }
    }
  });

  it("all edge-case SVGs are finite", () => {
    for (const scenario of EDGE_SCENARIOS) {
      const svg = scenario.build();
      expect(svg).not.toMatch(/NaN/);
      expect(svg).not.toMatch(/Infinity/);
      expect(svg).not.toMatch(/-Infinity/);
    }
  });
});

describe("snapshot regression — structural invariants", () => {
  it("every SVG has exactly one center circle", () => {
    const allScenarios = [
      ...STATIC_SCENARIOS,
      ...EDGE_SCENARIOS,
    ];
    for (const scenario of allScenarios) {
      const svg = scenario.build();
      const circles = (svg.match(/<circle/g) || []).length;
      expect(circles).toBe(1);
    }
    for (const scenario of ALL_ANIMATION_SCENARIOS) {
      for (const rawP of scenario.progressPoints) {
        const svg = scenario.buildFrame(rawP);
        if (!svg) continue;
        const circles = (svg.match(/<circle/g) || []).length;
        expect(circles).toBe(1);
      }
    }
  });

  it("morph frame at p=1 matches static (drill end → post-nav)", () => {
    // The p≥0.999 shortcut returns layout(child) with UN-rotated sector starts;
    // the visual rotation is applied as SVG <g rotate(offset)>. The
    // post-navigation static view (renderStaticRotated) does the same. So the
    // full SVGs (paths + center) must match byte-for-byte.
    for (const scenario of ALL_ANIMATION_SCENARIOS) {
      const isBack = scenario.name.includes("back");
      if (isBack) continue; // back-end handoff checked by p=0 baseline comparison
      const p1Svg = scenario.buildFrame(1.0);
      if (!p1Svg) continue;
      const root = clone(disk);
      computeSizes(root);
      layout(root);
      if (scenario.name.includes("drill-root-users")) {
        const users = root.children.find(c => c.name === "Users");
        const svg = renderStaticRotated(root, users);
        expect(p1Svg).toBe(svg);
      } else if (scenario.name.includes("drill-contents-resources")) {
        const apps = root.children.find(c => c.name === "Applications");
        const xcode = apps?.children?.find(c => c.name === "Xcode.app");
        const contents = xcode?.children?.find(c => c.name === "Contents");
        const resources = contents?.children?.find(c => c.name === "Resources");
        if (!contents || !resources) continue;
        computeSizes(contents);
        layout(contents);
        const svg = renderStaticRotated(contents, resources);
        expect(p1Svg).toBe(svg);
      }
    }
  });
});
