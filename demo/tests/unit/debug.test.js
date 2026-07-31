import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDebug, setDebug } from "../../src/debug.js";

const DEBUG_KEY = "sunburst:debug";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("getDebug", () => {
  it("defaults to false", () => {
    expect(getDebug()).toBe(false);
  });

  it("reads from localStorage", () => {
    localStorage.setItem(DEBUG_KEY, "true");
    expect(getDebug()).toBe(true);
  });

  it("reads localStorage false", () => {
    localStorage.setItem(DEBUG_KEY, "false");
    expect(getDebug()).toBe(false);
  });

  it("URL param ?debug=true overrides localStorage", () => {
    localStorage.setItem(DEBUG_KEY, "false");
    window.history.replaceState({}, "", "/?debug=true");
    expect(getDebug()).toBe(true);
    window.history.replaceState({}, "", "/");
  });

  it("URL param ?debug=false overrides localStorage", () => {
    localStorage.setItem(DEBUG_KEY, "true");
    window.history.replaceState({}, "", "/?debug=false");
    expect(getDebug()).toBe(false);
    window.history.replaceState({}, "", "/");
  });

  it("?debug with no value means true", () => {
    window.history.replaceState({}, "", "/?debug");
    expect(getDebug()).toBe(true);
    window.history.replaceState({}, "", "/");
  });

  it("setDebug writes to localStorage", () => {
    setDebug(true);
    expect(localStorage.getItem(DEBUG_KEY)).toBe("true");
    setDebug(false);
    expect(localStorage.getItem(DEBUG_KEY)).toBe("false");
  });
});
