import React, { useState, useEffect, useCallback } from "react";
import { DemoMode } from "./DemoMode.jsx";
import { EmbedsMode } from "./EmbedsMode.jsx";
import { ArticleMode } from "./ArticleMode.jsx";
import { useDebug } from "./DebugContext.jsx";

function ModeToggle({ mode, onSwitch }) {
  return (
    <div className="mode-toggle">
      <button className={`mode-toggle-btn ${mode === "demo" ? "active" : ""}`}
        onClick={() => onSwitch("demo")}>Demo</button>
      <button className={`mode-toggle-btn ${mode === "embeds" ? "active" : ""}`}
        onClick={() => onSwitch("embeds")}>Embeds</button>
      <button className={`mode-toggle-btn ${mode === "article" ? "active" : ""}`}
        onClick={() => onSwitch("article")}>Article</button>
    </div>
  );
}

function getModeFromHash() {
  const hash = window.location.hash.slice(1) || "/";
  if (hash.startsWith("/article")) return "article";
  if (hash.startsWith("/embeds")) return "embeds";
  return "demo";
}

export function App() {
  const { debug } = useDebug();
  const [mode, setMode] = useState(getModeFromHash);

  const switchMode = useCallback((m) => {
    setMode(m);
    if (m === "article") window.location.hash = "#/article";
    else if (m === "embeds") window.location.hash = "#/embeds";
    else window.location.hash = "#/";
  }, []);

  useEffect(() => {
    const onHashChange = () => setMode(getModeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <>
      {debug && <ModeToggle mode={mode} onSwitch={switchMode} />}
      {!debug ? <ArticleMode /> : mode === "demo" ? <DemoMode /> : mode === "embeds" ? <EmbedsMode /> : <ArticleMode />}
    </>
  );
}
