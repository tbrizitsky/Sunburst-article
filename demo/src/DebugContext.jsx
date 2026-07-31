import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getDebug, setDebug as setDebugStorage } from "./debug.js";

const DebugContext = createContext(null);

export function DebugProvider({ children }) {
  const [debug, setDebugState] = useState(getDebug);

  const toggle = useCallback(() => {
    setDebugState(prev => {
      const next = !prev;
      setDebugStorage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  return (
    <DebugContext.Provider value={{ debug, toggle }}>
      {children}
    </DebugContext.Provider>
  );
}

export function useDebug() {
  const ctx = useContext(DebugContext);
  if (!ctx) throw new Error("useDebug must be used within DebugProvider");
  return ctx;
}
