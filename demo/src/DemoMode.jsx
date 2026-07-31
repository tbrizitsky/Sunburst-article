import React, { useState, useRef, useMemo, useEffect } from "react";
import { SunburstMap } from "./SunburstMap.jsx";
import { disk } from "./sample-data.js";
import { useDebug } from "./DebugContext.jsx";

// Dev-only: DialKit debug panel + timeline (see spec/staging.md §"Debugging tools").
// Only mounted in demo mode (not article mode). Static import is fine — the CSS is
// negligible and DialKit components are only rendered when debug is on.
import { DialRoot, DialTimeline } from "dialkit";
import "dialkit/styles.css";
import { ChevronRightIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export function DemoMode({ onBreadcrumbChange, onBreadcrumbDimChange }) {
  const { debug } = useDebug();
  const [current, setCurrent] = useState(disk);
  // Preview mode (spec/staging.md §"DialTimeline"): the map is showing a
  // scrubbed timeline frame, not `current` — dim the breadcrumb.
  const [previewActive, setPreviewActive] = useState(false);
  const sunburstRef = useRef();

  // Report breadcrumb items and dim state to App.
  const breadcrumbItems = useMemo(() => {
    const parentMap = sunburstRef.current?.getParents() ?? new WeakMap();
    const path = [];
    let node = current;
    while (node) {
      path.unshift(node);
      node = parentMap.get(node);
    }
    return path.map((node, i, arr) => ({
      name: node.name,
      onClick: i < arr.length - 1 ? () => sunburstRef.current?.navigateTo(node) : undefined,
    }));
  }, [current]);

  useEffect(() => { onBreadcrumbChange?.(breadcrumbItems); }, [breadcrumbItems, onBreadcrumbChange]);
  useEffect(() => { onBreadcrumbDimChange?.(previewActive); }, [previewActive, onBreadcrumbDimChange]);

  // Current (parent, child) pair for the timeline scrubber + header.
  const [currentPair, setCurrentPair] = useState(() => {
    const folders = (disk.children || []).filter(c => c.type === "folder").sort((a, b) => (b.size || 0) - (a.size || 0));
    return { parent: disk, child: folders[0] || (disk.children || [])[0] || disk };
  });

  return (
    <main id="app">
      <Breadcrumb className={`breadcrumb${previewActive ? ' dimmed' : ''}`}>
        <BreadcrumbList>
          {breadcrumbItems.map((item, i) => (
            <React.Fragment key={`${item.name}-${i}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {item.onClick ? (
                  <BreadcrumbLink render={<button onClick={item.onClick} />}>{item.name}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{item.name}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <SunburstMap ref={sunburstRef} current={current} onNavigate={setCurrent} currentPair={currentPair} onPairChange={setCurrentPair} onPreviewChange={setPreviewActive} />
      {debug && (
        <>
          <DialRoot position="top-right" theme="system" />
          <DialTimeline
            theme="system"
            defaultVisible={true}
            defaultOpen={false}
            pairLabel={<>{currentPair.parent.name} <ChevronRightIcon size={12} style={{display: 'inline', verticalAlign: 'middle'}} /> {currentPair.child.name}</>}
          />
        </>
      )}
    </main>
  );
}
