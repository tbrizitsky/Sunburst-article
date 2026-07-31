import React, { useMemo, useState, useRef, useCallback, useLayoutEffect, useEffect } from "react";
import { computeSizes, formatSize, sizeHue, lastUpdatedHue } from "./layout.js";
import { useTheme } from "./use-theme.js";

const GP_HUES = [210, 0, 140, 185, 315, 25, 50, 275];

export const TREEMAP_TUNABLE_META = {
  algorithm: { label: "Algorithm", type: "select", options: ["stableSquarified", "sliceAndDice", "squarified", "strip"], default: "stableSquarified" },
  cushion:   { label: "Cushion",   type: "toggle", default: false },
  coloring:  { label: "Coloring",  type: "select", options: ["wheel", "size", "lastUpdated", "none"], default: "wheel" },
  colorModel:{ label: "Color model", type: "select", options: ["hsl", "oklch"], default: "hsl" },
  visibilityThreshold: { label: "Visibility threshold", type: "slider", min: 0, max: 20, step: 0.5, default: 10 },
  aspectRatio:{ label: "Aspect ratio", type: "select", options: ["16:9", "3:2", "1:1"], default: "16:9" },
  dataset:   { label: "Dataset",   type: "select", options: ["disk", "workstation"], default: "disk" },
};

export function defaultTreemapTunables() {
  const t = {};
  for (const [k, v] of Object.entries(TREEMAP_TUNABLE_META)) t[k] = v.default;
  return t;
}

function cushionBg(h, s, l, theme, model) {
  if (model === "oklch") {
    const oL = theme === "light" ? 0.75 : 0.6;
    const oC = 0.15;
    const delta = theme === "light" ? 0.12 : 0.20;
    const l1 = Math.min(1, oL + delta);
    const l3 = Math.max(0, oL - delta);
    return `linear-gradient(135deg,oklch(${l1.toFixed(3)} ${oC.toFixed(3)} ${h.toFixed(1)}) 0%,oklch(${oL.toFixed(3)} ${oC.toFixed(3)} ${h.toFixed(1)}) 35%,oklch(${l3.toFixed(3)} ${oC.toFixed(3)} ${h.toFixed(1)}) 100%)`;
  }
  const delta = theme === "light" ? 12 : 20;
  const l1 = Math.min(100, l + delta);
  const l3 = Math.max(0, l - delta);
  return `linear-gradient(135deg,hsl(${h},${s}%,${l1}%) 0%,hsl(${h},${s}%,${l}%) 35%,hsl(${h},${s}%,${l3}%) 100%)`;
}

function flatBg(h, s, l, theme, model) {
  if (model === "oklch") {
    const oL = theme === "light" ? 0.75 : 0.6;
    const oC = 0.15;
    return `oklch(${oL.toFixed(3)} ${oC.toFixed(3)} ${h.toFixed(1)})`;
  }
  return `hsl(${h},${s}%,${l}%)`;
}

function stripFree(node) {
  if (!node.children) return node;
  const kids = node.children.filter(c => c.type !== "free");
  return { ...node, children: kids.map(stripFree) };
}

export function filterSmallNodes(node, threshold) {
  if (!node.children || node.children.length === 0) return node;
  const total = node.size || node.children.reduce((a, c) => a + (c.size || 0), 0);
  if (total <= 0) return node;
  const keep = node.children.filter(c => ((c.size || 0) / total) * 100 >= threshold);
  if (keep.length === 0) {
    const largest = [...node.children].sort((a, b) => (b.size || 0) - (a.size || 0))[0];
    if (largest) { largest.size = total; node.children = [largest]; return node; }
    return node;
  }
  const removedSize = total - keep.reduce((a, c) => a + (c.size || 0), 0);
  if (removedSize > 0 && keep.length > 0) {
    const keepTotal = keep.reduce((a, c) => a + (c.size || 0), 0);
    keep.forEach(c => { c.size += removedSize * ((c.size || 0) / keepTotal); });
  }
  node.children = keep;
  node.children.forEach(c => filterSmallNodes(c, threshold));
  return node;
}

// ---- slice-and-dice (Shneiderman 1992) ----

