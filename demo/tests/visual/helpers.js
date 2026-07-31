/**
 * Shared rendering helpers for visual tests.
 * Produces deterministic SVG strings from the layout engine — no DOM needed.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  computeSizes, layout, sectorPath, norm,
  RING_RADII, MAX_RING, CENTER_OPACITY,
  S, L, ANGLE_GAP, RADIAL_GAP,
  GREY, SMALLER_ALPHA, ROOT_CENTER_BORDER,
  lerp, easeInOut, lerpAngle,
  radiusAt, morphLayout,
} from "../../src/layout.js";

// ---- Filesystem ----

const SNAPSHOTS_DIR = join(import.meta.dirname, "snapshots");
const BASELINES_DIR = join(import.meta.dirname, "baselines");

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function writeSnapshot(name, svg) {
  ensureDir(SNAPSHOTS_DIR);
  writeFileSync(join(SNAPSHOTS_DIR, name), svg);
}

export function readBaseline(name) {
  const p = join(BASELINES_DIR, name);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

export function writeBaseline(name, svg) {
  ensureDir(BASELINES_DIR);
  writeFileSync(join(BASELINES_DIR, name), svg);
}

// ---- Cloning ----

export function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ---- Rendering helpers ----

export function fillFor(node) {
  if (node.type === "free") return { fill: "transparent", alpha: 0 };
  if (node.type === "smaller") return { fill: GREY, alpha: SMALLER_ALPHA };
  if (node.type === "file") return { fill: GREY, alpha: 1 };
  return { fill: `hsl(${(node._hue ?? 0).toFixed(1)}, ${S}%, ${L}%)`, alpha: 1 };
}

export function renderFrame(items, centerEl, width = 800, height = 800, rotateAngle = 0) {
  let paths = "";
  for (const it of items) {
    if (it.isCenter) continue; // center is rendered separately as centerEl
    if (it.span <= 0.2) continue;
    const a0 = it.start + ANGLE_GAP / 2;
    const a1 = it.start + it.span - ANGLE_GAP / 2;
    if (a1 <= a0 + 0.01) continue;
    const [r0, r1] = radiusAt(it.ring);
    const ir0 = Math.max(0, r0 + (it.ring > 0 ? RADIAL_GAP / 2 : 0));
    const ir1 = r1 - (it.ring < MAX_RING ? RADIAL_GAP / 2 : 0);
    const { fill, alpha } = fillFor(it.node);
    const op = alpha * it.op;
    if (op <= 0.01) continue;
    const d = sectorPath(ir0, ir1, a0, a1);
    paths += `  <path d="${d}" fill="${fill}" fill-opacity="${op.toFixed(3)}" />\n`;
  }

  // Apply SVG rotation exactly like the app (SunburstMap.jsx): wrap center +
  // sectors in <g transform="rotate(...)"> when a non-zero rotation is present.
  const inner = `  <!-- center -->\n  ${centerEl}\n  <!-- sectors -->\n${paths}`;
  const body = rotateAngle
    ? `  <g transform="rotate(${rotateAngle} 400 400)">\n${inner}  </g>\n`
    : inner;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background: #16161a">
${body}</svg>`;
}

export function makeCenterCircle(hue, isRoot) {
  const fill = isRoot ? "transparent" : `hsl(${(hue ?? 0).toFixed(1)}, ${S}%, ${L}%)`;
  const fillOpacity = isRoot ? 0 : CENTER_OPACITY;
  const stroke = isRoot ? ROOT_CENTER_BORDER : null;
  const strokeWidth = isRoot ? 1.2 : 0;
  const strokeAttr = stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="1.000"` : '';
  return `<circle cx="400" cy="400" r="${RING_RADII[0][1]}" fill="${fill}" fill-opacity="${fillOpacity.toFixed(3)}"${strokeAttr} />`;
}

export function renderStatic(root, current) {
  const placed = layout(current);
  const isRoot = current === root;
  const centerEl = makeCenterCircle(current._hue, isRoot);
  const items = placed.filter(n => n._ring >= 1).map(n => ({
    node: n, ring: n._ring, start: n._start, span: n._span, op: 1,
  }));
  return renderFrame(items, centerEl);
}

// Static view rotated by the angular offset (matches the post-navigation static
// view in the app: layout(child) starts are un-rotated; SVG <g rotate> applies the
// visual rotation). `parent` is the pre-navigation current folder (used to compute
// childCenter from the parent's layout). The center circle is NOT rotated (it is
// rotation-invariant) but is wrapped in the same <g> for parity with the app.
export function renderStaticRotated(parent, child) {
  computeSizes(parent);
  layout(parent);
  const childCenter = norm(child._start + child._span / 2);
  const offset = norm(childCenter - 180);
  const placed = layout(child);
  const isRoot = child === parent;
  const centerEl = makeCenterCircle(child._hue, isRoot);
  const items = placed.filter(n => n._ring >= 1).map(n => ({
    node: n, ring: n._ring, start: n._start, span: n._span, op: 1,
  }));
  return renderFrame(items, centerEl, 800, 800, offset);
}

// Morph transition frame. `rotateAngle` interpolates from the pre-animation
// angular offset (oldOffset) to the post-navigation offset (newOffset) via
// lerpAngle(t), mirroring SunburstMap.jsx. The morph returns un-rotated sector
// starts; the SVG <g> applies the visual rotation.
export function renderTransitionFrame(rootNode, childNode, p, rotateAngle = 0) {
  computeSizes(rootNode);
  layout(rootNode);
  computeSizes(childNode);
  layout(childNode);

  const items = morphLayout(rootNode, childNode, p);
  const centerItem = items.find(it => it.isCenter);

  let centerEl;
  if (centerItem) {
    const centerFill = `hsl(${(centerItem.centerHue ?? 0).toFixed(1)}, ${S}%, ${L}%)`;
    const borderOp = centerItem.borderOp ?? 0;
    const strokeAttr = borderOp > 0.01
      ? `stroke="${ROOT_CENTER_BORDER}" stroke-width="1.2" stroke-opacity="${borderOp.toFixed(3)}"`
      : '';
    const hasRing0Sector = items.some(it => !it.isCenter && it.ring <= 0);
    const fo = hasRing0Sector ? 0 : (centerItem.op ?? 0);
    centerEl = `<circle cx="400" cy="400" r="${RING_RADII[0][1]}" fill="${centerFill}" fill-opacity="${fo.toFixed(3)}"${strokeAttr ? ` ${strokeAttr}` : ''} />`;
  } else {
    centerEl = makeCenterCircle(childNode._hue, rootNode === childNode);
  }

  return renderFrame(items, centerEl, 800, 800, rotateAngle);
}
