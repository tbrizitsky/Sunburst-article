import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { WidgetSelect } from "../../src/widget-controls.jsx";

function renderSelect(options, value = options[0]) {
  return render(
    <WidgetSelect name="coloring" label="Coloring" options={options} value={value} onChange={() => {}} />
  );
}

// jsdom does no layout, so offsetWidth is 0 for the probe; stub it to simulate
// a real width and verify the trigger is pinned to it.
let originalOffsetWidth;
beforeEach(() => {
  cleanup();
  originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      if (this.classList && this.classList.contains("widget-select-probe")) return 137;
      return 0;
    },
  });
});

afterEach(() => {
  cleanup();
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  else delete HTMLElement.prototype.offsetWidth;
});

describe("WidgetSelect consistent width", () => {
  it("pins the trigger's min-width to the measured probe width", () => {
    const { container } = renderSelect(["tiny", "very large item"]);
    const trigger = container.querySelector("button.widget-select");
    expect(trigger).toBeInTheDocument();
    expect(trigger.style.minWidth).toBe("137px");
  });

  it("renders a hidden probe mirroring the trigger chrome with every option stacked", () => {
    const { container } = renderSelect(["tiny", "very large item"]);
    const probe = container.querySelector(".widget-select-probe");
    expect(probe).toHaveAttribute("aria-hidden", "true");
    const labels = [...probe.querySelectorAll("[data-opt]")].map((el) => el.textContent);
    expect(labels).toEqual(["tiny", "very large item"]);
    // The probe's inner element reuses the trigger class (same padding/border/
    // font chrome) and carries the chevron.
    expect(probe.querySelector(".widget-select")).toBeInTheDocument();
    expect(probe.querySelector(".widget-select-icon")).toBeInTheDocument();
  });

  it("does not change the pinned width when the selection changes", () => {
    const { container, rerender } = renderSelect(["tiny", "very large item"], "tiny");
    const trigger = container.querySelector("button.widget-select");
    expect(trigger.style.minWidth).toBe("137px");
    rerender(
      <WidgetSelect name="coloring" label="Coloring" options={["tiny", "very large item"]} value="very large item" onChange={() => {}} />
    );
    expect(container.querySelector("button.widget-select").style.minWidth).toBe("137px");
  });
});
