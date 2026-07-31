import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import { SunburstMvp } from "../../src/SunburstMvp.jsx";
import { sortLayout, MVP_TUNABLES, computeSizes } from "../../src/layout.js";
import { disk } from "../../src/sample-data.js";

// NOTE: `prefersReducedMotion` is evaluated once at module load in SunburstMvp.
// The reduced-motion test re-imports the module with a mocked matchMedia.

function renderMvp(directive) {
  return render(<SunburstMvp directive={directive} />);
}

// The rendered sector geometry as an ordered list of SVG path `d` values. The map
// is the widget's whole point — a test that asserts only the switch state would
// pass even if the toggle did nothing to the layout (the bug this file guards).
function sectorDs(container) {
  return [...container.querySelectorAll("path")].map((p) => p.getAttribute("d"));
}

describe("SunburstMvp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the .sunburst-widget container", () => {
    const { container } = renderMvp({ data: "disk" });
    expect(container.querySelector(".sunburst-widget")).toBeInTheDocument();
  });

  it("renders a SunburstMap SVG inside .sunburst-widget-map", () => {
    const { container } = renderMvp({ data: "disk" });
    const mapWrap = container.querySelector(".sunburst-widget-map");
    expect(mapWrap).toBeInTheDocument();
    expect(mapWrap.querySelector("svg#map")).toBeInTheDocument();
  });

  it("renders the 'Sort by size' toggle, unchecked by default (name sort)", () => {
    const { container } = renderMvp({ data: "disk" });
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
    const label = container.querySelector(".widget-control-label");
    expect(label.textContent).toBe("Sort by size");
  });

  it("renders the caption when caption is a non-none string", () => {
    renderMvp({ data: "disk", caption: "a sunburst — flip the toggle" });
    const caption = screen.getByText("a sunburst — flip the toggle");
    expect(caption).toHaveClass("sunburst-widget-caption");
  });

  it("does not render the caption when caption is absent", () => {
    const { container } = renderMvp({ data: "disk" });
    expect(container.querySelector(".sunburst-widget-caption")).toBeNull();
  });

  it("disk name order differs from size order (guards the geometry tests against a vacuous pass)", () => {
    computeSizes(disk);
    const nameItems = sortLayout(disk, 0, MVP_TUNABLES);
    const sizeItems = sortLayout(disk, 1, MVP_TUNABLES);
    const starts = (items) => items.filter((it) => it.ring >= 1).map((it) => Math.round(it.start * 1000));
    expect(starts(sizeItems)).not.toEqual(starts(nameItems));
  });

  it("flipping the toggle on animates to the size layout — the rendered sectors re-order", async () => {
    const { container } = renderMvp({ data: "disk" });
    const before = sectorDs(container);
    const checkbox = container.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    // Let the tween run to completion (fake rAF stepping + async flush).
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(checkbox.checked).toBe(true);
    expect(sectorDs(container)).not.toEqual(before);
  });

  it("flipping off mid-flight retargets and settles back to the name layout", async () => {
    const { container } = renderMvp({ data: "disk" });
    const before = sectorDs(container);
    const checkbox = container.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);            // start 0 → 1
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.click(checkbox);            // retarget mid-flight → 0
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(checkbox.checked).toBe(false);
    expect(sectorDs(container)).toEqual(before);
  });

  it("unmounts mid-animation without throwing", async () => {
    const { container, unmount } = renderMvp({ data: "disk" });
    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(() => unmount()).not.toThrow();
  });
});

describe("SunburstMvp reduced-motion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("hard-cuts: toggle flips instantly and the map jumps to the size layout (no tween)", async () => {
    vi.resetModules();
    const orig = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    });
    try {
      const { SunburstMvp: Mvp } = await import("../../src/SunburstMvp.jsx");
      const { container } = render(<Mvp directive={{ data: "disk" }} />);
      const before = sectorDs(container);
      const checkbox = container.querySelector('input[type="checkbox"]');
      expect(checkbox.checked).toBe(false);
      fireEvent.click(checkbox);
      // Checked and re-sorted immediately with zero timer advancement.
      expect(checkbox.checked).toBe(true);
      expect(sectorDs(container)).not.toEqual(before);
    } finally {
      window.matchMedia = orig;
    }
  });
});