function sliceAndDice(node, x, y, w, h, depth, result) {
  if (w < 0.001 || h < 0.001) return;
  result.push({ node, x, y, w, h, depth });
  if (!node.children) return;
  const kids = node.children.filter(c => c.type !== "free");
  if (kids.length === 0) return;
  const sorted = [...kids].sort((a, b) => (b.size || 0) - (a.size || 0));
  const total = node.size || 1;
  const vertical = depth % 2 === 1;
  let offset = 0;
  for (const kid of sorted) {
    const ratio = (kid.size || 0) / total;
    if (vertical) {
      const kidW = w * ratio;
      sliceAndDice(kid, x + offset, y, kidW, h, depth + 1, result);
      offset += kidW;
    } else {
      const kidH = h * ratio;
      sliceAndDice(kid, x, y + offset, w, kidH, depth + 1, result);
      offset += kidH;
    }
  }
}

// ---- squarified (Bruls, Huizing, van Wijk 2000) ----

function worstRatio(row, length) {
  if (row.length === 0) return Infinity;
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum <= 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const sum2 = sum * sum;
  return Math.max((length * length * max) / sum2, sum2 / (length * length * min));
}

function squarifyChildren(children, x, y, w, h, depth, result) {
  if (children.length === 0) return;
  const total = children.reduce((a, c) => a + (c.size || 0), 0) || 1;
  // Normalize child sizes to total area = w*h
  const rectArea = w * h;
  const sizes = children.map(c => (c.size || 0) * rectArea / total);

  // Work on a shrinking rectangle
  let rx = x, ry = y, rw = w, rh = h;
  let remaining = sizes.slice();
  let remainingChildren = children.slice();

  function rowLength() {
    return Math.min(rw, rh);
  }

  function layoutRow(rowSizes, rowChildren, horizontal) {
    const rowSum = rowSizes.reduce((a, b) => a + b, 0);
    if (rowSum <= 0) return;
    if (horizontal) {
      // Row laid out as columns within the shorter side (rh): row height = rh * rowSum / rectArea
      const rowH = rh * rowSum / (rw * rh);
      // Actually: scale so row height fills rh proportionally to rowSum/remainingTotal
      // Use absolute: rowH = rh * (rowSum / (rw * rh)) ... simpler: rowH = rowSum / rw
      const rowHeight = rowSum / rw;
      let offset = 0;
      for (let i = 0; i < rowChildren.length; i++) {
        const kidW = rowSizes[i] / rowHeight;
        placeAndRecurse(rowChildren[i], rx, ry + offset, rowHeight, kidW, depth, result);
        offset += kidW;
      }
      ry += rowHeight;
      rh -= rowHeight;
    } else {
      const rowWidth = rowSum / rh;
      let offset = 0;
      for (let i = 0; i < rowChildren.length; i++) {
        const kidH = rowSizes[i] / rowWidth;
        placeAndRecurse(rowChildren[i], rx + offset, ry, kidH, rowWidth, depth, result);
        offset += kidH;
      }
      rx += rowWidth;
      rw -= rowWidth;
    }
  }

  function placeAndRecurse(node, nx, ny, nw, nh, d, res) {
    if (nw < 0.001 || nh < 0.001) return;
    res.push({ node, x: nx, y: ny, w: nw, h: nh, depth: d });
    if (!node.children) return;
    const kids = node.children.filter(c => c.type !== "free");
    if (kids.length === 0) return;
    const sorted = [...kids].sort((a, b) => (b.size || 0) - (a.size || 0));
    squarifyChildren(sorted, nx, ny, nw, nh, d + 1, res);
  }

  let row = [];
  let rowChildren = [];
  while (remaining.length > 0) {
    const horizontal = rw >= rh; // shorter side is the row's long axis
    const length = Math.min(rw, rh);
    const totalRemaining = remaining.reduce((a, b) => a + b, 0);
    const tryRow = [...row, remaining[0]];
    const w1 = worstRatio(row, length);
    const w2 = worstRatio(tryRow, length);
    if (row.length === 0 || w2 <= w1) {
      row = tryRow;
      rowChildren = [...rowChildren, remainingChildren[0]];
      remaining = remaining.slice(1);
      remainingChildren = remainingChildren.slice(1);
    } else {
      layoutRow(row, rowChildren, horizontal);
      row = [];
      rowChildren = [];
    }
  }
  if (row.length > 0) {
    const horizontal = rw >= rh;
    layoutRow(row, rowChildren, horizontal);
  }
}

