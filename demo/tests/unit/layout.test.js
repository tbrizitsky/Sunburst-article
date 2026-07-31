import { describe, it, expect } from "vitest";
import {
  CX, CY, CENTER_WIDTH, LARGE_WIDTH, SMALL_WIDTH,
  LARGE_RINGS, SMALL_RINGS, RING_RADII, MAX_RING,
  THETA_MIN, S, L, SMALLER_ALPHA, ANGLE_GAP, RADIAL_GAP,
  FILE_FILL, SMALLER_FILL, ROOT_CENTER_BORDER, CENTER_OPACITY,
  norm, computeSizes, layout, hueOf, sectorPath, formatSize,
  lerp, easeInOut, lerpAngle, radiusAt, snapshotAll, subtreeNodes,
  sizeHue, lastUpdatedHue, ringTable,
  sortLayout,
  CARD_RADIUS,
} from "../../src/layout.js";

// ---------- Constants ----------

describe("constants", () => {
  it("LARGE_RINGS = 5, SMALL_RINGS = 5", () => {
    expect(LARGE_RINGS).toBe(5);
    expect(SMALL_RINGS).toBe(5);
  });

  it("THETA_MIN = 2", () => {
    expect(THETA_MIN).toBe(2);
  });

  it("RING_RADII has CENTER + LARGE_RINGS + SMALL_RINGS entries", () => {
    expect(RING_RADII).toHaveLength(1 + LARGE_RINGS + SMALL_RINGS);
  });

  it("RING_RADII[0] is the center", () => {
    expect(RING_RADII[0][0]).toBe(0);
    expect(RING_RADII[0][1]).toBe(CENTER_WIDTH);
  });

  it("large rings are wider than small rings", () => {
    expect(LARGE_WIDTH).toBeGreaterThan(SMALL_WIDTH);
  });

  it("MAX_RING = RING_RADII.length - 1", () => {
    expect(MAX_RING).toBe(RING_RADII.length - 1);
  });

  it("ring radii are non-decreasing (adjacent rings share boundaries)", () => {
    for (let i = 1; i < RING_RADII.length; i++) {
      expect(RING_RADII[i][0]).toBeGreaterThanOrEqual(RING_RADII[i - 1][1]);
    }
  });

  it("S = 60, L = 58", () => {
    expect(S).toBe(60);
    expect(L).toBe(58);
  });

  it("SMALLER_ALPHA = 0.5", () => {
    expect(SMALLER_ALPHA).toBe(0.5);
  });

  it("CENTER_OPACITY = 0", () => {
    expect(CENTER_OPACITY).toBe(0);
  });
});

// ---------- norm ----------

describe("norm", () => {
  it("returns 0 for 0", () => {
    expect(norm(0)).toBe(0);
  });

  it("returns 180 for 180", () => {
    expect(norm(180)).toBe(180);
  });

  it("wraps 360 to 0", () => {
    expect(norm(360)).toBe(0);
  });

  it("wraps 720 to 0", () => {
    expect(norm(720)).toBe(0);
  });

  it("normalizes negative angles", () => {
    expect(norm(-90)).toBe(270);
    expect(norm(-1)).toBe(359);
  });

  it("normalizes large negatives", () => {
    expect(norm(-720)).toBe(0);
    expect(norm(-450)).toBe(270);
  });

  it("result is always in [0, 360)", () => {
    const vals = [-1000, -361, -360, -180, -1, 0, 1, 180, 359, 360, 361, 720, 1000];
    for (const v of vals) {
      const r = norm(v);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
    }
  });

  it("preserves small positive values", () => {
    expect(norm(0.5)).toBeCloseTo(0.5);
    expect(norm(179.9)).toBeCloseTo(179.9);
  });
});

// ---------- computeSizes ----------

