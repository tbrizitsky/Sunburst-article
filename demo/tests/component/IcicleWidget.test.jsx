import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { IcicleWidget } from "../../src/IcicleWidget.jsx";

function renderWidget(directive) {
  return render(<IcicleWidget directive={directive} />);
}

describe("IcicleWidget morph slider presentation", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders [Sunburst][slider][Icicle] with both labels styled identically", () => {
    const { container } = renderWidget({ data: "disk", controls: ["morph"] });
    const slider = container.querySelector(".widget-control-slider");
    expect(slider).toBeInTheDocument();
    const labels = slider.querySelectorAll(".widget-control-label");
    expect(labels).toHaveLength(2);
    expect(labels[0].textContent).toBe("Sunburst");
    expect(labels[1].textContent).toBe("Icicle");
    expect(labels[0].className).toBe(labels[1].className);
  });

  it("renders nothing else on the control — no numeric readout", () => {
    const { container } = renderWidget({ data: "disk", controls: ["morph"] });
    const slider = container.querySelector(".widget-control-slider");
    expect(slider.querySelector(".widget-control-value")).toBeNull();
    expect(slider.textContent).toBe("SunburstIcicle");
  });

  it("the target label is static (does not change with the value)", () => {
    const { container } = renderWidget({ data: "disk", controls: ["morph"] });
    const labels = container.querySelectorAll(".widget-control-slider .widget-control-label");
    expect(labels[1].textContent).toBe("Icicle");
  });
});
