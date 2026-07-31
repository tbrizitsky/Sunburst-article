import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { SunburstMap } from "./SunburstMap.jsx";
import { disk } from "./sample-data.js";
import { computeSizes, widgetNaturalSize } from "./layout.js";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { WidgetSlider, WidgetSelect, WidgetToggle } from "./widget-controls.jsx";

const prefersReducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

// ---- Tunable definitions (mirrors DialKit's schema) ----

export const TUNABLE_META = {
  maxRings: { label: "Max rings", type: "slider", min: 1, max: 20, step: 1, default: 10 },
  ringMode: { label: "Ring mode", type: "select", options: ["small", "grow", "shrink"], default: "small" },
  ringMultiplier: { label: "Ring multiplier", type: "slider", min: 0.5, max: 1.5, step: 0.05, default: 1.0 },
  sorting: { label: "Sorting", type: "select", options: ["size", "name"], default: "size" },
  coloring: { label: "Coloring", type: "select", options: ["wheel", "size", "lastUpdated", "none"], default: "wheel" },
  colorModel: { label: "Color model", type: "select", options: ["hsl", "oklch"], default: "hsl" },
  depthColor: { label: "Depth color", type: "toggle", default: false },
  render: { label: "Render", type: "select", options: ["full", "wireframe"], default: "full" },
  interactions: { label: "Interactions", type: "toggle", default: true },
  filesSpecial: { label: "Files and special objects", type: "toggle", default: true },
  animateNavigation: { label: "Animation", type: "toggle", default: true },
  visibilityThreshold: { label: "Visibility threshold", type: "slider", min: 0, max: 10, step: 0.5, default: 0 },
  smallerObjects: { label: "Smaller objects", type: "toggle", default: true },
  centerOpacity: { label: "Center opacity", type: "slider", min: 0, max: 1, step: 0.05, default: 0 },
};

function defaultTunables() {
  const t = {};
  for (const [k, v] of Object.entries(TUNABLE_META)) t[k] = v.default;
  return t;
}

// ---- SunburstWidget ----

