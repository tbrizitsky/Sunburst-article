import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import { PlayBadge, isPlayBadgeEligible, makePlayBadgeKey } from "../../src/PlayBadge.jsx";

const observers = new Map();

class MockIntersectionObserver {
  constructor(cb) {
    this.cb = cb;
    this.elements = new Set();
    observers.set(this, this);
  }
  observe(el) { this.elements.add(el); }
  unobserve(el) { this.elements.delete(el); }
  disconnect() { this.elements.clear(); observers.delete(this); }
  trigger(entries) { this.cb(entries, this); }
}

beforeEach(() => {
  localStorage.clear();
  observers.clear();
  globalThis.IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  cleanup();
});

function lastObserver() {
  const list = [...observers.values()];
  return list[list.length - 1];
}

function enterView() {
  const io = lastObserver();
  act(() => io.trigger([{ isIntersecting: true }]));
}

describe("PlayBadge", () => {
  it("renders children and the overlay hidden initially", () => {
    render(
      <PlayBadge id="sunburst:article:played:sunburst:0">
        <button>map</button>
      </PlayBadge>
    );
    expect(screen.getByRole("button", { name: "map" })).toBeInTheDocument();
    const badge = screen.getByText("Play with me");
    expect(badge).toHaveClass("article-play-badge-overlay");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge.closest(".article-play-badge")).toHaveAttribute("data-visible", "false");
  });

  it("shows the overlay when the widget scrolls into view", () => {
    render(
      <PlayBadge id="sunburst:article:played:sunburst:0">
        <button>map</button>
      </PlayBadge>
    );
    expect(screen.getByText("Play with me").closest(".article-play-badge"))
      .toHaveAttribute("data-visible", "false");
    enterView();
    expect(screen.getByText("Play with me").closest(".article-play-badge"))
      .toHaveAttribute("data-visible", "true");
  });

  it("dismisses on click and writes the played flag to localStorage", () => {
    render(
      <PlayBadge id="sunburst:article:played:sunburst:0">
        <button>map</button>
      </PlayBadge>
    );
    enterView();
    fireEvent.click(screen.getByRole("button", { name: "map" }));
    expect(localStorage.getItem("sunburst:article:played:sunburst:0")).toBe("1");
    expect(screen.getByText("Play with me").closest(".article-play-badge"))
      .toHaveAttribute("data-visible", "false");
  });

  it("dismisses on a control change", () => {
    render(
      <PlayBadge id="sunburst:article:played:hue:0">
        <label>Model <select><option>HSL</option><option>okLCH</option></select></label>
      </PlayBadge>
    );
    enterView();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "okLCH" } });
    expect(localStorage.getItem("sunburst:article:played:hue:0")).toBe("1");
    expect(screen.getByText("Play with me").closest(".article-play-badge"))
      .toHaveAttribute("data-visible", "false");
  });

  it("dismisses on keyboard focus entering a control", () => {
    render(
      <PlayBadge id="sunburst:article:played:geometry:0">
        <label>Rings <input type="range" /></label>
      </PlayBadge>
    );
    enterView();
    fireEvent.focus(screen.getByRole("slider"));
    expect(localStorage.getItem("sunburst:article:played:geometry:0")).toBe("1");
    expect(screen.getByText("Play with me").closest(".article-play-badge"))
      .toHaveAttribute("data-visible", "false");
  });

  it("never shows the overlay when the played flag is already stored", () => {
    localStorage.setItem("sunburst:article:played:icicle:0", "1");
    render(
      <PlayBadge id="sunburst:article:played:icicle:0">
        <button>map</button>
      </PlayBadge>
    );
    expect(screen.getByText("Play with me").closest(".article-play-badge"))
      .toHaveAttribute("data-visible", "false");
    expect(localStorage.getItem("sunburst:article:played:icicle:0")).toBe("1");
  });

  it("overlay never appears for a widget that was already played, even after dismissal re-fires", () => {
    render(
      <PlayBadge id="sunburst:article:played:sunburst:1">
        <button>map</button>
      </PlayBadge>
    );
    enterView();
    fireEvent.click(screen.getByRole("button", { name: "map" }));
    fireEvent.click(screen.getByRole("button", { name: "map" }));
    expect(localStorage.getItem("sunburst:article:played:sunburst:1")).toBe("1");
    expect(screen.getByText("Play with me").closest(".article-play-badge"))
      .toHaveAttribute("data-visible", "false");
  });
});

describe("isPlayBadgeEligible", () => {
  it("is eligible for widgets with at least one control", () => {
    expect(isPlayBadgeEligible("sunburst-hue", { controls: ["hueOffset"] })).toBe(true);
    expect(isPlayBadgeEligible("sunburst-playground", { controls: ["files"] })).toBe(true);
    expect(isPlayBadgeEligible("sunburst-geometry", { controls: ["ringLevels"] })).toBe(true);
    expect(isPlayBadgeEligible("icicle", { controls: ["morph"] })).toBe(true);
  });

  it("is eligible for a navigable sunburst with no controls", () => {
    expect(isPlayBadgeEligible("sunburst", { controls: [], locked: { interactions: true } })).toBe(true);
    expect(isPlayBadgeEligible("sunburst", { controls: [], locked: {} })).toBe(true);
  });

  it("is not eligible for a sunburst with navigation locked off", () => {
    expect(isPlayBadgeEligible("sunburst", { controls: [], locked: { interactions: false } })).toBe(false);
  });

  it("is not eligible for hover-only treemap and static stasko without controls", () => {
    expect(isPlayBadgeEligible("treemap", { controls: [], locked: {} })).toBe(false);
    expect(isPlayBadgeEligible("stasko", { controls: [], locked: {} })).toBe(false);
  });

  it("is eligible for a treemap that does expose controls", () => {
    expect(isPlayBadgeEligible("treemap", { controls: ["algorithm"] })).toBe(true);
  });
});

describe("makePlayBadgeKey", () => {
  it("builds the storage key from type and index", () => {
    expect(makePlayBadgeKey("sunburst", 2)).toBe("sunburst:article:played:sunburst:2");
    expect(makePlayBadgeKey("sunburst-hue", 0)).toBe("sunburst:article:played:sunburst-hue:0");
  });
});
