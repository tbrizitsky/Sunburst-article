import React, { useState, useRef, useEffect, useCallback } from "react";

const BADGE_KEY_PREFIX = "sunburst:article:played:";
const NAVIGATION_TYPES = new Set(["sunburst"]);
const STATIC_TYPES = new Set(["stasko"]);

export function makePlayBadgeKey(type, index) {
  return `${BADGE_KEY_PREFIX}${type}:${index}`;
}

export function isPlayBadgeEligible(type, directive) {
  if (STATIC_TYPES.has(type)) return false;
  const hasControls = Array.isArray(directive?.controls) && directive.controls.length > 0;
  if (hasControls) return true;
  if (NAVIGATION_TYPES.has(type)) {
    return directive?.locked?.interactions !== false;
  }
  return false;
}

function readPlayed(id) {
  try {
    return Boolean(localStorage.getItem(id));
  } catch {
    return false;
  }
}

function writePlayed(id) {
  try {
    localStorage.setItem(id, "1");
  } catch {
    // storage unavailable — badge re-appears on next load
  }
}

export function PlayBadge({ id, children }) {
  const [played, setPlayed] = useState(() => readPlayed(id));
  const [visible, setVisible] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (played) return undefined;
    const el = rootRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [played]);

  const dismiss = useCallback(() => {
    if (played) return;
    writePlayed(id);
    setPlayed(true);
  }, [played, id]);

  return (
    <div
      ref={rootRef}
      className="article-play-badge"
      data-visible={visible && !played}
      onClickCapture={dismiss}
      onChangeCapture={dismiss}
      onFocusCapture={dismiss}
    >
      {children}
      <div className="article-play-badge-overlay" aria-hidden="true">
        Play with me
      </div>
    </div>
  );
}
