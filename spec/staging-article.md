# Article Staging Spec

This spec describes how the **article** (`article.md`) is assembled and rendered in the demo. It is the staging counterpart to `staging.md`: where `staging.md` pins the demo's implementation values for the sunburst map, this file pins the article's structure, directives, and styling. It is binding for the demo.

## Two-layer separation

- `article.md` — the article content: prose (standard markdown) interspersed with directives for AI agents and embeddable widgets.
- `staging-article.md` (this file) — how the article is built and rendered: directive syntax, widget configuration, the parser, and the stylesheet. Binding for the demo.

Content (`article.md`) is kept separate from decoration (the stylesheet, see §"Styling"). The article file contains no styling; all visual presentation lives in the referenced CSS file.

## The article file

`article.md` is a standard markdown file with two additional, article-specific constructs:

- `<instructions>` tags — instructions to be read and executed in-place by the parser (and, when an agent is present, by the agent). Most of the time the instructions are about adding a visualization with specific parameters, or writing some text. Once executed, the instructions are **replaced by the result of execution** (a visualization block). The tag is consumed during parsing — it does not appear as a block in the rendered output.
- `<sunburst>` tags — embed an interactive Sunburst widget (see [`other-widgets/sunburst.md`](other-widgets/sunburst.md)).
- `<sunburst-hue>` tags — embed a static folder-only Sunburst widget with an HSL color ring (see [`other-widgets/sunburst-hue.md`](other-widgets/sunburst-hue.md)).
- `<treemap>` tags — embed a treemap visualization (see [`other-widgets/treemap.md`](other-widgets/treemap.md)).
- `<icicle>` tags — embed an icicle (partition) visualization (see [`other-widgets/icicle.md`](other-widgets/icicle.md)).

Additionally, the article supports embedded images via the `<image>` tag, and widget visibility triggers (see §"Widget activation").

All tags may appear on their own line within prose; the parser splits prose around them.

## `<instructions>` directive

The `<instructions>` tag is a parser-level directive that **clones the previous `<sunburst>`, `<treemap>`, or `<icicle>`** and applies incremental overrides to its configuration. This is the form of "execute in-place, replaced by the result" the parser currently implements: the instruction's result is a cloned visualization block, inserted at the instruction's position.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|---|
| `clone` | string | yes | Which visualization to clone. Only `prev` supported (the immediately preceding `<sunburst>`, `<treemap>`, or `<icicle>`). |
| `override` | map | no | Fields to override on the cloned directive. Keys not listed are inherited from the source. |

### Override semantics

Each key in `override` replaces the corresponding key in the cloned directive:

| Override key | Behavior |
|---|---|
| `controls` | Replaces the `controls` list entirely. |
| `locked` | Merges into the existing `locked` map (override keys win). |
| `scroll` | Replaces the `scroll` list entirely (sunburst only). |
| Any other field | Replaces the field value directly. |

If `<instructions>` appears with no preceding visualization to clone, it produces no output (silently skipped).

### Example

```markdown
Start with a wireframe:

<sunburst>
data: disk
controls: []
locked:
  maxRings: 5
  coloring: none
  render: wireframe
</sunburst>

Now add interactivity:

<instructions>
clone: prev
override:
  controls:
    - sorting
  locked:
    maxRings: 20
    coloring: none
    render: wireframe
</instructions>
```

The second block is a clone of the first (same type, `sunburst`), but with `sorting` exposed as a control and `maxRings` bumped to 20. The other locked values (`coloring`, `render`) are preserved from the original.

## `<image>` directive

The `<image>` tag embeds an image as a semantic `<figure>` with an optional caption. Images are lazy-loaded by default.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `src` | string | yes | Image path or URL, relative to the article file |
| `caption` | string | no | Figure caption rendered below the image |
| `alt` | string | no | Accessible alt text (defaults to empty) |
| `width` | string | no | CSS width value (e.g. `"100%"`, `"640px"`) |
| `lazy` | bool | no | Use native lazy loading (default: `true`) |

### Example

