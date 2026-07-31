# Stasko Original Sunburst — Specification

This spec defines a **static** Sunburst widget that replicates the visualization described in John Stasko's original SunBurst project (GVU, Georgia Tech, ~1996-2000). See https://sites.cc.gatech.edu/gvu/ii/sunburst.

This widget is **read-only**: no navigation, no animation, no hover interactions. It is a faithful recreation of the visual encoding from Stasko's papers and screenshots.

## 1. Overview

The Stasko Sunburst is a radial, space-filling visualization of hierarchical data. Like our spec'd Sunburst Map, it uses:
- Concentric rings for depth levels
- Sectors sized proportionally to node size (angle ∝ size)
- Root at the center, deeper levels outward

**Key differences from our Sunburst Map spec:**
| Aspect | Our Sunburst Map | Stasko Original |
|--------|------------------|-----------------|
| **Color encoding** | Folders: hue by angular position (frozen); Files/smaller: neutral grey | **File type** (by extension/category); Folders: distinct neutral or type-inherited |
| **Smaller objects** | Consolidated bucket per level | **Disabled** — all items shown individually |
| **Free space** | Shown at root as transparent sector | **Hidden** — not part of the visualization |
| **Interactions** | Click to drill, hover hints, animated navigation | **None** — static visualization only |
| **Labels** | Not in v1 (spec §9) | Optional in papers; **disabled** for this widget |

## 2. Data Model

Same as `sunburst-map.md` §2, with the following notes:
- `free` nodes are **ignored** (not rendered)
- `smaller` nodes are **not generated** (no consolidation)
- File types are inferred from the `name` field (extension-based)

## 3. Layout

Identical to `sunburst-map.md` §4, except:
- **No "smaller objects" bucket** — every child is rendered as its own sector, regardless of angular size
- **No free space sector** — the `free` node at root is skipped
- **No max depth limit** — render all levels present in the data (no ring cap)
- Sorting: **alphabetical by name** (matches native filesystem order; differs from our size-based sorting)
- Angular span: proportional to size (same as our spec)
- Ring width: **uniform** (all rings same width; no large/small tier distinction)

### Ring Geometry
- Center circle: 50px radius (same as binding)
- All rings: **30px width** (uniform; differs from our two-tier 50px/16px)
- No inter-ring gaps (sectors touch radially)
- Minimal angular gaps (1px stroke or 0.2° gap)

## 4. Color

**File-type-based hue mapping** — the defining characteristic of Stasko's visualization.

### File Type Categories
File types are determined by extension, grouped into categories:

| Category | Extensions | Hue |
|----------|------------|-----|
| **Applications** | `.app`, `.exe`, `.app/` (folder contents) | 0° (red) |
| **Documents** | `.doc`, `.pdf`, `.txt`, `.rtf`, `.pages` | 60° (yellow-orange) |
| **Images** | `.jpg`, `.jpeg`, `.png`, `.gif`, `.tiff`, `.bmp`, `.psd` | 120° (green) |
| **Video** | `.mov`, `.mp4`, `.avi`, `.mkv`, `.wmv` | 180° (cyan) |
| **Audio** | `.mp3`, `.wav`, `.aac`, `.flac`, `.m4a` | 240° (blue) |
| **Code** | `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.c`, `.cpp`, `.h`, `.swift`, `.go`, `.rs`, `.rb`, `.php` | 300° (magenta) |
| **Data** | `.json`, `.xml`, `.csv`, `.yaml`, `.yml`, `.sql`, `.db`, `.sqlite` | 330° (pink) |
| **Archives** | `.zip`, `.tar`, `.gz`, `.rar`, `.7z`, `.dmg` | 20° (orange) |
| **System** | `.sys`, `.dll`, `.so`, `.dylib`, `.o`, `.obj`, `.kext`, `.framework` | 280° (purple) |
| **Other/Unknown** | no extension or unrecognized | 0° (grey, desaturated) |

### Folder Coloring
Folders do **not** receive hue based on position. Instead:
- Folders are rendered with a **neutral, low-saturation color** (grey or desaturated tone)
- This distinguishes them from file-type-colored sectors
- Suggested: `hsl(0, 0%, 60%)` (medium grey) or `hsl(0, 0%, 70%)` (lighter grey)

### Color Model
- **HSL** (matching the era of Stasko's work)
- Saturation: **70%** for file types
- Lightness: **55%** for file types (dark mode compatible)
- Folders: **0% saturation** (grey)

### No Depth Factor
Unlike our spec's optional `depthColor` (progressive desaturation), Stasko's original used **uniform saturation** across all depths.

## 5. Interactions

**None.** This is a static visualization:
- No hover hints
- No click navigation
- No animation
- No center-circle drill-up

## 6. Dataset

Uses the same `disk` and `workstation` datasets from `sample-data.js`. The widget respects the dataset structure but:
- Ignores `free` nodes (not rendered)
- Does not generate `smaller` buckets
- Renders all levels (no ring cap)

## 7. Demo App

- **Placement**: Inside the "Embeds" tab, alongside Treemap and Icicle widgets
- **Controls**: Minimal
  - Dataset selector (`disk` / `workstation`)
  - Optional: ring width slider (20-50px, default 30px)
- **No DialKit debug panel** for this widget (static reference implementation)

## 8. Edge Cases

- **Empty folder**: Renders as a grey sector with no sub-sectors
- **Single child**: Occupies full 360° of its ring
- **Zero-size items**: Excluded from layout (same as our spec)
- **No extension**: Treated as "Other/Unknown" category
- **Folder without extension**: Always grey (never hue-coded)

## 9. Out of Scope

- Labels on sectors (Stasko's papers show them, but this widget is label-free)
- File age coloring (Stasko showed this as an alternative view; not implemented here)
- Focus+Context techniques (Angular Detail, Detail Inside, Detail Outside — see Stasko's InfoVis '00 paper)
- Animation (Stasko's demos had smooth navigation; this widget is static)

## 10. References

- Stasko, J. "SunBurst Project" — https://sites.cc.gatech.edu/gvu/ii/sunburst
- Stasko, J. et al. "An Evaluation of Space-Filling Information Visualizations for Depicting Hierarchical Structures" — IJHCS '00
- Stasko, J. et al. "Focus+Context Display and Navigation Techniques for Enhancing Radial, Space-Filling Hierarchy Visualizations" — InfoVis '00
