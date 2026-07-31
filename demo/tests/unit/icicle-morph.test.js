import { describe, it, expect } from "vitest";
import { computeIcicleCells } from "../../src/IcicleSunburstMorph.jsx";
import { disk, workstation } from "../../src/sample-data.js";

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function rootAligned(cells) {
  const root = cells.find(c => c._ring === 0);
  const ring1 = cells.filter(c => c._ring === 1);
  if (!root || ring1.length === 0) return { ok: false, reason: "no root or ring-1 cells" };
  const minA0 = Math.min(...ring1.map(c => c._a0));
  const maxEnd = Math.max(...ring1.map(c => c._a0 + c._span));
  const ok = Math.abs(root._a0 - minA0) < 0.01 && Math.abs((root._a0 + root._span) - maxEnd) < 0.01;
  if (!ok) {
    return { ok: false, rootA0: root._a0, rootEnd: root._a0 + root._span, minA0, maxEnd };
  }
  return { ok: true };
}

describe("computeIcicleCells root-children alignment", () => {
  for (const dataset of [["disk", disk], ["workstation", workstation]]) {
    const [name, rawData] = dataset;
    for (const morph of [0, 0.25, 0.5, 0.75, 1]) {
      it(`${name} morph=${morph}: root left/right edges match children's extremes`, () => {
        const data = clone(rawData);
        const cells = computeIcicleCells(data, morph);
        const result = rootAligned(cells);
        if (!result.ok) {
          console.log("root a0", result.rootA0, "root end", result.rootEnd);
          console.log("children min a0", result.minA0, "max end", result.maxEnd);
        }
        expect(result.ok).toBe(true);
      });
    }
  }

  it("fails without shrink-wrap (root spans full visibleAngle when children are narrower)", () => {
    const data = clone(disk);
    const cells = computeIcicleCells(data, 0.5);
    const root = cells.find(c => c._ring === 0);
    const ring1 = cells.find(c => c._ring === 1);
    const rootStartAhead = Math.abs(root._a0 - ring1._a0) < 0.01;
    expect(rootStartAhead).toBe(true);
  });
});
