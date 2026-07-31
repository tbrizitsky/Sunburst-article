import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const articleCss = fs.readFileSync(path.resolve("src/article.css"), "utf8");
const stylesCss = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
const stagingArticle = fs.readFileSync(path.resolve("../spec/staging-article.md"), "utf8");

// Classes used by ArticleMode.jsx and SunburstWidget.jsx (from className="...").
const EXPECTED_CLASSES = [
  "article-columns",
  "article-prose",
  "article-prose-column",
  "sunburst-widget",
  "sunburst-widget-map",
  "sunburst-widget-controls",
  "sunburst-widget-caption",
  "sunburst-widget-breadcrumb",
  "widget-control",
  "widget-control-label",
  "widget-control-value",
  "widget-toggle",
  "article-play-badge",
];

// Tokens documented in the article.css header as inherited from styles.css.
const EXPECTED_TOKENS = [
  "--surface-0", "--surface-1", "--surface-2", "--surface-3",
  "--text-primary", "--text-secondary", "--text-tertiary",
  "--accent", "--accent-hover", "--focus-accent",
  "--border-subtle", "--border-medium",
  "--shadow-sm", "--shadow-md", "--shadow-lg",
  "--radius-sm", "--radius-md", "--radius-lg",
  "--transition-fast", "--transition-normal", "--ease-out",
  "--anchor-width", "--transform-origin",
  "--article-body", "--article-heading", "--article-link-underline",
  "--article-blockquote-border",
];

function selectorExists(css, selector) {
  // Match the selector (with class/id chars) followed by `{` (allowing whitespace
  // and a possible pseudo-element/compound on the same selector).
  // Escape regex metacharacters in the selector.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(^|[}\\s])" + escaped + "(\\s*[,>+~\\s][^{]*|\\s*)\\{", "m");
  return re.test(css);
}

describe("article.css — class coverage", () => {
  for (const cls of EXPECTED_CLASSES) {
    it(`has a selector for .${cls}`, () => {
      expect(selectorExists(articleCss, "." + cls)).toBe(true);
    });
  }

  it("has a #article id selector", () => {
    expect(selectorExists(articleCss, "#article")).toBe(true);
  });

  it("has .article-prose descendant typography selectors (h1, p, a, code, pre, ul, li, hr)", () => {
    const descendants = ["h1", "h2", "h3", "p", "a", "code", "pre", "ul", "li", "hr"];
    for (const tag of descendants) {
      expect(selectorExists(articleCss, ".article-prose " + tag)).toBe(true);
    }
  });
});

describe("article.css — token references", () => {
  for (const token of EXPECTED_TOKENS) {
    it(`${token} is defined in styles.css (documented as inherited by article.css)`, () => {
      expect(stylesCss).toContain(`${token}:`);
    });
  }

  it("every var(--token) referenced in article.css is defined in styles.css", () => {
    const refs = new Set();
    const re = /var\((--[a-z0-9-]+)\)/g;
    let m;
    while ((m = re.exec(articleCss)) !== null) refs.add(m[1]);
    expect(refs.size).toBeGreaterThan(0);
    for (const token of refs) {
      expect(stylesCss).toContain(`${token}:`);
    }
  });

  it("references a non-empty subset of the documented tokens", () => {
    const refs = new Set();
    const re = /var\((--[a-z0-9-]+)\)/g;
    let m;
    while ((m = re.exec(articleCss)) !== null) refs.add(m[1]);
    const documented = new Set(EXPECTED_TOKENS);
    for (const token of refs) {
      expect(documented.has(token)).toBe(true);
    }
  });
});

describe("article.css — structural sanity", () => {
  it("is non-empty", () => {
    expect(articleCss.trim().length).toBeGreaterThan(0);
  });

  it("has balanced braces (count of { === count of })", () => {
    const open = (articleCss.match(/{/g) || []).length;
    const close = (articleCss.match(/}/g) || []).length;
    expect(open).toBe(close);
  });

  it(".sunburst-widget uses display: flex with flex-direction: column", () => {
    // Extract the rule body for .sunburst-widget {
    const idx = articleCss.indexOf(".sunburst-widget {");
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = articleCss.slice(idx, articleCss.indexOf("}", idx));
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-direction:\s*column/);
  });

  it("has slider thumb styling (.widget-slider-thumb)", () => {
    expect(articleCss).toContain(".widget-slider-thumb");
  });

  it(".widget-switch renders a pill with a checked (accent) state", () => {
    const idx = articleCss.indexOf(".widget-switch {");
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = articleCss.slice(idx, articleCss.indexOf("}", idx));
    expect(body).toMatch(/width:\s*36px/);
    expect(body).toMatch(/height:\s*20px/);
    expect(articleCss).toContain(".widget-switch[data-checked]");
  });

  it(".widget-select-probe is hidden and never intercepts events", () => {
    const idx = articleCss.indexOf(".widget-select-probe {");
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = articleCss.slice(idx, articleCss.indexOf("}", idx));
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/visibility:\s*hidden/);
    expect(body).toMatch(/pointer-events:\s*none/);
  });

  it(".widget-select-item reserves a fixed check column and pins the label to column 2", () => {
    const idx = articleCss.indexOf(".widget-select-item {");
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = articleCss.slice(idx, articleCss.indexOf("}", idx));
    expect(body).toMatch(/grid-template-columns:\s*1rem 1fr/);
    const textIdx = articleCss.indexOf(".widget-select-item-text {");
    expect(textIdx).toBeGreaterThanOrEqual(0);
    const textBody = articleCss.slice(textIdx, articleCss.indexOf("}", textIdx));
    expect(textBody).toMatch(/grid-column:\s*2/);
  });
});

describe("article.css — affordance badge conformance with staging-article.md", () => {
  const enterMs = Number((stagingArticle.match(/over \*\*(\d+) ms\*\* with the `--ease-out` curve/) || [])[1]);
  const exitMs = Number((stagingArticle.match(/with the same curve over \*\*(\d+) ms\*\*/) || [])[1]);

  it("staging-article.md pins the badge entrance/exit durations", () => {
    expect(enterMs).toBeGreaterThan(0);
    expect(exitMs).toBeGreaterThan(0);
  });

  it("--ease-out token exists in styles.css with the spec'd cubic-bezier curve", () => {
    expect(stylesCss).toContain("--ease-out: cubic-bezier(0.23, 1, 0.32, 1)");
  });

  it("badge overlay has a selector and is pointer-events: none", () => {
    const idx = articleCss.indexOf(".article-play-badge-overlay {");
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = articleCss.slice(idx, articleCss.indexOf("}", idx));
    expect(body).toMatch(/pointer-events:\s*none/);
  });

  it("badge entrance transition matches the spec'd duration and curve", () => {
    const re = new RegExp(`opacity ${enterMs}ms var\\(--ease-out\\), transform ${enterMs}ms var\\(--ease-out\\)`);
    expect(articleCss).toMatch(re);
  });

  it("badge exit transition is faster than entrance and matches the spec'd duration", () => {
    const re = new RegExp(`opacity ${exitMs}ms var\\(--ease-out\\), transform ${exitMs}ms var\\(--ease-out\\)`);
    expect(articleCss).toMatch(re);
    expect(exitMs).toBeLessThan(enterMs);
  });
});