import React, { useMemo, useEffect } from "react";
import { parseArticle } from "./article-parser.js";
import { typographicProse } from "./typographic.js";
import { renderArticleProse } from "./article-prose.js";
import { SunburstWidget } from "./SunburstWidget.jsx";
import { SunburstHueWidget } from "./SunburstHueWidget.jsx";
import { SunburstPlayground } from "./SunburstPlayground.jsx";
import { SunburstMvp } from "./SunburstMvp.jsx";
import { SunburstGeometryWidget } from "./SunburstGeometryWidget.jsx";
import { TreemapWidget } from "./TreemapWidget.jsx";
import { IcicleWidget } from "./IcicleWidget.jsx";
import { StaskoWidget } from "./StaskoWidget.jsx";
import { Figure } from "./Figure.jsx";
import { PlayBadge, isPlayBadgeEligible, makePlayBadgeKey } from "./PlayBadge.jsx";
import articleMd from "../../spec/article.md?raw";
import "./article.css";

function renderWidgetFromBlock(block) {
  if (block.type === "sunburst") return <SunburstWidget directive={block.directive} />;
  if (block.type === "sunburst-hue") return <SunburstHueWidget directive={block.directive} />;
  if (block.type === "sunburst-playground") return <SunburstPlayground directive={block.directive} />;
  if (block.type === "sunburst-mvp") return <SunburstMvp directive={block.directive} />;
  if (block.type === "sunburst-geometry") return <SunburstGeometryWidget directive={block.directive} />;
  if (block.type === "treemap") return <TreemapWidget directive={block.directive} />;
  if (block.type === "icicle") return <IcicleWidget directive={block.directive} />;
  if (block.type === "stasko") return <StaskoWidget directive={block.directive} />;
  return null;
}

function renderWidget(block, typeIndex) {
  const widget = renderWidgetFromBlock(block);
  if (!widget) return null;
  if (!isPlayBadgeEligible(block.type, block.directive)) return widget;
  return <PlayBadge id={makePlayBadgeKey(block.type, typeIndex)}>{widget}</PlayBadge>;
}

function renderProse(md) {
  return <div className="article-prose" dangerouslySetInnerHTML={{ __html: renderArticleProse(typographicProse(md)) }} />;
}

export function ArticleMode() {
  const blocks = useMemo(() => parseArticle(articleMd), []);
  const visibleBlocks = useMemo(() => blocks.filter(b => b.type !== "deactivate"), [blocks]);

  // Per-type widget index: the 0-based position among same-type blocks, used for
  // the per-widget "played" storage key (see staging-article.md §"Widget affordance badge").
  const renderedBlocks = useMemo(() => {
    const counts = {};
    return visibleBlocks.map((block) => {
      const typeIndex = counts[block.type] ?? 0;
      counts[block.type] = typeIndex + 1;
      return { block, typeIndex };
    });
  }, [visibleBlocks]);

  // Idle-time performance monitor
  useEffect(() => {
    let rafId;
    let frameCount = 0;
    const tick = () => { frameCount++; rafId = requestAnimationFrame(tick); };
    rafId = requestAnimationFrame(tick);
    const timer = setInterval(() => {
      const mem = performance.memory?.usedJSHeapSize;
      const mb = mem ? (mem / 1048576).toFixed(1) : '?';
      console.log(`[Perf] frames/10s: ${frameCount} | heap: ${mb}MB`);
      frameCount = 0;
    }, 10000);
    return () => { cancelAnimationFrame(rafId); clearInterval(timer); };
  }, []);

  return (
    <main id="article">
      <div className="article-columns">
        <div className="article-prose-column">
          {renderedBlocks.map(({ block, typeIndex }, i) => (
            <div key={i} className="article-content-block">
              {block.type === "prose" ? (
                renderProse(block.md)
              ) : block.type === "image" ? (
                <Figure directive={block.directive} />
              ) : block.md ? (
                <>
                  {renderWidget(block, typeIndex)}
                  {renderProse(block.md)}
                </>
              ) : (
                renderWidget(block, typeIndex)
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
