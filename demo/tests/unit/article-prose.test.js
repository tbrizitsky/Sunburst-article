import { describe, it, expect } from "vitest";
import { renderArticleProse } from "../../src/article-prose.js";

describe("renderArticleProse external links", () => {
  it("opens http:// links in a new tab with noopener noreferrer", () => {
    const html = renderArticleProse("[site](https://example.com)");
    expect(html).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a></p>\n'
    );
  });

  it("opens http:// links in a new tab", () => {
    expect(renderArticleProse("[a](http://example.com)")).toContain(
      'href="http://example.com" target="_blank" rel="noopener noreferrer"'
    );
  });

  it("opens protocol-relative // links in a new tab", () => {
    expect(renderArticleProse("[cdn](//cdn.example.com/x)")).toContain(
      'href="//cdn.example.com/x" target="_blank" rel="noopener noreferrer"'
    );
  });

  it("keeps the title attribute when present", () => {
    expect(renderArticleProse('[site](https://example.com "The title")')).toContain(
      'rel="noopener noreferrer" title="The title"'
    );
  });

  it("renders relative links without target/rel", () => {
    const html = renderArticleProse("[spec](../sunburst-map.md)");
    expect(html).toContain('<a href="../sunburst-map.md">spec</a>');
    expect(html).not.toContain("target=");
    expect(html).not.toContain("rel=");
  });

  it("renders fragment links without target/rel", () => {
    const html = renderArticleProse("[up](#section)");
    expect(html).toContain('<a href="#section">up</a>');
    expect(html).not.toContain("target=");
  });

  it("renders mailto links without target/rel", () => {
    const html = renderArticleProse("[email](mailto:hi@example.com)");
    expect(html).toContain('<a href="mailto:hi@example.com">email</a>');
    expect(html).not.toContain("target=");
  });
});