```markdown
The map illustrates the difference in ring width between the small and grow models:

<image>
src: assets/ring-comparison.png
caption: "Ring width comparison — small (left) vs grow (right)"
width: 100%
</image>
```

## `<treemap>` directive

The `<treemap>` tag embeds a treemap visualization in the widget column (same slot as sunburst maps, scroll-activated). The body follows the same key/value format as `<sunburst>`.

Common fields (`data`, `controls`, `locked`, `caption`) behave the same as the `<sunburst>` directive (see [`other-widgets/sunburst.md`](other-widgets/sunburst.md)). Treemap-specific fields, tunables, and gallery specification are in [`other-widgets/treemap.md`](other-widgets/treemap.md).

## `<icicle>` directive

The `<icicle>` tag embeds an icicle (partition layout) visualization in the widget column (same slot as sunburst and treemap maps, scroll-activated). The body follows the same key/value format as `<sunburst>`.

Common fields (`data`, `controls`, `locked`, `caption`) behave the same as the `<sunburst>` directive (see [`other-widgets/sunburst.md`](other-widgets/sunburst.md)). Icicle-specific fields, tunables, morph behavior, and gallery specification are in [`other-widgets/icicle.md`](other-widgets/icicle.md).

## `<stasko>` directive

The `<stasko>` tag embeds a static Stasko original Sunburst visualization in the widget column (same slot as sunburst, treemap, and icicle maps, scroll-activated). The body follows the same key/value format as `<sunburst>`.

Unlike the other visualization widgets, the Stasko widget has **no interactive controls** — it is a read-only reference rendering. Fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `data` | string | no | Dataset name (`"disk"` or `"workstation"`; default: `"disk"`) |
| `ringWidth` | number | no | Ring width in SVG units (default: `50`) |
| `caption` | string | no | Figure caption rendered between the widget and its controls |

See [`other-widgets/stasko-original-sunburst.md`](other-widgets/stasko-original-sunburst.md) for the full specification.

## Widget–prose pairing

Widget tags in the article support two forms:

### Two parsing forms

| Form | Syntax | Output |
|---|---|---|
| **Inline attrs + wrapped prose** | `<sunburst data="disk">Prose</sunburst>` | `{ type, directive, md: "Prose" }` |
| **Key/value body** (config only) | `<sunburst>\ndata: disk\n</sunburst>` | `{ type, directive }` |
| **Self-closing** (no body) | `<sunburst data="disk" />` | `{ type, directive }` |

**Inline-attrs form**: the opening tag contains `key="value"` pairs (the directive). The body between `<tagname>` and `</tagname>` is treated as **paired markdown prose** — rendered below the widget in the single-column flow.

**Key/value body form**: the body follows `<tagname>` on subsequent lines and is parsed as directive fields (existing behavior). No prose is paired.

**Self-closing form**: no body, no paired prose. The widget renders inline in the prose column at its document position.

### Detection rule

If the opening tag line contains `=` in its attributes, the body is treated as paired markdown prose. Otherwise, the body is parsed as key/value directive fields.

### `<deactivate>` directive

```
<deactivate />
```

A self-closing tag that is **filtered out** during rendering (no visual effect). `<deactivate />` is inert in both wide and narrow layouts — it exists only for document-structuring purposes.

### `<sunburst>` directive

The `<sunburst>` tag embeds an interactive Sunburst widget. In inline-attrs form the directive comes from tag attributes; in key/value body form it comes from `parseDirectiveBody`. See [`other-widgets/sunburst.md`](other-widgets/sunburst.md) for the complete field reference.

## Styling

All visual presentation of the article, its prose, the embedded widgets, the widget inline controls (sliders, selects, toggles), the widget breadcrumb, and the affordance badge is contained in a **standalone CSS file**, imported once by the article renderer:

- **`demo/src/article.css`** — article-specific styling: layout, prose typography, widget container, widget controls, widget breadcrumb, affordance badge, captions. Inherits the design-system CSS custom properties defined in `demo/src/styles.css` (`--surface-*`, `--text-*`, `--accent`, `--focus-accent`, `--border-*`, `--shadow-*`, `--radius-*`, `--transition-*`).

