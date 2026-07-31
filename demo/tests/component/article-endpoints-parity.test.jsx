import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import { SunburstWidget } from "../../src/SunburstWidget.jsx";
import { parseArticle } from "../../src/article-parser.js";
import { disk } from "../../src/sample-data.js";
import { computeSizes, layout, ringTable, widgetNaturalSize } from "../../src/layout.js";
import articleMd from "../../../spec/article.md?raw";

// Parity suite: the article's FIRST and LAST widgets run through the same
// battery of assertions the main demo widget (SunburstMap.test.jsx) gets.
// The two widgets under test are the real <sunburst> blocks from spec/article.md:
//   - first:  <sunburst data="disk" controls="[]" locked="{centerOpacity:0}" … />
//   - last:   <sunburst data="disk" controls="[animateNavigation]"
//                        locked="{animateNavigation:false}" breadcrumb="true" … />

function sunburstBlocks() {
  return parseArticle(articleMd).filter((b) => b.type === "sunburst");
}

describe("article endpoints — parity with the main demo widget", () => {
  const blocks = sunburstBlocks();
  if (blocks.length < 2) {
    throw new Error("parity suite: expected >= 2 <sunburst> blocks in spec/article.md");
  }
  const FIRST = blocks[0].directive;
  const LAST = blocks[blocks.length - 1].directive;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const renderWidget = (directive) => render(<SunburstWidget directive={directive} />);
  const settle = async () => act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  // ---- Rendering invariants (same as main suite) ----

  it("first widget: renders an SVG with aria-label", () => {
    const { container } = renderWidget(FIRST);
    const svg = container.querySelector("svg#map");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-label", "Disk usage sunburst map");
  });

  it("last widget: renders an SVG with aria-label", () => {
    const { container } = renderWidget(LAST);
    const svg = container.querySelector("svg#map");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-label", "Disk usage sunburst map");
  });

  it("both widgets: render sector paths (ring >= 1)", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const svg = container.querySelector("svg#map");
      expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("both widgets: render a center circle at root", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const circle = container.querySelector("svg#map circle");
      expect(circle).toBeInTheDocument();
      unmount();
    }
  });

  it("both widgets: center circle at root is transparent with grey border", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const circle = container.querySelector("svg#map circle");
      expect(circle).toHaveAttribute("fill", "transparent");
      expect(circle).toHaveAttribute("stroke", "hsl(0, 0%, 55%)");
      const fillOpacity = circle.getAttribute("fillOpacity") ?? circle.getAttribute("fill-opacity");
      expect(Number(fillOpacity)).toBe(0);
      unmount();
    }
  });

  it("both widgets: SVG has preserveAspectRatio xMidYMid meet", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      expect(container.querySelector("svg#map")).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
      unmount();
    }
  });

  it("both widgets: viewBox is the interactive full-circle stable viewBox (article divergence from the demo's fixed 0 0 800 800)", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const svg = container.querySelector("svg#map");
      const vbox = svg.getAttribute("viewBox");
      expect(vbox).not.toBe("0 0 800 800"); // article widgets auto-tighten
      const [x, y, w, h] = vbox.split(/\s+/).map(Number);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      // Interactive widgets navigate (drill-in fills the full circle), so the
      // viewBox is a square centered at the content circle (400,400) — stable
      // across navigations, no clipped sectors (spec/sunburst-map.md §"ViewBox").
      expect(w).toBeCloseTo(h, 5);
      expect(x + w / 2).toBeCloseTo(400, 5);
      expect(y + h / 2).toBeCloseTo(400, 5);
      unmount();
    }
  });

  it("both widgets: drilled-in (full-circle) geometry stays within the viewBox — no clipping", () => {
    computeSizes(disk);
    const rt = ringTable(); // defaults: maxRings 10, small mode
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const svg = container.querySelector("svg#map");
      const [vbX, vbY, vbW] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
      const half = vbW / 2;
      const folders = (disk.children || []).filter((c) => c.type === "folder" && c.children && c.children.length > 0);
      expect(folders.length).toBeGreaterThan(0);
      for (const f of folders) {
        layout(f, {}); // full-circle layout at the folder's own ring count
        const maxRing = Math.max(...f.children.map((c) => c._ring ?? 0));
        const outer = rt.bounds[maxRing + 1] ?? rt.bounds[rt.bounds.length - 1];
        // The deepest ring's outer edge must fit inside the viewBox (4px margin).
        expect(outer).toBeLessThanOrEqual(half - 4);
      }
      unmount();
    }
  });

  it("both widgets: center circle at root has cursor: default (no parent to go to)", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      expect(container.querySelector("svg#map circle").style.cursor).toBe("default");
      unmount();
    }
  });

  it("both widgets: drillable folder sectors have cursor: pointer", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const pointerPaths = Array.from(container.querySelectorAll("svg#map path"))
        .filter(p => p.style.cursor === "pointer");
      expect(pointerPaths.length).toBeGreaterThan(0);
      unmount();
    }
  });

  // ---- Hover (same as main suite) ----

  it("both widgets: hovering a sector shows a hint with name and size", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const path = container.querySelector("svg#map path");
      fireEvent.mouseMove(path, { clientX: 100, clientY: 100 });
      const hint = container.querySelector("#hint");
      expect(hint).toBeInTheDocument();
      expect(hint.querySelector(".name")).toBeInTheDocument();
      expect(hint.querySelector(".size")).toBeInTheDocument();
      unmount();
    }
  });

  it("both widgets: hovering away hides the hint", () => {
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const path = container.querySelector("svg#map path");
      fireEvent.mouseMove(path, { clientX: 100, clientY: 100 });
      expect(container.querySelector("#hint")).toBeInTheDocument();
      fireEvent.mouseLeave(path);
      const hint = container.querySelector("#hint");
      expect(hint).toBeInTheDocument();
      expect(hint.style.opacity).toBe("0");
      unmount();
    }
  });

  // ---- Drill-in (same as main suite) ----

  it("first widget (animation on): clicking a folder drills in, center circle present, no blank screen", async () => {
    const { container } = renderWidget(FIRST);
    const svg = container.querySelector("svg#map");
    const folderPath = Array.from(svg.querySelectorAll("path")).find(p => p.style.cursor === "pointer");
    expect(folderPath).toBeDefined();

    act(() => { fireEvent.click(folderPath); });
    await settle();

    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(svg.querySelector("circle")).toBeInTheDocument();
    // Drilled in: the center is no longer the transparent root circle.
    expect(svg.querySelector("circle").getAttribute("fill")).not.toBe("transparent");
  });

  it("last widget (animation off): drill is a synchronous hard cut (no blank, center colored)", async () => {
    const { container } = renderWidget(LAST);
    const svg = container.querySelector("svg#map");
    const folderPath = Array.from(svg.querySelectorAll("path")).find(p => p.style.cursor === "pointer");
    expect(folderPath).toBeDefined();

    act(() => { fireEvent.click(folderPath); });

    // Hard cut: the new folder is rendered without waiting for a tween.
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(svg.querySelector("circle")).toBeInTheDocument();
    expect(svg.querySelector("circle").getAttribute("fill")).not.toBe("transparent");
    await settle();
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  // ---- Widget-level contract (from the directive, not on the main widget) ----

  it("first widget: no controls panel (controls=[]), no breadcrumb", () => {
    const { container } = renderWidget(FIRST);
    expect(container.querySelector(".sunburst-widget-controls")).toBeNull();
    expect(container.querySelector(".sunburst-widget-breadcrumb")).toBeNull();
  });

  it("last widget: renders the Animation toggle, seeded off by the locked default", () => {
    const { container } = renderWidget(LAST);
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
    expect(container.querySelector(".widget-control-label").textContent).toBe("Animation");
  });

  it("last widget: renders the breadcrumb as the first widget child, root-only at rest", () => {
    const { container } = renderWidget(LAST);
    const widget = container.querySelector(".sunburst-widget");
    const crumb = widget.querySelector(".sunburst-widget-breadcrumb");
    expect(crumb).toBeInTheDocument();
    expect(widget.firstElementChild).toBe(crumb);
    expect(crumb.textContent).toContain("Macintosh HD");
    expect(crumb.querySelector('[data-slot="breadcrumb-page"]')).toBeInTheDocument();
  });

  it("last widget: breadcrumb gains a link after drilling and navigates back to root", () => {
    const { container } = renderWidget(LAST);
    const svg = container.querySelector("svg#map");
    const folderPath = Array.from(svg.querySelectorAll("path")).find(p => p.style.cursor === "pointer");
    expect(folderPath).toBeDefined();

    act(() => { fireEvent.click(folderPath); });
    const crumb = container.querySelector(".sunburst-widget-breadcrumb");
    const links = crumb.querySelectorAll('[data-slot="breadcrumb-link"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
    const rootLinkText = links[0].textContent;

    act(() => { fireEvent.click(links[0]); });
    const page = crumb.querySelector('[data-slot="breadcrumb-page"]');
    expect(page.textContent).toBe(rootLinkText);
  });

  it("both widgets: first widget renders its caption, last widget renders its caption", () => {
    const firstCaption = FIRST.caption;
    const lastCaption = LAST.caption;
    expect(firstCaption).toBe("DaisyDisk-inspired interactive sunburst map");
    expect(lastCaption).toContain("No transition by default");
    const { container: c1, unmount: u1 } = renderWidget(FIRST);
    expect(c1.querySelector(".sunburst-widget-caption")).toHaveTextContent(firstCaption);
    u1();
    const { container: c2, unmount: u2 } = renderWidget(LAST);
    expect(c2.querySelector(".sunburst-widget-caption")).toHaveTextContent(lastCaption);
    u2();
  });

  it("both widgets: render without duplicate React keys (no attribute inheritance across sectors)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const directive of [FIRST, LAST]) {
        const { unmount } = renderWidget(directive);
        unmount();
      }
      const dupWarnings = errSpy.mock.calls.filter(args =>
        String(args[0]).includes("same key")
      );
      expect(dupWarnings).toEqual([]);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("both widgets: widgetNaturalSize viewBox agrees with the rendered viewBox (binding geometry)", () => {
    computeSizes(disk);
    for (const directive of [FIRST, LAST]) {
      const { container, unmount } = renderWidget(directive);
      const svg = container.querySelector("svg#map");
      const rendered = svg.getAttribute("viewBox");
      const opts = { ...directive.locked };
      const { viewBox } = widgetNaturalSize(opts, disk);
      expect(rendered).toBe(viewBox);
      unmount();
    }
  });
});
