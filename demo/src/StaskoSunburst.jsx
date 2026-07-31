import React, { useMemo, useState, useCallback } from "react";
import {
  computeSizes, layout, sectorPath, formatSize,
  CX, CY,
} from "./layout.js";
import { disk } from "./sample-data.js";
import { useTheme } from "./use-theme.js";

const CENTER_RADIUS = 70;
const RING_WIDTH = 50;
const ANGLE_GAP = 0.2 * Math.PI / 180;

const FILE_TYPE_HUES = {
  app: 0,
  document: 60,
  image: 120,
  video: 180,
  audio: 240,
  code: 300,
  data: 330,
  archive: 20,
  system: 280,
  other: 0,
};

const EXTENSION_MAP = {
  app: ["app", "exe"],
  document: ["doc", "pdf", "txt", "rtf", "pages"],
  image: ["jpg", "jpeg", "png", "gif", "tiff", "bmp", "psd", "photoslibrary"],
  video: ["mov", "mp4", "avi", "mkv", "wmv"],
  audio: ["mp3", "wav", "aac", "flac", "m4a"],
  code: ["js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "swift", "go", "rs", "rb", "php"],
  data: ["json", "xml", "csv", "yaml", "yml", "sql", "db", "sqlite", "bin"],
  archive: ["zip", "tar", "gz", "rar", "7z", "dmg"],
  system: ["sys", "dll", "so", "dylib", "o", "obj", "kext", "framework", "sym", "DS_Store", "Spotlight-V100"],
};

const NAME_PATTERN_CATEGORIES = [
  { pattern: /^app-/i, category: "app" },
  { pattern: /^(xcode|safari|mail|notes|maps|music|terminal)$/i, category: "app" },
  { pattern: /^(plugin|plugIn|comp|hook|util|tf|cfg|handler|cj|umd|mod|fp|lod|header|Obj)/i, category: "code" },
  { pattern: /^(Fwk|Fw|lib|dylib|kext|Device|xcb|xcl|swapfile|etc|tmp|cs-|CS$)/i, category: "system" },
  { pattern: /^(Resource|Res|R-|Cache|log|Profile|plist|db|asset|rootfile|pub|sh|CD-|SL-|DD-|PrefPane|Backup)/i, category: "data" },
  { pattern: /^(img|ph-)/i, category: "image" },
  { pattern: /^mov-/i, category: "video" },
];

function nameHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h |= 0;
  }
  return ((Math.abs(h) % 330) + 15) % 360;
}

function getFileType(name) {
  if (!name || typeof name !== "string") return "other";
  const lower = name.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < lower.length - 1) {
    const ext = lower.slice(dotIndex + 1);
    for (const [category, extensions] of Object.entries(EXTENSION_MAP)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
  }
  for (const { pattern, category } of NAME_PATTERN_CATEGORIES) {
    if (pattern.test(lower)) return category;
  }
  return "other";
}

function fillFor(node, theme) {
  if (node.type === "free") return { fill: "transparent", stroke: "none", alpha: 0 };
  if (node.type === "folder") {
    const stroke = node.name && node.name.toLowerCase().endsWith(".app")
      ? "hsl(0, 70%, 55%)"
      : theme === "light" ? "hsl(0, 0%, 52.8%)" : "hsl(0, 0%, 60%)";
    return { fill: "none", stroke, alpha: 1 };
  }
  if (node.type === "smaller") {
    return { fill: "hsl(0, 0%, 50%)", stroke: "none", alpha: 0.5 };
  }
  const fileType = getFileType(node.name);
  const isOther = fileType === "other";
  const hue = isOther ? nameHue(node.name) : (FILE_TYPE_HUES[fileType] || 0);
  const saturation = isOther ? 40 : 70;
  const lightness = theme === "light" ? 60 : 55;
  return { fill: `hsl(${hue}, ${saturation}%, ${lightness}%)`, stroke: "none", alpha: 1 };
}

function Sector({ node, ring, start, span, bounds, theme, ringWidth, onHover }) {
  const [r0, r1] = [CENTER_RADIUS + (ring - 1) * ringWidth, CENTER_RADIUS + ring * ringWidth];
  const a0 = start + ANGLE_GAP / 2;
  const a1 = start + span - ANGLE_GAP / 2;
  if (a1 <= a0) return null;
  const { fill, stroke, alpha } = fillFor(node, theme);
  return (
    <path
      d={sectorPath(r0, r1, a0, a1)}
      fill={fill}
      fillOpacity={fill !== "none" ? alpha : undefined}
      stroke={stroke !== "none" ? stroke : undefined}
      strokeWidth={stroke !== "none" ? 1 : undefined}
      strokeOpacity={stroke !== "none" ? 1 : undefined}
      onMouseEnter={(e) => onHover({ name: node.name, size: node.size, type: node.type, x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => onHover({ name: node.name, size: node.size, type: node.type, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHover(null)}
    />
  );
}

export function StaskoSunburst({ data = disk, ringWidth = RING_WIDTH }) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(null);

  const handleRootHover = useCallback((e) => {
    if (e === null) { setHovered(null); return; }
    setHovered({ name: data.name || "Root", size: data.size, type: "folder", x: e.clientX, y: e.clientY });
  }, [data]);

  const placed = useMemo(() => {
    const clonedData = JSON.parse(JSON.stringify(data, (k, v) => k === '_parent' ? undefined : v));
    function stripFree(node) {
      if (node.type === "free") return null;
      if (node.children) {
        node.children = node.children.map(stripFree).filter(Boolean);
      }
      return node;
    }
    const cleaned = stripFree(clonedData);
    if (!cleaned) return [];
    computeSizes(cleaned);
    return layout(cleaned, { smallerObjects: false, maxRings: 100, sorting: "name", THETA_MIN: 0 });
  }, [data]);

  const totalRadius = CENTER_RADIUS + (placed.reduce((max, n) => Math.max(max, n._ring || 0), 0)) * ringWidth;
  const margin = 40;
  const dim = 2 * (totalRadius + margin);
  const viewBox = `${CX - dim / 2} ${CY - dim / 2} ${dim} ${dim}`;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Stasko original Sunburst visualization"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <circle
          cx={CX}
          cy={CY}
          r={CENTER_RADIUS}
          fill="none"
          stroke={theme === "light" ? "hsl(0, 0%, 52.8%)" : "hsl(0, 0%, 60%)"}
          strokeWidth={1}
          onMouseEnter={handleRootHover}
          onMouseMove={handleRootHover}
          onMouseLeave={() => setHovered(null)}
        />
        {placed.filter((n) => n._ring >= 1).map((node) => (
          <Sector
            key={`${node.name}-${node._ring}-${node._start}`}
            node={node}
            ring={node._ring}
            start={node._start}
            span={node._span}
            bounds={null}
            theme={theme}
            ringWidth={ringWidth}
            onHover={setHovered}
          />
        ))}
      </svg>
      {hovered && (
        <div style={{
          position: "fixed",
          left: hovered.x + 12,
          top: hovered.y - 12,
          transform: "translateY(-100%)",
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 8px",
          fontSize: 13,
          color: "var(--text-primary)",
          pointerEvents: "none",
          zIndex: 1000,
          whiteSpace: "nowrap",
        }}>
          {hovered.name} — {formatSize(hovered.size)}
        </div>
      )}
    </div>
  );
}