`article.md` contains no styling. To change the article's appearance, edit `article.css` (and `styles.css` for shared tokens). To change the article's content, edit `article.md`.

### Widget controls

The article's inline controls (sliders, selects, toggles) are **unstyled primitives from [Base UI](https://base-ui.com)**, wrapped once in `demo/src/widget-controls.jsx` and shared by every article widget and the Embeds gallery:

- `WidgetSlider` — Base UI `Slider` (track, indicator, thumb)
- `WidgetSelect` — Base UI `Select` (trigger button, popup list, items)
- `WidgetToggle` — Base UI `Switch` (pill + thumb)

The wrappers render the same `.widget-control`/`.widget-control-label`/`.widget-control-value` structure as before, so widget markup, the affordance-badge eligibility logic, and the visual language are unchanged. All visual styling lives in `article.css` (`.widget-slider-*`, `.widget-select*`, `.widget-switch`, `.widget-select-popup`, …); the popup additionally inherits the Base UI-provided `--anchor-width`/`--transform-origin` tokens (defaults defined in `styles.css`). Press feedback, `focus-visible` rings, the `--ease-out` curve, and reduced-motion handling are identical to the previous native controls.

**Chrome palette (greyscale).** `--accent` is a **per-mode greyscale** value (light grey in dark mode, dark grey in light mode — see `styles.css`) used by the controls' track/indicator fills, the select-item check, the affordance badge, breadcrumb, and app chrome. The chrome does not introduce hue, so the article's illustrations (the colored sector rings) stay the sole source of color in the reading flow.

**Keyboard focus accent.** `--focus-accent` retains the original indigo and is used **only** for `:focus-visible` rings on the slider thumb, select trigger, and switch — preserving a non-grey keyboard affordance when the controls themselves are greyscale.

**Slider layout.** A slider control (`widget-control-slider`) is `flex: 1 0 100%`: it forces a full-width row of its own and never sits beside another control. Toggles and selects keep `flex:1; min-width:200px` and share rows inline via `flex-wrap`.

**Select width.** A select's trigger is pinned to the width of its widest option, so the control never resizes when the selection changes — "tiny" and "very large item" render the trigger at the same width. The pinned width is measured once from a hidden probe (`.widget-select-probe`) that mirrors the trigger's chrome (same `.widget-select` padding, border, font, and chevron) with every option label stacked, so the measurement tracks the styling and cannot drift. The popup's check slot is dedicated/reserved: each item is a fixed `1rem` grid column (`.widget-select-item` uses `grid-template-columns: 1rem 1fr`) and the item label is pinned to the second column (`.widget-select-item-text { grid-column: 2 }`), so option labels stay aligned — the selected item's check occupies column 1, unselected items show an empty 1rem slot, and labels never shift when the selection changes. (Base UI renders the check only for the selected item; the explicit `grid-column` keeps the reservation without it.)

**Toggle on-state.** The switch on-state uses **inverted lightness**: on-state track = `--text-primary`, on-state thumb = `--surface-3` (off-state is the inverse). This maximizes thumb/track contrast in both dark and light modes without relying on hue, so the on/off distinction survives the greyscale palette.

### Typography scaling

At narrow viewports (≤768px), heading and body font sizes scale down to prevent overflow and maintain readability. Scaling is applied via CSS media queries or `clamp()`: headings shrink proportionally (e.g. h1 from ~64px to ~36px), body text from 1.25rem to 1rem. Type scale ratio (√2) is preserved at all sizes.

## Typographic refinement

All prose blocks undergo a deterministic typographic refinement after parsing and before rendering. The refinement is implemented in `demo/src/typographic.js` and applied in `ArticleMode.jsx` as a pre-`marked()` transform on the block's markdown source.

### Transformations

