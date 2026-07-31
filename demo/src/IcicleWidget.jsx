import React, { useState, useCallback, useMemo } from "react";
import { ICICLE_TUNABLE_META, defaultIcicleTunables } from "./Icicle.jsx";
import { IcicleSunburstMorph } from "./IcicleSunburstMorph.jsx";
import { disk, workstation } from "./sample-data.js";
import { WidgetSlider, WidgetSelect, WidgetToggle } from "./widget-controls.jsx";

const DATASETS = { disk, workstation };

export function IcicleWidget({ directive }) {
  const { data: dataName = "disk", controls = [], locked = {}, caption, bare } = directive;

  const [tunables, setTunables] = useState(() => {
    const t = defaultIcicleTunables();
    for (const [k, v] of Object.entries(locked)) t[k] = v;
    return t;
  });

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

  return (
    <div className="sunburst-widget">
      <div className="sunburst-widget-map">
        <IcicleSunburstMorph
          data={data}
          morph={1 - opts.morph}
          coloring={opts.coloring}
          colorModel={opts.colorModel}
          visibilityThreshold={opts.visibilityThreshold}
        />
      </div>
      {caption && caption !== "none" && <p className="sunburst-widget-caption">{caption}</p>}
      {controlNames.length > 0 && (
        <div className="sunburst-widget-controls">
          {controlNames.map((name) => {
            const meta = ICICLE_TUNABLE_META[name];
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
                value={value} onChange={(v) => setTunable(name, v)}
                bare={bare === name}
                endLabel={name === "morph" ? "Icicle" : undefined} />;
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
