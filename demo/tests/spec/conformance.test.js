import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  S, L, SMALLER_ALPHA, CENTER_OPACITY, THETA_MIN,
  LARGE_RINGS, SMALL_RINGS, GREY, ROOT_CENTER_BORDER,
  DURATION_MS, CENTER_WIDTH, LARGE_WIDTH, SMALL_WIDTH,
  CX, CY, ANGLE_GAP, RADIAL_GAP, OKLCH_L, OKLCH_C,
  EASE, ANIMATION_SPEED,
  CARD_RADIUS, RING_LANE_WIDTH, RING_LANE_OPACITY, GEOMETRY_TWEEN_MS,
  MVP_TUNABLES,
} from "../../src/layout.js";
import { DEFAULT_TUNABLES } from "../../src/layout.js";
import { TUNABLE_META } from "../../src/SunburstWidget.jsx";

// Spec/code conformance (Phase 2, kills the "magic value flip-flop" recurring
// class): the binding values below are PARSED out of the spec text and asserted
// against the code constants. The spec is the single source of truth — change
// the code without the spec (or vice versa) and the relevant case fails with a
// clear diff, instead of a silent ~85%→~10%→~15% center-opacity beep-boop.

const SPEC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../spec");
const staging = readFileSync(resolve(SPEC_DIR, "staging.md"), "utf8");
const animation = readFileSync(resolve(SPEC_DIR, "animation.md"), "utf8");
const geometry = readFileSync(resolve(SPEC_DIR, "other-widgets/sunburst-geometry.md"), "utf8");
const mvp = readFileSync(resolve(SPEC_DIR, "other-widgets/sunburst-mvp.md"), "utf8");
const sunburstWidget = readFileSync(resolve(SPEC_DIR, "other-widgets/sunburst.md"), "utf8");

// Parse the first numeric capture of `re` out of `text`. Fails the test with a
// pointer to the spec if the binding value isn't where the test expects it — a
// parse-miss is treated the same as drift, on purpose: the contract naming the
// constant in the spec is part of what keeps them in sync.
function parseNum(text, re, label) {
  const m = text.match(re);
  if (!m) throw new Error(`conformance: could not parse "${label}" from spec via ${re}`);
  return parseFloat(m[1]);
}
function parseStr(text, re, label) {
  const m = text.match(re);
  if (!m) throw new Error(`conformance: could not parse "${label}" from spec via ${re}`);
  return m[1];
}
function parseNumArr(text, re, label, count) {
  const m = text.match(re);
  if (!m) throw new Error(`conformance: could not parse "${label}" from spec via ${re}`);
  const arr = m[1].split(",").map(s => parseFloat(s.trim()));
  if (arr.length !== count) throw new Error(`conformance: expected ${count} values for "${label}", got ${arr.length}`);
  return arr;
}