| Input | Output | Notes |
|---|---|---|
| `"..."` (straight double quotes) | `""...""` (curly double quotes) | Paired, non-nested; code spans preserved verbatim |
| `'...'` (straight single quotes) | `'...'` / `'...'` (curly) | Opening/closing disambiguated by context; apostrophes (`don't`) handled correctly |
| `---` | `—` (em dash) | Sentence breaks |
| `--` between numbers | `–` (en dash) | Numeric ranges: `1999–2000` |
| `...` | `…` (ellipsis) | Single character |
| `\d+ \w+` (number + word) | `\d+&nbsp;\w+` | Non-breaking space prevents line-break orphan: `5&nbsp;rings`, `10&nbsp;years` |

### Exclusions

- Backtick code spans (`` `code` ``): extracted before refinement, restored verbatim — straight quotes preserved.
- Fenced code blocks: parsed as separate block types, never reach the refinement pass.
- Directive bodies and paired prose (`<sunburst>`, `<treemap>`, `<icicle>`, `<stasko>`, `<image>`): parsed through separate paths, never refined. Paired prose blocks (`md`) are refined through the same `typographicProse` + `marked` pipeline as standalone prose.
- URLs in markdown link syntax `[text](url)`: the URL part is not touched; link text is refined like any prose.

### Implementation

- `demo/src/typographic.js` exports `typographicProse(str) → str` — a pure function with no side effects or state.
- Tests: `demo/tests/unit/typographic.test.js`.

The refinement is **always active** (auto-fix on every render), not a manual one-time pass. There is no opt-out mechanism — the transformations are lossless for plain prose.

## External links

All external links in article prose blocks must open in a new tab. An external link is any markdown link `[text](url)` where the URL begins with `http://`, `https://`, or `//` (protocol-relative). These render with `target="_blank"` and `rel="noopener noreferrer"`. Relative links, fragment-only links (`#section`), and `mailto:` links open in the same tab.

## Responsive layout

Single-column layout on all viewport widths. Blocks are rendered sequentially in the order they appear in `article.md`. Widgets appear inline with paired prose rendered below the widget. `<deactivate />` markers are filtered out. Widgets take the full column width.

### Tap interaction

On touch devices, the sunburst map provides a single-pulse opacity dip on tap as immediate tactile feedback before the navigation morph. The dip lasts ~150ms; navigation fires on the tap/click event that follows. There are no hover states on mobile — taps navigate directly.

## Widget affordance badge

Every **interactive** article widget shows a small "Play with me" pill overlay — an affordance badge — until the reader's first interaction with that widget. Once dismissed, the flag is stored locally and the badge never appears again for that widget.

### Scope

A widget is badge-eligible when it accepts a click or a control change:

- Any widget whose directive exposes at least one control (`controls` non-empty).
- The `sunburst` map when navigation is enabled (its `locked.interactions` is not `false`).

Ineligible widgets show no badge: hover-only widgets (e.g. a `treemap` with no controls) and static widgets (e.g. `stasko`). The badge is **article-only** — the Embeds gallery never renders it. The badge is implemented as a `PlayBadge` wrapper around the widget in `ArticleMode`, not inside any widget component, so Embeds and Demo rendering are untouched.

### Appearance

- The badge is a pill (`border-radius: 999px`), `--surface-2` background, `--border-medium` border, `--shadow-md`, `pointer-events: none`, `aria-hidden`, centered over the widget at the very center of its map.
- It first appears when the widget **scrolls into view** (IntersectionObserver, once per widget), animating in from `scale(0.95)` + `opacity: 0` over **200 ms** with the `--ease-out` curve `cubic-bezier(0.23, 1, 0.32, 1)`.
- It animates out with the same curve over **140 ms**.
- Under `prefers-reduced-motion`, the badge fades in/out without the scale movement.

### Dismissal

A widget's badge is dismissed by the first of:

- a `click` anywhere inside the widget,
- a `change` on any of its controls,
- keyboard activation — `focus` entering any control inside the widget.

