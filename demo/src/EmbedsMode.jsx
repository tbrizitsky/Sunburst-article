import React, { useState } from "react";
import { Treemap } from "./Treemap.jsx";
import { IcicleSunburstMorph } from "./IcicleSunburstMorph.jsx";
import { StaskoSunburst } from "./StaskoSunburst.jsx";
import { SunburstHueWidget } from "./SunburstHueWidget.jsx";
import { SunburstPlayground } from "./SunburstPlayground.jsx";
import { SunburstMvp } from "./SunburstMvp.jsx";
import { SunburstGeometryWidget } from "./SunburstGeometryWidget.jsx";
import { disk, workstation } from "./sample-data.js";
import { WidgetSlider, WidgetSelect, WidgetToggle } from "./widget-controls.jsx";

const DATASETS = { disk, workstation };
const ASPECT_VALUES = { "16:9": 16 / 9, "3:2": 3 / 2, "1:1": 1 };

const EMBEDS = [
  {
    id: "treemap",
    label: "Treemap",
    Component: Treemap,
    controls: [
      { name: "dataset",    label: "Dataset",     type: "select", options: ["disk", "workstation"] },
      { name: "algorithm",  label: "Algorithm",   type: "select", options: ["sliceAndDice", "squarified", "strip"] },
      { name: "cushion",    label: "Cushion",     type: "toggle" },
      { name: "coloring",   label: "Coloring",    type: "select", options: ["wheel", "size", "lastUpdated", "none"] },
      { name: "colorModel", label: "Color model", type: "select", options: ["hsl", "oklch"] },
      { name: "aspectRatio", label: "Aspect",     type: "select", options: ["16:9", "3:2", "1:1"] },
    ],
    defaults: { dataset: "disk", algorithm: "sliceAndDice", cushion: false, coloring: "wheel", colorModel: "hsl", aspectRatio: "16:9" },
  },
  {
    id: "icicle",
    label: "Icicle",
    Component: IcicleSunburstMorph,
    controls: [
      { name: "dataset",    label: "Dataset",     type: "select", options: ["disk", "workstation"] },
      { name: "coloring",   label: "Coloring",    type: "select", options: ["wheel", "size", "lastUpdated", "none"] },
      { name: "colorModel", label: "Color model", type: "select", options: ["hsl", "oklch"] },
      { name: "morph",      label: "Sunburst", type: "slider", min: 0, max: 1, step: 0.01, endLabel: "Icicle" },
    ],
    defaults: { dataset: "disk", coloring: "wheel", colorModel: "hsl", morph: 0 },
  },
  {
    id: "stasko",
    label: "Original Stasko",
    Component: StaskoSunburst,
    controls: [
      { name: "dataset",    label: "Dataset",     type: "select", options: ["disk", "workstation"] },
      { name: "ringWidth",  label: "Ring width",  type: "slider", min: 20, max: 80, step: 1, default: 50 },
    ],
    defaults: { dataset: "disk", ringWidth: 50 },
  },
  {
    id: "sunburst-mvp",
    label: "Sunburst MVP",
    Component: SunburstMvp,
    controls: [],
    defaults: {},
  },
  {
    id: "sunburst-hue",
    label: "Sunburst with color ring",
    Component: SunburstHueWidget,
    controls: [],
    defaults: {},
  },
  {
    id: "sunburst-playground",
    label: "Sunburst Playground",
    Component: SunburstPlayground,
    controls: [],
    defaults: {},
  },
  {
    id: "sunburst-geometry",
    label: "Sunburst Geometry",
    Component: SunburstGeometryWidget,
    controls: [],
    defaults: {},
  },
];

function CardControl({ def, value, onChange }) {
  if (def.type === "select") {
    return (
      <WidgetSelect name={def.name} label={def.label}
        options={def.options}
        value={value} onChange={onChange} />
    );
  }
  if (def.type === "toggle") {
    return (
      <WidgetToggle name={def.name} label={def.label}
        value={value} onChange={onChange} />
    );
  }
  if (def.type === "slider") {
    return (
      <WidgetSlider name={def.name} label={def.label}
        min={def.min ?? 0} max={def.max ?? 1} step={def.step ?? 0.01}
        value={value} onChange={onChange} endLabel={def.endLabel} />
    );
  }
  return null;
}

export function EmbedsMode() {
  const [stateByEmbed, setStateByEmbed] = useState(() => {
    const s = {};
    for (const e of EMBEDS) s[e.id] = { ...e.defaults };
    return s;
  });

  const setEmbedValue = (id, name, value) => {
    setStateByEmbed(prev => ({ ...prev, [id]: { ...prev[id], [name]: value } }));
  };

  return (
    <main style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "24px 16px",
      width: "100%",
      maxWidth: 800,
      margin: "0 auto",
    }}>
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 32,
        width: "100%",
      }}>
        {EMBEDS.map(({ id, label, Component, controls }) => {
          const state = stateByEmbed[id] || {};
          return (
            <div key={id} style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--surface-2)",
              }}>
                {label}
              </div>
              <div style={{ padding: 16 }}>
                <div className="sunburst-widget">
                  <div className="sunburst-widget-map">
                    {id === "sunburst-mvp" ? (
                      <Component directive={{ data: "disk", caption: "Sunburst MVP" }} />
                    ) : id === "sunburst-hue" ? (
                      <Component directive={{ data: "disk", controls: ["hueOffset", "colorModel", "showRing", "depthSL", "showPointer"] }} />
                    ) : id === "sunburst-playground" ? (
                      <Component directive={{ controls: ["files", "smallerObjects", "singleChildren"], caption: "Sunburst Playground" }} />
                    ) : id === "sunburst-geometry" ? (
                      <Component directive={{ controls: ["ringLevels", "growthRate", "smallerRings"], caption: "Sunburst Geometry" }} />
                    ) : id === "stasko" ? (
                      <Component
                        data={DATASETS[state.dataset] || disk}
                        ringWidth={state.ringWidth}
                      />
                    ) : (
                      <Component
                        data={DATASETS[state.dataset] || disk}
                        algorithm={state.algorithm}
                        cushion={state.cushion}
                        coloring={state.coloring}
                        colorModel={state.colorModel}
                        morph={state.morph}
                        visibilityThreshold={state.visibilityThreshold}
                        aspectRatio={ASPECT_VALUES[state.aspectRatio ?? "16:9"]}
                      />
                    )}
                  </div>
                  <div className="sunburst-widget-controls" style={{ marginTop: 12 }}>
                    {controls.map((def) => (
                      <CardControl
                        key={def.name}
                        def={def}
                        value={state[def.name]}
                        onChange={(v) => setEmbedValue(id, def.name, v)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}