import React, { useMemo, useState, useRef, useCallback } from "react";
import { computeSizes, formatSize, layout, RING_RADII, CX, CY, ANGLE_GAP, RADIAL_GAP } from "./layout.js";

const S = 800;
const STEPS = 32;
const θ_MIN = 0.2;

function toRad(deg) { return (deg * Math.PI) / 180; }

function sectorPerimeter(r0, r1, a0, a1, steps, C) {
  const pts = [];
  const a0r = toRad(a0);
  const a1r = toRad(a1);
  const span = a1r - a0r;
  const cy = CY - C;

  for (let i = 0; i <= steps; i++) {
    const a = a0r + span * (i / steps);
    const R = r0 + C;
    pts.push([CX + R * Math.sin(a), cy - R * Math.cos(a)]);
  }
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    const R = r0 + (r1 - r0) * f + C;
    pts.push([CX + R * Math.sin(a1r), cy - R * Math.cos(a1r)]);
  }
  for (let i = 1; i <= steps; i++) {
    const a = a1r - span * (i / steps);
    const R = r1 + C;
    pts.push([CX + R * Math.sin(a), cy - R * Math.cos(a)]);
  }
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const R = r1 - (r1 - r0) * f + C;
    pts.push([CX + R * Math.sin(a0r), cy - R * Math.cos(a0r)]);
  }
  return pts;
}

function ptsToPath(pts) {
  return "M" + pts.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join("L") + "Z";
}

export function computeIcicleCells(data, morph) {
  computeSizes(data);
  const placed = layout(data);
  const maxR = RING_RADII[RING_RADII.length - 1][1];
  const visibleAngle = θ_MIN + morph * (360 - θ_MIN);

  let R;
  if (visibleAngle <= 180) {
    R = 400 / Math.sin(toRad(visibleAngle / 2));
  } else {
    R = 380 + (360 - visibleAngle) / 9;
  }
  const C = R - maxR;

  const rangeStart = 180 - visibleAngle / 2;

  const rstack = [];
  const parentCursor = new Map();
  const parentUnwrap = new Map();

  const rawCells = placed
    .filter(n => n._span > 0)
    .map(n => {
      while (rstack.length > 0 && rstack[rstack.length - 1].node._ring >= n._ring) {
        rstack.pop();
      }

      let a0, span;
      if (rstack.length === 0) {
        a0 = rangeStart;
        span = visibleAngle;
      } else {
        const parent = rstack[rstack.length - 1];
        const relPos = ((n._start - parent.node._start) % 360 + 360) % 360;
        const angFrac = parent.node._span > 0 ? relPos / parent.node._span : 0;
        const cursor = parentCursor.get(parent.node) || 0;
        const share = n._span / parent.node._span;
        const st = parentUnwrap.get(parent.node);
        let frac = angFrac;
        if (!st) {
          parentUnwrap.set(parent.node, { prevA: angFrac, prevShare: share });
        } else {
          const expected = st.prevA + st.prevShare;
          frac = angFrac + Math.round(expected - angFrac);
          parentUnwrap.set(parent.node, { prevA: frac, prevShare: share });
        }
        const fraction = cursor + (frac - cursor) * morph;
        a0 = parent.a0 + fraction * parent.spanA;
        span = (n._span / 360) * visibleAngle;
        parentCursor.set(parent.node, cursor + n._span / parent.node._span);
      }
      const spanA = (n._span / 360) * visibleAngle;
      rstack.push({ node: n, a0, spanA });

      const [r0, r1] = RING_RADII[n._ring] || RING_RADII[RING_RADII.length - 1];
      // Constant gaps matching the sunburst: the radial gap is the sunburst's
      // RADIAL_GAP px (the radial dimension is pixel-scaled at both endpoints,
      // so rows separate exactly like the sunburst's rings). The angular gap is
      // the sunburst's ANGLE_GAP scaled by the visible-angle fraction
      // (ANGLE_GAP · visibleAngle/360) — at the sunburst end (visibleAngle=360)
      // it is exactly ANGLE_GAP; toward the icicle end it shrinks proportionally
      // because an absolute degree gap would overflow the θ_min sliver and
      // collapse every cell to zero width. Clamp the inset so it never exceeds
      // the available span/radial range — a degenerate (zero-width) path still
      // draws.
      const gapAng = ANGLE_GAP * (visibleAngle / 360);
      const gapR = RADIAL_GAP;
      const ga0 = a0 + Math.min(gapAng / 2, span / 2);
      const ga1 = a0 + span - Math.min(gapAng / 2, span / 2);
      const gr0 = r0 + Math.min(gapR / 2, (r1 - r0) / 2);
      const gr1 = r1 - Math.min(gapR / 2, (r1 - r0) / 2);
      const d = ptsToPath(sectorPerimeter(gr0, gr1, ga0, ga1, STEPS, C));

      const hue = ((n._start + n._span / 2) % 360 + 360) % 360;

      let fill, stroke, strokeWidth;
      if (n === data) {
        fill = "none";
        stroke = "hsla(0, 0%, 50%, 0.35)";
        strokeWidth = 2;
      } else if (n.type === "free") {
        fill = "hsla(0, 0%, 60%, 0.1)";
        stroke = "hsla(0, 0%, 60%, 0.18)";
        strokeWidth = 0.5;
      } else {
        fill = `hsl(${hue.toFixed(1)}, 60%, 50%)`;
        stroke = "rgba(0,0,0,0.08)";
        strokeWidth = 0.5;
      }

      return {
        key: `${n.name}-${n._ring}-${n._start}`,
        d,
        fill,
        stroke,
        strokeWidth,
        name: n.name,
        size: n.size,
        _a0: a0,
        _span: span,
        _ring: n._ring,
      };
    })
    .filter(Boolean);

  const rootIdx = rawCells.findIndex(c => c._ring === 0);
  const ring1Cells = rawCells.filter(c => c._ring === 1);
  if (rootIdx >= 0 && ring1Cells.length > 0) {
    const minA0 = Math.min(...ring1Cells.map(c => c._a0));
    const maxEnd = Math.max(...ring1Cells.map(c => c._a0 + c._span));
    if (maxEnd - minA0 > 0.01) {
      const [cr0, cr1] = RING_RADII[0];
      const gapR = RADIAL_GAP;
      rawCells[rootIdx] = {
        ...rawCells[rootIdx],
        d: ptsToPath(sectorPerimeter(cr0, cr1 - gapR / 2, minA0, maxEnd, STEPS, C)),
        _a0: minA0,
        _span: maxEnd - minA0,
      };
    }
  }

  return rawCells;
}

export function IcicleSunburstMorph({ data, morph = 0 }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  const handleMouseEnter = useCallback((e, name, size) => {
    setHover({ name, size, x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e) => {
    setHover(prev => prev && { ...prev, x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseLeave = useCallback(() => setHover(null), []);

  const cells = useMemo(() => computeIcicleCells(data, morph), [data, morph]);

  const rootCell = cells[0];
  const childCells = cells.slice(1);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", height: "100%", display: "block" }}>
        {childCells.map(({ key, d, fill, stroke, strokeWidth, name, size }) => (
          <path key={key} d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth ?? 0.5}
            onMouseEnter={(e) => handleMouseEnter(e, name, size)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        ))}
        <path d={rootCell.d} fill={rootCell.fill} stroke={rootCell.stroke} strokeWidth={rootCell.strokeWidth ?? 0.5} />
      </svg>
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
