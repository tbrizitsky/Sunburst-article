import { describe, it, expect } from "vitest";
import { disk } from "../../src/sample-data.js";
import { runAnyToAnyShards } from "./continuity.js";

describe("frame continuity — all any-to-any pairs (disk, 0/4)", () => {
  it("no discontinuities", { timeout: 900_000 }, () => {
    runAnyToAnyShards({ name: "disk", data: disk, fileIndex: 0, fileCount: 4 }, expect);
  });
});
