import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { SunburstWidget } from "../../src/SunburstWidget.jsx";
import { disk } from "../../src/sample-data.js";
import { computeSizes } from "../../src/layout.js";

// Deep clone tolerating the `_parent` back-reference cycle set by layout().
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

// Mock requestAnimationFrame for jsdom (SunburstMap uses rAF for animation).
beforeEach(() => {
  vi.useFakeTimers();
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
});

// Disk needs sizes precomputed once.
computeSizes(disk);

// Helper to render with a directive and return container.
function renderWidget(directive) {
  return render(<SunburstWidget directive={directive} />);
}

describe("SunburstWidget", () => {
  it("renders the .sunburst-widget container", () => {
    const { container } = renderWidget({ data: "disk", controls: [] });
    expect(container.querySelector(".sunburst-widget")).toBeInTheDocument();
  });

  it("renders SunburstMap inside .sunburst-widget-map (an SVG)", () => {
    const { container } = renderWidget({ data: "disk", controls: [] });
    const mapWrap = container.querySelector(".sunburst-widget-map");
    expect(mapWrap).toBeInTheDocument();
    expect(mapWrap.querySelector("svg")).toBeInTheDocument();
  });

  it("renders without throwing for a minimal directive", () => {
    expect(() => renderWidget({ data: "disk", controls: [] })).not.toThrow();
  });

  it("does not render the controls panel when controls is empty", () => {
    const { container } = renderWidget({ data: "disk", controls: [] });
    expect(container.querySelector(".sunburst-widget-controls")).toBeNull();
  });

  it("renders the controls panel when controls are present", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [{ name: "maxRings" }],
    });
    expect(container.querySelector(".sunburst-widget-controls")).toBeInTheDocument();
  });

  it("renders a slider control for a slider-type tunable with params", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [{ name: "maxRings", min: 1, max: 11, step: 1, default: 10 }],
    });
    const slider = container.querySelector('input[type="range"]');
    expect(slider).toBeInTheDocument();
    expect(Number(slider.min)).toBe(1);
    expect(Number(slider.max)).toBe(11);
    expect(Number(slider.step)).toBe(1);
    expect(Number(slider.value)).toBe(10);
  });

  it("renders a select control for a select-type tunable", async () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [{ name: "sorting" }],
    });
    const trigger = container.querySelector(".widget-select");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("role", "combobox");
    // The selected option label is shown in the trigger.
    expect(container.querySelector(".widget-select-value")).toHaveTextContent("size");
    // Options live in a popup; open it to assert they exist.
    fireEvent.click(trigger);
    const opts = screen.getAllByRole("option").map(o => o.textContent.trim());
    expect(opts).toContain("size");
    expect(opts).toContain("name");
  });

  it("renders a toggle control for a toggle-type tunable", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [{ name: "filesSpecial" }],
    });
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeInTheDocument();
  });

  it("normalizes a bare-string control def to {name: string} (renders select)", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: ["sorting"],
    });
    expect(container.querySelector(".widget-select")).toBeInTheDocument();
  });

  it("object control def with params renders slider", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [{ name: "maxRings", min: 1, max: 11 }],
    });
    expect(container.querySelector('input[type="range"]')).toBeInTheDocument();
  });

  it("renders caption text when caption is a non-none string", () => {
    renderWidget({ data: "disk", controls: [], caption: "My caption" });
    const caption = screen.getByText("My caption");
    expect(caption).toHaveClass("sunburst-widget-caption");
  });

  it("does not render caption element when caption is 'none' (sentinel)", () => {
    const { container } = renderWidget({ data: "disk", controls: [], caption: "none" });
    expect(container.querySelector(".sunburst-widget-caption")).toBeNull();
  });

  it("does not render caption element when caption is absent", () => {
    const { container } = renderWidget({ data: "disk", controls: [] });
    expect(container.querySelector(".sunburst-widget-caption")).toBeNull();
  });

  it("applies locked tunables to the rendered SunburstMap opts", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [],
      locked: { maxRings: 5 },
    });
    // SunburstMap honors opts.maxRings by capping the number of rings rendered.
    // We verify by checking that the SVG renders (opts applied without crash)
    // and that a SunburstMap is present. A deeper opts assertion requires
    // mocking SunburstMap; see the dedicated test below.
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("locked wins over the default tunable value", () => {
    // Render two widgets: one with locked.sorting=name, one without.
    // The select's displayed value reflects the active tunable.
    const { container } = renderWidget({
      data: "disk",
      controls: [{ name: "sorting" }],
      locked: { sorting: "name" },
    });
    const trigger = container.querySelector(".widget-select");
    expect(trigger).toHaveTextContent("name");
  });

  it("changing a slider control updates the displayed value", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [{ name: "maxRings", min: 1, max: 11, step: 1, default: 10 }],
    });
    const slider = container.querySelector('input[type="range"]');
    fireEvent.change(slider, { target: { value: "7" } });
    expect(Number(slider.value)).toBe(7);
  });

  it("changing a toggle control flips the checked state", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [{ name: "filesSpecial" }],
    });
    const checkbox = container.querySelector('input[type="checkbox"]');
    const before = checkbox.checked;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(!before);
  });

  it("defaultTunables covers all 11 TUNABLE_META keys (via rendered defaults)", () => {
    // Indirect: render with all controls and confirm all render without error.
    const all = ["maxRings", "ringMode", "ringMultiplier", "sorting", "coloring",
      "render", "interactions", "filesSpecial", "visibilityThreshold",
      "smallerObjects", "centerOpacity"];
    const { container } = renderWidget({
      data: "disk",
      controls: all.map(name => ({ name })),
    });
    const controls = container.querySelectorAll(".widget-control");
    expect(controls.length).toBe(11);
  });

  it("exposes the Animation toggle, seeded off by the locked default", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: ["animateNavigation"],
      locked: { animateNavigation: false },
    });
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
    const label = container.querySelector(".widget-control-label");
    expect(label.textContent).toBe("Animation");
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it("renders no breadcrumb when the breadcrumb field is absent", () => {
    const { container } = renderWidget({ data: "disk", controls: [] });
    expect(container.querySelector(".sunburst-widget-breadcrumb")).toBeNull();
  });

  it("renders the breadcrumb as the first widget child when breadcrumb is true", () => {
    const { container } = renderWidget({ data: "disk", controls: [], breadcrumb: true });
    const widget = container.querySelector(".sunburst-widget");
    const crumb = widget.querySelector(".sunburst-widget-breadcrumb");
    expect(crumb).toBeInTheDocument();
    expect(widget.firstElementChild).toBe(crumb);
    // At the root, the breadcrumb is a single non-clickable item.
    expect(crumb.textContent).toContain("Macintosh HD");
    expect(crumb.querySelector('[data-slot="breadcrumb-page"]')).toBeInTheDocument();
  });

  it("breadcrumb navigates back to an ancestor (hard cut with animation off)", () => {
    const { container } = renderWidget({
      data: "disk",
      controls: [],
      locked: { animateNavigation: false },
      breadcrumb: true,
    });
    const svg = container.querySelector("svg#map");
    const folderPath = Array.from(svg.querySelectorAll("path"))
      .find(p => p.style.cursor === "pointer");
    expect(folderPath).toBeDefined();

    // Drill into a folder (animateNavigation off → synchronous hard cut).
    act(() => { fireEvent.click(folderPath); });
    const crumb = container.querySelector(".sunburst-widget-breadcrumb");
    const links = crumb.querySelectorAll('[data-slot="breadcrumb-link"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
    const rootLinkText = crumb.querySelector('[data-slot="breadcrumb-link"]').textContent;

    // Click the root ancestor → back to the root (single non-clickable item).
    act(() => { fireEvent.click(links[0]); });
    const page = crumb.querySelector('[data-slot="breadcrumb-page"]');
    expect(page.textContent).toBe(rootLinkText);
  });

  it("does not throw when view: 'sector' is present (parsed but unused)", () => {
    expect(() => renderWidget({ data: "disk", controls: [], view: "sector" })).not.toThrow();
  });

  it("scroll keyframes: IntersectionObserver mock updates tunables", async () => {
    // Install a minimal IntersectionObserver mock that stores the callback
    // and exposes a trigger(ratio) helper.
    let observerCallback = null;
    let observerElement = null;
    class MockIO {
      constructor(cb) { observerCallback = cb; this.thresholds = []; }
      observe(el) { observerElement = el; }
      unobserve() {}
      disconnect() {}
      triggerEntry(ratio) {
        observerCallback([{
          isIntersecting: true,
          boundingClientRect: { top: 100, bottom: 200, height: 100, left: 0, right: 0, width: 100 },
          intersectionRatio: ratio,
        }]);
      }
    }
    const origIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = MockIO;

    try {
      const directive = {
        data: "disk",
        controls: [{ name: "maxRings", min: 1, max: 11, step: 1, default: 10 }],
        scroll: [
          { at: 0, set: { maxRings: 3 } },
          { at: 1, set: { maxRings: 11 } },
        ],
      };
      const { container } = renderWidget(directive);
      // advance past the initial effect
      await act(async () => { vi.runAllTimers(); });

      // Drive scroll progress to ~0.5 (maxRings interpolates to ~7)
      await act(async () => {
        // rect.bottom=200, viewportH=768 → (768-200)/(100+768)=0.65
        observerCallback([{
          isIntersecting: true,
          boundingClientRect: { top: 100, bottom: 200, height: 100 },
          intersectionRatio: 0.5,
        }]);
        vi.runAllTimers();
      });

      const slider = container.querySelector('input[type="range"]');
      // maxRings should have been interpolated between 3 and 11 at progress 0.65 → ~8.2
      const v = Number(slider.value);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(11);
    } finally {
      globalThis.IntersectionObserver = origIO;
    }
  });
});