function squarified(node, x, y, w, h, depth, result) {
  if (w < 0.001 || h < 0.001) return;
  result.push({ node, x, y, w, h, depth });
  if (!node.children) return;
  const kids = node.children.filter(c => c.type !== "free");
  if (kids.length === 0) return;
  const sorted = [...kids].sort((a, b) => (b.size || 0) - (a.size || 0));
  squarifyChildren(sorted, x, y, w, h, depth + 1, result);
}

// ---- strip (Shneiderman 2001) ----
// Variant of squarified: fixed strip height, fill strips along the longer side.

function stripLayout(node, x, y, w, h, depth, result) {
  if (w < 0.001 || h < 0.001) return;
  result.push({ node, x, y, w, h, depth });
  if (!node.children) return;
  const kids = node.children.filter(c => c.type !== "free");
  if (kids.length === 0) return;
  const sorted = [...kids].sort((a, b) => (b.size || 0) - (a.size || 0));

  const rectArea = w * h;
  const total = sorted.reduce((a, c) => a + (c.size || 0), 0) || 1;
  const sizes = sorted.map(c => (c.size || 0) * rectArea / total);

  let rx = x, ry = y, rw = w, rh = h;
  let i = 0;

  function worstInStrip(stripSizes, stripLength) {
    if (stripSizes.length === 0) return Infinity;
    const sum = stripSizes.reduce((a, b) => a + b, 0);
    const max = Math.max(...stripSizes);
    const min = Math.min(...stripSizes);
    const sum2 = sum * sum;
    return Math.max((stripLength * stripLength * max) / sum2, sum2 / (stripLength * stripLength * min));
  }

  while (i < sorted.length) {
    const horizontal = rw >= rh;
    const stripLength = horizontal ? rh : rw;
    let stripSizes = [];
    let stripKids = [];
    let j = i;
    while (j < sorted.length) {
      const trySizes = [...stripSizes, sizes[j]];
      const w1 = stripSizes.length === 0 ? Infinity : worstInStrip(stripSizes, stripLength);
      const w2 = worstInStrip(trySizes, stripLength);
      if (stripSizes.length === 0 || w2 <= w1) {
        stripSizes = trySizes;
        stripKids = [...stripKids, sorted[j]];
        j++;
      } else {
        break;
      }
    }
    const stripSum = stripSizes.reduce((a, b) => a + b, 0);
    const stripThickness = stripSum / stripLength;
    if (horizontal) {
      let offset = 0;
      for (let k = 0; k < stripKids.length; k++) {
        const kidW = rw * stripSizes[k] / stripSum;
        placeStripCell(stripKids[k], rx + offset, ry, kidW, stripThickness, depth + 1, result);
        offset += kidW;
      }
      ry += stripThickness;
      rh -= stripThickness;
    } else {
      let offset = 0;
      for (let k = 0; k < stripKids.length; k++) {
        const kidH = rh * stripSizes[k] / stripSum;
        placeStripCell(stripKids[k], rx, ry + offset, stripThickness, kidH, depth + 1, result);
        offset += kidH;
      }
      rx += stripThickness;
      rw -= stripThickness;
    }
    i = j;
  }
}

function placeStripCell(node, nx, ny, nw, nh, d, res) {
  if (nw < 0.001 || nh < 0.001) return;
  res.push({ node, x: nx, y: ny, w: nw, h: nh, depth: d });
  if (!node.children) return;
  const kids = node.children.filter(c => c.type !== "free");
  if (kids.length === 0) return;
  const sorted = [...kids].sort((a, b) => (b.size || 0) - (a.size || 0));
  stripLayout({ name: "_sub", size: node.size, children: sorted }, nx, ny, nw, nh, d, res);
}

function strip(node, x, y, w, h, depth, result) {
  stripLayout(node, x, y, w, h, depth, result);
}

// ---- stable squarified ----
// Caches row partitions from the first layout. On subsequent calls with the
// same data but different bounding box, reuses the same row structure — cells
// stay in the same row (no shuffling) and only their dimensions adjust.
//
// Cache key = depth + name + sorted child names. This survives the new object
// references created by stripFree() on every useMemo execution.