export function SunburstWidget({ directive }) {
  const { data: dataName = "disk", controls = [], scroll = [], view, locked = {}, caption, breadcrumb } = directive;

  // Resolve data
  const data = dataName === "disk" ? disk : disk; // only disk for now

  // Compute sizes once
  const sizesDone = useRef(false);
  if (!sizesDone.current) { computeSizes(data); sizesDone.current = true; }

  // Widget-level tunable state (overrides from controls + locked)
  const [tunables, setTunables] = useState(() => {
    const t = defaultTunables();
    for (const [k, v] of Object.entries(locked)) t[k] = v;
    return t;
  });

  // Navigation state
  const [current, setCurrent] = useState(data);
  const sunburstRef = useRef();

  // Interactive breadcrumb (opt-in via `breadcrumb`): the path from the root to
  // `current`. Ancestors navigate via the map's imperative handle (morphing when
  // animateNavigation is on, hard-cutting when off).
  const breadcrumbItems = useMemo(() => {
    if (!breadcrumb) return [];
    const parentMap = sunburstRef.current?.getParents() ?? new WeakMap();
    const path = [];
    let node = current;
    while (node) {
      path.unshift(node);
      node = parentMap.get(node);
    }
    return path.map((node, i, arr) => ({
      name: node.name,
      onClick: i < arr.length - 1 ? () => sunburstRef.current?.navigateTo(node) : undefined,
    }));
  }, [breadcrumb, current]);

  // Build the controls whitelist from the directive
  // controls is an array of {name, ...params} objects, or bare strings (normalized to {name})
  const controlDefs = (Array.isArray(controls) ? controls : []).map(c =>
    typeof c === "string" ? { name: c } : c
  );
  const controlNames = controlDefs.map(c => c.name);

  // Merge directive params into TUNABLE_META for each control
  const controlMeta = {};
  for (const def of controlDefs) {
    const base = TUNABLE_META[def.name];
    if (base) controlMeta[def.name] = { ...base, ...def };
  }

  // Handle control changes
  const setTunable = useCallback((name, value) => {
    setTunables(prev => ({ ...prev, [name]: value }));
  }, []);

  // ---- Scroll staging ----
  const widgetRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion || scroll.length === 0) return;
    const el = widgetRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const rect = entry.boundingClientRect;
            const viewportH = window.innerHeight;
            // Progress: 0 when bottom of widget enters viewport, 1 when top exits
            const progress = Math.max(0, Math.min(1,
              (viewportH - rect.bottom) / (rect.height + viewportH)
            ));
            setScrollProgress(progress);
          }
        }
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scroll.length]);

  // Apply scroll keyframes to tunables
  useEffect(() => {
    if (scroll.length === 0) return;
    // Find the two keyframes that bracket the current progress
    let before = scroll[0];
    let after = scroll[scroll.length - 1];
    for (let i = 0; i < scroll.length - 1; i++) {
      if (scrollProgress >= scroll[i].at && scrollProgress <= scroll[i + 1].at) {
        before = scroll[i];
        after = scroll[i + 1];
        break;
      }
    }
    if (before.at === after.at) {
      setTunables(prev => ({ ...prev, ...before.set }));
      return;
    }
    // Interpolate between before and after
    const t = (scrollProgress - before.at) / (after.at - before.at);
    const interpolated = {};
    for (const key of Object.keys(before.set)) {
      const bv = before.set[key];
      const av = after.set[key];
      if (typeof bv === "number" && typeof av === "number") {
        interpolated[key] = bv + (av - bv) * t;
      } else {
        interpolated[key] = t < 0.5 ? bv : av;
      }
    }
    setTunables(prev => ({ ...prev, ...interpolated }));
  }, [scrollProgress, scroll]);

  // Build opts for SunburstMap from tunables + locked + view
  const opts = useMemo(() => {
    const o = { ...tunables, view };
    if (!tunables.interactions) o.viewBoxMargin = 0;
    for (const [k, v] of Object.entries(locked)) {
      if (!controlNames.includes(k)) o[k] = v;
    }
    return o;
  }, [tunables, view, locked, controlNames]);

  // Compute viewBox from ring geometry
  const { viewBox } = useMemo(() => widgetNaturalSize(opts, data), [opts.maxRings, opts.ringMode, opts.ringMultiplier, data]);

  return (
    <div className="sunburst-widget" ref={widgetRef}>
      {breadcrumbItems.length > 0 && (
        <Breadcrumb className="sunburst-widget-breadcrumb">
          <BreadcrumbList>
            {breadcrumbItems.map((item, i) => (
              <React.Fragment key={`${item.name}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {item.onClick ? (
                    <BreadcrumbLink render={<button onClick={item.onClick} />}>{item.name}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.name}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="sunburst-widget-map">
        <SunburstMap ref={sunburstRef} data={data} current={current} onNavigate={setCurrent}
          opts={opts} viewBox={viewBox} />
      </div>
      {caption && caption !== "none" && <p className="sunburst-widget-caption">{caption}</p>}
      {controlNames.length > 0 && (
        <div className="sunburst-widget-controls">
          {controlNames.map((name) => {
            const meta = controlMeta[name] || TUNABLE_META[name];
            if (!meta) return null;
            const value = tunables[name] ?? meta.default;
            if (meta.type === "slider") {
              return <WidgetSlider key={name} name={name} label={meta.label}
                min={meta.min} max={meta.max} step={meta.step}
                value={value} onChange={(v) => setTunable(name, v)} />;
            }
            if (meta.type === "select") {
              return <WidgetSelect key={name} name={name} label={meta.label}
                options={meta.options}
                value={value} onChange={(v) => setTunable(name, v)} />;
            }
            if (meta.type === "toggle") {
              return <WidgetToggle key={name} name={name} label={meta.label}
                value={value} onChange={(v) => setTunable(name, v)} />;
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
