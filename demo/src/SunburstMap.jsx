import React, { useMemo, useState, useReducer, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useDialKit, useDialTimeline } from "dialkit";
import { animate } from "motion";
import {
  computeSizes, layout, sectorPath, formatSize, ringTable, sizeHue, lastUpdatedHue,
  RING_RADII, ROOT_CENTER_BORDER, MAX_RING, GREY, GREY_LIGHT, NONE_COLOR, NONE_COLOR_LIGHT, SMALLER_ALPHA,
  ANGLE_GAP, RADIAL_GAP, S, L, CENTER_OPACITY, CX, CY,
  RING_LANE_WIDTH, RING_LANE_OPACITY,
  lerp, lerpAngle, easeInOut, radiusAt, DEFAULT_TUNABLES,
  snapshotAll, subtreeNodes, morphLayout, sortLayout, norm,
  toColorString, depthFactor, virtualPosIn,
} from "./layout.js";
import { disk, workstation, computeMtimes } from "./sample-data.js";
import { useTheme } from "./use-theme.js";

const prefersReducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

const DATASETS = { disk, workstation };

// Fill + stroke color + base alpha for a node. Hue comes from `coloring`:
//  - "wheel"      → the node's frozen _hue (spec §5, angle-based)
//  - "size"       → sizeHue(size, maxSize) (debug-only; deviates from §5)
//  - "lastUpdated"→ lastUpdatedHue(mtime, minMtime, maxMtime) (green=newest, red=oldest)
//  - "none"       → monochromatic light grey (no hue variation)
// S/L/greys/free-transparency are binding (spec §5).
function fillFor(node, coloring, maxSize, mtimeRange, colorModel = 'hsl', df = 1, theme = 'dark', lightSaturation, lightLightness, lightOklchLightness, lightOklchChroma) {
  if (node.type === "free") return { fill: "transparent", strokeColor: "transparent", alpha: 0 };
  const grey = theme === 'light' ? GREY_LIGHT : GREY;
  const noneColor = theme === 'light' ? NONE_COLOR_LIGHT : NONE_COLOR;
  if (coloring === "none") return { fill: noneColor, strokeColor: noneColor, alpha: 1 };
  if (node.type === "smaller") return { fill: grey, strokeColor: grey, alpha: SMALLER_ALPHA };
  if (node.type === "file") return { fill: grey, strokeColor: grey, alpha: 1 };
  let hue;
  if (coloring === "size") hue = sizeHue(node.size, maxSize);
  else if (coloring === "lastUpdated") hue = lastUpdatedHue(node.mtime, mtimeRange?.min, mtimeRange?.max);
  else hue = node._hue ?? 0;
  const color = toColorString(hue, { model: colorModel, df, theme, lightSaturation, lightLightness, lightOklchLightness, lightOklchChroma });
  return { fill: color, strokeColor: color, alpha: 1 };
}

function Sector({ node, ring, start, span, op, bounds, coloring, maxSize, mtimeRange, render, interactions, onHover, onDrill, hoverOpacityDip, pulseDuration, animating, colorModel, depthColor, maxRings, lightSaturation, lightLightness, lightOklchLightness, lightOklchChroma }) {
  const [isHovered, setIsHovered] = useState(false);
  const pathRef = useRef(null);
  const pulseRafRef = useRef(null);
  const theme = useTheme();

  const doDrill = useCallback(() => {
    if (node.type === "folder" && ring >= 1) onDrill(node);
  }, [node, ring, onDrill]);

  // Compute alpha early — the hover pulse effect uses it.
  const a0 = start + ANGLE_GAP / 2;
  const a1 = start + span - ANGLE_GAP / 2;
  if (a1 <= a0 + 0.01) {
    if (span <= 0.2) return null;
  }
  const [r0, r1] = radiusAt(ring, bounds);
  const ir0 = Math.max(0, r0 + (ring > 0 ? RADIAL_GAP / 2 : 0));
  const ir1 = r1 - (ring < MAX_RING ? RADIAL_GAP / 2 : 0);
  const df = depthFactor(ring, maxRings, depthColor);
  const { fill, strokeColor, alpha } = fillFor(node, coloring, maxSize, mtimeRange, colorModel, df, theme, lightSaturation, lightLightness, lightOklchLightness, lightOklchChroma);

  useEffect(() => {
    const el = pathRef.current;
    if (prefersReducedMotion || interactions !== true || !isHovered || animating || !el) {
      if (el) el.style.fillOpacity = "";
      return;
    }
    const startTime = performance.now();
    const loop = () => {
      const elapsed = performance.now() - startTime;
      const factor = (1 + Math.cos(elapsed * 2 * Math.PI / pulseDuration)) / 2;
      const dip = 1 - hoverOpacityDip * factor;
      el.style.fillOpacity = String(alpha * op * dip);
      pulseRafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(pulseRafRef.current);
      if (el) el.style.fillOpacity = "";
    };
  }, [interactions, isHovered, animating, pulseDuration, alpha, op, hoverOpacityDip]);

  // Keep the DOM element alive even at op=0 so React doesn't remove many SVG
  // paths at once when items cross the opacity threshold. fillOpacity=0 makes
  // the sector invisible; the element is naturally cleaned up when the morph
  // replaces it with the static layout (p=1 shortcut or onComplete).
  const drillable = interactions === true && node.type === "folder" && ring >= 1;

  const handleTouchStart = useCallback(() => {
    if (!drillable) return;
    const el = pathRef.current;
    if (!el) return;
    el.style.transition = "fill-opacity 0.15s ease-out";
    el.style.fillOpacity = String(alpha * op * 0.3);
    clearTimeout(el._touchTimer);
    el._touchTimer = setTimeout(() => {
      el.style.transition = "";
      el.style.fillOpacity = "";
    }, 150);
  }, [drillable, alpha, op]);

  const handleClick = () => {
    if (!drillable) return;
    doDrill();
  };

  const cursor = drillable ? "pointer" : "default";
  const pe = op > 0.5 ? "auto" : "none";
  const mouseHandlers = interactions ? {
    onMouseEnter: (e) => { setIsHovered(true); onHover(node, e); },
    onMouseMove: (e) => onHover(node, e),
    onMouseLeave: () => { setIsHovered(false); onHover(null); },
    ...(interactions === true ? { onClick: handleClick, onTouchStart: handleTouchStart } : {}),
  } : {};

  if (render === "wireframe") {
    return (
      <path ref={pathRef}
        d={sectorPath(ir0, ir1, a0, a1)}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1}
        strokeOpacity={alpha * op}
        style={{ pointerEvents: pe, cursor }}
        {...mouseHandlers}
      />
    );
  }

  return (
    <path ref={pathRef}
      d={sectorPath(ir0, ir1, a0, a1)}
      fill={fill}
      fillOpacity={alpha * op}
      style={{ pointerEvents: pe, cursor }}
      {...mouseHandlers}
    />
  );
}

