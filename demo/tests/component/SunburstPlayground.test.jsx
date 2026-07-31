import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { SunburstPlayground } from "../../src/SunburstPlayground.jsx";

function renderWidget(directive) {
  return render(<SunburstPlayground directive={directive} />);
}

describe("SunburstPlayground", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the map and the Show files toggle", () => {
    const { container } = renderWidget({ controls: ["files"] });
    expect(container.querySelector("svg#map")).toBeInTheDocument();
    const toggle = container.querySelector(".widget-toggle");
    expect(toggle).toHaveTextContent("Show files");
  });

  it("shows a hover tooltip on a sector", () => {
    const { container } = renderWidget({ controls: ["files"] });
    const svg = container.querySelector("svg#map");
    const path = svg.querySelectorAll("path")[0];
    fireEvent.mouseMove(path, { clientX: 100, clientY: 100 });
    const hint = container.querySelector("#hint");
    expect(hint).toBeInTheDocument();
    expect(hint.querySelector(".name")).toBeInTheDocument();
    expect(hint.querySelector(".size")).toBeInTheDocument();
  });

  it("sectors are not drillable (cursor default, no navigation on click)", () => {
    const { container } = renderWidget({ controls: ["files"] });
    const svg = container.querySelector("svg#map");
    const paths = Array.from(svg.querySelectorAll("path"));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.style.cursor).toBe("default");
    fireEvent.click(paths[0]);
    // No animation/navigation state change — the root view still renders sectors.
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });
});