describe("computeSizes", () => {
  it("file: returns its own size, does not modify", () => {
    const node = { name: "f", type: "file", size: 42 };
    expect(computeSizes(node)).toBe(42);
    expect(node.size).toBe(42);
  });

  it("folder: returns sum of children sizes", () => {
    const node = {
      name: "d", type: "folder", children: [
        { name: "a", type: "file", size: 10 },
        { name: "b", type: "file", size: 20 },
      ],
    };
    expect(computeSizes(node)).toBe(30);
    expect(node.size).toBe(30);
  });

  it("nested folder: sums recursively", () => {
    const node = {
      name: "d", type: "folder", children: [
        { name: "a", type: "file", size: 5 },
        { name: "sub", type: "folder", children: [
          { name: "b", type: "file", size: 15 },
          { name: "c", type: "file", size: 25 },
        ]},
      ],
    };
    expect(computeSizes(node)).toBe(45);
    expect(node.size).toBe(45);
    expect(node.children[1].size).toBe(40);
  });

  it("free node: returns its own size", () => {
    const node = { name: "free", type: "free", size: 100 };
    expect(computeSizes(node)).toBe(100);
  });

  it("node with no size and no children: returns 0", () => {
    const node = { name: "empty", type: "file" };
    expect(computeSizes(node)).toBe(0);
  });

  it("folder with empty children array: returns 0", () => {
    const node = { name: "empty", type: "folder", children: [] };
    expect(computeSizes(node)).toBe(0);
    expect(node.size).toBe(0);
  });
});

// ---------- layout ----------

function makeTree() {
  return {
    name: "root", type: "folder", size: 0, children: [
      { name: "free", type: "free", size: 100 },
      { name: "big", type: "folder", size: 0, children: [
        { name: "f1", type: "file", size: 50 },
        { name: "f2", type: "file", size: 30 },
        { name: "f3", type: "file", size: 20 },
      ]},
      { name: "mid", type: "folder", size: 0, children: [
        { name: "f4", type: "file", size: 40 },
        { name: "sub", type: "folder", size: 0, children: [
          { name: "f5", type: "file", size: 10 },
        ]},
      ]},
      { name: "small", type: "file", size: 5 },
    ],
  };
}