// Compute the leg sequence for an any-to-any transition between `from` and `to`.
// Returns an array of { parent, child, reverse } legs:
//   - reverse=true  → back-out leg (parent is shallower, child is deeper; morph p goes 1→0)
//   - reverse=false → drill-in leg (parent is shallower, child is deeper; morph p goes 0→1)
// The path goes up from `from` to the common ancestor, then down to `to`.
function computePath(from, to, parents) {
  if (!from || !to || from === to) return [];
  // ancestors of `from` (inclusive)
  const ancestors = new Set();
  let node = from;
  while (node) { ancestors.add(node); node = parents.get(node); }
  // common ancestor of `from` and `to`
  let common = to;
  while (common && !ancestors.has(common)) { common = parents.get(common); }
  if (!common) return []; // shouldn't happen (root is common to all)
  // back path: from → … → common
  const back = [];
  node = from;
  while (node !== common) { back.push(node); node = parents.get(node); }
  back.push(common);
  // forward path: common → … → to
  const forward = [];
  node = to;
  while (node !== common) { forward.unshift(node); node = parents.get(node); }
  forward.unshift(common);
  // build legs
  const legs = [];
  for (let i = 0; i < back.length - 1; i++) {
    legs.push({ parent: back[i + 1], child: back[i], reverse: true }); // back-out
  }
  for (let i = 0; i < forward.length - 1; i++) {
    legs.push({ parent: forward[i], child: forward[i + 1], reverse: false }); // drill-in
  }
  return legs;
}

