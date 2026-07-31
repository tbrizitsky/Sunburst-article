import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { animate } from "motion";
import { SunburstMap } from "./SunburstMap.jsx";
import { disk } from "./sample-data.js";
import { computeSizes, widgetNaturalSize, DEFAULT_TUNABLES, MVP_TUNABLES } from "./layout.js";
import { WidgetToggle } from "./widget-controls.jsx";

const prefersReducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

// Sunburst MVP — spec/other-widgets/sunburst-mvp.md. A minimal read-only sunburst
// (folders only, no files/smaller-objects, no hover, no navigation) whose only
// control is the "Sort by size" toggle. Flipping it animates the sort morph
// (spec/animation.md §"Sort morph"): `sortP` (0 = name, 1 = size) drives
// SunburstMap's sort-morph render mode, interpolated by Motion. Interruptible —
// flipping mid-flight retargets from the current progress; reduced-motion cuts
// hard.
export function SunburstMvp({ directive }) {
  const { caption } = directive;
  const tree = disk;

  const sizesDone = useRef(false);
  if (!sizesDone.current) { computeSizes(tree); sizesDone.current = true; }

  const [sortBySize, setSortBySize] = useState(false);
  const [sortP, setSortP] = useState(0);
  const animRef = useRef(null);

  // Fixed MVP config (spec/other-widgets/sunburst-mvp.md §1). `sortP` flows into
  // SunburstMap's sort-morph mode; everything else is read-only. The toggle
  // changes ONLY the sort order.
  const baseOpts = MVP_TUNABLES;

  const opts = useMemo(() => ({ ...baseOpts, sortP }), [baseOpts, sortP]);

  // ViewBox is stable across the sort (ring geometry is fixed and sectors rotate
  // within the same angular extent), so it is computed once from baseOpts.
  const { viewBox } = useMemo(() => widgetNaturalSize(baseOpts, tree), [baseOpts]);

  useEffect(() => () => animRef.current?.controls?.stop(), []);

  const toggleSort = useCallback((checked) => {
    setSortBySize(checked);
    const target = checked ? 1 : 0;
    if (prefersReducedMotion) { setSortP(target); return; }
    animRef.current?.controls?.stop();
    animRef.current = animate(sortP, target, {
      type: "tween",
      ease: DEFAULT_TUNABLES.EASE,
      duration: DEFAULT_TUNABLES.DURATION_MS / 1000,
      onUpdate: (v) => setSortP(v),
      onComplete: () => setSortP(target),
    });
  }, [sortP]);

  return (
    <div className="sunburst-widget">
      <div className="sunburst-widget-map">
        <SunburstMap data={tree} current={tree} onNavigate={() => {}}
          opts={opts} viewBox={viewBox} />
      </div>
      {caption && caption !== "none" && <p className="sunburst-widget-caption">{caption}</p>}
      <div className="sunburst-widget-controls">
        <WidgetToggle name="sortBySize" label="Sort by size"
          value={sortBySize} onChange={(v) => toggleSort(v)} />
      </div>
    </div>
  );
}