describe("layout", () => {
  it("returns an array", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    expect(Array.isArray(placed)).toBe(true);
  });

  it("root is at ring 0", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    expect(placed[0]._ring).toBe(0);
    expect(placed[0].name).toBe("root");
  });

  it("every placed node has _ring, _start, _span", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    for (const n of placed) {
      expect(n).toHaveProperty("_ring");
      expect(n).toHaveProperty("_start");
      expect(n).toHaveProperty("_span");
      expect(Number.isFinite(n._ring)).toBe(true);
      expect(Number.isFinite(n._start)).toBe(true);
      expect(Number.isFinite(n._span)).toBe(true);
    }
  });

  it("no placed node exceeds MAX_RING", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    for (const n of placed) {
      expect(n._ring).toBeLessThanOrEqual(MAX_RING);
    }
  });

  it("root span is 360", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    expect(placed[0]._span).toBe(360);
  });

  it("folders get _hue on first placement at ring > 0", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    const big = placed.find(n => n.name === "big");
    expect(big).toBeDefined();
    expect(big._hue).toBeGreaterThanOrEqual(0);
    expect(big._hue).toBeLessThan(360);
  });

  it("files do not get _hue", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    const file = placed.find(n => n.name === "f1");
    expect(file).toBeDefined();
    expect(file._hue).toBeUndefined();
  });

  it("free node at root is placed at 180° bisector", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    const free = placed.find(n => n.type === "free");
    expect(free).toBeDefined();
    // bisector = start + span/2 should be ≈ 180
    const bisector = norm(free._start + free._span / 2);
    expect(bisector).toBeCloseTo(180, 0);
  });

  it("free node appears only at root level", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    const freeNodes = placed.filter(n => n.type === "free");
    expect(freeNodes).toHaveLength(1);
    expect(freeNodes[0]._ring).toBe(1); // child of root
  });

  it("children are sorted by size descending (largest first)", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    // root's children at ring 1 (excluding free)
    const ring1 = placed.filter(n => n._ring === 1 && n.type !== "free");
    for (let i = 1; i < ring1.length; i++) {
      expect(ring1[i].size).toBeLessThanOrEqual(ring1[i - 1].size);
    }
  });

  it("child spans are proportional to size relative to parent (parentSpan = 360)", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root);
    const ring1 = placed.filter(n => n._ring === 1 && n.type !== "free");
    for (const n of ring1) {
      const expected = (n.size / root.size) * 360;
      expect(n._span).toBeCloseTo(expected, 1);
    }
  });

  it("sorting: 'name' sorts all non-free children (files + folders) alphabetically", () => {
    // filesSpecial is a render-side filter; layout sorting must include files
    // so that when filesSpecial is off, the remaining folders are still in
    // sorted order relative to where files would appear.
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root, { sorting: "name" });
    const ring1 = placed.filter(n => n._ring === 1 && n.type !== "free");
    for (let i = 1; i < ring1.length; i++) {
      expect(ring1[i].name.localeCompare(ring1[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it("sorting: 'size' (default) sorts all non-free children by size descending", () => {
    const root = makeTree();
    computeSizes(root);
    const placed = layout(root, { sorting: "size" });
    const ring1 = placed.filter(n => n._ring === 1 && n.type !== "free");
    for (let i = 1; i < ring1.length; i++) {
      expect(ring1[i].size).toBeLessThanOrEqual(ring1[i - 1].size);
    }
  });
});

// ---------- sortLayout ----------

// Name and size orders deliberately differ at both levels so the morph
// genuinely re-orders sectors. Root children (non-free): apple(20), zebra(100),
// mango(50), dir(180) — name: apple, dir, mango, zebra; size: dir, zebra,
// mango, apple. dir's children: zulu(90), alpha(30), mike(60) — name: alpha,
// mike, zulu; size: zulu, mike, alpha.
function makeSortTree() {
  return {
    name: "root", type: "folder", size: 0, children: [
      { name: "free", type: "free", size: 100 },
      { name: "apple", type: "file", size: 20 },
      { name: "zebra", type: "file", size: 100 },
      { name: "mango", type: "file", size: 50 },
      { name: "dir", type: "folder", size: 0, children: [
        { name: "zulu", type: "file", size: 90 },
        { name: "alpha", type: "file", size: 30 },
        { name: "mike", type: "file", size: 60 },
      ]},
    ],
  };
}

// The shortest angular delta between a and b (lerpAngle's convention).
function shortestDelta(a, b) {
  return (((b - a) % 360) + 540) % 360 - 180;
}

describe("sortLayout", () => {
  const opts = { maxRings: 5, THETA_MIN: 0, smallerObjects: false };

  function itemsByName(items) {
    const m = new Map();
    for (const it of items) m.set(it.node.name, it);
    return m;
  }

  it("p=0 reproduces the name layout exactly", () => {
    const root = makeSortTree(); computeSizes(root);
    const got = itemsByName(sortLayout(root, 0, opts));
    const namePlaced = layout(root, { ...opts, sorting: "name" }).filter(n => n._ring >= 1);
    expect(got.size).toBe(namePlaced.length);
    for (const n of namePlaced) {
      const it = got.get(n.name);
      expect(it).toBeDefined();
      expect(it.ring).toBe(n._ring);
      expect(it.start).toBeCloseTo(n._start, 5);
      expect(it.span).toBeCloseTo(n._span, 5);
      expect(it.op).toBe(1);
    }
  });

  it("p=1 reproduces the size layout exactly", () => {
    const root = makeSortTree(); computeSizes(root);
    const got = itemsByName(sortLayout(root, 1, opts));
    const sizePlaced = layout(root, { ...opts, sorting: "size" }).filter(n => n._ring >= 1);
    expect(got.size).toBe(sizePlaced.length);
    for (const n of sizePlaced) {
      const it = got.get(n.name);
      expect(it).toBeDefined();
      expect(it.ring).toBe(n._ring);
      expect(it.start).toBeCloseTo(n._start, 5);
      expect(it.span).toBeCloseTo(n._span, 5);
      expect(it.op).toBe(1);
    }
  });

  it("places the same sectors with the same spans/rings at every p", () => {
    const root = makeSortTree(); computeSizes(root);
    const m0 = itemsByName(sortLayout(root, 0, opts));
    const m1 = itemsByName(sortLayout(root, 1, opts));
    expect(m0.size).toBe(m1.size);
    for (const [name, it0] of m0) {
      const it1 = m1.get(name);
      expect(it1).toBeDefined();
      expect(it0.ring).toBe(it1.ring);
      expect(it0.span).toBeCloseTo(it1.span, 5);
      expect(it1.op).toBe(1);
    }
  });

  it("start angles move along the shortest arc, never the long way", () => {
    const root = makeSortTree(); computeSizes(root);
    const m0 = itemsByName(sortLayout(root, 0, opts));
    const m1 = itemsByName(sortLayout(root, 1, opts));
    for (const [name, it0] of m0) {
      const it1 = m1.get(name);
      const d = shortestDelta(it0.start, it1.start);
      if (Math.abs(d) < 1e-9) continue;
      for (const p of [0.25, 0.5, 0.75]) {
        const mid = itemsByName(sortLayout(root, p, opts)).get(name);
        // Signed arc travelled is exactly d·p — a straight shot along the
        // shortest arc (mod 360), no wrap-around detour and no discontinuity.
        expect(shortestDelta(it0.start, mid.start)).toBeCloseTo(d * p, 5);
      }
    }
  });

  it("is deterministic (same inputs → same output)", () => {
    const root = makeSortTree(); computeSizes(root);
    const a = sortLayout(root, 0.37, opts);
    const b = sortLayout(root, 0.37, opts);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].node).toBe(b[i].node);
      expect(a[i].start).toBeCloseTo(b[i].start, 10);
    }
  });
});

