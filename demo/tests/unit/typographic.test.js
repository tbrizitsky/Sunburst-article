import { describe, it, expect } from "vitest";
import { typographicProse } from "../../src/typographic.js";

describe("typographicProse", () => {
  describe("smart double quotes", () => {
    it("converts paired straight double quotes to curly", () => {
      expect(typographicProse('"hello"')).toBe("\u201chello\u201d");
    });

    it("handles quotes in a sentence", () => {
      const input = 'He said, "hello" and left.';
      const expected = 'He said, \u201chello\u201d and left.';
      expect(typographicProse(input)).toBe(expected);
    });

    it("preserves straight quotes inside backtick code spans", () => {
      const input = 'Use `"strict"` mode.';
      expect(typographicProse(input)).toBe('Use `"strict"` mode.');
    });
  });

  describe("smart single quotes and apostrophes", () => {
    it("converts apostrophes between word characters", () => {
      expect(typographicProse("don't")).toBe("don\u2019t");
      expect(typographicProse("it's")).toBe("it\u2019s");
      expect(typographicProse("John's")).toBe("John\u2019s");
    });

    it("converts opening single quotes", () => {
      const input = "'Twas the night";
      const expected = "\u2018Twas the night";
      expect(typographicProse(input)).toBe(expected);
    });

    it("converts closing single quotes", () => {
      const input = "over 'there'";
      const expected = "over \u2018there\u2019";
      expect(typographicProse(input)).toBe(expected);
    });
  });

  describe("em dash", () => {
    it("converts triple hyphen to em dash", () => {
      expect(typographicProse("it was---surprisingly---good")).toBe(
        "it was\u2014surprisingly\u2014good"
      );
    });

    it("does not affect single hyphens", () => {
      expect(typographicProse("well-known")).toBe("well-known");
    });
  });

  describe("en dash", () => {
    it("converts double hyphen between numbers to en dash", () => {
      expect(typographicProse("1999--2000")).toBe("1999\u20132000");
    });
  });

  describe("ellipsis", () => {
    it("converts three periods to ellipsis", () => {
      expect(typographicProse("wait...")).toBe("wait\u2026");
    });
  });

  describe("non-breaking space", () => {
    it("inserts nbsp between number and following word", () => {
      expect(typographicProse("5 rings")).toBe("5\u00A0rings");
      expect(typographicProse("10 years")).toBe("10\u00A0years");
      expect(typographicProse("0.5 degrees")).toBe("0.5\u00A0degrees");
    });

    it("does not affect words followed by numbers", () => {
      expect(typographicProse("Section 5")).toBe("Section 5");
    });
  });

  describe("code span preservation", () => {
    it("preserves backtick code spans verbatim through all transforms", () => {
      const input = "Use `5 > 3` and `\"hello\"` in your code.";
      expect(typographicProse(input)).toBe(input);
    });

    it("transforms prose around code spans", () => {
      const input = 'In "hello" the value is 5 rings...';
      const result = typographicProse(input);
      expect(result).toContain("\u201chello\u201d");
      expect(result).toContain("5\u00A0rings");
      expect(result).toContain("\u2026");
    });


  });

  describe("realistic prose", () => {
    it("applies multiple transformations to a paragraph", () => {
      const input = `It's been over 10 years since we launched DaisyDisk. It was "the best" disk tool---surprisingly.`;
      const result = typographicProse(input);
      expect(result).toContain("It\u2019s");
      expect(result).toContain("10\u00A0years");
      expect(result).toContain("\u201cthe best\u201d");
      expect(result).toContain("\u2014surprisingly");
    });
  });
});