The dismissing interaction still reaches the widget (the badge never blocks input). Dismissal is permanent per widget: the flag is written synchronously to `localStorage` under `sunburst:article:played:{type}:{index}`, where `{type}` is the widget's block type and `{index}` its zero-based position among same-type blocks in the rendered article. Clearing site storage re-enables all badges.

## Embeds gallery

A third debugging mode, `Embeds`, rendered alongside Demo and Article in the mode toggle. It is a gallery sandbox for developing embed widgets before referencing them in article `<treemap>` or `<icicle>` directives.

### Layout

A single-column vertical filmstrip centered in the viewport. Each "embed card" occupies the full column width, with a label header, the embed visualization, and the card's own inline controls below it. Cards stack vertically with gaps. Controls are **per-card** (declared in the card's embed definition), not shared across the gallery.

### Treemap (first embed)

A treemap visualization of the same dataset used by the sunburst map. Hand-rolled: no charting library dependency. Layout, coloring, and rendering are all in `demo/src/Treemap.jsx`.

See [`other-widgets/treemap.md`](other-widgets/treemap.md) for the full specification (data, layout algorithm, coloring, rendering, tunables, interaction).

### Icicle (second embed)

An icicle (partition) layout visualization. Hand-rolled: no charting library dependency. Layout, coloring, and rendering are all in `demo/src/Icicle.jsx`.

See [`other-widgets/icicle.md`](other-widgets/icicle.md) for the full specification (data, layout algorithm, coloring, rendering, tunables, interaction).

### Adding embeds

To add a new embed:
1. Create a new component file in `demo/src/`.
2. Import it in `EmbedsMode.jsx` and add it to the embeds list.
3. Document it in the appropriate widget file under `other-widgets/`.

## Implementation

### Parser

`demo/src/article-parser.js` splits markdown into an ordered list of blocks:

| `type` | Description | Has `md` field |
|---|---|---|
| `"prose"` | Standard markdown, rendered via `marked` | yes |
| `"sunburst"` | Sunburst widget, rendered via `SunburstWidget` | yes (paired) or no (self-closing) |
| `"sunburst-hue"` | Sunburst Hue widget (folder-only + color ring, with hue offset slider and/or color model selector), rendered via `SunburstHueWidget` | no (self-closing only) |
| `"sunburst-playground"` | Simplified sunburst for educational exploration (Files toggle, no navigation), rendered via `SunburstPlayground` | no (self-closing only) |
| `"sunburst-mvp"` | Minimal sunburst with a single "Sort by size" toggle (animated sort morph; no hover/navigation/pulse), rendered via `SunburstMvp` | no (self-closing only) |
| `"treemap"` | Treemap visualization, rendered via `TreemapWidget` | yes (paired) or no (self-closing) |
| `"icicle"` | Icicle visualization, rendered via `IcicleWidget` | yes (paired) or no (self-closing) |
| `"stasko"` | Stasko original sunburst, rendered via `StaskoWidget` | yes (paired) or no (self-closing) |
| `"image"` | Figure with image + caption, rendered via `Figure` | no |
| `"deactivate"` | Widget deactivation marker, filtered out during rendering | no |

Each block has a `directive` object with the tag's parsed key/value pairs. Blocks with an `md` field carry paired markdown prose that renders alongside the widget.

**Two modes**: widget tags whose opening line contains `=` in attributes use `parseInlineTagAttributes()` for the directive and treat the body as paired markdown prose (`md`). Tags without inline attributes use `parseDirectiveBody()` for the body (key/value config only, no `md` field).

**Tag name regex**: The parser matches opening tags via `/^<([\w-]+)\s*([^>]*)>/`, not `\w+`, so hyphenated tag names (`sunburst-hue`) are supported. The `TAG_NAMES` array includes `"sunburst-hue"` and `"sunburst-mvp"`. The `<sunburst-hue>` and `<sunburst-mvp>` blocks do not update `lastWidgetDirective` (neither is clonable via `<instructions>`).

- `<instructions>` tags are handled by cloning the preceding visualization's directive with overrides (the cloned block replaces the instruction in the output block list, preserving the original type).
- `parseInlineTagAttributes()` supports inline objects (`{key:val,...}`) and arrays (`[a,b]`) via `parseInlineValue()` — complex values like `locked` objects can be passed as inline attributes.

