import React, { useRef } from "react";
import { StaskoSunburst } from "./StaskoSunburst.jsx";
import { disk } from "./sample-data.js";
import { computeSizes } from "./layout.js";

export function StaskoWidget({ directive }) {
  const { data: dataName = "disk", ringWidth = 50, controls = [], caption } = directive;

  const data = dataName === "disk" ? disk : disk;

  const sizesDone = useRef(false);
  if (!sizesDone.current) { computeSizes(data); sizesDone.current = true; }

  return (
    <div className="sunburst-widget">
      <div className="sunburst-widget-map">
        <StaskoSunburst data={data} ringWidth={ringWidth} />
      </div>
      {caption && caption !== "none" && <p className="sunburst-widget-caption">{caption}</p>}
    </div>
  );
}