// ---------- hueOf ----------

describe("hueOf", () => {
  it("returns start + span/2 normalized to [0,360)", () => {
    const node = { _start: 100, _span: 40 };
    expect(hueOf(node)).toBeCloseTo(120);
  });

  it("wraps correctly", () => {
    const node = { _start: 350, _span: 20 };
    expect(hueOf(node)).toBeCloseTo(0);
  });
});

// ---------- sectorPath ----------

describe("sectorPath", () => {
  it("returns a string starting with M and ending with Z", () => {
    const d = sectorPath(50, 100, 0, 90);
    expect(d).toMatch(/^M .+ Z$/);
  });

  it("contains arc commands (A)", () => {
    const d = sectorPath(50, 100, 0, 90);
    expect(d).toContain("A ");
  });

  it("no NaN in path", () => {
    const d = sectorPath(50, 100, 0, 90);
    expect(d).not.toContain("NaN");
  });

  it("sweep > 180 sets large-arc flag to 1", () => {
    const d = sectorPath(50, 100, 0, 200);
    // should contain "0 1 1" (large-arc=1, sweep=1)
    expect(d).toContain("0 1 1");
  });

  it("sweep < 180 sets large-arc flag to 0", () => {
    const d = sectorPath(50, 100, 0, 90);
    expect(d).toContain("0 0 1");
  });

  it("degenerate sector (a0 === a1) produces valid path", () => {
    const d = sectorPath(50, 100, 45, 45);
    expect(typeof d).toBe("string");
    expect(d).not.toContain("NaN");
  });
});

// ---------- formatSize ----------

describe("formatSize", () => {
  it("formats bytes", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(999)).toBe("999 B");
  });

  it("formats kilobytes", () => {
    expect(formatSize(1000)).toBe("1.0 KB");
    expect(formatSize(1500)).toBe("1.5 KB");
    expect(formatSize(999900)).toBe("999.9 KB");
  });

  it("formats megabytes", () => {
    expect(formatSize(1_000_000)).toBe("1.0 MB");
    expect(formatSize(1_500_000)).toBe("1.5 MB");
    expect(formatSize(999_900_000)).toBe("999.9 MB");
  });

  it("formats gigabytes", () => {
    expect(formatSize(1_000_000_000)).toBe("1.00 GB");
    expect(formatSize(4_000_000_000)).toBe("4.00 GB");
  });

  it("formats very large values", () => {
    expect(formatSize(100_000_000_000)).toBe("100.00 GB");
  });
});

// ---------- sizeHue ----------

describe("sizeHue", () => {
  it("returns 0 for zero/negative size", () => {
    expect(sizeHue(0, 1000)).toBe(0);
    expect(sizeHue(-5, 1000)).toBe(0);
  });

  it("returns up to 300° for the largest size (no wrap)", () => {
    expect(sizeHue(1000, 1000)).toBeLessThanOrEqual(300);
    expect(sizeHue(1000, 1000)).toBeGreaterThan(290);
    expect(sizeHue(1, 1000)).toBeLessThan(31);
  });
});

// ---------- lastUpdatedHue ----------

