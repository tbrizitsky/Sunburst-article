import React, { useState, useCallback, useMemo } from "react";
import { Treemap, TREEMAP_TUNABLE_META, defaultTreemapTunables } from "./Treemap.jsx";
import { disk, workstation } from "./sample-data.js";
import { WidgetSlider, WidgetSelect, WidgetToggle } from "./widget-controls.jsx";

const DATASETS = { disk, workstation };

export function TreemapWidget({ directive }) {
  const { data: dataName = "disk", controls = [], locked = {}, caption } = directive;

  const [tunables, setTunables] = useState(() => {
    const t = defaultTreemapTunables();
    for (const [k, v] of Object.entries(locked)) t[k] = v;
    return t;
  });

  const ASPECT_VALUES = { "16:9": 16 / 9, "3:2": 3 / 2, "1:1": 1 };

  const setTunable = useCallback((name, value) => {
    setTunables(prev => ({ ...prev, [name]: value }));
  }, []);

  const controlDefs = (Array.isArray(controls) ? controls : []).map(c =>
    typeof c === "string" ? { name: c } : c
  );
  const controlNames = controlDefs.map(c => c.name);
  const data = DATASETS[dataName] || disk;

  const opts = useMemo(() => {
    const o = { ...tunables };
    for (const [k, v] of Object.entries(locked)) {
      if (!controlNames.includes(k)) o[k] = v;
    }
    return o;
  }, [tunables, locked, controlNames]);
  const aspectRatio = ASPECT_VALUES[opts.aspectRatio ?? "16:9"];

  return (
    <div className="sunburst-widget">
      <div className="sunburst-widget-map">
        <Treemap
          data={data}
          algorithm={opts.algorithm}
          cushion={opts.cushion}
          coloring={opts.coloring}
          colorModel={opts.colorModel}
          visibilityThreshold={opts.visibilityThreshold}
          aspectRatio={aspectRatio}
        />
      </div>
      {controlNames.includes("aspectRatio") && (
        <WidgetSelect className="treemap-aspect-select" name="aspectRatio"
          options={Object.keys(ASPECT_VALUES)}
          value={opts.aspectRatio ?? "16:9"}
          onChange={(v) => setTunable("aspectRatio", v)} />
      )}
      {caption && caption !== "none" && <p className="sunburst-widget-caption">{caption}</p>}
      {controlNames.length > 0 && (
        <div className="sunburst-widget-controls">
          {controlNames.map((name) => {
            const meta = TREEMAP_TUNABLE_META[name];
            if (!meta) return null;
            const value = tunables[name] ?? meta.default;
            if (meta.type === "select") {
              return <WidgetSelect key={name} name={name} label={meta.label}
                options={meta.options}
                value={value} onChange={(v) => setTunable(name, v)} />;
            }
            if (meta.type === "toggle") {
              return <WidgetToggle key={name} name={name} label={meta.label}
                value={value} onChange={(v) => setTunable(name, v)} />;
            }
            if (meta.type === "slider") {
              return <WidgetSlider key={name} name={name} label={meta.label}
                min={meta.min} max={meta.max} step={meta.step}
                value={value} onChange={(v) => setTunable(name, v)} />;
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
