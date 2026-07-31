const DEBUG_KEY = "sunburst:debug";

export function getDebug() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("debug")) return params.get("debug") !== "false";
  const stored = localStorage.getItem(DEBUG_KEY);
  if (stored !== null) return stored === "true";
  if (import.meta.env.VITE_DEBUG !== undefined) {
    return import.meta.env.VITE_DEBUG === "true" || import.meta.env.VITE_DEBUG === "1";
  }
  return false;
}

export function setDebug(enabled) {
  localStorage.setItem(DEBUG_KEY, String(enabled));
}
