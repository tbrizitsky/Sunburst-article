import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { DebugProvider } from "./DebugContext.jsx";
import { getDebug } from "./debug.js";
import "./styles.css";

// Dev-only: React Grab for visual debugging (see spec/staging.md).
if (getDebug()) {
  import("react-grab");
}

// Real-time dark/light mode: set data-theme on <html> based on system preference
function applyTheme() {
  const isLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");
}
applyTheme();
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DebugProvider>
      <App />
    </DebugProvider>
  </React.StrictMode>
);