const rowCache = new Map();

function cacheKey(node, sorted, depth) {
  return depth + ":" + node.name + ":" + sorted.map(c => c.name).join("|");
}

function computeStablePartition(sorted, w, h) {
  const total = sorted.reduce((a, c) => a + (c.size || 0), 0) || 1;
  const totalAbs = w * h;
  const sizes = sorted.map(c => (c.size || 0) * totalAbs / total);
  const horizontal = w >= h;
  const rows = [];
  const remaining = sizes.map((s, i) => ({ size: s, idx: i }));
  let rw = w, rh = h;
  while (remaining.length > 0) {
    const length = Math.min(rw, rh);
    let row = [];
    let rowSizes = [];
    let i = 0;
    while (i < remaining.length) {
      const trySizes = [...rowSizes, remaining[i].size];
      const w1 = rowSizes.length === 0 ? Infinity : worstRatio(rowSizes, length);
      const w2 = worstRatio(trySizes, length);
      if (rowSizes.length === 0 || w2 <= w1) {
        rowSizes.push(remaining[i].size);
        row.push(remaining[i].idx);
        i++;
      } else break;
    }
    rows.push(row);
    const sum = rowSizes.reduce((a, b) => a + b, 0);
    if (horizontal) rh -= sum / rw;
    else rw -= sum / rh;
    remaining.splice(0, i);
  }
  return { rows, horizontal };
}

function stableSquarified(node, x, y, w, h, depth, result) {
  if (w < 0.001 || h < 0.001) return;
  result.push({ node, x, y, w, h, depth });
  if (!node.children) return;
  const kids = node.children.filter(c => c.type !== "free");
  if (kids.length === 0) return;
  const sorted = [...kids].sort((a, b) => (b.size || 0) - (a.size || 0));
  const key = cacheKey(node, sorted, depth);
  if (!rowCache.has(key)) {
    rowCache.set(key, computeStablePartition(sorted, w, h));
  }
  const { rows, horizontal } = rowCache.get(key);
  const total = sorted.reduce((a, c) => a + (c.size || 0), 0) || 1;
  const totalAbs = w * h;
  const sizes = sorted.map(c => (c.size || 0) * totalAbs / total);
  let rx = x, ry = y, rw = w, rh = h;
  for (const indices of rows) {
    const rowChildren = indices.map(i => sorted[i]);
    const rowSizes = indices.map(i => sizes[i]);
    const rowSum = rowSizes.reduce((a, b) => a + b, 0);
    if (horizontal) {
      const rowH = rowSum / rw;
      let offset = 0;
      for (let i = 0; i < rowChildren.length; i++) {
        const cw = rowSizes[i] / rowH;
        stableSquarified(rowChildren[i], rx, ry + offset, cw, rowH, depth + 1, result);
        offset += cw;
      }
      ry += rowH; rh -= rowH;
    } else {
      const rowW = rowSum / rh;
      let offset = 0;
      for (let i = 0; i < rowChildren.length; i++) {
        const ch = rowSizes[i] / rowW;
        stableSquarified(rowChildren[i], rx + offset, ry, rowW, ch, depth + 1, result);
        offset += ch;
      }
      rx += rowW; rw -= rowW;
    }
  }
}

const LAYOUTS = {
  sliceAndDice,
  squarified,
  strip,
  stableSquarified,
};

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

export const ANIM_MS = 400;

function addPaths(node, parentPath) {
  const path = parentPath ? parentPath + "/" + node.name : node.name || "/";
  node._path = path;
  if (node.children) {
    for (const c of node.children) {
      if (c.type !== "free") addPaths(c, path);
    }
  }
}

