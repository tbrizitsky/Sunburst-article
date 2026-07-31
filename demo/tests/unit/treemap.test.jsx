import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { Treemap, filterSmallNodes, ANIM_MS } from "../../src/Treemap.jsx";
import { disk } from "../../src/sample-data.js";

function clone(obj) {
  const seen = new WeakMap();
  function walk(n) {
    if (n === null || typeof n !== "object") return n;
    if (seen.has(n)) return seen.get(n);
    if (Array.isArray(n)) {
      const arr = [];
      seen.set(n, arr);
      for (const v of n) arr.push(walk(v));
      return arr;
    }
    const out = {};
    seen.set(n, out);
    for (const k of Object.keys(n)) {
      if (k === "_parent") continue;
      out[k] = walk(n[k]);
    }
    return out;
  }
  return walk(obj);
}

// ---------- filterSmallNodes (unit) ----------

describe("filterSmallNodes", () => {
  it("removes children below threshold and redistributes size", () => {
    const tree = {
      name: "root", size: 100,
      children: [
        { name: "big", size: 60 },
        { name: "medium", size: 30 },
        { name: "small", size: 10 },
      ],
    };
    filterSmallNodes(tree, 15);
    expect(tree.children).toHaveLength(2);
    expect(tree.children.map(c => c.name)).toEqual(["big", "medium"]);
    const total = tree.children.reduce((a, c) => a + c.size, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(tree.children[0].size).toBeGreaterThan(60);
  });

  it("keeps all children at threshold 0", () => {
    const tree = {
      name: "root", size: 100,
      children: [
        { name: "a", size: 50 },
        { name: "b", size: 30 },
        { name: "c", size: 20 },
      ],
    };
    filterSmallNodes(tree, 0);
    expect(tree.children).toHaveLength(3);
  });

  it("removes all but the largest at threshold above second-largest share", () => {
    const tree = {
      name: "root", size: 100,
      children: [
        { name: "big", size: 80 },
        { name: "small", size: 20 },
      ],
    };
    filterSmallNodes(tree, 25);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe("big");
    expect(tree.children[0].size).toBeCloseTo(100, 5);
  });

  it("preserves leaf node (no children)", () => {
    const leaf = { name: "leaf", size: 50 };
    const result = filterSmallNodes(leaf, 10);
    expect(result).toBe(leaf);
  });

  it("preserves node with empty children array", () => {
    const tree = { name: "emptyDir", size: 0, children: [] };
    const result = filterSmallNodes(tree, 10);
    expect(result.children).toEqual([]);
  });

  it("handles all children below threshold by consolidating into the largest", () => {
    const tree = {
      name: "root", size: 100,
      children: [
        { name: "a", size: 1 },
        { name: "b", size: 1 },
      ],
    };
    filterSmallNodes(tree, 50);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe("a");
    expect(tree.children[0].size).toBe(100);
  });

  it("removes medium and small from flat data", () => {
    const flatData = { name: "root", size: 100, children: [
      { name: "big", size: 80 },
      { name: "med", size: 15 },
      { name: "sml", size: 5 },
    ]};
    filterSmallNodes(flatData, 20);
    expect(flatData.children).toHaveLength(1);
    expect(flatData.children[0].name).toBe("big");
    expect(flatData.children[0].size).toBeCloseTo(100, 5);
  });

  it("recurses into nested children", () => {
    const tree = {
      name: "root", size: 100,
      children: [
        {
          name: "parent", size: 80,
          children: [
            { name: "bigChild", size: 70 },
            { name: "tinyChild", size: 10 },
          ],
        },
        { name: "other", size: 20 },
      ],
    };
    filterSmallNodes(tree, 15);
    const parent = tree.children.find(c => c.name === "parent");
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].name).toBe("bigChild");
    expect(parent.children[0].size).toBeCloseTo(80, 5);
  });
});

// ---------- Treemap rendering with threshold ----------

function renderTreemap(props = {}) {
  return render(
    <Treemap
      data={clone(disk)}
      algorithm={props.algorithm ?? "stableSquarified"}
      visibilityThreshold={props.visibilityThreshold ?? 0}
      aspectRatio={props.aspectRatio ?? 16 / 9}
      animate={props.animate ?? false}
    />
  );
}

function cellCount(container) {
  const wrapper = container.querySelector('[style*="overflow: hidden"]');
  if (!wrapper) return 0;
  // Ghosts have pointer-events:none; active cells don't.
  return Array.from(wrapper.querySelectorAll(':scope > div'))
    .filter(el => el.style.pointerEvents !== 'none').length;
}

