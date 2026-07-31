import React, { useMemo, useState, useRef, useCallback } from "react";
import { computeSizes, formatSize, sizeHue, lastUpdatedHue } from "./layout.js";
import { useTheme } from "./use-theme.js";

const GP_HUES = [210, 0, 140, 185, 315, 25, 50, 275];

export const ICICLE_TUNABLE_META = {
  coloring:  { label: "Coloring",  type: "select", options: ["wheel", "size", "lastUpdated", "none"], default: "wheel" },
  colorModel:{ label: "Color model", type: "select", options: ["hsl", "oklch"], default: "hsl" },
  morph:     { label: "Sunburst", type: "slider", min: 0, max: 1, step: 0.01, default: 0 },
  visibilityThreshold: { label: "Visibility threshold", type: "slider", min: 0, max: 10, step: 0.5, default: 0 },
  dataset:   { label: "Dataset",   type: "select", options: ["disk", "workstation"], default: "disk" },
};

export function defaultIcicleTunables() {
  const t = {};
  for (const [k, v] of Object.entries(ICICLE_TUNABLE_META)) t[k] = v.default;
  return t;
}

function stripFree(node) {
  if (!node.children) return node;
  const kids = node.children.filter(c => c.type !== "free");
  return { ...node, children: kids.map(stripFree) };
}

function findMaxDepth(node, depth) {
  if (!node.children) return depth;
  return Math.max(...node.children.filter(c => c.type !== "free").map(c => findMaxDepth(c, depth + 1)), depth);
}

function icicleLayout(node, x, y, w, h, depth, maxDepth, result) {
  const rowHeight = h / (maxDepth + 1);
  result.push({ node, x, y: depth * rowHeight, w, h: rowHeight, depth });
  if (!node.children) return;
  const kids = node.children.filter(c => c.type !== "free");
  if (kids.length === 0) return;
  const sorted = [...kids].sort((a, b) => (b.size || 0) - (a.size || 0));
  const total = node.size || 1;
  let offset = 0;
  for (const kid of sorted) {
    const ratio = (kid.size || 0) / total;
    icicleLayout(kid, x + offset, y, w * ratio, h, depth + 1, maxDepth, result);
    offset += w * ratio;
  }
}

function assignColor(node, h, s, l) {
  node._h = h;
  node._s = s;
  node._l = l;
  if (node.children) {
    for (const c of node.children) {
      if (c.type !== "free") assignColor(c, h, s, l);
    }
  }
}

export function Icicle({ data, coloring = "wheel", colorModel = "hsl", visibilityThreshold = 0 }) {
  const theme = useTheme();
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  const themeSat = theme === "light" ? 70 : 60;
  const themeLight = theme === "light" ? 65 : 48;
  const borderColorVal = "var(--surface-0)";

  const cells = useMemo(() => {
    computeSizes(data);
    const tree = stripFree(data);
    const top = (tree.children || []).filter(c => c.type !== "free");
    const maxSize = tree.size || 1;

    let mmin = Infinity, mmax = -Infinity;
    (function walk(n) {
      if (n.mtime !== undefined) { if (n.mtime < mmin) mmin = n.mtime; if (n.mtime > mmax) mmax = n.mtime; }
      if (n.children) for (const c of n.children) walk(c);
    })(tree);

    if (coloring === "wheel") {
      top.forEach((child, i) => {
        assignColor(child, GP_HUES[i % GP_HUES.length], themeSat, themeLight);
      });
    }

    const maxDepth = findMaxDepth(tree, 0);
    const rects = [];
    icicleLayout(tree, 0, 0, 1, 1, 0, maxDepth, rects);

    return rects
      .filter(({ w }) => w * 100 >= visibilityThreshold)
      .map(({ node, x, y, w, h, depth }) => {
        let hh, ss, ll;
        if (coloring === "wheel") {
          hh = node._h ?? 0;
          ss = node._s ?? themeSat;
          ll = node._l ?? themeLight;
        } else if (coloring === "none") {
          hh = 0; ss = 0; ll = theme === "light" ? 65 : 50;
        } else {
          const hue = coloring === "size"
            ? sizeHue(node.size, maxSize)
            : lastUpdatedHue(node.mtime, mmin, mmax);
          hh = hue;
          ss = themeSat;
          ll = themeLight;
        }

        return {
          node,
          key: `${node.name}-${x.toFixed(4)}-${y.toFixed(4)}`,
          pct: { x: x * 100, y: y * 100, w: w * 100, h: h * 100 },
          bg: `hsl(${hh},${ss}%,${ll}%)`,
          borderColor: borderColorVal,
          borderWidth: 2,
          depth,
        };
      });
  }, [data, coloring, colorModel, theme, visibilityThreshold, themeSat, themeLight]);

  const handleMouseEnter = useCallback((e, name, size) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      setHover({ name, size, x: e.clientX, y: e.clientY });
    }
  }, []);

  const handleMouseMove = useCallback((e, name, size) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      setHover(prev => prev && { ...prev, x: e.clientX, y: e.clientY });
    }
  }, []);

  const handleMouseLeave = useCallback(() => setHover(null), []);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", aspectRatio: "1.6 / 1" }}>
      {cells.map(({ node, key, pct, bg, borderColor, borderWidth }) => (
        <div key={key}
          onMouseEnter={(e) => handleMouseEnter(e, node.name, node.size)}
          onMouseMove={(e) => handleMouseMove(e, node.name, node.size)}
          onMouseLeave={handleMouseLeave}
          style={{
            position: "absolute",
            left: `${pct.x}%`, top: `${pct.y}%`,
            width: `${pct.w}%`, height: `${pct.h}%`,
            background: bg,
            border: `${borderWidth}px solid ${borderColor}`,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        />
      ))}
      {hover && (
        <div style={{
          position: "fixed", left: hover.x + 14, top: hover.y + 14,
          pointerEvents: "none", zIndex: 10,
          background: "var(--surface-2)", color: "var(--text-primary)",
          border: "1px solid var(--border-medium)", borderRadius: "var(--radius-md)",
          padding: "7px 10px", fontSize: 13, lineHeight: 1.3, boxShadow: "var(--shadow-lg)",
        }}>
          <div style={{ fontWeight: 600 }}>{hover.name}</div>
          <div style={{ opacity: 0.85, marginTop: 2 }}>{formatSize(hover.size)}</div>
        </div>
      )}
    </div>
  );
}
