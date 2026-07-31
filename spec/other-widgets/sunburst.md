# Sunburst widget (article embed)

## `<sunburst>` directive

The `<sunburst>` tag embeds an interactive Sunburst widget. Everything within the tag is treated as a set of parameters for configuring the widget. The body is parsed as a simple key-value format (not full YAML).

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `data` | string | no | Dataset name. Currently only `disk` (the default). Article widgets default to `disk`. |
| `controls` | list | no | Whitelist of tunable names to expose as inline controls. Empty list = read-only. |
| `scroll` | list | no | Scroll-driven keyframes. Each item has `at` (0..1) and `set` (map of tunable → value). |
| `view` | string | no | View scope: `full` (default), `rings`, `sector`. |
| `locked` | map | no | Tunables to pin to specific values (not exposed, not scroll-driven). When the same key is also whitelisted in `controls`, the locked value seeds the control's initial state instead of pinning it — the reader can still change it. |
| `caption` | string | no | Caption rendered between the widget and its controls. |
| `breadcrumb` | bool | no | Show an interactive breadcrumb above the map: the path from the root folder to the current folder, ancestors clickable. Clicking an ancestor navigates to it — morphing when `animateNavigation` is on, hard-cutting when off. Default `false`. |

### Tunable names

These match the DialKit control names in `staging.md`. Each tunable becomes a widget parameter; when listed in `controls`, it is also exposed as an inline control.

| Name | Type | Default | Description |
|---|---|---|---|
| `maxRings` | slider (1–20) | 10 | Number of rings excluding center |
| `ringMode` | select | `small` | Ring-width model: `small`, `grow`, `shrink` |
| `ringMultiplier` | slider (0.5–1.5) | 1.0 | Outer-ring width multiplier (grow/shrink only) |
| `sorting` | select | `size` | Child sort: `size`, `name` |
| `coloring` | select | `wheel` | Hue source: `wheel` (angle), `size` (size ramp), `lastUpdated` (mtime ramp), `none` (monochromatic) |
| `colorModel` | select | `hsl` | Color model: `hsl`, `oklch` |
| `depthColor` | toggle | off | Progressively desaturate outer rings |
| `render` | select | `full` | Render mode: `full` (fill), `wireframe` (stroke only, 1px) |
| `interactions` | toggle | true | Enable hover/click interactions |
| `filesSpecial` | toggle | true | Show file-type and "smaller objects" sectors |
| `animateNavigation` | toggle | true | Animate navigation transitions (drill-in, back, breadcrumb) per `animation.md`. When false, all navigation is an immediate jump (hard cut) — for demonstrating the no-transition experience. The widget control is labelled **"Animation"**. An embed may expose it as a control with the default off by listing it in `controls` and pinning it to `false` in `locked` (see "Locked tunables"). |
| `visibilityThreshold` | slider (0–10) | 0 | Minimum sector span in degrees |
| `smallerObjects` | toggle | true | Emit the "smaller objects" bucket |
| `centerOpacity` | slider (0–1) | 0 | Center circle fill opacity (0 = invisible at rest; pulses on hover only) |

### Inline control params

Each entry in `controls` can be a simple name (uses defaults) or an object with overrides:

```
<sunburst>
controls:
  - maxRings: { min: 1, max: 11, step: 1, default: 10 }
  - ringMode: { options: [small, grow, shrink], default: small }
  - visibilityThreshold: { min: 0, max: 10, step: 0.5, default: 0 }
</sunburst>
```

When a name is given without params, the defaults from the table above are used.

### Scroll keyframes

```
<sunburst>
scroll:
  - at: 0.00, set: { maxRings: 3 }
  - at: 1.00, set: { maxRings: 11 }
</sunburst>
```

- `at`: scroll progress 0..1 (0 = bottom of widget enters viewport, 1 = top exits).
- `set`: map of tunable → value. Numeric values are interpolated; non-numeric snap at 0.5.

### Locked tunables

```
<sunburst>
locked: { maxRings: 5, ringMode: small }
</sunburst>
```

Locked values override both the defaults and any scroll-driven changes. They are not exposed as controls.

When a key appears in **both** `locked` and `controls`, the locked value is the control's *initial* state rather than a pin — the reader can toggle it away. This is how an embed gets an off-by-default toggle:

```
<sunburst data="disk" controls="[animateNavigation]" locked="{animateNavigation:false}" breadcrumb="true" caption="..."/>
```

Here the Animation control starts off (the "no transition" experience); flipping it on re-enables animated navigation, and the breadcrumb navigates with a morph while it is on.
