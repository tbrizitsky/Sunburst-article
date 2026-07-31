import { describe, it, expect } from "vitest";
import { parseArticle } from "../../src/article-parser.js";

describe("parseArticle", () => {
  it("returns empty array for empty input", () => {
    expect(parseArticle("")).toEqual([]);
  });

  it("returns a prose block for plain markdown", () => {
    const blocks = parseArticle("Hello **world**");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("prose");
    expect(blocks[0].md).toContain("Hello");
  });

  it("parses a <sunburst> tag", () => {
    const md = `<sunburst>\ndata: disk\ncontrols: []\n</sunburst>`;
    const blocks = parseArticle(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("sunburst");
    expect(blocks[0].directive.data).toBe("disk");
    expect(blocks[0].directive.controls).toEqual([]);
  });

  it("parses a <treemap> tag", () => {
    const md = `<treemap>\ndata: disk\ncontrols:\n  - algorithm\n</treemap>`;
    const blocks = parseArticle(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("treemap");
    expect(blocks[0].directive.data).toBe("disk");
    expect(blocks[0].directive.controls).toHaveLength(1);
    expect(blocks[0].directive.controls[0]).toBe("algorithm");
  });

  it("interleaves prose and viz tags", () => {
    const md = `Some text.\n\n<sunburst>\ndata: disk\n</sunburst>\n\nMore text.`;
    const blocks = parseArticle(md);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("prose");
    expect(blocks[1].type).toBe("sunburst");
    expect(blocks[2].type).toBe("prose");
  });

  it("parses a self-closing <sunburst-mvp> tag", () => {
    const md = `<sunburst-mvp caption="a sunburst — flip the toggle" />`;
    const blocks = parseArticle(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("sunburst-mvp");
    expect(blocks[0].directive.caption).toBe("a sunburst — flip the toggle");
    expect(blocks[0].md).toBeUndefined();
  });

  it("<sunburst-mvp> is not clonable via <instructions>", () => {
    const md = [
      "<sunburst-mvp caption=\"mvp\" />",
      "",
      "<instructions>",
      "clone: prev",
      "override:",
      "  caption: other",
      "</instructions>",
    ].join("\n");
    const blocks = parseArticle(md);
    // The <instructions> block is silently skipped (no preceding clonable widget).
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("sunburst-mvp");
  });

  describe("<instructions>", () => {
    it("clones previous sunburst and applies overrides", () => {
      const md = [
        "<sunburst>",
        "data: disk",
        "controls: []",
        "locked:",
        "  maxRings: 5",
        "  coloring: none",
        "  render: wireframe",
        "</sunburst>",
        "",
        "<instructions>",
        "clone: prev",
        "override:",
        "  controls:",
        "    - sorting",
        "  locked:",
        "    maxRings: 20",
        "</instructions>",
      ].join("\n");

      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[1].type).toBe("sunburst");

      const original = blocks[0].directive;
      const cloned = blocks[1].directive;

      // Original preserved
      expect(original.locked.maxRings).toBe(5);
      expect(original.controls).toEqual([]);

      // Clone has overrides
      expect(cloned.data).toBe("disk");
      expect(cloned.locked.maxRings).toBe(20);
      expect(cloned.controls).toEqual(["sorting"]);

      // Original fields preserved (not in override)
      expect(cloned.locked.coloring).toBe("none");
      expect(cloned.locked.render).toBe("wireframe");
    });

    it("original directive is not mutated by override", () => {
      const md = [
        "<sunburst>",
        "data: disk",
        "locked:",
        "  maxRings: 5",
        "</sunburst>",
        "",
        "<instructions>",
        "clone: prev",
        "override:",
        "  locked:",
        "    maxRings: 20",
        "</instructions>",
      ].join("\n");

      const blocks = parseArticle(md);
      expect(blocks[0].directive.locked.maxRings).toBe(5);
      expect(blocks[1].directive.locked.maxRings).toBe(20);
    });

    it("appears within prose — prose between sunburst and instructions is preserved", () => {
      const md = [
        "Before text.",
        "",
        "<sunburst>",
        "data: disk",
        "</sunburst>",
        "",
        "Middle text.",
        "",
        "<instructions>",
        "clone: prev",
        "override:",
        "  controls:",
        "    - sorting",
        "</instructions>",
        "",
        "After text.",
      ].join("\n");

      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(5);
      expect(blocks[0].type).toBe("prose");
      expect(blocks[0].md).toContain("Before text.");
      expect(blocks[1].type).toBe("sunburst");
      expect(blocks[2].type).toBe("prose");
      expect(blocks[2].md).toContain("Middle text.");
      expect(blocks[3].type).toBe("sunburst"); // cloned sunburst
      expect(blocks[3].directive.controls).toEqual(["sorting"]);
      expect(blocks[4].type).toBe("prose");
      expect(blocks[4].md).toContain("After text.");
    });

    it("no preceding viz — produces no output", () => {
      const md = [
        "<instructions>",
        "clone: prev",
        "override:",
        "  controls:",
        "    - sorting",
        "</instructions>",
      ].join("\n");

      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(0);
    });

    it("clones previous treemap and preserves type", () => {
      const md = [
        "<treemap>",
        "data: disk",
        "controls: []",
        "locked:",
        "  algorithm: squarified",
        "</treemap>",
        "",
        "<instructions>",
        "clone: prev",
        "override:",
        "  controls:",
        "    - coloring",
        "</instructions>",
      ].join("\n");

      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe("treemap");
      expect(blocks[1].type).toBe("treemap");
      expect(blocks[1].directive.data).toBe("disk");
      expect(blocks[1].directive.locked.algorithm).toBe("squarified");
      expect(blocks[1].directive.controls).toEqual(["coloring"]);
    });
  });

  describe("scroll keyframes", () => {
    it("parses a single scroll keyframe", () => {
      const md = [
        "<sunburst>",
        "data: disk",
        "scroll:",
        "  - at: 0.00, set: { maxRings: 3 }",
        "</sunburst>",
      ].join("\n");
      const blocks = parseArticle(md);
      expect(blocks[0].directive.scroll).toHaveLength(1);
      expect(blocks[0].directive.scroll[0].at).toBe(0);
      expect(blocks[0].directive.scroll[0].set.maxRings).toBe(3);
    });

    it("parses multiple scroll keyframes in order", () => {
      const md = [
        "<sunburst>",
        "scroll:",
        "  - at: 0.00, set: { maxRings: 3 }",
        "  - at: 0.50, set: { maxRings: 7 }",
        "  - at: 1.00, set: { maxRings: 11 }",
        "</sunburst>",
      ].join("\n");
      const scroll = parseArticle(md)[0].directive.scroll;
      expect(scroll).toHaveLength(3);
      expect(scroll[0].at).toBe(0);
      expect(scroll[1].at).toBe(0.5);
      expect(scroll[2].at).toBe(1);
      expect(scroll[1].set.maxRings).toBe(7);
    });

    it("parses set with multiple fields", () => {
      const md = [
        "<sunburst>",
        "scroll:",
        "  - at: 0.00, set: { maxRings: 3, sorting: name }",
        "</sunburst>",
      ].join("\n");
      const set = parseArticle(md)[0].directive.scroll[0].set;
      expect(set.maxRings).toBe(3);
      expect(set.sorting).toBe("name");
    });
  });

  describe("inline values", () => {
    it("parses inline object value", () => {
      const md = [
        "<sunburst>",
        "controls:",
        "  - maxRings: { min: 1, max: 11, step: 1, default: 10 }",
        "</sunburst>",
      ].join("\n");
      const c = parseArticle(md)[0].directive.controls[0];
      expect(c.name).toBe("maxRings");
      expect(c.min).toBe(1);
      expect(c.max).toBe(11);
      expect(c.step).toBe(1);
      expect(c.default).toBe(10);
    });

    it("parses inline array value", () => {
      const md = [
        "<sunburst>",
        "ringMode: [small, grow, shrink]",
        "</sunburst>",
      ].join("\n");
      expect(parseArticle(md)[0].directive.ringMode).toEqual(["small", "grow", "shrink"]);
    });

    it("coerces numeric values", () => {
      const md = [
        "<sunburst>",
        "visibilityThreshold: 0",
        "maxRings: 5",
        "</sunburst>",
      ].join("\n");
      const d = parseArticle(md)[0].directive;
      expect(d.visibilityThreshold).toBe(0);
      expect(d.maxRings).toBe(5);
      expect(typeof d.maxRings).toBe("number");
    });

    it("coerces boolean values", () => {
      const md = [
        "<sunburst>",
        "smallerObjects: false",
        "filesSpecial: true",
        "</sunburst>",
      ].join("\n");
      const d = parseArticle(md)[0].directive;
      expect(d.smallerObjects).toBe(false);
      expect(d.filesSpecial).toBe(true);
    });

    it("parses quoted string values", () => {
      const md = [
        "<sunburst>",
        'caption: "Hello world"',
        "</sunburst>",
      ].join("\n");
      expect(parseArticle(md)[0].directive.caption).toBe("Hello world");
    });
  });

  describe("fields", () => {
    it("parses view field", () => {
      const md = ["<sunburst>", "view: sector", "</sunburst>"].join("\n");
      expect(parseArticle(md)[0].directive.view).toBe("sector");
    });

    it("parses caption: none as the string 'none'", () => {
      const md = ["<sunburst>", "caption: none", "</sunburst>"].join("\n");
      expect(parseArticle(md)[0].directive.caption).toBe("none");
    });
  });

  describe("fenced code blocks", () => {
    it("skips fenced code blocks in prose", () => {
      const md = [
        "Before.",
        "",
        "```js",
        "const x = 1;",
        "```",
        "",
        "After.",
      ].join("\n");
      const blocks = parseArticle(md);
      // Two prose blocks; the fenced block is dropped entirely
      expect(blocks.every(b => b.type === "prose")).toBe(true);
      expect(blocks.some(b => b.md.includes("const x"))).toBe(false);
      expect(blocks.some(b => b.md.includes("Before"))).toBe(true);
      expect(blocks.some(b => b.md.includes("After"))).toBe(true);
    });
  });

  describe("chained <instructions>", () => {
    it("second instructions clones the first clone", () => {
      const md = [
        "<sunburst>",
        "data: disk",
        "locked:",
        "  maxRings: 5",
        "</sunburst>",
        "",
        "<instructions>",
        "clone: prev",
        "override:",
        "  controls:",
        "    - sorting",
        "</instructions>",
        "",
        "<instructions>",
        "clone: prev",
        "override:",
        "  locked:",
        "    maxRings: 20",
        "</instructions>",
      ].join("\n");
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(3);
      // base, first clone, second clone
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[1].type).toBe("sunburst");
      expect(blocks[2].type).toBe("sunburst");
      expect(blocks[1].directive.controls).toEqual(["sorting"]);
      expect(blocks[1].directive.locked.maxRings).toBe(5);
      // second clone builds on first clone: has both controls and locked override
      expect(blocks[2].directive.controls).toEqual(["sorting"]);
      expect(blocks[2].directive.locked.maxRings).toBe(20);
    });
  });

  describe("applyOverrides semantics", () => {
    it("locked override merges (not replaces)", () => {
      const md = [
        "<sunburst>",
        "locked:",
        "  maxRings: 5",
        "  coloring: none",
        "</sunburst>",
        "",
        "<instructions>",
        "clone: prev",
        "override:",
        "  locked:",
        "    maxRings: 20",
        "</instructions>",
      ].join("\n");
      const cloned = parseArticle(md)[1].directive;
      expect(cloned.locked.maxRings).toBe(20);
      expect(cloned.locked.coloring).toBe("none"); // preserved by merge
    });

    it("controls override replaces (not merges)", () => {
      const md = [
        "<sunburst>",
        "controls:",
        "  - sorting",
        "  - maxRings",
        "</sunburst>",
        "",
        "<instructions>",
        "clone: prev",
        "override:",
        "  controls:",
        "    - coloring",
        "</instructions>",
      ].join("\n");
      const cloned = parseArticle(md)[1].directive;
      expect(cloned.controls).toEqual(["coloring"]);
    });
  });

  describe("<image>", () => {
    it("parses an <image> tag with src", () => {
      const md = "<image>\nsrc: assets/diagram.png\ncaption: 'A diagram'\n</image>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("image");
      expect(blocks[0].directive.src).toBe("assets/diagram.png");
      expect(blocks[0].directive.caption).toBe("A diagram");
    });

    it("interleaves image with prose", () => {
      const md = ["Text before.", "", "<image>", "src: img.png", "</image>", "", "Text after."].join("\n");
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(3);
      expect(blocks[0].type).toBe("prose");
      expect(blocks[1].type).toBe("image");
      expect(blocks[2].type).toBe("prose");
    });

    it("parses self-closing <image /> tag", () => {
      const md = '<image src="img.png" caption="Hi" />';
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("image");
      expect(blocks[0].directive.src).toBe("img.png");
      expect(blocks[0].directive.caption).toBe("Hi");
    });
  });

  describe("<treemap>", () => {
    it("parses a <treemap> tag with data and controls", () => {
      const md = "<treemap>\ndata: disk\ncontrols:\n  - algorithm\n  - cushion\n</treemap>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("treemap");
      expect(blocks[0].directive.data).toBe("disk");
      expect(blocks[0].directive.controls).toHaveLength(2);
    });

    it("interleaves treemap with prose and sunburst", () => {
      const md = [
        "Prose.",
        "",
        "<treemap>",
        "data: disk",
        "</treemap>",
        "",
        "<sunburst>",
        "data: disk",
        "</sunburst>",
      ].join("\n");
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(3);
      expect(blocks[0].type).toBe("prose");
      expect(blocks[1].type).toBe("treemap");
      expect(blocks[2].type).toBe("sunburst");
    });
  });

  describe("edge cases", () => {
    it("empty <sunburst> body produces empty directive", () => {
      const md = "<sunburst>\n</sunburst>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[0].directive).toEqual({});
    });

    it("empty <treemap> body produces empty directive", () => {
      const md = "<treemap>\n</treemap>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("treemap");
      expect(blocks[0].directive).toEqual({});
    });

    it("<instructions> with no override clones identical to previous viz", () => {
      const md = [
        "<sunburst>",
        "data: disk",
        "locked:",
        "  maxRings: 5",
        "</sunburst>",
        "",
        "<instructions>",
        "clone: prev",
        "</instructions>",
      ].join("\n");
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[1].type).toBe("sunburst");
      expect(blocks[1].directive.data).toBe("disk");
      expect(blocks[1].directive.locked.maxRings).toBe(5);
      // not the same object reference (it's a clone)
      expect(blocks[1].directive).not.toBe(blocks[0].directive);
      expect(blocks[1].directive.locked).not.toBe(blocks[0].directive.locked);
    });
  });

  describe("inline-attrs + body-as-prose (wrapping form)", () => {
    it("parses <sunburst data='disk'> with body as paired markdown prose", () => {
      const md = "<sunburst data=\"disk\">The sunburst shows data.</sunburst>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[0].directive.data).toBe("disk");
      expect(blocks[0].md).toBe("The sunburst shows data.");
    });

    it("parses <treemap> with inline locked object and body as prose", () => {
      const md = "<treemap data=\"disk\" locked=\"{algorithm:sliceAndDice,cushion:true}\">Treemap prose here.</treemap>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("treemap");
      expect(blocks[0].directive.data).toBe("disk");
      expect(blocks[0].directive.locked.algorithm).toBe("sliceAndDice");
      expect(blocks[0].directive.locked.cushion).toBe(true);
      expect(blocks[0].md).toBe("Treemap prose here.");
    });

    it("parses <stasko> with inline attributes and body as prose", () => {
      const md = "<stasko data=\"disk\" ringWidth=\"50\">A static Stasko sunburst.</stasko>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("stasko");
      expect(blocks[0].directive.data).toBe("disk");
      expect(blocks[0].directive.ringWidth).toBe(50);
      expect(blocks[0].md).toBe("A static Stasko sunburst.");
    });

    it("empty body with inline attrs produces widget block (no md)", () => {
      const md = "<sunburst data=\"disk\">\n</sunburst>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[0].directive.data).toBe("disk");
      expect(blocks[0].md).toBeUndefined();
    });

    it("key/value body form still works (no inline attrs)", () => {
      const md = "<sunburst>\ndata: disk\ncontrols: []\n</sunburst>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[0].directive.data).toBe("disk");
      expect(blocks[0].directive.controls).toEqual([]);
      expect(blocks[0].md).toBeUndefined();
    });

    it("self-closing form still works", () => {
      const md = "<sunburst data=\"disk\" maxRings=\"5\" />";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[0].directive.data).toBe("disk");
      expect(blocks[0].directive.maxRings).toBe(5);
      expect(blocks[0].md).toBeUndefined();
    });

    it("controls array from inline attrs", () => {
      const md = "<sunburst data=\"disk\" controls=\"[maxRings,sorting]\">Prose about controls.</sunburst>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[0].directive.controls).toEqual(["maxRings", "sorting"]);
      expect(blocks[0].md).toBe("Prose about controls.");
    });

    it("parses the navigation embed form: animateNavigation control + locked seed + breadcrumb", () => {
      const md = "<sunburst data=\"disk\" controls=\"[animateNavigation]\" locked=\"{animateNavigation:false}\" breadcrumb=\"true\" caption=\"hi\" />";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("sunburst");
      expect(blocks[0].directive.controls).toEqual(["animateNavigation"]);
      expect(blocks[0].directive.locked).toEqual({ animateNavigation: false });
      expect(blocks[0].directive.breadcrumb).toBe(true);
      expect(blocks[0].directive.caption).toBe("hi");
    });

    it("multi-paragraph body is preserved as md", () => {
      const md = "<sunburst data=\"disk\">\n\nFirst paragraph.\n\nSecond paragraph.\n\n</sunburst>";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].md).toContain("First paragraph.");
      expect(blocks[0].md).toContain("Second paragraph.");
    });

    it("wrapping form interleaves correctly with surrounding prose", () => {
      const md = [
        "Before text.",
        "",
        "<sunburst data=\"disk\">",
        "Inside text.",
        "</sunburst>",
        "",
        "After text.",
      ].join("\n");
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(3);
      expect(blocks[0].type).toBe("prose");
      expect(blocks[0].md).toContain("Before");
      expect(blocks[1].type).toBe("sunburst");
      expect(blocks[1].md).toContain("Inside");
      expect(blocks[2].type).toBe("prose");
      expect(blocks[2].md).toContain("After");
    });
  });

  describe("<deactivate>", () => {
    it("parses self-closing <deactivate />", () => {
      const md = "<deactivate />";
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("deactivate");
    });

    it("interleaves deactivate with prose and viz tags", () => {
      const md = [
        "Intro text.",
        "",
        "<deactivate />",
        "",
        "History text.",
        "",
        "<sunburst>",
        "data: disk",
        "</sunburst>",
        "",
        "Discussion of widget 0.",
        "",
        "<deactivate />",
      ].join("\n");
      const blocks = parseArticle(md);
      expect(blocks).toHaveLength(6);
      expect(blocks[0].type).toBe("prose");
      expect(blocks[0].md).toContain("Intro");
      expect(blocks[1].type).toBe("deactivate");
      expect(blocks[2].type).toBe("prose");
      expect(blocks[2].md).toContain("History");
      expect(blocks[3].type).toBe("sunburst");
      expect(blocks[4].type).toBe("prose");
      expect(blocks[4].md).toContain("Discussion");
      expect(blocks[5].type).toBe("deactivate");
    });
  });
});
