import "@testing-library/jest-dom/vitest";

// Mock IntersectionObserver for test environment (jsdom doesn't support it)
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    constructor() { this.elements = new Set(); }
    observe(el) { this.elements.add(el); }
    unobserve(el) { this.elements.delete(el); }
    disconnect() { this.elements.clear(); }
  };
}

// Mock ResizeObserver for test environment (jsdom doesn't support it)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.elements = new Map(); }
    observe(el) {
      const dims = { width: 800, height: 600 };
      this.elements.set(el, dims);
      if (typeof el.getBoundingClientRect === "function") {
        const orig = el.getBoundingClientRect.bind(el);
        el.getBoundingClientRect = () => ({ width: dims.width, height: dims.height, x: 0, y: 0, top: 0, left: 0, right: dims.width, bottom: dims.height, toJSON: () => "" });
      }
      this.cb([{ contentRect: { width: dims.width, height: dims.height } }]);
    }
    unobserve(el) { this.elements.delete(el); }
    disconnect() { this.elements.clear(); }
  };
}

// Mock window.matchMedia for test environment (jsdom doesn't support it)
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}