describe("lastUpdatedHue", () => {
  it("returns 0 for undefined mtime", () => {
    expect(lastUpdatedHue(undefined, 0, 1000)).toBe(0);
    expect(lastUpdatedHue(null, 0, 1000)).toBe(0);
  });

  it("returns red (0°) for the oldest mtime, green (120°) for the newest", () => {
    const min = 1000, max = 2000;
    expect(lastUpdatedHue(min, min, max)).toBeCloseTo(0, 1);
    expect(lastUpdatedHue(max, min, max)).toBeCloseTo(120, 1);
  });

  it("interpolates linearly across [min, max]", () => {
    const min = 0, max = 1000;
    const mid = lastUpdatedHue(500, min, max);
    expect(mid).toBeCloseTo(60, 1); // halfway between red (0) and green (120)
  });

  it("handles equal min/max (span 0) without NaN", () => {
    const h = lastUpdatedHue(500, 500, 500);
    expect(isNaN(h)).toBe(false);
  });
});

// ---------- lerp ----------

describe("lerp", () => {
  it("lerp(0, 10, 0) === 0", () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });

  it("lerp(0, 10, 1) === 10", () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it("lerp(0, 10, 0.5) === 5", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it("handles negative values", () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
    expect(lerp(-20, -10, 0.5)).toBe(-15);
  });

  it("handles reversed direction", () => {
    expect(lerp(10, 0, 0.5)).toBe(5);
  });
});

// ---------- easeInOut ----------

describe("easeInOut", () => {
  it("easeInOut(0) === 0", () => {
    expect(easeInOut(0)).toBe(0);
  });

  it("easeInOut(1) === 1", () => {
    expect(easeInOut(1)).toBe(1);
  });

  it("easeInOut(0.5) === 0.5 (symmetry)", () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });

  it("is monotonically non-decreasing on [0,1]", () => {
    const steps = 200;
    let prev = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const v = easeInOut(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-10);
      prev = v;
    }
  });

  it("output is always in [0,1] for input in [0,1]", () => {
    for (let i = 0; i <= 100; i++) {
      const v = easeInOut(i / 100);
      expect(v).toBeGreaterThanOrEqual(-1e-10);
      expect(v).toBeLessThanOrEqual(1 + 1e-10);
    }
  });
});

// ---------- lerpAngle ----------

describe("lerpAngle", () => {
  it("lerpAngle(a, a, t) === a for any t", () => {
    expect(lerpAngle(90, 90, 0)).toBeCloseTo(90);
    expect(lerpAngle(90, 90, 0.5)).toBeCloseTo(90);
    expect(lerpAngle(90, 90, 1)).toBeCloseTo(90);
  });

  it("lerpAngle(a, b, 0) === a", () => {
    expect(lerpAngle(10, 200, 0)).toBeCloseTo(10);
  });

  it("lerpAngle(a, b, 1) === b", () => {
    expect(lerpAngle(10, 200, 1)).toBeCloseTo(200);
  });

  it("takes shortest path: 350 → 10 goes 20° forward", () => {
    const mid = lerpAngle(350, 10, 0.5);
    // shortest path: 350 + 10 = 360 → midpoint = 0
    expect(mid).toBeCloseTo(0, 0);
  });

  it("takes shortest path: 10 → 350 goes 20° backward", () => {
    const mid = lerpAngle(10, 350, 0.5);
    expect(mid).toBeCloseTo(0, 0);
  });

  it("result is always in [0,360)", () => {
    const pairs = [[0, 359], [359, 0], [180, 181], [0, 180], [270, 90]];
    for (const [a, b] of pairs) {
      for (let t = 0; t <= 1; t += 0.05) {
        const r = lerpAngle(a, b, t);
        expect(r).toBeGreaterThanOrEqual(-1e-10);
        expect(r).toBeLessThan(360 + 1e-10);
      }
    }
  });

  it("handles wrap-around near 0", () => {
    const mid = lerpAngle(359, 1, 0.5);
    expect(mid).toBeCloseTo(0, 0);
  });
});

// ---------- radiusAt ----------

describe("radiusAt", () => {
  it("rf=0 returns [0, CENTER_WIDTH]", () => {
    const [r0, r1] = radiusAt(0);
    expect(r0).toBeCloseTo(0);
    expect(r1).toBeCloseTo(CENTER_WIDTH);
  });

  it("r0 < r1 for all integer ring indices", () => {
    for (let i = 0; i <= MAX_RING; i++) {
      const [r0, r1] = radiusAt(i);
      expect(r0).toBeLessThan(r1);
    }
  });

  it("radii increase with rf (monotonic)", () => {
    const vals = [];
    for (let rf = 0; rf <= MAX_RING; rf += 0.1) {
      vals.push(radiusAt(rf)[0]);
    }
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1] - 1e-6);
    }
  });

  it("interpolates between ring boundaries at fractional rf", () => {
    const [r0a, r1a] = radiusAt(1); // start of first large ring
    const [r0b, r1b] = radiusAt(2); // start of second large ring
    const [r0mid, r1mid] = radiusAt(1.5);
    // midpoint should be between the two
    expect(r0mid).toBeGreaterThan(r0a);
    expect(r0mid).toBeLessThan(r0b);
  });
});