export function Treemap({ data, algorithm = "sliceAndDice", cushion = false, coloring = "wheel", colorModel = "hsl", visibilityThreshold = 10, aspectRatio = 1.6 / 1, animate = true }) {
  const theme = useTheme();
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const [pixelWidth, setPixelWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setPixelWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const themeSat = theme === "light" ? 70 : 60;
  const themeLight = theme === "light" ? 65 : 48;
  const borderColorVal = "var(--surface-0)";

  const cellHeight = pixelWidth ? pixelWidth / aspectRatio : 0;

  const cells = useMemo(() => {
    if (!pixelWidth) return [];
    computeSizes(data);
    // Deep-clone the stripFree'd tree so filterSmallNodes (which mutates node
    // sizes and children arrays in place) never touches the shared `data`
    // singleton's leaf objects — otherwise repeated re-renders compound the
    // size inflation and drift the geometry (e.g. toggling cushion repeatedly).
    // The replacer drops `_parent` back-references set by the sunburst layout,
    // which would otherwise make the structure circular and fail JSON.stringify.
    const tree = JSON.parse(JSON.stringify(stripFree(data), (k, v) => k === '_parent' ? undefined : v));
    addPaths(tree);
    tree.size = (tree.children || []).reduce((a, c) => a + (c.size || 0), 0);
    if (visibilityThreshold > 0) filterSmallNodes(tree, visibilityThreshold);
    tree.size = (tree.children || []).reduce((a, c) => a + (c.size || 0), 0);
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

    const rects = [];
    const layoutFn = LAYOUTS[algorithm] || sliceAndDice;
    layoutFn(tree, 0, 0, pixelWidth, cellHeight, 0, rects);

    return rects
      .filter(({ depth }) => depth > 0)
      .filter(({ w, h }) => w >= 4 && h >= 4)
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
          key: node._path,
          pos: { left: x, top: y, width: w, height: h },
          bg: cushion ? cushionBg(hh, ss, ll, theme, colorModel) : flatBg(hh, ss, ll, theme, colorModel),
          borderColor: borderColorVal,
          borderWidth: 2,
          depth,
        };
      });
  }, [data, algorithm, cushion, coloring, colorModel, theme, visibilityThreshold, themeSat, themeLight, pixelWidth, cellHeight, aspectRatio]);

  const [ghosts, setGhosts] = useState([]);
  const prevCellsRef = useRef([]);

  useEffect(() => {
    if (!animate) { prevCellsRef.current = cells; return; }
    const prev = prevCellsRef.current;
    const prevMap = new Map(prev.map(c => [c.key, c]));
    const currMap = new Map(cells.map(c => [c.key, c]));
    const exiting = prev.filter(c => !currMap.has(c.key));
    if (exiting.length > 0) {
      setGhosts(g => [...g, ...exiting]);
      const timer = setTimeout(() => setGhosts(g => g.filter(x => !exiting.includes(x))), ANIM_MS);
      prevCellsRef.current = cells;
      return () => clearTimeout(timer);
    }
    prevCellsRef.current = cells;
  }, [cells, animate]);

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

  const containerH = pixelWidth ? pixelWidth / aspectRatio : 0;

  const trans = animate
    ? `left ${ANIM_MS}ms ease, top ${ANIM_MS}ms ease, width ${ANIM_MS}ms ease, height ${ANIM_MS}ms ease, opacity ${ANIM_MS}ms ease`
    : "none";

  const currKeys = new Set(cells.map(c => c.key));
  const ghostKeys = new Set(ghosts.map(g => g.key));

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: containerH || "auto" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {cells.map(({ node, key, pos, bg, borderColor, borderWidth }) => (
          <div key={key}
            onMouseEnter={(e) => handleMouseEnter(e, node.name, node.size)}
            onMouseMove={(e) => handleMouseMove(e, node.name, node.size)}
            onMouseLeave={handleMouseLeave}
            style={{
              position: "absolute",
              left: pos.left, top: pos.top,
              width: pos.width, height: pos.height,
              background: bg,
              border: `${borderWidth}px solid ${borderColor}`,
              boxSizing: "border-box",
              overflow: "hidden",
              transition: trans,
              opacity: ghostKeys.has(key) ? 0 : 1,
            }}
          />
        ))}
        {ghosts.filter(g => !currKeys.has(g.key)).map(({ node, key, pos, bg, borderColor, borderWidth }) => (
          <div key={"ghost-" + key}
            style={{
              position: "absolute",
              left: pos.left, top: pos.top,
              width: pos.width, height: pos.height,
              background: bg,
              border: `${borderWidth}px solid ${borderColor}`,
              boxSizing: "border-box",
              overflow: "hidden",
              transition: `opacity ${ANIM_MS}ms ease`,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        ))}
      </div>
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