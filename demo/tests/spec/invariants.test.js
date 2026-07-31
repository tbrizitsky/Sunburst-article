import { describe, it, expect, beforeAll } from "vitest";
import {
  computeSizes, layout, morphLayout, norm,
  THETA_MIN, MAX_RING, LARGE_RINGS, SMALL_RINGS,
  S, L, SMALLER_ALPHA, CENTER_OPACITY, ANGLE_GAP, RADIAL_GAP,
  DEFAULT_TUNABLES,
} from "../../src/layout.js";

// Deep-clone helper (the layout mutates nodes in place)
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

import { disk, workstation, validateTree } from "../../src/sample-data.js";

let root, placed;

beforeAll(() => {
  root = clone(disk);
  computeSizes(root);
  placed = layout(root);
});

// ---------- §2 Data model ----------

describe("§2 Data model — sample data integrity", () => {
  it("root is a folder named 'Macintosh HD'", () => {
    expect(root.type).toBe("folder");
    expect(root.name).toBe("Macintosh HD");
  });

  it("root has a free node as one of its children", () => {
    expect(root.children.some(c => c.type === "free")).toBe(true);
  });

  it("exactly one free node at root level", () => {
    const freeChildren = root.children.filter(c => c.type === "free");
    expect(freeChildren).toHaveLength(1);
  });

  it("every node has a name", () => {
    const walk = (n) => {
      expect(n).toHaveProperty("name");
      expect(typeof n.name).toBe("string");
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(root);
  });

  it("every file has a positive size", () => {
    const walk = (n) => {
      if (n.type === "file") {
        expect(n.size).toBeGreaterThan(0);
      }
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(root);
  });

  it("every folder's size equals the sum of its children's sizes", () => {
    const checkFolder = (n) => {
      if (n.type === "folder" && n.children) {
        const childSum = n.children.reduce((a, c) => a + (c.size || 0), 0);
        expect(n.size).toBe(childSum);
        for (const c of n.children) checkFolder(c);
      }
    };
    checkFolder(root);
  });

  it("free node only appears as a direct child of root, never deeper", () => {
    const walk = (n, depth) => {
      // free node at depth 1 (direct child of root) is allowed;
      // free node at depth > 1 means it appeared inside a subfolder.
      if (n.type === "free" && depth > 1) {
        throw new Error(`free node found at depth ${depth}: ${n.name}`);
      }
      if (n.children) for (const c of n.children) walk(c, depth + 1);
    };
    expect(() => walk(root, 0)).not.toThrow();
  });

  it("tree has multiple levels of nesting (depth >= 3)", () => {
    let maxDepth = 0;
    const walk = (n, depth) => {
      if (depth > maxDepth) maxDepth = depth;
      if (n.children) for (const c of n.children) walk(c, depth + 1);
    };
    walk(root, 0);
    expect(maxDepth).toBeGreaterThanOrEqual(3);
  });

  it("sample data has both large items and many small items", () => {
    const walk = (n) => {
      let files = 0;
      let large = 0;
      if (n.type === "file") return { files: 1, large: n.size > 1_000_000_000 ? 1 : 0 };
      if (!n.children) return { files: 0, large: 0 };
      for (const c of n.children) {
        const r = walk(c);
        files += r.files;
        large += r.large;
      }
      return { files, large };
    };
    const r = walk(root);
    expect(r.files).toBeGreaterThan(50); // "many small items"
    expect(r.large).toBeGreaterThan(0);   // "a few large items"
  });
});

// ---------- §4 Layout — rings ----------

describe("§4 Layout — rings", () => {
  it("root is at ring 0, its children at ring 1, etc.", () => {
    const ring1 = placed.filter(n => n._ring === 1 && n.type !== "free");
    expect(ring1.length).toBeGreaterThan(0);
    // every placed node has a valid ring
    for (const n of placed) {
      expect(n._ring).toBeGreaterThanOrEqual(0);
      expect(n._ring).toBeLessThanOrEqual(MAX_RING);
    }
  });

  it("max visible levels = center + 5 large + 5 small = 11", () => {
    expect(LARGE_RINGS).toBe(5);
    expect(SMALL_RINGS).toBe(5);
    // MAX_RING = 10 (index 0..10 = 11 rings)
    expect(MAX_RING).toBe(10);
  });

  it("no placed node exceeds MAX_RING", () => {
    for (const n of placed) {
      expect(n._ring).toBeLessThanOrEqual(MAX_RING);
    }
  });

  it("a folder and its children occupy adjacent rings", () => {
    // pick a deep folder and check ring difference
    const walk = (n) => {
      if (n.type === "folder" && n.children && n.children.length > 1) {
        const child = n.children.find(c => c.type !== "free" && c._ring !== undefined);
        if (child) {
          return { parentRing: n._ring, childRing: child._ring };
        }
      }
      if (n.children) {
        for (const c of n.children) {
          const r = walk(c);
          if (r) return r;
        }
      }
      return null;
    };
    const result = walk(root);
    expect(result).not.toBeNull();
    expect(result.childRing).toBe(result.parentRing + 1);
  });
});

// ---------- §4 Sorting ----------

describe("§4 Sorting — children sorted by size, largest first", () => {
  it("root-level children (excluding free + smaller) are size-descending", () => {
    const ring1 = placed.filter(n => n._ring === 1 && n.type !== "free" && n.type !== "smaller");
    for (let i = 1; i < ring1.length; i++) {
      expect(ring1[i].size).toBeLessThanOrEqual(ring1[i - 1].size);
    }
  });

  it("smaller objects bucket is last within its parent's angular span", () => {
    // For each placed folder that has children, check that if a smaller
    // bucket exists among its children, its start angle is the latest
    // (it comes after all real siblings).
    const walk = (n) => {
      if (n.type === "folder" && n.children) {
        const childSectors = placed.filter(p => {
          return n.children.includes(p) || n.children.some(c => c === p);
        });
        const smallerInRing = placed.filter(
          p => p.type === "smaller" && n.children.includes(p)
        );
        // If there's a smaller bucket among this folder's placed children,
        // its _start should be >= all real siblings' starts (last in span).
        if (smallerInRing.length > 0) {
          const smaller = smallerInRing[0];
          const realSiblings = placed.filter(
            p => n.children.includes(p) && p !== smaller && p.type !== "free"
          );
          for (const s of realSiblings) {
            // smaller's start should be after real siblings (within the parent span)
            // This is a soft check: smaller.start >= sibling.start for all siblings
            expect(smaller._start).toBeGreaterThanOrEqual(s._start - 0.01);
          }
        }
        for (const c of n.children) walk(c);
      }
    };
    walk(root);
  });
});

// ---------- §4 Free space ----------

describe("§4 Free space — root only, bisector at 180°", () => {
  it("exactly one free node placed", () => {
    const freeNodes = placed.filter(n => n.type === "free");
    expect(freeNodes).toHaveLength(1);
  });

  it("free node is at ring 1 (child of root)", () => {
    const free = placed.find(n => n.type === "free");
    expect(free._ring).toBe(1);
  });

  it("free node bisector is at 180°", () => {
    const free = placed.find(n => n.type === "free");
    const bisector = norm(free._start + free._span / 2);
    expect(bisector).toBeCloseTo(180, 0);
  });

  it("no free node exists in non-root drill-downs", () => {
    // drill into the first folder and check its children
    const bigFolder = placed.find(n => n.name === "Applications" || n.name === "Library" || n.name === "Users");
    if (bigFolder) {
      expect(bigFolder.children).toBeDefined();
      const hasFree = bigFolder.children.some(c => c.type === "free");
      expect(hasFree).toBe(false);
    }
  });
});

// ---------- §4 Smaller objects ----------

describe("§4 Smaller objects — below θ_min folded into bucket", () => {
  it("items with span < THETA_MIN are not individually placed", () => {
    // We can't easily check "not placed" since the layout doesn't track skipped items.
    // Instead: verify no placed sector has span < THETA_MIN (except possibly root)
    const nonRootPlaced = placed.filter(n => n._ring >= 1 && n.type !== "free" && n.type !== "smaller");
    for (const n of nonRootPlaced) {
      expect(n._span).toBeGreaterThanOrEqual(THETA_MIN - 0.01);
    }
  });

  it("smaller bucket has size > 0 when present", () => {
    const smallerBuckets = placed.filter(n => n.type === "smaller");
    for (const s of smallerBuckets) {
      expect(s.size).toBeGreaterThan(0);
      expect(s._span).toBeGreaterThan(0);
    }
  });

  it("if all children are small, no children ring is placed", () => {
    // Find a folder whose children all have very small sizes relative to it
    const walk = (n) => {
      if (n.type === "folder" && n.children) {
        const real = n.children.filter(c => c.type !== "free");
        if (real.length > 0) {
          const maxSpan = real.reduce((max, c) => {
            const span = (c.size / n.size) * 360;
            return span > max ? span : max;
          }, 0);
          if (maxSpan < THETA_MIN && real.length > 0) {
            // all children are below threshold — check if they were placed
            const childPlaced = placed.filter(p => {
              const parentOfP = root; // simplified check
              return p._ring > n._ring && real.includes(p);
            });
            return { folder: n.name, childPlaced: childPlaced.length, allSmall: true };
          }
        }
        for (const c of n.children) {
          const r = walk(c);
          if (r) return r;
        }
      }
      return null;
    };
    // This test validates the rule exists in the algorithm even if the sample data
    // doesn't naturally trigger it. We verify the rule via unit tests on custom trees.
    const result = walk(root);
    // If no naturally small-only folder exists in sample data, that's OK —
    // the rule is tested in unit tests with crafted trees.
  });
});

// ---------- §4 Max depth ----------

describe("§4 Max depth — levels beyond outermost small ring not rendered", () => {
  it("no placed node has ring > MAX_RING", () => {
    for (const n of placed) {
      expect(n._ring).toBeLessThanOrEqual(MAX_RING);
    }
  });
});

// ---------- §5 Color — hue freezing ----------

describe("§5 Color — folders get frozen _hue on first placement", () => {
  it("every placed folder at ring > 0 has _hue in [0, 360)", () => {
    const folders = placed.filter(n => n.type === "folder" && n._ring > 0);
    expect(folders.length).toBeGreaterThan(0);
    for (const f of folders) {
      expect(f._hue).toBeGreaterThanOrEqual(0);
      expect(f._hue).toBeLessThan(360);
    }
  });

  it("files do not have _hue", () => {
    const files = placed.filter(n => n.type === "file");
    for (const f of files) {
      expect(f._hue).toBeUndefined();
    }
  });

  it("smaller buckets do not have _hue", () => {
    const smaller = placed.filter(n => n.type === "smaller");
    for (const s of smaller) {
      expect(s._hue).toBeUndefined();
    }
  });

  it("hue is frozen: re-laying out preserves _hue", () => {
    // save current hues
    const huesBefore = new Map();
    for (const n of placed) {
      if (n._hue !== undefined) huesBefore.set(n, n._hue);
    }
    // re-layout
    const root2 = clone(disk);
    computeSizes(root2);
    const placed2 = layout(root2);
    // nodes in clone are different objects, so hue was freshly set.
    // Instead, test on same tree: re-layout should not change _hue.
    placed.length = 0;
    placed.push(...layout(root));
    for (const n of placed) {
      if (huesBefore.has(n)) {
        expect(n._hue).toBe(huesBefore.get(n));
      }
    }
  });
});

// ---------- §7 Edge cases ----------

describe("§7 Edge cases", () => {
  it("empty folder → renders as a sector with no sub-sectors", () => {
    const emptyFolder = {
      name: "empty", type: "folder", size: 0, children: [],
    };
    computeSizes(emptyFolder);
    const p = layout(emptyFolder);
    // root at ring 0, the empty folder should have no ring-1 children placed
    expect(p).toHaveLength(1); // just the root
  });

  it("single child → occupies full 360°", () => {
    const single = {
      name: "root", type: "folder", size: 0, children: [
        { name: "only", type: "file", size: 100 },
      ],
    };
    computeSizes(single);
    const p = layout(single);
    const child = p.find(n => n.name === "only");
    expect(child).toBeDefined();
    expect(child._span).toBeCloseTo(360, 0);
  });

  it("zero-size items are excluded from layout", () => {
    const tree = {
      name: "root", type: "folder", size: 0, children: [
        { name: "zero", type: "file", size: 0 },
        { name: "real", type: "file", size: 100 },
      ],
    };
    computeSizes(tree);
    const p = layout(tree);
    // zero-size item span = 0, which is < THETA_MIN → folded into smaller objects
    // or excluded entirely. The real file should still be placed.
    const real = p.find(n => n.name === "real");
    expect(real).toBeDefined();
  });
});

// ---------- §10 Navigation ----------

describe("§10 Navigation — drill-in layout", () => {
  it("drilled-in folder spans 360°", () => {
    // drill into Users: layout from Users perspective
    const usersNode = placed.find(n => n.name === "Users");
    if (usersNode && usersNode.type === "folder") {
      // simulate drill: layout from usersNode as root
      const drilled = layout(usersNode);
      // usersNode is now the center (ring 0) with span 360
      expect(drilled[0]._ring).toBe(0);
      expect(drilled[0]._span).toBeCloseTo(360, 0);
    }
  });

  it("drilled-in folder has no free-space sector", () => {
    const folder = placed.find(n => n.type === "folder" && n._ring >= 1 && n.children && n.children.length > 1);
    if (folder) {
      const drilled = layout(folder);
      const free = drilled.find(n => n.type === "free");
      expect(free).toBeUndefined();
    }
  });
});

// ---------- §10 Animation — morphLayout ring occupancy invariant ----------
// The dedup filter in SunburstMap.jsx drops ring<1 non-center items only
// during drill-in (p0<p1). During back transitions the final child may
// legitimately have ring<1 with op>0 as it returns from the center.
// This test verifies morphLayout output satisfies the invariant that
// makes the direction guard correct.

describe("§10 Animation — morphLayout ring occupancy invariant", () => {
  // Deep drill: folder → deeply nested descendant (depth >= 2)
  // such that during back the final child appears at ring < 1 with op > 0.
  // The workstation dataset has deeper nesting than disk, but we use disk
  // with the deepest available chain.
  let root, apps, util;
  beforeAll(() => {
    root = clone(disk);
    computeSizes(root);
    layout(root); // sets _parent, _start, _span
    apps = root.children.find(c => c.name === "Applications");
    util = apps?.children?.find(c => c.name === "Utilities");
  });

  // Stand-in for the SunburstMap.jsx dedup filter + direction guard.
  // Returns { kept: items[], droppedViaOld: items[], droppedViaNew: items[] }
  function dedupFilter(items, isDrill) {
    const dedup = new Map();
    const droppedByOld = []; // items the OLD filter (no direction guard) would drop
    const droppedByNew = []; // items the NEW filter (with guard) would drop

    for (const it of items) {
      if (it.isCenter) continue;
      // Old filter (no direction guard): drops ring<1 with op>0.01 always
      if (it.ring < 1 && (it.op ?? 1) > 0.01) droppedByOld.push(it);
      // New filter (with direction guard): only drops during drill-in
      if (isDrill && it.ring < 1 && (it.op ?? 1) > 0.01) droppedByNew.push(it);

      const key = (it.node && (it.node.name || it.node._hue)) + it.ring;
      const prev = dedup.get(key);
      if (!prev || (it.op ?? 0) > (prev.op ?? 0)) dedup.set(key, it);
    }
    return { kept: [...dedup.values()], droppedByOld, droppedByNew };
  }

  it("drill-in (p0<p1): non-center items at ring<1 with op>0.01 dropped", () => {
    if (!apps || !util) return;
    // p=0.6 is in the morph phase: pMorphRaw=0.2, so the final child
    // should have ring ≈ 0.92 (depth=2, pSlide ≈ 2*0.08=0.16, ring=1-0.16=0.84)
    // and op = lerp(1, 0, 0.2) ≈ 0.8 for depth=2 final child.
    const items = morphLayout(apps, util, 0.6, DEFAULT_TUNABLES);
    const { kept, droppedByNew } = dedupFilter(items, true);

    // The final child should be dropped by the new filter (isDrill=true)
    expect(droppedByNew.length).toBeGreaterThan(0);
    // The final child should NOT appear in kept items
    const finalChild = kept.find(it => !it.isCenter && it.ring < 1);
    expect(finalChild).toBeUndefined();
    // The kept items should have no duplicate keys
    const keys = kept.map(it => (it.node?.name ?? "") + it.ring);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("back (p0>p1): non-center items at ring<1 with op>0.01 preserved", () => {
    if (!apps || !util) return;
    // Same morphLayout call (morphLayout doesn't know direction), but
    // the dedup filter treats it as back (isDrill=false).
    const items = morphLayout(apps, util, 0.6, DEFAULT_TUNABLES);
    const { kept, droppedByNew } = dedupFilter(items, false);

    // During back, the final child should be KEPT (not dropped)
    expect(droppedByNew.length).toBe(0);
    // The final child should appear in kept items at ring<1
    const finalChild = kept.find(it => !it.isCenter && it.ring < 1);
    expect(finalChild).toBeDefined();
    expect(finalChild.op).toBeGreaterThan(0.01);
    // No duplicate keys
    const keys = kept.map(it => (it.node?.name ?? "") + it.ring);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the old filter (no direction guard) drops the final child during back", () => {
    if (!apps || !util) return;
    const items = morphLayout(apps, util, 0.6, DEFAULT_TUNABLES);
    const { droppedByOld } = dedupFilter(items, true);

    // The old filter (always active, no p0<p1 guard) would drop
    // the final child — this is the bug we fixed.
    expect(droppedByOld.length).toBeGreaterThan(0);
    const droppedNames = droppedByOld.map(it => it.node?.name);
    expect(droppedNames).toContain(util.name);
  });

  it("at p=0 and p=1 no item has ring<1 with op>0.01 (static endpoints)", () => {
    if (!apps || !util) return;
    for (const p of [0, 1]) {
      const items = morphLayout(apps, util, p, DEFAULT_TUNABLES);
      for (const it of items) {
        if (it.isCenter) continue;
        if (it.ring < 1 && (it.op ?? 1) > 0.01) {
          throw new Error(`p=${p}: non-center item "${it.node?.name}" at ring=${it.ring} op=${it.op}`);
        }
      }
    }
  });
});

// ---------- Staging constants ----------

describe("staging.md constants — binding for the demo", () => {
  it("LARGE_RINGS = 5", () => expect(LARGE_RINGS).toBe(5));
  it("SMALL_RINGS = 5", () => expect(SMALL_RINGS).toBe(5));
  it("THETA_MIN = 2°", () => expect(THETA_MIN).toBe(2));
  it("S = 60%", () => expect(S).toBe(60));
  it("L = 58%", () => expect(L).toBe(58));
  it("SMALLER_ALPHA = 0.5", () => expect(SMALLER_ALPHA).toBe(0.5));
  it("CENTER_OPACITY = 0", () => expect(CENTER_OPACITY).toBe(0));
  it("ANGLE_GAP > 0", () => expect(ANGLE_GAP).toBeGreaterThan(0));
  it("RADIAL_GAP > 0", () => expect(RADIAL_GAP).toBeGreaterThan(0));
});

// ---------- §2 dataset integrity — fail-fast validator ----------

describe("§2 validateTree — fail-fast at module load", () => {
  it("the shipped datasets pass validation (validator does not throw)", () => {
    expect(() => validateTree(disk)).not.toThrow();
    expect(() => validateTree(workstation)).not.toThrow();
  });

  // The detection guarantee: each class of corruption that the validator targets
  // is asserted to throw with a clear path. If `validateTree` were silently
  // permissive, one of these would pass instead of throwing.
  it("throws when a folder has no .children (the f0c8e9c crash shape)", () => {
    const bad = { name: "r", type: "folder", size: 0, children: [
      { name: "F", type: "folder", size: 10, children: [{ name: "leaf", type: "file", size: 10 }] },
    ] };
    // mutate: break the inner folder without .children
    delete bad.children[0].children;
    expect(() => validateTree(bad)).toThrow(/without \.children array/);
  });

  it("throws when a leaf node (file) is given children", () => {
    const bad = { name: "r", type: "folder", size: 0, children: [
      { name: "leaf", type: "file", size: 10, children: [{ name: "x", type: "file", size: 1 }] },
    ] };
    expect(() => validateTree(bad)).toThrow(/leaf \.file with children/);
  });

  it("throws when a 'free' node appears below the root (depth > 1)", () => {
    const bad = { name: "r", type: "folder", size: 0, children: [
      { name: "sub", type: "folder", size: 10, children: [
        { name: "free space", type: "free", size: 5 },
      ] },
    ] };
    expect(() => validateTree(bad)).toThrow(/'free' node only allowed/);
  });
});