// ---------- snapshotAll ----------

describe("snapshotAll", () => {
  it("returns a Map", () => {
    const root = makeTree();
    computeSizes(root);
    layout(root);
    const snap = snapshotAll(root);
    expect(snap).toBeInstanceOf(Map);
  });

  it("captures every node in the tree", () => {
    const root = makeTree();
    computeSizes(root);
    layout(root);
    const snap = snapshotAll(root);
    // walk tree and check each node is in the map
    const walk = (n) => {
      expect(snap.has(n)).toBe(true);
      const s = snap.get(n);
      expect(s.ring).toBe(n._ring);
      expect(s.start).toBe(n._start);
      expect(s.span).toBe(n._span);
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(root);
  });
});

// ---------- subtreeNodes ----------

describe("subtreeNodes", () => {
  it("returns a Set", () => {
    const root = makeTree();
    const s = subtreeNodes(root);
    expect(s).toBeInstanceOf(Set);
  });

  it("includes the root node", () => {
    const root = makeTree();
    const s = subtreeNodes(root);
    expect(s.has(root)).toBe(true);
  });

  it("includes all descendants", () => {
    const root = makeTree();
    const s = subtreeNodes(root);
    const walk = (n) => {
      expect(s.has(n)).toBe(true);
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(root);
  });

  it("subtree of a child excludes root and siblings", () => {
    const root = makeTree();
    computeSizes(root);
    layout(root);
    const big = root.children.find(c => c.name === "big");
    const s = subtreeNodes(big);
    expect(s.has(big)).toBe(true);
    expect(s.has(root)).toBe(false);
    expect(s.has(root.children.find(c => c.name === "mid"))).toBe(false);
    // but includes big's children
    for (const c of big.children) {
      expect(s.has(c)).toBe(true);
    }
  });
});

// ---------- Regression: dataset structural integrity ----------
//
// Catches the bug where folder() was misused to wrap a file object instead of
// passing an array of children (a972b5b / fix f0c8e9c). A malformed node with
// type:"folder" and children:<non-array> made computeSizes throw
// "node.children is not iterable" the moment the workstation dataset loaded.
// This test exercises both real datasets end-to-end so any future malformed
// node in either tree fails the suite immediately.

describe("dataset structural integrity", () => {
  it("every folder node has an array of children (disk + workstation)", async () => {
    const { disk, workstation } = await import("../../src/sample-data.js");
    for (const root of [disk, workstation]) {
      const stack = [root];
      while (stack.length) {
        const n = stack.pop();
        if (n.type === "folder") {
          expect(Array.isArray(n.children)).toBe(true);
          if (n.children) stack.push(...n.children);
        } else {
          // leaves must not carry children
          expect(n.children).toBeUndefined();
        }
      }
    }
  });

  it("computeSizes does not throw on disk or workstation", async () => {
    const { disk, workstation } = await import("../../src/sample-data.js");
    for (const root of [disk, workstation]) {
      expect(() => computeSizes(root)).not.toThrow();
      expect(root.size).toBeGreaterThan(0);
    }
  });

  it("layout produces placed nodes on disk or workstation", async () => {
    const { disk, workstation } = await import("../../src/sample-data.js");
    for (const root of [disk, workstation]) {
      computeSizes(root);
      const placed = layout(root);
      expect(placed.length).toBeGreaterThan(0);
    }
  });

  // ---------- ringTable (ring tuning; geometry widget) ----------

  describe("ringTable", () => {
    it("geometric mode: w_i = w_(i-1) × m, anchored at CENTER_WIDTH", () => {
      const rt = ringTable({ maxRings: 4, ringMode: "geometric", ringMultiplier: 2 });
      expect(rt.table[0][0]).toBe(0);
      expect(rt.table[0][1]).toBe(CENTER_WIDTH);
      for (let i = 1; i <= 4; i++) {
        const w = rt.table[i][1] - rt.table[i][0];
        const prevW = rt.table[i - 1][1] - rt.table[i - 1][0];
        expect(w).toBeCloseTo(prevW * 2, 6);
      }
      expect(rt.bounds[5]).toBeCloseTo(CENTER_WIDTH * (2 ** 5 - 1), 6);
    });

    it("ringScale shrinks ALL widths uniformly", () => {
      const rt = ringTable({ maxRings: 3, ringMode: "small", ringScale: 0.5 });
      for (let i = 0; i <= 3; i++) {
        const w = rt.table[i][1] - rt.table[i][0];
        const raw = i === 0 ? CENTER_WIDTH : (i <= Math.min(LARGE_RINGS, 3) ? LARGE_WIDTH : SMALL_WIDTH);
        expect(w).toBeCloseTo(raw * 0.5, 6);
      }
      expect(rt.bounds[4]).toBeCloseTo((CENTER_WIDTH + 3 * LARGE_WIDTH) * 0.5, 6);
    });

    it("ringScale = 1 (default) is identity", () => {
      const a = ringTable({ maxRings: 3, ringMode: "small" });
      const b = ringTable({ maxRings: 3, ringMode: "small", ringScale: 1.0 });
      expect(a.bounds).toEqual(b.bounds);
    });

    it("growth rate 2.0 × 15 rings overflows CARD_RADIUS; ringScale caps it", () => {
      const rt = ringTable({ maxRings: 15, ringMode: "geometric", ringMultiplier: 2 });
      const total = rt.bounds[rt.bounds.length - 1];
      expect(total).toBeGreaterThan(CARD_RADIUS);
      const s = Math.min(1, CARD_RADIUS / total);
      const capped = ringTable({ maxRings: 15, ringMode: "geometric", ringMultiplier: 2, ringScale: s });
      expect(capped.bounds[capped.bounds.length - 1]).toBeCloseTo(CARD_RADIUS, 6);
    });

    it("modeBlend=0 reproduces the base column; modeBlend=1 the other column", () => {
      const geom = ringTable({ maxRings: 10, ringMode: "geometric", ringMultiplier: 1.0 });
      const tiered = ringTable({ maxRings: 10, ringMode: "small" });
      const b0 = ringTable({ maxRings: 10, ringMode: "geometric", ringMultiplier: 1.0, modeBlend: 0 });
      const b1 = ringTable({ maxRings: 10, ringMode: "geometric", ringMultiplier: 1.0, modeBlend: 1 });
      expect(b0.bounds).toEqual(geom.bounds);
      expect(b1.bounds).toEqual(tiered.bounds);
    });

    it("modeBlend=0.5 lerps each ring's width to the midpoint", () => {
      const b = ringTable({ maxRings: 10, ringMode: "geometric", ringMultiplier: 1.0, modeBlend: 0.5 });
      for (let i = 0; i <= 10; i++) {
        const w = b.table[i][1] - b.table[i][0];
        const raw = i === 0 ? CENTER_WIDTH : (i <= Math.min(LARGE_RINGS, 10) ? LARGE_WIDTH : SMALL_WIDTH);
        expect(w).toBeCloseTo((CENTER_WIDTH + raw) / 2, 6);
      }
    });

    it("grow/shrink modes ignore modeBlend", () => {
      const a = ringTable({ maxRings: 5, ringMode: "grow", ringMultiplier: 1.2, modeBlend: 0 });
      const b = ringTable({ maxRings: 5, ringMode: "grow", ringMultiplier: 1.2, modeBlend: 1 });
      expect(a.bounds).toEqual(b.bounds);
    });

    it("toggle pin: with derived ringScale the outer edge stays at CARD_RADIUS across the whole blend", () => {
      const widthsAt = (blend) => {
        const total = ringTable({ maxRings: 10, ringMode: "geometric", ringMultiplier: 1, modeBlend: blend }).bounds[10];
        const s = Math.min(1, CARD_RADIUS / total);
        return ringTable({ maxRings: 10, ringMode: "geometric", ringMultiplier: 1, modeBlend: blend, ringScale: s }).bounds[10];
      };
      expect(widthsAt(0)).toBeCloseTo(CARD_RADIUS, 6);
      expect(widthsAt(0.5)).toBeCloseTo(CARD_RADIUS, 6);
      expect(widthsAt(1)).toBeCloseTo(CARD_RADIUS, 6);
    });
  });
});