describe("binding values — spec text agrees with the code constants", () => {
  // ---- Color / appearance (staging.md §"Visual appearance") ----
  it("S (saturation) — folder hue hsl(…, S%, L%)", () => {
    const specS = parseNum(staging, /mod 360,\s*(\d+)%,\s*\d+%\)/, "S");
    expect(S).toBe(specS);
  });

  it("L (lightness) — folder hue hsl(…, S%, L%)", () => {
    const specL = parseNum(staging, /mod 360,\s*\d+%,\s*(\d+)%\)/, "L");
    expect(L).toBe(specL);
  });

  it("SMALLER_ALPHA — grey at reduced opacity hsla(0,0%,50%,α)", () => {
    const specA = parseNum(staging, /hsla\(0,\s*0%,\s*50%,\s*([\d.]+)\)/, "SMALLER_ALPHA");
    expect(SMALLER_ALPHA).toBe(specA);
  });

  it("CENTER_OPACITY — drilled-in center hsla(hue,S%,L%,α)", () => {
    const specA = parseNum(staging, /hsla\(hue,\s*\d+%,\s*\d+%,\s*([\d.]+)\)/, "CENTER_OPACITY");
    expect(CENTER_OPACITY).toBe(specA);
  });

  it("GREY — file grey hsl(0,0%,50%)", () => {
    const specGrey = parseStr(staging, /(hsl\(0,\s*0%,\s*50%\))/, "GREY");
    expect(GREY).toBe(specGrey);
  });

  it("ROOT_CENTER_BORDER — root center border hsl(0,0%,55%)", () => {
    const specBorder = parseStr(staging, /(hsl\(0,\s*0%,\s*55%\))/, "ROOT_CENTER_BORDER");
    expect(ROOT_CENTER_BORDER).toBe(specBorder);
  });

  // ---- Layout (staging.md §"Implementation constants") ----
  it("THETA_MIN — display threshold θ_min", () => {
    const specThm = parseNum(staging, /Display threshold `θ_min`\s*\|\s*(\d+)°/, "THETA_MIN");
    expect(THETA_MIN).toBe(specThm);
  });

  it("LARGE_RINGS / SMALL_RINGS — tier counts", () => {
    const specLarge = parseNum(staging, /\| Large rings \| (\d+)/, "LARGE_RINGS");
    const specSmall = parseNum(staging, /\| Small rings \| (\d+)/, "SMALL_RINGS");
    expect(LARGE_RINGS).toBe(specLarge);
    expect(SMALL_RINGS).toBe(specSmall);
  });

  // ---- Timing (animation.md §"Timing & easing") ----
  it("DURATION_MS — navigation transition base duration", () => {
    const specDur = parseNum(animation, /DURATION_MS\s*=\s*(\d+)/, "DURATION_MS");
    expect(DURATION_MS).toBe(specDur);
  });

  it("EASE — motion tween easing curve", () => {
    const specEase = parseNumArr(staging, /\| `EASE` \| `\[([\d.,\s]+)\]`/, "EASE", 4);
    expect(DEFAULT_TUNABLES.EASE).toEqual(specEase);
  });

  it("ANIMATION_SPEED — default speed multiplier (slowAnimation off)", () => {
    const specSpeed = parseNum(staging, /off\s*=\s*([\d.]+)×/, "ANIMATION_SPEED");
    expect(ANIMATION_SPEED).toBe(specSpeed);
  });

  // ---- Geometry (staging.md §"Implementation constants") ----
  it("CENTER_WIDTH — ring 0 radius", () => {
    const specW = parseNum(staging, /\| `CENTER_WIDTH` \| (\d+)/, "CENTER_WIDTH");
    expect(CENTER_WIDTH).toBe(specW);
  });

  it("LARGE_WIDTH — large ring width", () => {
    const specW = parseNum(staging, /\| `LARGE_WIDTH` \| (\d+)/, "LARGE_WIDTH");
    expect(LARGE_WIDTH).toBe(specW);
  });

  it("SMALL_WIDTH — small ring width", () => {
    const specW = parseNum(staging, /\| `SMALL_WIDTH` \| (\d+)/, "SMALL_WIDTH");
    expect(SMALL_WIDTH).toBe(specW);
  });

  it("CX, CY — viewport center (hard invariant)", () => {
    const specX = parseNum(staging, /\| `CX`,\s*`CY` \| (\d+),\s*(\d+)/, "CX");
    const specY = parseNum(staging, /\| `CX`,\s*`CY` \| \d+,\s*(\d+)/, "CY");
    expect(CX).toBe(specX);
    expect(CY).toBe(specY);
  });

  it("ANGLE_GAP — angular gap between sibling sectors", () => {
    const specGap = parseNum(staging, /\| `ANGLE_GAP` \| ([\d.]+)°/, "ANGLE_GAP");
    expect(ANGLE_GAP).toBe(specGap);
  });

  it("RADIAL_GAP — radial gap between rings", () => {
    const specGap = parseNum(staging, /\| `RADIAL_GAP` \| ([\d.]+)/, "RADIAL_GAP");
    expect(RADIAL_GAP).toBe(specGap);
  });

  // ---- Color model constants (staging.md §"Visual appearance") ----
  it("OKLCH_L — OKLCH lightness for folder hues", () => {
    const specL = parseNum(staging, /\| `OKLCH_L` \| ([\d.]+)/, "OKLCH_L");
    expect(OKLCH_L).toBe(specL);
  });

  it("OKLCH_C — OKLCH chroma for folder hues", () => {
    const specC = parseNum(staging, /\| `OKLCH_C` \| ([\d.]+)/, "OKLCH_C");
    expect(OKLCH_C).toBe(specC);
  });

  // ---- Sunburst Geometry widget (other-widgets/sunburst-geometry.md §11) ----
  it("CARD_RADIUS — geometry widget bounded-zoom radius", () => {
    const spec = parseNum(geometry, /\| `CARD_RADIUS` \| (\d+) \|/, "CARD_RADIUS");
    expect(CARD_RADIUS).toBe(spec);
  });

  it("RING_LANE_WIDTH — geometry widget lane stroke width", () => {
    const spec = parseNum(geometry, /\| `RING_LANE_WIDTH` \| ([\d.]+) \|/, "RING_LANE_WIDTH");
    expect(RING_LANE_WIDTH).toBe(spec);
  });

  it("RING_LANE_OPACITY — geometry widget lane stroke opacity", () => {
    const spec = parseNum(geometry, /\| `RING_LANE_OPACITY` \| ([\d.]+) \|/, "RING_LANE_OPACITY");
    expect(RING_LANE_OPACITY).toBe(spec);
  });

  it("GEOMETRY_TWEEN_MS — geometry widget transition glide duration", () => {
    const spec = parseNum(geometry, /\| `GEOMETRY_TWEEN_MS` \| (\d+) \|/, "GEOMETRY_TWEEN_MS");
    expect(GEOMETRY_TWEEN_MS).toBe(spec);
  });

  // ---- Sunburst MVP widget (other-widgets/sunburst-mvp.md §1) ----
  it("MVP maxRings — 5 (small mode)", () => {
    const spec = parseNum(mvp, /\| Max rings \| (\d+) \(`small` mode\)/, "MVP maxRings");
    expect(MVP_TUNABLES.maxRings).toBe(spec);
  });

  it("MVP ringMode — small", () => {
    const spec = parseStr(mvp, /\| Max rings \| \d+ \(`(\w+)` mode\)/, "MVP ringMode");
    expect(MVP_TUNABLES.ringMode).toBe(spec);
  });

  it("MVP filesSpecial — false (folders only)", () => {
    const spec = parseStr(mvp, /Hidden \(`filesSpecial: (\w+)`\)/, "MVP filesSpecial");
    expect(MVP_TUNABLES.filesSpecial).toBe(spec === "true");
  });

  it("MVP smallerObjects — false (no bucket)", () => {
    const spec = parseStr(mvp, /Disabled \(`smallerObjects: (\w+)`\)/, "MVP smallerObjects");
    expect(MVP_TUNABLES.smallerObjects).toBe(spec === "true");
  });

  it("MVP THETA_MIN — 0 (every folder renders)", () => {
    const spec = parseNum(mvp, /`θ_min = (\d+)`/, "MVP THETA_MIN");
    expect(MVP_TUNABLES.THETA_MIN).toBe(spec);
  });

  it("MVP coloring — none (monochromatic grey)", () => {
    const spec = parseStr(mvp, /\| Coloring \| `(\w+)` \(/, "MVP coloring");
    expect(MVP_TUNABLES.coloring).toBe(spec);
  });

  it("MVP interactions — none (read-only map)", () => {
    const spec = parseStr(mvp, /\| Interactions \| (None)/, "MVP interactions");
    expect(spec).toBe("None");
    expect(MVP_TUNABLES.interactions).toBe(false);
  });

  it("MVP sortBySize — defaults off (name order)", () => {
    const spec = parseStr(mvp, /\| `sortBySize` \| Sort by size \| Toggle \| (Off \(default\))/, "MVP sortBySize default");
    expect(spec).toBe("Off (default)");
  });

  it("MVP embeds directive — { data: \"disk\", caption: \"Sunburst MVP\" }", () => {
    expect(mvp).toMatch(/\{ data: "disk", caption: "Sunburst MVP" \}/);
  });

  // ---- Sunburst widget tunable defaults (other-widgets/sunburst.md §"Tunable names") ----
  // TUNABLE_META is the code-side schema for <sunburst> widget parameters. Every
  // default must match the spec table; a silent code-side tweak (like the old
  // centerOpacity 0.15 vs spec 0) fails here instead of surfacing as a drifted
  // article widget.
  function parseWidgetDefault(raw) {
    if (raw.startsWith("`")) return raw.slice(1, -1);
    if (raw === "off" || raw === "false") return false;
    if (raw === "on" || raw === "true") return true;
    return parseFloat(raw);
  }
  function widgetTableDefaults() {
    const defaults = {};
    const section = sunburstWidget.slice(
      sunburstWidget.indexOf("### Tunable names"),
      sunburstWidget.indexOf("### Inline control params"),
    );
    for (const row of section.split("\n")) {
      const m = row.match(/^\|\s*`(\w+)`\s*\|\s*[^|]+\|\s*([^|]+?)\s*\|/);
      if (!m) continue;
      defaults[m[1]] = parseWidgetDefault(m[2]);
    }
    return defaults;
  }
  const widgetDefaults = widgetTableDefaults();

  it("TUNABLE_META — every widget tunable default matches the spec table", () => {
    const specKeys = Object.keys(widgetDefaults);
    const codeKeys = Object.keys(TUNABLE_META);
    expect(codeKeys.sort()).toEqual(specKeys.sort());
    for (const k of codeKeys) {
      expect(TUNABLE_META[k].default, `TUNABLE_META["${k}"].default`).toBe(widgetDefaults[k]);
    }
  });

  it("TUNABLE_META centerOpacity — 0 (invisible at rest, pulses on hover only)", () => {
    expect(TUNABLE_META.centerOpacity.default).toBe(0);
    expect(TUNABLE_META.centerOpacity.default).toBe(CENTER_OPACITY);
  });

  it("TUNABLE_META — widget defaults agree with staging.md DialKit defaults (centerOpacity)", () => {
    const specA = parseNum(staging, /\| `centerOpacity` \| slider \| (\d+) \|/, "widget centerOpacity");
    expect(TUNABLE_META.centerOpacity.default).toBe(specA);
  });
});