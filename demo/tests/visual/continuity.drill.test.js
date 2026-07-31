/**
 * Frame-continuity oracle — drill/back edges of the production navigation
 * graph (reachable folders only; see continuity.js reachableEdges).
 *
 * Back navigation renders the same frames reversed (startAnim(p, current, 1, 0)),
 * so forward sweeps cover both directions at the layout level.
 */
import { describe, it, expect } from "vitest";
import { disk } from "../../src/sample-data.js";
import { prepareDataset, reachableEdges, drillFrames, checkTransition, summarize } from "./continuity.js";

function runDataset(name, data, minEdges) {
  const { root } = prepareDataset(data);
  const violations = [];
  const edges = reachableEdges(root);
  for (const [parent, child] of edges) {
    const { genFrame, fromView, toView, rotationAllowance } = drillFrames(parent, child, root);
    violations.push(...checkTransition(
      `${name}: drill ${parent.name}→${child.name}`,
      genFrame,
      fromView, toView,
      { rotationAllowance },
    ));
  }
  return { violations, edges: edges.length, minEdges };
}

describe("frame continuity — all drill/back edges", () => {
  it("disk dataset", { timeout: 300_000 }, () => {
    const { violations, edges, minEdges } = runDataset("disk", disk, 100);
    expect(edges).toBeGreaterThan(minEdges);
    expect(violations.length, `edges=${edges}\n  ${summarize(violations)}`).toBe(0);
  });


});
