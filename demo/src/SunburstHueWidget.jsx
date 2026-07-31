import React, { useMemo, useRef, useState, useCallback } from "react";
import {
  computeSizes, layout, sectorPath, ringTable, radiusAt,
  toColorString, CX, CY, ANGLE_GAP, RADIAL_GAP, MAX_RING,
  ROOT_CENTER_BORDER, S, L,
} from "./layout.js";
import { disk } from "./sample-data.js";
import { useTheme } from "./use-theme.js";
import { WidgetSlider, WidgetSelect, WidgetToggle } from "./widget-controls.jsx";

const RING_SEGMENTS = 60;
const OVERLAP = 0.1;
const MODEL_OPTIONS = ["HSL", "okLCH"];
const ALL_CONTROLS = ["hueOffset", "colorModel", "showRing", "depthSL", "showPointer"];

function cloneTree(root) {
  return JSON.parse(JSON.stringify(root, (k, v) => k[0] === "_" ? undefined : v));
}

export function SunburstHueWidget({ directive }) {
  const { data: dataName = "disk", caption, colorModel: initialModel = "HSL", hueOffset: initialOffset = 0, showRing: initialShowRing = true, depthSL: initialDepthSL = false, showPointer: initialShowPointer = true, controls } = directive;
  const theme = useTheme();
  const [activeNode, setActiveNode] = useState(null);
  const [colorModel, setColorModel] = useState(initialModel);
  const [hueOffset, setHueOffset] = useState(Number(initialOffset));
  const [showRing, setShowRing] = useState(initialShowRing);
  const [depthSL, setDepthSL] = useState(initialDepthSL);
  const [showPointer, setShowPointer] = useState(initialShowPointer);
  const svgRef = useRef(null);

  const visibleControls = controls || ALL_CONTROLS;

  const opts = useMemo(() => ({
    maxRings: 5,
    sorting: "size",
    coloring: "wheel",
    smallerObjects: true,
    filesSpecial: true,
    visibilityThreshold: 0,
    interactions: false,
    render: "full",
    ringMode: "small",
    THETA_MIN: 2,
  }), []);

  const placed = useMemo(() => {
    const d = dataName === "disk" ? cloneTree(disk) : cloneTree(disk);
    computeSizes(d);
    return layout(d, opts);
  }, [dataName, opts]);

  const rt = useMemo(() => ringTable(opts), [opts]);
  const totalRadius = rt.bounds[opts.maxRings + 1];
  const gap = 4;
  const ringWidth = 12;
  const ringInner = totalRadius + gap;
  const ringOuter = ringInner + ringWidth;
  const maxOuter = ringOuter;

  const margin = 4;
  const svgSize = 2 * (maxOuter + margin);
  const viewBox = `${400 - svgSize / 2} ${400 - svgSize / 2} ${svgSize} ${svgSize}`;

  const sectors = useMemo(
    () => placed.filter(n => n._ring >= 1 && n._span >= 1e-6 && n.type === "folder"),
    [placed]
  );

  const handleActivate = useCallback((node) => setActiveNode(node), []);
  const handleDeactivate = useCallback(() => setActiveNode(null), []);

  const handleSvgClick = useCallback((e) => {
    if (e.target === e.currentTarget) setActiveNode(null);
  }, []);

  const model = colorModel === "okLCH" ? "oklch" : "hsl";

  const colorOpts = useMemo(() => ({
    model, df: 1, theme,
    ...(theme === "light" && model === "hsl" ? { lightSaturation: 70, lightLightness: 65 } : {}),
  }), [theme, model]);

  const offsetHue = useCallback((hue) => ((hue ?? 0) + hueOffset) % 360, [hueOffset]);

  const sectorColor = useCallback((node) => {
    const hue = offsetHue(node._hue);
    if (depthSL && model === "hsl") {
      const baseSat = theme === "light" ? 70 : S;
      const baseLight = theme === "light" ? 65 : L;
      const ds = Math.max(10, baseSat - (node._ring - 1) * 8);
      const dl = Math.max(10, baseLight - (node._ring - 1) * 8);
      return toColorString(hue, { ...colorOpts, saturation: ds, lightness: dl });
    }
    return toColorString(hue, colorOpts);
  }, [offsetHue, depthSL, model, theme, colorOpts]);

  let pointerLine = null;
  if (activeNode) {
    const midAngle = activeNode._start + activeNode._span / 2;
    const rad = (midAngle * Math.PI) / 180;
    const [sr0, sr1] = radiusAt(activeNode._ring, rt.bounds);
    const sir0 = Math.max(0, sr0 + (activeNode._ring > 0 ? RADIAL_GAP / 2 : 0));
    const sir1 = sr1 - (activeNode._ring < MAX_RING ? RADIAL_GAP / 2 : 0);
    const cr = (sir0 + sir1) / 2;
    const x1 = CX + cr * Math.sin(rad);
    const y1 = CY - cr * Math.cos(rad);
    const x2 = CX + ringOuter * Math.sin(rad);
    const y2 = CY - ringOuter * Math.cos(rad);
    pointerLine = { x1, y1, x2, y2, cx: x1, cy: y1 };
  }

  const ringSegments = useMemo(() => {
    const segs = [];
    const step = 360 / RING_SEGMENTS;
    for (let h = 0; h < 360; h += step) {
      const a0 = h - OVERLAP;
      const a1 = h + step + OVERLAP;
      const hue = offsetHue(h + step / 2);
      const color = toColorString(hue, colorOpts);
      segs.push({ d: sectorPath(ringInner, ringOuter, a0, a1), fill: color });
    }
    return segs;
  }, [ringInner, ringOuter, colorOpts, offsetHue]);

  const centerBorder = theme === "light" ? "hsl(0, 0%, 52.8%)" : ROOT_CENTER_BORDER;
  const centerR = rt.bounds[1];

  return (
    <div className="sunburst-widget">
      <div className="sunburst-widget-map" style={{ position: "relative" }}>
        <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", display: "block" }}
          onClick={handleSvgClick}>
          <circle cx={CX} cy={CY} r={centerR}
            fill="transparent" stroke={centerBorder} strokeWidth={1.2} />
          {showRing && (
            <g id="color-ring">
              {ringSegments.map((seg, i) => (
                <path key={i} d={seg.d} fill={seg.fill} />
              ))}
            </g>
          )}
          {sectors.map((node, i) => {
            const [r0, r1] = radiusAt(node._ring, rt.bounds);
            const ir0 = Math.max(0, r0 + (node._ring > 0 ? RADIAL_GAP / 2 : 0));
            const ir1 = r1 - (node._ring < MAX_RING ? RADIAL_GAP / 2 : 0);
            const a0 = node._start + ANGLE_GAP / 2;
            const a1 = node._start + node._span - ANGLE_GAP / 2;
            if (a1 <= a0 + 0.01) return null;
            const color = sectorColor(node);
            return (
              <path key={i} d={sectorPath(ir0, ir1, a0, a1)}
                fill={color}
                onMouseEnter={() => handleActivate(node)}
                onMouseLeave={handleDeactivate}
                onClick={(e) => { e.stopPropagation(); handleActivate(node); }} />
            );
          })}
          {pointerLine && showPointer && (
            <>
              <circle cx={pointerLine.cx} cy={pointerLine.cy} r={3} fill="#e00" style={{ pointerEvents: "none" }} />
              <line x1={pointerLine.x1} y1={pointerLine.y1} x2={pointerLine.x2} y2={pointerLine.y2}
                stroke="#e00" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
            </>
          )}
        </svg>
      </div>
      {caption && caption !== "none" && <p className="sunburst-widget-caption">{caption}</p>}
      {(visibleControls.length > 0) && (
        <div className="sunburst-widget-controls">
          {visibleControls.includes("hueOffset") && (
            <WidgetSlider name="hueOffset" label="Hue offset"
              min={0} max={360} step={1}
              value={hueOffset}
              valueFormat={(v) => `${v}°`}
              onChange={(v) => setHueOffset(v)} />
          )}
          {visibleControls.includes("colorModel") && (
            <WidgetSelect name="colorModel" label="Color model"
              options={MODEL_OPTIONS}
              value={colorModel}
              onChange={(v) => setColorModel(v)} />
          )}
          {visibleControls.includes("showRing") && (
            <WidgetToggle name="showRing" label="Hue ring"
              value={showRing}
              onChange={(v) => setShowRing(v)} />
          )}
          {visibleControls.includes("depthSL") && (
            <WidgetToggle name="depthSL" label="Depth"
              value={depthSL}
              onChange={(v) => setDepthSL(v)} />
          )}
          {visibleControls.includes("showPointer") && (
            <WidgetToggle name="showPointer" label="Hue indicator"
              value={showPointer}
              onChange={(v) => setShowPointer(v)} />
          )}
        </div>
      )}
    </div>
  );
}