export const SunburstMap = forwardRef(({ data, current: rawCurrent, onNavigate = () => {}, currentPair, onPairChange = () => {}, onPreviewChange = () => {}, opts, viewBox = "0 0 800 800" }, ref) => {
  const theme = useTheme();
  // ---- DialKit debug panel (dev-only; see spec/staging.md §"Debugging tools") ----
  // Structural exploration controls. All default to binding behavior; overrides are
  // session-only (not persisted). Promote tuned values via DialKit's JSON export.
  const drillRef = useRef(null);
  const dial = useDialKit("Sunburst", {
    dataset: { type: "select", options: ["disk", "workstation"], default: "disk" },
    maxRings: [DEFAULT_TUNABLES.maxRings, 1, 20, 1],
    ringMode: { type: "select", options: ["small", "grow", "shrink"], default: DEFAULT_TUNABLES.ringMode },
    ringMultiplier: [DEFAULT_TUNABLES.ringMultiplier, 0.5, 1.5, 0.05],
    sorting: { type: "select", options: ["size", "name"], default: DEFAULT_TUNABLES.sorting },
    coloring: { type: "select", options: ["wheel", "size", "lastUpdated", "none"], default: DEFAULT_TUNABLES.coloring },
    colorModel: { type: "select", options: ["hsl", "oklch"], default: DEFAULT_TUNABLES.colorModel },
    depthColor: DEFAULT_TUNABLES.depthColor,
    render: { type: "select", options: ["full", "wireframe"], default: DEFAULT_TUNABLES.render },
    visibilityThreshold: [DEFAULT_TUNABLES.visibilityThreshold, 0, 10, 0.5],
    smallerObjects: DEFAULT_TUNABLES.smallerObjects,
    interactions: DEFAULT_TUNABLES.interactions,
    filesSpecial: DEFAULT_TUNABLES.filesSpecial,
    hoverOpacityDip: [DEFAULT_TUNABLES.hoverOpacityDip, 0, 1, 0.05],
    centerOpacity: [CENTER_OPACITY, 0, 1, 0.05],
    pulseDuration: [500, 100, 2000, 50],
    slowAnimation: false,
    lightSaturation: [70, 0, 100, 1],
    lightLightness: [65, 0, 100, 1],
    lightOklchLightness: [DEFAULT_TUNABLES.lightOklchLightness, 0, 1, 0.01],
    lightOklchChroma: [DEFAULT_TUNABLES.lightOklchChroma, 0, 0.4, 0.01],
  });
  const tunables = useMemo(() => ({
    dataset: dial.dataset,
    maxRings: dial.maxRings,
    ringMode: dial.ringMode,
    ringMultiplier: dial.ringMultiplier,
    sorting: dial.sorting,
    coloring: dial.coloring,
    colorModel: dial.colorModel ?? DEFAULT_TUNABLES.colorModel,
    depthColor: dial.depthColor ?? DEFAULT_TUNABLES.depthColor,
    render: dial.render,
    visibilityThreshold: dial.visibilityThreshold,
    smallerObjects: dial.smallerObjects,
    interactions: dial.interactions,
    filesSpecial: dial.filesSpecial,
    hoverOpacityDip: dial.hoverOpacityDip,
    centerOpacity: dial.centerOpacity ?? CENTER_OPACITY,
    pulseDuration: dial.pulseDuration ?? 500,
    slowAnimation: dial.slowAnimation ?? false,
    animationSpeed: (dial.slowAnimation ?? false) ? 0.1 : 0.5,
    lightSaturation: dial.lightSaturation ?? DEFAULT_TUNABLES.lightSaturation,
    lightLightness: dial.lightLightness ?? DEFAULT_TUNABLES.lightLightness,
    lightOklchLightness: dial.lightOklchLightness ?? DEFAULT_TUNABLES.lightOklchLightness,
    lightOklchChroma: dial.lightOklchChroma ?? DEFAULT_TUNABLES.lightOklchChroma,
    animateNavigation: dial.animateNavigation ?? DEFAULT_TUNABLES.animateNavigation,
    THETA_MIN: DEFAULT_TUNABLES.THETA_MIN,
    DURATION_MS: DEFAULT_TUNABLES.DURATION_MS,
    EASE: DEFAULT_TUNABLES.EASE,
    ...(opts || {}),
  }), [
    dial.dataset, dial.maxRings, dial.ringMode, dial.ringMultiplier,
    dial.sorting, dial.coloring, dial.colorModel, dial.depthColor,
    dial.render, dial.visibilityThreshold, dial.smallerObjects,
    dial.interactions, dial.filesSpecial, dial.hoverOpacityDip,
    dial.centerOpacity, dial.pulseDuration, dial.slowAnimation,
    dial.lightSaturation, dial.lightLightness,
    dial.lightOklchLightness, dial.lightOklchChroma,
    dial.animateNavigation,
    opts,
  ]);

  // Resolve dataset from DialKit selector. When dataset changes, reset current to root.
  const activeData = DATASETS[tunables.dataset] || disk;
  const current = rawCurrent ?? activeData;
  const prevDatasetRef = useRef(tunables.dataset);
  if (prevDatasetRef.current !== tunables.dataset) {
    prevDatasetRef.current = tunables.dataset;
    angularOffsetRef.current = 0; // rotation from the old dataset is meaningless for the new one
    requestAnimationFrame(() => onNavigate(activeData));
  }

  const { parents, nodeIds, synIds } = useMemo(() => {
    computeSizes(activeData);
    const p = new WeakMap();
    const ids = new WeakMap();
    let nextId = 0;
    const walk = (n) => {
      ids.set(n, ++nextId);
      if (n.children) for (const c of n.children) { p.set(c, n); walk(c); }
    };
    walk(activeData);
    return { parents: p, nodeIds: ids, synIds: new WeakMap() };
  }, [activeData]);
  // Synthetic nodes (smaller-objects buckets) are fresh objects per layout/morph
  // call. Assign lazy object-identity ids: stable for the memoized static layout
  // (same objects recur across renders), fresh per frame during morph.
  const synIdCounter = useRef(0);
  const keyFor = (it) => {
    const id = nodeIds.get(it.node);
    if (id != null) return id;
    let sid = synIds.get(it.node);
    if (sid == null) {
      sid = `syn-${++synIdCounter.current}`;
      synIds.set(it.node, sid);
    }
    return sid;
  };

  const maxSize = activeData.size || 1;

  // Dataset mtime range for the "lastUpdated" coloring mode (green=newest, red=oldest).
  // Anchored to the whole dataset so a folder's color is stable per dataset.
  const mtimeRange = useMemo(() => {
    let min = Infinity, max = -Infinity;
    const walk = (n) => {
      if (n.mtime !== undefined) {
        if (n.mtime < min) min = n.mtime;
        if (n.mtime > max) max = n.mtime;
      }
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(activeData);
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }, [activeData]);

  // Live ring geometry (radii table + cumulative bounds) for the chosen rings.
  const { bounds } = useMemo(
    () => ringTable(tunables),
    [tunables.maxRings, tunables.ringMode, tunables.ringMultiplier, tunables.ringScale,
     tunables.modeBlend]
  );

  const placed = useMemo(
    () => layout(current, tunables),
    [current, tunables.maxRings, tunables.sorting, tunables.smallerObjects,
     tunables.THETA_MIN, tunables.ringCull]
  );

  const [hover, setHover] = useState(null);
  const handleHover = (node, e) => {
    if (!tunables.interactions || animRef.current) return;
    setHover(node ? { node, x: e.clientX, y: e.clientY } : null);
  };

  // ---- DialKit timeline editor (dev-only; see spec/staging.md §"DialTimeline") ----
  // Scrubs/previews the zoom transition; the edited curve feeds Motion for real navigation.
  // Stable id so tests/tooling can address the transport deterministically.
  const timeline = useDialTimeline("Zoom", {
    drillIn: {
      at: 0,
      duration: tunables.DURATION_MS / 1000,
      from: { p: [0, 0, 1] },
      to: { p: [1, 0, 1] },
      transition: { type: "easing", duration: tunables.DURATION_MS / 1000, ease: [0.45, 0, 0.55, 1] },
    },
  }, { autoplay: false, id: "sunburst-zoom" });

  // The (parent, child) pair the timeline scrubs. Lifted to DemoMode for the
  // timeline header. Destructured from props (see forwardRef destructuring above).

  // Preview mode (spec/staging.md §"DialTimeline"): the timeline transport is
  // active (playing or scrubbed away from 0). Exit it before every navigation so
  // the map never silently shows a tree other than `current`'s.
  const isTimelineActive = timeline.playing || timeline.time > 0;
  const exitPreview = () => { timeline.pause(); timeline.seek(0); };

  // Dataset switch also exits preview mode (spec/staging.md §"DialTimeline"):
  // the stored pair belongs to the old dataset and must not drive the render.
  const prevDatasetPreviewRef = useRef(tunables.dataset);
  useEffect(() => {
    if (prevDatasetPreviewRef.current !== tunables.dataset) {
      prevDatasetPreviewRef.current = tunables.dataset;
      exitPreview();
    }
  }, [tunables.dataset]);
  // ---- animation: Motion drives a single scalar p; morphLayout consumes it ----
  const animRef = useRef(null);
  const angularOffsetRef = useRef(0);
  const [, force] = useReducer((c) => c + 1, 0);

  useEffect(() => () => animRef.current?.controls?.stop(), []);

  const [centerHovered, setCenterHovered] = useState(false);
  const centerRef = useRef(null);
  const centerPulseRafRef = useRef(null);
  useEffect(() => {
    const el = centerRef.current;
    if (prefersReducedMotion || !centerHovered || animRef.current || !el || current === activeData) {
      if (el) el.style.fillOpacity = "";
      return;
    }
    const t0 = performance.now();
    const loop = () => {
      const elapsed = performance.now() - t0;
      const factor = (1 + Math.cos(elapsed * 2 * Math.PI / tunables.pulseDuration)) / 2;
      const fo = Math.max(tunables.centerOpacity + tunables.hoverOpacityDip * factor, 0.001);
      el.style.fillOpacity = String(fo);
      centerPulseRafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(centerPulseRafRef.current); if (el) el.style.fillOpacity = ""; };
  }, [centerHovered, animRef.current, tunables.pulseDuration, tunables.centerOpacity, tunables.hoverOpacityDip, current, activeData]);

  // Trigger the real zoom when the timeline plays from the start (replay).
  // Re-planned from `current` at replay time (parent → current), never from a
  // stale stored pair, so replay can't show a tree that disagrees with the
  // committed navigation state (spec/staging.md §"DialTimeline").
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = timeline.playing;
    if (timeline.playing && !wasPlaying && timeline.time < 0.01) {
      const parent = parents.get(current);
      if (parent && !animRef.current && tunables.filesSpecial) {
        startAnim(parent, current, 0, 1, current);
        // The real animation (driven by Motion with the timeline's edited curve)
        // replaces the transport playback; reset the transport so the map
        // returns to live mode when the animation completes.
        exitPreview();
      }
    }
  }, [timeline.playing, timeline.time, current, parents]);

  const startAnim = (parent, child, p0, p1, toNode, leg2 = null) => {
    if (prefersReducedMotion) { onNavigate(toNode); return; }
    setHover(null);
    setCenterHovered(false);
    // Latest-wins queue (depth 1): if an animation is running, replace any
    // pending request and let the current one finish first.
    if (animRef.current) {
      animRef.current.pending = { toNode };
      return;
    }
    layout(parent, tunables);
    const oldOffset = angularOffsetRef.current;
    let newOffset = 0;
    if (p0 < p1) {
      // Placement test via the placed set: _start/_span may be stale from a
      // layout rooted elsewhere (unplaced nodes keep their last values).
      const placed = new Set(layout(parent, tunables));
      const cv = placed.has(child)
        ? { start: child._start, span: child._span }
        : virtualPosIn(parent, child, tunables.sorting || "size");
      newOffset = norm(cv.start + cv.span / 2 - 180);
    }
    angularOffsetRef.current = newOffset;
    const oldMap = snapshotAll(parent);
    layout(child, tunables);
    const newMap = snapshotAll(child);
    const cSub = subtreeNodes(child);
    animRef.current = { parent, child, p0, p1, toNode, oldMap, newMap, cSub, p: p0, oldOffset, newOffset, leg2, controls: null, pending: null };
    force();

    // Use the timeline's edited curve for the real zoom.
    const t = timeline.drillIn?.transition;
    const baseDuration = tunables.DURATION_MS / 1000;
    const speed = tunables.animationSpeed ?? DEFAULT_TUNABLES.animationSpeed;
    const duration = baseDuration / speed;
    const transition = t ? { ...t, type: t.type === "easing" ? "tween" : t.type, duration } : { type: "tween", ease: tunables.EASE, duration };
    const a = animRef.current;
    const controls = animate(p0, p1, {
      ...transition,
      onUpdate: (v) => {
        // Clamp p to [0,1]: morphLayout is only defined for p ∈ [0,1].
        a.p = Math.max(0, Math.min(1, v));
        force();
      },
      onComplete: () => {
        const pending = a.pending;
        const leg2 = a.leg2;
        onNavigate(a.toNode);
        a.p = 1;
        animRef.current = null;
        force();
        if (pending) { startQueued(pending, a.toNode); }
        else if (leg2) {
          onPairChange(leg2.pair);
          startAnim(leg2.parent, leg2.child, leg2.p0, leg2.p1, leg2.toNode);
        }
      },
    });
    a.controls = controls;
  };

  // Route from `from` to `to` using the drill/back morph only (no separate
  // any-to-any morph — see spec/animation.md §"Any-to-any transitions"). Pure
  // ancestor cases are a single morph; a true cross-subtree transition is TWO
  // sequential morphs — back-out from `from` to the common ancestor, then
  // drill-in from the common ancestor to `to` (chained via `leg2`).
  const routeFromTo = (from, to) => {
    if (prefersReducedMotion) { onNavigate(to); return; }
    exitPreview();
    const legs = computePath(from, to, parents);
    if (legs.length === 0) { onNavigate(to); return; }
    if (!tunables.filesSpecial || !tunables.animateNavigation) { onNavigate(to); return; }
    const allDrill = legs.every(l => !l.reverse);
    const allBack = legs.every(l => l.reverse);
    if (allDrill) {
      onPairChange({ parent: from, child: to });
      startAnim(from, to, 0, 1, to);
    } else if (allBack) {
      onPairChange({ parent: to, child: from });
      startAnim(to, from, 1, 0, to);
    } else {
      const backLegs = legs.filter(l => l.reverse);
      const common = backLegs[backLegs.length - 1].parent;
      const leg2 = { parent: common, child: to, p0: 0, p1: 1, toNode: to, pair: { parent: common, child: to } };
      onPairChange({ parent: common, child: from });
      startAnim(common, from, 1, 0, common, leg2);
    }
  };

  // Start a navigation request popped from the queue after the previous one settled.
  // The pending request was captured while an earlier animation was still running,
  // so its parent/child pair may no longer match the settled view. Re-plan the route
  // from the settled folder (fromNode) to the requested target — same routing as
  // navigateTo. This keeps the queued animation's first frame continuous with the
  // view the user is actually looking at.
  const startQueued = (pending, fromNode) => {
    const toNode = pending.toNode;
    if (!toNode || toNode === fromNode) return;
    routeFromTo(fromNode, toNode);
  };

  // ---- Navigation event recording (dev-only; DemoMode record bar) ----
  // Records the target node + elapsed ms of every navigation while armed.
  // Playback replays the captured events with their original timing via
  // navigateTo (the latest-wins queue drops intermediate events exactly as it
  // would for live clicks, so replay matches live behavior).
  const recordingRef = useRef(null); // { t0, events: [{ node, at }] } | null
  const playbackTimersRef = useRef([]);
  const recordNav = (node) => {
    const rec = recordingRef.current;
    if (rec) rec.events.push({ node, at: performance.now() - rec.t0 });
  };
  const cancelPlayback = () => {
    for (const id of playbackTimersRef.current) clearTimeout(id);
    playbackTimersRef.current = [];
  };

  // navigateTo(node): breadcrumb / programmatic navigation (any-to-any with
  // animation). Component-level so both the imperative handle and recording
  // playback can call it.
  const navigateTo = (node) => {
    if (tunables.interactions !== true || !node || node === current) return;
    recordNav(node);
    routeFromTo(current, node);
  };

  // Expose navigateTo(node) for breadcrumb navigation (any-to-any with animation),
  // plus getParents() / getActiveData() for DemoMode's Breadcrumb to stay in sync
  // when the DialKit dataset selector changes.
  useImperativeHandle(ref, () => ({
    navigateTo,
    getParents: () => parents,
    getActiveData: () => activeData,
    startRecording: () => {
      cancelPlayback();
      recordingRef.current = { t0: performance.now(), events: [] };
    },
    stopRecording: () => {
      // Keep the captured events for playback; a subsequent startRecording replaces them.
      if (!recordingRef.current) recordingRef.current = { t0: 0, events: [] };
    },
    playRecording: () => {
      const rec = recordingRef.current;
      if (!rec || rec.events.length === 0) return;
      cancelPlayback();
      playbackTimersRef.current = rec.events.map((ev) =>
        setTimeout(() => navigateTo(ev.node), ev.at)
      );
    },
    clearRecording: () => {
      recordingRef.current = null;
      cancelPlayback();
    },
  }));

  // Cancel any in-flight playback on unmount.
  useEffect(() => cancelPlayback, []);

  const drill = (node) => {
    if (tunables.interactions !== true || node.type !== "folder") return;
    recordNav(node);
    // filesSpecial off / animateNavigation off: hard-cut (no animation).
    if (!tunables.filesSpecial || !tunables.animateNavigation) { onNavigate(node); return; }
    startAnim(current, node, 0, 1, node);
    onPairChange({ parent: current, child: node });
    exitPreview();
  };
  drillRef.current = drill;
  const up = () => {
    if (tunables.interactions !== true) return;
    const p = parents.get(current);
    if (!p) return;
    recordNav(p);
    // filesSpecial off / animateNavigation off: hard-cut (no animation).
    if (!tunables.filesSpecial || !tunables.animateNavigation) { onNavigate(p); return; }
    startAnim(p, current, 1, 0, p); // zoom out (reverse of drill-in)
    onPairChange({ parent: p, child: current });
    exitPreview();
  };

  // Build a pseudo-animation object for the timeline preview (preview mode,
  // spec/staging.md §"DialTimeline"). Only when no real animation is running —
  // a running navigation always takes precedence over the scrubbed preview.
  const previewP = !animRef.current && isTimelineActive ? Math.max(0, Math.min(1, timeline.drillIn?.current?.p ?? 0)) : null;

  // Compute rotation offsets for preview so the SVG rotation matches the real animation.
  // Mirrors the offset calculation in startAnim() — without this the preview shows
  // sectors at raw angular positions with no viewport alignment.
  let previewOldOffset = 0;
  let previewNewOffset = 0;
  if (previewP !== null && currentPair.parent && currentPair.child) {
    previewOldOffset = angularOffsetRef.current;
    const placed = new Set(layout(currentPair.parent, tunables));
    const cv = placed.has(currentPair.child)
      ? { start: currentPair.child._start, span: currentPair.child._span }
      : virtualPosIn(currentPair.parent, currentPair.child, tunables.sorting || "size");
    previewNewOffset = norm(cv.start + cv.span / 2 - 180);
  }

  const previewA = previewP !== null && currentPair.parent && currentPair.child ? {
    parent: currentPair.parent,
    child: currentPair.child,
    p: previewP,
    toNode: currentPair.child,
    oldOffset: previewOldOffset,
    newOffset: previewNewOffset,
  } : null;
  const a = animRef.current || previewA;
  const animating = !!animRef.current;
  const previewActive = !!previewA;

  // Sort morph mode (Sunburst MVP widget): when `opts.sortP` is provided, render
  // the sort morph between the name (0) and size (1) layouts instead of the
  // static layout. Never nulled while in use — the widget always passes a
  // resolved 0 or 1, so there is no jump back to `placed`.
  const sortP = tunables.sortP != null ? tunables.sortP : null;

  // Signal live/preview mode to DemoMode (breadcrumb dimming) — spec/staging.md
  // §"DialTimeline": preview mode is never silent.
  useEffect(() => { onPreviewChange(previewActive); }, [previewActive, onPreviewChange]);
  const isRoot = current === activeData;
  const { coloring, colorModel, depthColor, render, visibilityThreshold, maxRings } = tunables;
  const co = tunables.centerOpacity;

  // Apply the visibility threshold (anti-moire): drop sectors narrower than it.
  // Applied uniformly to static + morph items, including the "smaller objects" bucket.
  const visible = (it) => it.span >= visibilityThreshold;

  // Build the list of sectors to render.
  let items = [];
  let centerEl = null;
  const view = tunables.view || "full";

  // Helper: extract center info from morphLayout items and build the center circle element.
  // When a sector path renders at ring 0 (the final child), the center circle
  // suppresses its fill to avoid double-rendering, keeping only the border.
  const buildCenterEl = (morphItems, cm, defaultNode) => {
    const ci = morphItems.find(it => it.isCenter);
    if (!ci) return null;
    const ch = ci.centerHue ?? 0;
    const bo = ci.borderOp ?? 0;
    const fo = (ci.op ?? 0);
    const centerColor = toColorString(ch, { model: cm, df: 1 });
    const cpe = tunables.interactions ? "all" : "none";
    const ccf = tunables.interactions === true ? "pointer" : "default";
    const chandlers = tunables.interactions ? {
      onMouseEnter: (e) => handleHover(defaultNode, e),
      onMouseMove: (e) => handleHover(defaultNode, e),
      onMouseLeave: () => handleHover(null),
      ...(tunables.interactions === true ? { onClick: up } : {}),
    } : {};
    if (render === "wireframe") {
      return (
        <circle
          cx={400} cy={400} r={RING_RADII[0][1]}
          fill="none"
          stroke={centerColor}
          strokeWidth={1}
          strokeOpacity={fo}
          style={{ pointerEvents: cpe, cursor: ccf }}
          {...chandlers}
        />
      );
    }
    return (
      <circle
        cx={400} cy={400} r={RING_RADII[0][1]}
        fill={centerColor}
        fillOpacity={fo}
        stroke={bo > 0.01 ? ROOT_CENTER_BORDER : null} strokeWidth={bo > 0.01 ? 1.2 : 0} strokeOpacity={bo}
        style={{ pointerEvents: cpe, cursor: ccf }}
        {...chandlers}
      />
    );
  };

  if (a) {
    items = morphLayout(a.parent, a.child, a.p, tunables).filter(visible);
    centerEl = buildCenterEl(items, colorModel, a.toNode);
  } else {
    items = (sortP != null
      ? sortLayout(current, sortP, tunables)
      : placed.filter((n) => n._ring >= 1).map((n) => ({ node: n, ring: n._ring, start: n._start, span: n._span, op: 1 }))
    ).filter(visible);
    const centerHue = coloring === "size" ? sizeHue(current.size, maxSize)
      : coloring === "lastUpdated" ? lastUpdatedHue(current.mtime, mtimeRange.min, mtimeRange.max)
      : current._hue;
    const centerColor = isRoot ? "transparent" : toColorString(centerHue ?? 0, { model: colorModel, df: 1 });
    const cpe = tunables.interactions ? "all" : "none";
    const ccf = tunables.interactions === true ? (isRoot ? "default" : "pointer") : "default";
    const chandlers = tunables.interactions ? {
      onMouseEnter: (e) => { if (tunables.interactions === true) setCenterHovered(true); handleHover(current, e); },
      onMouseMove: (e) => handleHover(current, e),
      onMouseLeave: () => { setCenterHovered(false); handleHover(null); },
      ...(tunables.interactions === true ? { onClick: up } : {}),
    } : {};
    if (render === "wireframe") {
      centerEl = (
        <circle ref={centerRef}
          cx={400} cy={400} r={RING_RADII[0][1]}
          fill="none"
          stroke={isRoot ? ROOT_CENTER_BORDER : centerColor}
          strokeWidth={1}
          strokeOpacity={isRoot ? 1 : Math.max(co, 0.001)}
          style={{ pointerEvents: cpe, cursor: ccf }}
          {...chandlers}
        />
      );
    } else {
      centerEl = (
        <circle ref={centerRef}
          cx={400} cy={400} r={RING_RADII[0][1]}
          fill={centerColor}
          fillOpacity={isRoot ? 0 : Math.max(co, 0.001)}
          stroke={isRoot ? ROOT_CENTER_BORDER : null} strokeWidth={isRoot ? 1.2 : 0}
          style={{ pointerEvents: cpe, cursor: ccf }}
          {...chandlers}
        />
      );
    }
  }

  // Suppress center circle in rings view mode
  if (view === "rings") centerEl = null;

  // Filter and deduplicate sector items. The morph legitimately emits the same
  // node twice (from-side shrinking + to-side growing) — deduplicate by key
  // keeping the higher-op copy to prevent duplicate-key attribute inheritance
  // across sectors (flicker). Keep ring<1 items (final child sliding past ring 0
  // during drill-in) as DOM-invisible fillOpacity=0 elements so React doesn't
  // remove many sibling elements at once when they cross the ring≥1 boundary at
  // p≈0.5, which creates a visible white gap before the path child grows to fill
  // the ring. The ring<1 filter only applies during drill-in (p0<p1): during back
  // the final child returns from ring 0→1 with op going 0→1 and must not be dropped.
  const dedup = new Map();
  for (const it of items) {
    if (it.isCenter) continue;
    if (a && a.p0 < a.p1 && it.ring < 1 && (it.op ?? 1) > 0.01) continue;
    if (!tunables.filesSpecial && (it.node.type === "file" || it.node.type === "smaller")) continue;
    if (it.span <= 0.2) continue;
    const key = keyFor(it);
    const prev = dedup.get(key);
    if (!prev || (it.op ?? 0) > (prev.op ?? 0)) dedup.set(key, it);
  }
  const sectorItems = [...dedup.values()];


  // Compute rotation: static view uses angularOffsetRef. During animation the
  // SVG rotation is phase-gated at p=0.5 (frozen during pre-stage, interpolated
  // during the morph), matching the anchorCenter unwind in morphLayout which
  // also uses pMorph timing. This keeps the geometry and rotation/anchor unwind
  // on the same clock, eliminating the child-center drift that occurs when
  // rotation uses a different easing curve than the geometry lerp (especially
  // for multi-level morphs where childStart lerps from oldCenter to anchorCenter
  // using pMorph timing). During pre-stage (p≤0.5) the map does not rotate —
  // it is a pure opacity phase. At p=0.5 the rotation starts with derivative 0
  // (easeInOut has 0 slope at t=0), so there is no velocity discontinuity.
  const pm = easeInOut(Math.max(0, (a ? a.p : 0) - 0.5) / 0.5);
  let rotateAngle = 0;
  if (a) {
    if (a.p0 < a.p1) {
      // Drill-in: rotation interpolates from oldOffset to newOffset during the
      // morph phase (p∈[0.5,1]) using easeInOut(pMorphRaw) — same clock as the
      // geometry's pMorph. Frozen at oldOffset during pre-stage (p<0.5).
      rotateAngle = lerpAngle(a.oldOffset ?? 0, a.newOffset ?? 0, pm);
    } else {
      // Back: rotation interpolates from oldOffset (p=1, child's view) to
      // newOffset=0 (p=0.5, parent's view) during the morph phase, then stays
      // at newOffset=0 during the post-stage (p<0.5).
      rotateAngle = lerpAngle(a.newOffset ?? 0, a.oldOffset ?? 0, pm);
    }
  } else if (!isRoot && angularOffsetRef.current) {
    rotateAngle = angularOffsetRef.current;
  }

  return (
    <>
      <svg id="map" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-label="Disk usage sunburst map" style={{ width: "100%" }}>
        {rotateAngle ? (
          <g transform={`rotate(${rotateAngle} 400 400)`}>
            {centerEl}
            {sectorItems.map((it, i) => (
              <Sector key={keyFor(it)}
                node={it.node} ring={it.ring} start={it.start} span={it.span} op={it.op}
                bounds={bounds} coloring={coloring} render={render} maxSize={maxSize} mtimeRange={mtimeRange}
                interactions={tunables.interactions} onHover={handleHover} onDrill={drill}
                hoverOpacityDip={tunables.hoverOpacityDip} pulseDuration={tunables.pulseDuration} animating={animating}
                colorModel={colorModel} depthColor={depthColor} maxRings={maxRings}
                lightSaturation={tunables.lightSaturation} lightLightness={tunables.lightLightness}
                lightOklchLightness={tunables.lightOklchLightness} lightOklchChroma={tunables.lightOklchChroma} />
            ))}
          </g>
        ) : (
          <>
            {centerEl}
            {sectorItems.map((it, i) => (
              <Sector key={keyFor(it)}
                node={it.node} ring={it.ring} start={it.start} span={it.span} op={it.op}
                bounds={bounds} coloring={coloring} render={render} maxSize={maxSize} mtimeRange={mtimeRange}
                interactions={tunables.interactions} onHover={handleHover} onDrill={drill}
                hoverOpacityDip={tunables.hoverOpacityDip} pulseDuration={tunables.pulseDuration} animating={animating}
                colorModel={colorModel} depthColor={depthColor} maxRings={maxRings}
                lightSaturation={tunables.lightSaturation} lightLightness={tunables.lightLightness}
                lightOklchLightness={tunables.lightOklchLightness} lightOklchChroma={tunables.lightOklchChroma} />
            ))}
          </>
        )}
        {tunables.ringLanes && (
          <g className="ring-lanes" style={{ pointerEvents: "none" }}>
            {bounds.slice(1).map((r, i) => (
              <circle key={`lane-${i}`} cx={CX} cy={CY} r={r}
                fill="none"
                stroke={theme === "light" ? GREY_LIGHT : GREY}
                strokeWidth={RING_LANE_WIDTH}
                strokeOpacity={RING_LANE_OPACITY} />
            ))}
          </g>
        )}
      </svg>
      {tunables.interactions && (
        <div id="hint" style={{
          left: hover?.x ?? 0,
          top: hover?.y ?? 0,
          opacity: hover ? 1 : 0,
          pointerEvents: "none",
        }}>
          {hover && (
            <>
              <div className="name">{hover.node.name}</div>
              <div className="size">{formatSize(hover.node.size)}</div>
            </>
          )}
        </div>
      )}
      {previewActive && (
        <div id="preview-badge">Preview — timeline scrubbing; breadcrumb shows the live folder</div>
      )}
    </>
  );
});