function ghostCount(container) {
  const wrapper = container.querySelector('[style*="overflow: hidden"]');
  if (!wrapper) return 0;
  return Array.from(wrapper.querySelectorAll(':scope > div'))
    .filter(el => el.style.pointerEvents === 'none').length;
}

describe("Treemap threshold rendering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders cells at threshold 0", () => {
    const { container } = renderTreemap({ visibilityThreshold: 0 });
    expect(cellCount(container)).toBeGreaterThan(0);
  });

  it("renders cells at both threshold 0 and threshold 5", () => {
    const { container: c1 } = renderTreemap({ visibilityThreshold: 0 });
    const { container: c2 } = renderTreemap({ visibilityThreshold: 5 });
    expect(cellCount(c1)).toBeGreaterThan(0);
    expect(cellCount(c2)).toBeGreaterThan(0);
  });

  it("renders with different algorithms", () => {
    const algs = ["stableSquarified", "sliceAndDice", "squarified", "strip"];
    for (const alg of algs) {
      const { container } = renderTreemap({ algorithm: alg, visibilityThreshold: 5 });
      expect(cellCount(container)).toBeGreaterThan(0);
    }
  });

  it("renders with different aspect ratios", () => {
    for (const ar of [16 / 9, 3 / 2, 1]) {
      const { container } = renderTreemap({ aspectRatio: ar, visibilityThreshold: 5 });
      expect(cellCount(container)).toBeGreaterThan(0);
    }
  });

  it("strip algorithm produces cells at all aspect ratios", () => {
    for (const ar of [16 / 9, 3 / 2, 1]) {
      const { container } = renderTreemap({ algorithm: "strip", aspectRatio: ar });
      expect(cellCount(container)).toBeGreaterThan(0);
    }
  });

  it("strip + threshold produces cells at both threshold 0 and threshold 5", () => {
    const { container: c0 } = renderTreemap({ algorithm: "strip", visibilityThreshold: 0 });
    const { container: c5 } = renderTreemap({ algorithm: "strip", visibilityThreshold: 5 });
    expect(cellCount(c0)).toBeGreaterThan(0);
    expect(cellCount(c5)).toBeGreaterThan(0);
  });

  it("renders both datasets", () => {
    const { container } = renderTreemap({ visibilityThreshold: 5 });
    expect(cellCount(container)).toBeGreaterThan(0);
  });
});

// ---------- Treemap animation on threshold change ----------

describe("Treemap animation on threshold change", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates ghost cells when threshold increases and removes them after ANIM_MS", () => {
    const mkData = () => ({ name: "root", type: "folder", children: [
      { name: "big", type: "file", size: 80 },
      { name: "med", type: "file", size: 15 },
      { name: "sml", type: "file", size: 5 },
    ]});
    const { container, rerender } = render(
      <Treemap
        data={mkData()}
        algorithm="stableSquarified"
        visibilityThreshold={0}
        animate={true}
      />
    );
    expect(cellCount(container)).toBe(3);
    expect(ghostCount(container)).toBe(0);

    rerender(
      <Treemap
        data={mkData()}
        algorithm="stableSquarified"
        visibilityThreshold={20}
        animate={true}
      />
    );

    expect(cellCount(container)).toBe(1);
    expect(ghostCount(container)).toBe(2);

    act(() => { vi.advanceTimersByTime(ANIM_MS); });
    expect(cellCount(container)).toBe(1);
    expect(ghostCount(container)).toBe(0);
  });

  it("animates on algorithm change", () => {
    const { container, rerender } = renderTreemap({
      algorithm: "stableSquarified", visibilityThreshold: 0, animate: true,
    });
    expect(cellCount(container)).toBeGreaterThan(0);

    rerender(
      <Treemap
        data={clone(disk)}
        algorithm="sliceAndDice"
        visibilityThreshold={0}
        aspectRatio={16 / 9}
        animate={true}
      />
    );
    expect(cellCount(container)).toBeGreaterThan(0);

    act(() => { vi.advanceTimersByTime(ANIM_MS); });
  });

  it("animates on aspect ratio change", () => {
    const { container, rerender } = renderTreemap({
      visibilityThreshold: 0, aspectRatio: 16 / 9, animate: true,
    });
    expect(cellCount(container)).toBeGreaterThan(0);

    rerender(
      <Treemap
        data={clone(disk)}
        algorithm="stableSquarified"
        visibilityThreshold={0}
        aspectRatio={1}
        animate={true}
      />
    );
    expect(cellCount(container)).toBeGreaterThan(0);

    act(() => { vi.advanceTimersByTime(ANIM_MS); });
  });
});
