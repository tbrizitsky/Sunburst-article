import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { SunburstMap } from "./SunburstMap.jsx";
import { disk } from "./sample-data.js";
import { computeSizes, ringTable, CARD_RADIUS, GEOMETRY_TWEEN_MS } from "./layout.js";
import { WidgetSlider, WidgetToggle } from "./widget-controls.jsx";

function cloneTree(root) {
  return JSON.parse(JSON.stringify(root, (k, v) => k[0] === "_" ? undefined : v));
}

// Ease a value toward a target over ~GEOMETRY_TWEEN_MS (ease-out cubic). Returns
// the live displayed value; glides on every target change. Used so growth-rate
// and ring-scale changes morph instead of cutting (spec §2 "Transition animation").
function useTween(target, ms = GEOMETRY_TWEEN_MS) {
  const [value, setValue] = useState(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = value;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * e);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, ms]);

  return value;
}

export function SunburstGeometryWidget({ directive }) {
  const { controls = [], caption, ringLevels: ringLevelsDefault, growthRate: growthRateDefault, smallerRings: smallerRingsDefault } = directive;

  const controlNames = (Array.isArray(controls) ? controls : []).map(c =>
    typeof c === "string" ? c : c.name
  );

  const [ringLevels, setRingLevels] = useState(ringLevelsDefault ?? 5);
  const [growthRate, setGrowthRate] = useState(growthRateDefault ?? 1.0);
  const [smallerRings, setSmallerRings] = useState(smallerRingsDefault ?? false);

  const tree = useMemo(() => {
    const t = cloneTree(disk);
    computeSizes(t);
    return t;
  }, []);

  // Glide the growth rate and the smallerRings blend. The toggle does NOT change
  // ring count or re-fit: it glides each ring's width between the geometric and
  // two-tier columns (modeBlend 0→1), and ringScale is derived live from the
  // blended total so the outer edge stays pinned at CARD_RADIUS while the inner
  // rings grow. (spec §2 "Transition animation", sunburst-geometry §3)
  const displayRate = useTween(growthRate);
  const modeBlend = useTween(smallerRings ? 1 : 0);
  const rt = useMemo(() => ringTable({
    maxRings: ringLevels, ringMode: "geometric", ringMultiplier: displayRate, modeBlend,
  }), [ringLevels, displayRate, modeBlend]);
  const totalRadius = rt.bounds[rt.bounds.length - 1];
  const ringScale = Math.min(1, CARD_RADIUS / Math.max(1, totalRadius));

  const opts = useMemo(() => ({
    maxRings: ringLevels,
    ringMode: "geometric",
    ringMultiplier: displayRate,
    modeBlend,
    ringScale,
    sorting: "size",
    coloring: "wheel",
    filesSpecial: true,
    smallerObjects: true,
    interactions: false,
    visibilityThreshold: 0,
    hoverOpacityDip: 0,
    ringLanes: true,
  }), [ringLevels, displayRate, modeBlend, ringScale]);

  const handleNavigate = useCallback(() => {}, []);

  return (
    <div className="sunburst-widget">
      <div className="sunburst-widget-map">
        <SunburstMap data={tree} current={tree} onNavigate={handleNavigate}
          opts={opts} />
      </div>
      {caption && caption !== "none" && <p className="sunburst-widget-caption">{caption}</p>}
      {controlNames.length > 0 && (
        <div className="sunburst-widget-controls">
          {controlNames.includes("ringLevels") && (
            <WidgetSlider name="ringLevels" label="Ring levels"
              min={1} max={15} step={1}
              value={ringLevels}
              onChange={(v) => setRingLevels(v)} />
          )}
          {controlNames.includes("growthRate") && (
            <WidgetSlider name="growthRate" label="Growth rate"
              min={0.3} max={1.2} step={0.1}
              value={growthRate}
              disabled={smallerRings}
              valueFormat={(v) => v.toFixed(1)}
              onChange={(v) => setGrowthRate(v)} />
          )}
          {controlNames.includes("smallerRings") && (
            <WidgetToggle name="smallerRings" label="Smaller outer rings"
              value={smallerRings}
              onChange={(v) => setSmallerRings(v)} />
          )}
        </div>
      )}
    </div>
  );
}
