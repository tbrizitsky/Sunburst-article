import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ArticleMode } from "../../src/ArticleMode.jsx";

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

describe("ArticleMode", () => {
  it("renders a <main id='article'>", () => {
    const { container } = render(<ArticleMode />);
    expect(container.querySelector("main#article")).toBeInTheDocument();
  });

  it("renders a single-column layout (.article-columns)", () => {
    const { container } = render(<ArticleMode />);
    expect(container.querySelector(".article-columns")).toBeInTheDocument();
    expect(container.querySelector(".article-rows")).not.toBeInTheDocument();
    expect(container.querySelector(".article-prose-column")).toBeInTheDocument();
  });

  it("renders prose content inline", () => {
    const { container } = render(<ArticleMode />);
    const prose = container.querySelector(".article-prose");
    expect(prose).toBeInTheDocument();
    expect(prose.innerHTML).toMatch(/</);
  });

  it("renders the real spec/article.md without throwing", () => {
    expect(() => render(<ArticleMode />)).not.toThrow();
  });

  it("opens every article link in a new tab", () => {
    const { container } = render(<ArticleMode />);
    const links = [...container.querySelectorAll("a")];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = link.getAttribute("href");
      expect(href).toMatch(/^https?:\/\//);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });
});
