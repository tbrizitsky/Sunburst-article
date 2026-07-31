import React, { useLayoutEffect, useRef, useState } from "react";
import { Slider } from "@base-ui/react/slider";
import { Select } from "@base-ui/react/select";
import { Switch } from "@base-ui/react/switch";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function WidgetSlider({ name, label, min, max, step, value, onChange, bare, valueFormat, endLabel, disabled }) {
  return (
    <label className="widget-control widget-control-slider">
      {!bare && <span className="widget-control-label">{label}</span>}
      <Slider.Root
        className="widget-slider"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        disabled={disabled}
        onValueChange={(v) => onChange(v)}
      >
        <Slider.Control className="widget-slider-control">
          <Slider.Track className="widget-slider-track">
            <Slider.Indicator className="widget-slider-indicator" />
            <Slider.Thumb className="widget-slider-thumb" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      {endLabel != null ? (
        <span className="widget-control-label">{endLabel}</span>
      ) : ((!bare || valueFormat) && (
        <span className={valueFormat ? "widget-control-label" : "widget-control-value"}>
          {valueFormat ? valueFormat(value) : value}
        </span>
      ))}
    </label>
  );
}

export function WidgetSelect({ name, label, options, value, onChange, className }) {
  const items = options.map((opt) => ({ label: String(opt), value: String(opt) }));
  const probeRef = useRef(null);
  const [minWidth, setMinWidth] = useState(null);
  const itemsKey = items.map((it) => it.label).join("\u0000");

  // Pin the trigger to the width of its widest option so selections never
  // resize it. Measured from a hidden probe that mirrors the trigger's chrome
  // (.widget-select) with every option label stacked.
  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const w = probe.offsetWidth;
    if (w > 0) setMinWidth((prev) => (prev === w ? prev : w));
  }, [itemsKey]);

  return (
    <label className={"widget-control widget-control-select" + (className ? " " + className : "")}>
      {label && <span className="widget-control-label">{label}</span>}
      <Select.Root
        className="widget-select-root"
        items={items}
        value={String(value)}
        onValueChange={(v) => onChange(v)}
      >
        <Select.Trigger
          className="widget-select"
          style={minWidth != null ? { minWidth } : undefined}
          aria-label={label}
        >
          <Select.Value className="widget-select-value" />
          <Select.Icon className="widget-select-icon">
            <ChevronIcon />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="widget-select-positioner" sideOffset={4}>
            <Select.Popup className="widget-select-popup">
              <Select.List className="widget-select-list">
                {items.map((item) => (
                  <Select.Item key={item.value} value={item.value} className="widget-select-item">
                    <Select.ItemIndicator className="widget-select-item-indicator">
                      <CheckIcon />
                    </Select.ItemIndicator>
                    <Select.ItemText className="widget-select-item-text">{item.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      <span ref={probeRef} className="widget-select-probe" aria-hidden="true">
        <span className="widget-select">
          <span className="widget-select-probe-labels">
            {items.map((it) => (
              <span key={it.value} data-opt>{it.label}</span>
            ))}
          </span>
          <span className="widget-select-icon">
            <ChevronIcon />
          </span>
        </span>
      </span>
    </label>
  );
}

export function WidgetToggle({ name, label, value, onChange }) {
  return (
    <label className="widget-control widget-toggle">
      <span className="widget-control-label">{label}</span>
      <Switch.Root
        className="widget-switch"
        checked={value}
        onCheckedChange={(v) => onChange(v)}
      >
        <Switch.Thumb className="widget-switch-thumb" />
      </Switch.Root>
    </label>
  );
}