### Components

- `demo/src/SunburstWidget.jsx` — renders a `SunburstMap` with inline controls + scroll binding, driven by a parsed `directive`.
- `demo/src/SunburstHueWidget.jsx` — renders a folder-only Sunburst with an HSL color ring and hover line, driven by a parsed `directive` with `data` and `caption` fields.
- `demo/src/SunburstMvp.jsx` — renders the minimal Sunburst MVP (single "Sort by size" toggle, animated sort morph, no other interactions), driven by a parsed `directive`.
- `demo/src/TreemapWidget.jsx` — renders a `Treemap` with inline controls, driven by a parsed `directive`.
- `demo/src/IcicleWidget.jsx` — renders a morph visualization with inline controls, driven by a parsed `directive`. Always renders `IcicleSunburstMorph`.
- `demo/src/IcicleSunburstMorph.jsx` — SVG-based morph component that uses the sunburst layout (`layout()` from `layout.js`) as source, projects to cartesian rectangles for the icicle end via radius-offset polar interpolation, and blends each child's angular position between cursor-order and angular-order with seam-unwrapped targets. Shared tunables (coloring, colorModel, visibilityThreshold) remain active across the full morph range.
- `demo/src/Figure.jsx` — renders an `<img>` inside a `<figure>` with optional `<figcaption>`.

### Widget whitespace trimming

When a widget is **non-interactive** (does not change geometry in response to user input — e.g., no navigation, no controls that alter the layout), its SVG viewBox should tightly bound the visualization content with minimal margin. Interactive widgets need breathing room for hover effects, stroke edges, and tooltip clearance; non-interactive widgets have no such requirement, so the extra whitespace is trimmed to keep the widget compact in the prose flow.

- **Non-interactive** means: `interactions: false` (sunburst), or a widget whose spec declares it static (stasko). Widgets with geometry-changing controls exposed (`morph` slider on icicle, `algorithm` on treemap) are interactive even if read-only — their viewBox must accommodate the full range of possible geometries.
- **Implementation**: the SVG viewBox margin is reduced to 0–8 px (from the default 40 px for stasko, 4 px for sunburst). The viewBox continues to bound the content — no clipping occurs.

### Renderer

`demo/src/ArticleMode.jsx` imports `article.md?raw`, parses it via `parseArticle`, and renders all blocks sequentially in a single column. `<deactivate />` markers are filtered out. Widget blocks with paired prose (`block.md`) render the widget followed by the prose. Widget blocks without prose render the widget alone. Prose blocks render as markdown.

Common per-block dispatch:

```jsx
function blockComponent(block) {
  switch (block.type) {
    case "sunburst":    return <SunburstWidget directive={block.directive} />;
    case "sunburst-hue": return <SunburstHueWidget directive={block.directive} />;
    case "sunburst-mvp": return <SunburstMvp directive={block.directive} />;
    case "treemap":     return <TreemapWidget directive={block.directive} />;
    case "icicle":      return <IcicleWidget directive={block.directive} />;
    case "image":       return <Figure directive={block.directive} />;
  }
}
```

The renderer imports `article.css` for all article styling.

## Relationship to other specs

- `staging.md` defines the sunburst map demo and its DialKit-exposed tunables; this file defines the article layer that sits on top of it. Per-widget tunable names and defaults are in [`other-widgets/sunburst.md`](other-widgets/sunburst.md), [`other-widgets/treemap.md`](other-widgets/treemap.md), and [`other-widgets/icicle.md`](other-widgets/icicle.md); they mirror DialKit's schema in `staging.md`.
- `sunburst-map.md` / `animation.md` define map behavior; the article's widgets render that behavior unchanged (they share the same `SunburstMap` component).
- Per `AGENTS.md`, when a `sunburst-map.md` / `animation.md` section referenced by the article's prose changes, the prose must be updated to match (the widgets self-update via the shared rendering code).