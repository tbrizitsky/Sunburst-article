import React from "react";

export function Figure({ directive }) {
  const { src, caption, alt, width, lazy } = directive || {};
  if (!src) return null;

  const imgProps = { src, alt: alt || "", width: width || "100%" };
  if (lazy !== false) imgProps.loading = "lazy";

  return (
    <figure className="article-figure">
      <img {...imgProps} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
