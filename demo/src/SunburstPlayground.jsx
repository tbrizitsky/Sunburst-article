import React, { useState, useMemo, useCallback } from "react";
import { SunburstMap } from "./SunburstMap.jsx";
import { disk } from "./sample-data.js";
import { computeSizes, widgetNaturalSize } from "./layout.js";
import { WidgetToggle } from "./widget-controls.jsx";

function cloneTree(root) {
  return JSON.parse(JSON.stringify(root, (k, v) => k[0] === "_" ? undefined : v));
}

// Strip file children and absorb their sizes into parent folders.
// Returns the total size of all descendant files for the given node.
function stripFilesAndAbsorb(node) {
  if (node.type !== "folder" || !node.children) return node.size || 0;

  let absorbed = 0;
  const remaining = [];

  for (const c of node.children) {
    if (c.type === "file") {
      absorbed += c.size;
    } else {
      remaining.push(c);
      absorbed += stripFilesAndAbsorb(c);
    }
  }

  node.children = remaining;
  node.size = absorbed;
  return absorbed;
}

export function SunburstPlayground({ directive }) {
  const { controls = [], caption, files: filesDefault, smallerObjects: smallerObjectsDefault, singleChildren: singleChildrenDefault } = directive;

  const controlNames = (Array.isArray(controls) ? controls : []).map(c =>
    typeof c === "string" ? c : c.name
  );

  const [showFiles, setShowFiles] = useState(filesDefault ?? false);
  const [showSmallerObjects, setShowSmallerObjects] = useState(smallerObjectsDefault ?? false);
  const [showSingleChildren, setShowSingleChildren] = useState(singleChildrenDefault ?? false);

  const tree = useMemo(() => {
    const t = cloneTree(disk);
    if (!showFiles) {
      stripFilesAndAbsorb(t);
    } else {
      computeSizes(t);
    }
    return t;
  }, [showFiles]);

  const opts = useMemo(() => ({
    maxRings: 5,
    sorting: "size",
    coloring: "wheel",
    smallerObjects: showFiles && showSmallerObjects,
    interactions: "tooltips",
    filesSpecial: true,
    visibilityThreshold: 0,
    hoverOpacityDip: 0,
    THETA_MIN: showFiles && showSmallerObjects ? 2 : 0,
    ringCull: !showSingleChildren,
  }), [showFiles, showSmallerObjects, showSingleChildren]);

  const handleNavigate = useCallback(() => {}, []);

  // Compute viewBox once from the full tree (with files) so it doesn't jump
  // when toggling files on/off (different tree depth → different tight bounds).
  const { viewBox } = useMemo(() => {
    const full = cloneTree(disk);
    computeSizes(full);
    return widgetNaturalSize({ maxRings: 5, interactions: false }, full);
  }, []);

  return (
    <div className="sunburst-widget">
      <div className="sunburst-widget-map">
        <SunburstMap data={tree} current={tree} onNavigate={handleNavigate}
          opts={opts} viewBox={viewBox} />
      </div>
      {caption && caption !== "none" && <p className="sunburst-widget-caption">{caption}</p>}
      {controlNames.length > 0 && (
        <div className="sunburst-widget-controls">
          {controlNames.includes("files") && (
            <WidgetToggle name="files" label="Show files"
              value={showFiles}
              onChange={(v) => setShowFiles(v)} />
          )}
          {controlNames.includes("smallerObjects") && (
            <WidgetToggle name="smallerObjects" label="Aggregate small objects"
              value={showSmallerObjects}
              onChange={(v) => setShowSmallerObjects(v)} />
          )}
          {controlNames.includes("singleChildren") && (
            <WidgetToggle name="singleChildren" label="Display single children"
              value={showSingleChildren}
              onChange={(v) => setShowSingleChildren(v)} />
          )}
        </div>
      )}
    </div>
  );
}
