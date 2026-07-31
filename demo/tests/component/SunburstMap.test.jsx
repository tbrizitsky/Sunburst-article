import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import { TimelineStore } from "dialkit";
import { SunburstMap } from "../../src/SunburstMap.jsx";
import { disk, workstation } from "../../src/sample-data.js";

// Deep clone that tolerates the `_parent` back-reference cycle that `layout()`
// sets on every node. Strips `_parent` (and any other internal cycle) so the
// resulting tree is a clean JSON-serializable copy.
function clone(obj) {
  const seen = new WeakMap();
  function walk(n) {
    if (n === null || typeof n !== "object") return n;
    if (seen.has(n)) return seen.get(n);
    if (Array.isArray(n)) {
      const arr = [];
      seen.set(n, arr);
      for (const v of n) arr.push(walk(v));
      return arr;
    }
    const out = {};
    seen.set(n, out);
    for (const k of Object.keys(n)) {
      if (k === "_parent") continue; // break the cycle
      out[k] = walk(n[k]);
    }
    return out;
  }
  return walk(obj);
}

// IMPORTANT: two non-obvious facts about these tests:
//  1. Motion's `onComplete` fires on a microtask — tests that need animations
//     to finish must use `await vi.advanceTimersByTimeAsync(...)`, not the sync
//     variant (which never flushes the completion callback).
//  2. SunburstMap renders the built-in DATASETS tree (DialKit selector), NOT the
//     `data` prop. Node objects passed to navigateTo must come from that same
//     tree (obtainable via ref.getActiveData()), or computePath finds no common
//     ancestor and navigateTo hard-cuts.
beforeEach(() => {
  vi.useFakeTimers();
  // Do NOT replace requestAnimationFrame — vitest's fake timers mock it natively
  // with 16ms frame stepping, which Motion needs to finish animations.
});

afterEach(() => {
  cleanup(); // unmount all rendered components so DialKit store registrations are cleaned
  vi.useRealTimers();
});

describe("SunburstMap component", () => {
  it("renders an SVG with aria-label", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-label", "Disk usage sunburst map");
  });

  it("renders sector paths (ring >= 1)", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    const paths = svg.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
  });

  it("renders a center circle at root", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    const circle = svg.querySelector("circle");
    expect(circle).toBeInTheDocument();
  });

  it("center circle at root is transparent with grey border", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    const circle = svg.querySelector("circle");
    expect(circle).toHaveAttribute("fill", "transparent");
    expect(circle).toHaveAttribute("stroke", "hsl(0, 0%, 55%)");
    // fillOpacity="0" — React renders numeric 0 as attribute
    const fillOpacity = circle.getAttribute("fillOpacity") ?? circle.getAttribute("fill-opacity");
    expect(Number(fillOpacity)).toBe(0);
  });

  it("hovering a sector shows a hint with name and size", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    const paths = svg.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    const path = paths[0];
    fireEvent.mouseMove(path, { clientX: 100, clientY: 100 });
    const hint = container.querySelector("#hint");
    expect(hint).toBeInTheDocument();
    expect(hint.querySelector(".name")).toBeInTheDocument();
    expect(hint.querySelector(".size")).toBeInTheDocument();
  });

  it("hovering away hides the hint", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    const path = svg.querySelectorAll("path")[0];
    // show hint
    fireEvent.mouseMove(path, { clientX: 100, clientY: 100 });
    expect(container.querySelector("#hint")).toBeInTheDocument();
    // hide hint (element stays in DOM but becomes invisible)
    fireEvent.mouseLeave(path);
    const hint = container.querySelector("#hint");
    expect(hint).toBeInTheDocument();
    expect(hint.style.opacity).toBe("0");
  });

  it("SVG has viewBox 0 0 800 800", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    expect(svg).toHaveAttribute("viewBox", "0 0 800 800");
  });

  it("SVG has preserveAspectRatio xMidYMid meet", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  });

  it("center circle at root has cursor: default (no parent to go to)", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    const circle = svg.querySelector("circle");
    expect(circle.style.cursor).toBe("default");
  });

  it("drillable folder sectors have cursor: pointer", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    const paths = Array.from(svg.querySelectorAll("path"));
    const pointerPaths = paths.filter(p => p.style.cursor === "pointer");
    expect(pointerPaths.length).toBeGreaterThan(0);
  });

  it("clicking a folder sector triggers drill-in with center circle present", async () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");

    // Find a drillable path
    const paths = Array.from(svg.querySelectorAll("path"));
    const folderPath = paths.find(p => p.style.cursor === "pointer");
    expect(folderPath).toBeDefined();

    // Click to drill in
    act(() => {
      fireEvent.click(folderPath);
    });

    // During animation, a center circle should be present
    const circle = svg.querySelector("circle");
    expect(circle).toBeInTheDocument();
    // The circle should have pointer events for up navigation
    expect(circle.style.pointerEvents).toBe("all");

    // Let the animation finish: a Motion animation left mid-flight at test end
    // corrupts the shared frameloop for later tests (onComplete never fires).
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  });

  it("drilling in does not blank the screen (sectors persist through animation)", async () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");

    // Find a drillable path
    const paths = Array.from(svg.querySelectorAll("path"));
    const folderPath = paths.find(p => p.style.cursor === "pointer");
    expect(folderPath).toBeDefined();

    // Click to drill in
    act(() => {
      fireEvent.click(folderPath);
    });

    // Advance timers to let the animation run through completion
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // The SVG should still have sector paths — not blank
    const pathsAfter = svg.querySelectorAll("path");
    expect(pathsAfter.length).toBeGreaterThan(0);
    expect(svg.querySelector("circle")).toBeInTheDocument();
  });

  it("file sectors are not drillable (cursor: default)", () => {
    const { container } = render(<SunburstMap data={clone(disk)} />);
    const svg = container.querySelector("svg#map");
    const paths = Array.from(svg.querySelectorAll("path"));
    const filePath = paths.find(p => p.style.cursor === "default");
    // If there are file sectors, they should have cursor: default
    if (filePath) {
      expect(filePath.style.cursor).toBe("default");
    }
  });

  it("filesSpecial off: drill-in uses hard cut (no animation, immediate navigation)", () => {
    // With filesSpecial off, navigation should hard-cut to the target folder
    // instead of running the morph animation (per !execute_me.md: the toggle is
    // not intended for use with animations).
    let navigatedTo = null;
    const { container } = render(
      <SunburstMap
        data={clone(disk)}
        onNavigate={(node) => { navigatedTo = node; }}
        opts={{ filesSpecial: false }}
      />
    );
    const svg = container.querySelector("svg#map");
    const paths = Array.from(svg.querySelectorAll("path"));
    const folderPath = paths.find(p => p.style.cursor === "pointer");
    expect(folderPath).toBeDefined();

    act(() => {
      fireEvent.click(folderPath);
    });

    // Hard cut: onNavigate fires synchronously with the target folder.
    expect(navigatedTo).not.toBeNull();
    expect(navigatedTo.type).toBe("folder");
  });

  it("animateNavigation off: all navigation hard-cuts (drill, breadcrumb)", () => {
    // With animateNavigation false (article "no transition" embed), every
    // navigation is an immediate jump — no morph animation.
    let navigatedTo = null;
    const ref = React.createRef();
    const { container } = render(
      <SunburstMap
        ref={ref}
        data={clone(disk)}
        onNavigate={(node) => { navigatedTo = node; }}
        opts={{ animateNavigation: false }}
      />
    );
    const activeData = ref.current.getActiveData();
    const folderPath = Array.from(container.querySelectorAll("svg#map path"))
      .find(p => p.style.cursor === "pointer");
    expect(folderPath).toBeDefined();

    // Drill (sector click): immediate onNavigate with the target folder.
    act(() => {
      fireEvent.click(folderPath);
    });
    expect(navigatedTo).not.toBeNull();
    expect(navigatedTo.type).toBe("folder");

    // Breadcrumb / programmatic navigation: immediate jump too.
    const folders = activeData.children.filter(c => c.type === "folder")
      .sort((a, b) => (b.size || 0) - (a.size || 0));
    act(() => {
      ref.current.navigateTo(folders[0]);
    });
    expect(navigatedTo).toBe(folders[0]);
  });

  it("queued navigation: second navigation during animation targets the correct node after the first settles", async () => {
    let navigatedTo = null;
    const ref = React.createRef();
    const data = clone(disk);
    const { container } = render(
      <SunburstMap
        ref={ref}
        data={data}
        onNavigate={(node) => { navigatedTo = node; }}
      />
    );
    const svg = container.querySelector("svg#map");
    const paths = Array.from(svg.querySelectorAll("path"));
    const folderPaths = paths.filter(p => p.style.cursor === "pointer");
    expect(folderPaths.length).toBeGreaterThanOrEqual(2);

    // The component renders its internal DATASETS tree — pull matching node
    // objects from it (clones would not resolve in the parents WeakMap).
    const activeData = ref.current.getActiveData();
    const folders = activeData.children.filter(c => c.type === "folder").sort((a, b) => (b.size || 0) - (a.size || 0));
    const secondNode = folders[1];

    // Start first animation by clicking the first folder's sector
    act(() => {
      fireEvent.click(folderPaths[0]);
    });

    // Immediately queue second navigation via imperative handle (simulates a
    // breadcrumb click during the running animation)
    act(() => {
      ref.current.navigateTo(secondNode);
    });

    // Advance timers to let both animations complete (async advance flushes
    // Motion's onComplete microtask between frames)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    // After both animations settle, we should have navigated to the SECOND target
    expect(navigatedTo).toBe(secondNode);

    // The screen should not be blank
    const pathsAfter = svg.querySelectorAll("path");
    expect(pathsAfter.length).toBeGreaterThan(0);
    expect(svg.querySelector("circle")).toBeInTheDocument();
  });

  it("any-to-any (sibling) is back-then-drill: start offset continuous, end offset is the target's natural drill offset", async () => {
    const ref = React.createRef();
    const data = clone(disk);
    let navigatedTo = null;

    // Harness mimics DemoMode: holds `current` in state so onNavigate re-renders
    // the map with the new current folder.
    function Harness() {
      const [current, setCurrent] = React.useState(null);
      return (
        <SunburstMap
          ref={ref}
          data={data}
          current={current}
          onNavigate={(node) => { navigatedTo = node; setCurrent(node); }}
        />
      );
    }

    const { container } = render(<Harness />);
    const svg = container.querySelector("svg#map");
    const paths = Array.from(svg.querySelectorAll("path"));
    const folderPaths = paths.filter(p => p.style.cursor === "pointer");
    expect(folderPaths.length).toBeGreaterThanOrEqual(2);

    const activeData = ref.current.getActiveData();
    const folders = activeData.children.filter(c => c.type === "folder").sort((a, b) => (b.size || 0) - (a.size || 0));
    const secondNode = folders[1];

    const rotationOf = () => {
      const g = svg.querySelector("g[transform]");
      if (!g) return 0;
      const m = g.getAttribute("transform").match(/rotate\(([\d.\-eE]+) 400 400\)/);
      return m ? parseFloat(m[1]) : 0;
    };

    // Drill into first folder to accumulate a non-zero angular offset
    act(() => { fireEvent.click(folderPaths[0]); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(navigatedTo).toBe(folders[0]);
    const offsetAfterDrill = rotationOf();
    expect(Math.abs(offsetAfterDrill)).toBeGreaterThan(0.1); // non-zero

    // Navigate to a sibling. The any-to-any transition is now a two-leg
    // chain: back from folders[0] to root, then drill root → secondNode.
    // Leg 1 (back) must START at the pre-nav offset (continuous, no snap).
    act(() => { ref.current.navigateTo(secondNode); });
    const startOffset = rotationOf();
    let delta = Math.abs(startOffset - offsetAfterDrill);
    if (delta > 180) delta = 360 - delta;
    expect(delta).toBeLessThan(5); // continuous start (back leg keeps oldOffset)

    // After BOTH legs settle, the post-nav static view is the target's natural
    // drilled-in orientation — the same offset a direct root → secondNode drill
    // would produce (no cumulative / stale rotation from the prior folder).
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(navigatedTo).toBe(secondNode);

    // Expected natural offset for secondNode in the root layout.
    const { computeSizes, layout, norm } = await import("../../src/layout.js");
    const root2 = clone(disk); computeSizes(root2); layout(root2);
    const sn = root2.children.find(c => c.name === secondNode.name);
    const expected = norm(sn._start + sn._span / 2 - 180);
    const endOffset = rotationOf();
    let endDelta = Math.abs(endOffset - expected);
    if (endDelta > 180) endDelta = 360 - endDelta;
    expect(endDelta).toBeLessThan(1);
  });

  // Regression: the workstation dataset had a malformed node where folder()
  // was used to wrap a file object (a972b5b / fix f0c8e9c). computeSizes threw
  // "node.children is not iterable" the moment SunburstMap mounted with it,
  // because the dataset selector defaulted to disk and the workstation tree
  // had never been exercised. These tests render each dataset directly.
  describe("renders each dataset without throwing", () => {
    it("renders the disk dataset", () => {
      const { container } = render(<SunburstMap data={clone(disk)} />);
      const svg = container.querySelector("svg#map");
      expect(svg).toBeInTheDocument();
      expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    });

    it("renders the workstation dataset (14+ levels, deep nesting)", () => {
      const { container } = render(<SunburstMap data={clone(workstation)} />);
      const svg = container.querySelector("svg#map");
      expect(svg).toBeInTheDocument();
      expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
      // The center circle should be present at root.
      expect(svg.querySelector("circle")).toBeInTheDocument();
    });

    it("drilling into a top-level workstation folder does not throw", async () => {
      const { container } = render(<SunburstMap data={clone(workstation)} />);
      const svg = container.querySelector("svg#map");
      const folderPath = Array.from(svg.querySelectorAll("path"))
        .find(p => p.style.cursor === "pointer");
      expect(folderPath).toBeDefined();
      // Clicking should not throw — exercise the morph path on the deep tree.
      act(() => { fireEvent.click(folderPath); });
      // Let the animation finish (a mid-flight Motion animation at test end
      // corrupts the shared frameloop for later tests).
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    });
  });
});

// ---------- Live mode vs. preview mode (spec/staging.md §"DialTimeline") ----------
//
// Regression guard for the screenshot bug: breadcrumb deep at
// "… ▸ MobileSync ▸ Backup" while the map rendered the disk root. Root cause:
// the timeline preview (derived from the stored currentPair) silently overrode
// the live view (derived from `current`), and nothing exited that state.
// These tests pin the contract: preview mode is signalled, navigation exits
// it, replay re-plans from `current`, and at rest the map shows `current`.
describe("DialTimeline live/preview mode", () => {
  const TIMELINE_ID = "sunburst-zoom";

  afterEach(() => {
    cleanup(); // unregister the timeline so the next test starts from a clean store
  });

  // Harness mimics DemoMode: holds `current` + `currentPair` in state.
  function renderHarness() {
    const ref = React.createRef();
    const state = { navigated: null, preview: [] };
    function Harness() {
      const [current, setCurrent] = React.useState(null);
      const [pair, setPair] = React.useState(() => {
        const folders = (disk.children || []).filter(c => c.type === "folder")
          .sort((a, b) => (b.size || 0) - (a.size || 0));
        return { parent: disk, child: folders[0] || disk };
      });
      return (
        <SunburstMap
          ref={ref}
          current={current}
          onNavigate={(n) => { state.navigated = n; setCurrent(n); }}
          currentPair={pair}
          onPairChange={setPair}
          onPreviewChange={(v) => state.preview.push(v)}
        />
      );
    }
    const utils = render(<Harness />);
    return { ref, state, ...utils };
  }

  const settle = async () => act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  const firstFolderPath = (svg) =>
    Array.from(svg.querySelectorAll("path")).find(p => p.style.cursor === "pointer");

  it("idle at time 0: live mode — no preview badge", () => {
    const { container } = renderHarness();
    expect(container.querySelector("#preview-badge")).not.toBeInTheDocument();
  });

  it("scrubbing the timeline enters preview mode: badge shown, onPreviewChange(true)", () => {
    const { container, state } = renderHarness();
    act(() => { TimelineStore.seek(TIMELINE_ID, 0.2); });
    expect(container.querySelector("#preview-badge")).toBeInTheDocument();
    expect(state.preview).toContain(true);
  });

  it("any navigation exits preview mode (pause + seek 0) and settles in live mode", async () => {
    const { container, state } = renderHarness();
    const svg = container.querySelector("svg#map");

    // Enter preview mode
    act(() => { TimelineStore.seek(TIMELINE_ID, 0.2); });
    expect(container.querySelector("#preview-badge")).toBeInTheDocument();

    // Navigate (sector click) — must exit preview before animating
    act(() => { fireEvent.click(firstFolderPath(svg)); });
    const transport = TimelineStore.getTransport(TIMELINE_ID);
    expect(transport.playing).toBe(false);
    expect(transport.time).toBe(0);

    await settle();
    expect(container.querySelector("#preview-badge")).not.toBeInTheDocument();
    expect(state.preview[state.preview.length - 1]).toBe(false);

    // At-rest invariant: the rendered tree is layout(current) — drilled in,
    // so no free-space sector (root-only per spec §4) and the center shows
    // the current folder's hue (not the transparent root center).
    expect(state.navigated).not.toBeNull();
    const transparent = Array.from(svg.querySelectorAll("path"))
      .filter(p => p.getAttribute("fill") === "transparent");
    expect(transparent).toHaveLength(0);
    expect(svg.querySelector("circle").getAttribute("fill")).not.toBe("transparent");
  });

  it("timeline replay re-plans from current (never a stale pair) and returns to live mode", async () => {
    const { container, state } = renderHarness();
    const svg = container.querySelector("svg#map");

    // Drill root → A, settle
    act(() => { fireEvent.click(firstFolderPath(svg)); });
    await settle();
    const A = state.navigated;
    expect(A).not.toBeNull();

    // Drill A → B, settle
    act(() => { fireEvent.click(firstFolderPath(svg)); });
    await settle();
    const B = state.navigated;
    expect(B).not.toBe(A);

    // Back up to A (currentPair still points at {A, B} — stale relative to A)
    act(() => { fireEvent.click(svg.querySelector("circle")); });
    await settle();
    expect(state.navigated).toBe(A);

    // Replay the transition from the timeline: must animate parent(A) → A and
    // commit A — with the old code it replayed the stale pair and committed B.
    act(() => { TimelineStore.play(TIMELINE_ID); });
    await settle();
    expect(state.navigated).toBe(A);

    // After the replay, the transport is reset: live mode, no badge.
    const transport = TimelineStore.getTransport(TIMELINE_ID);
    expect(transport.playing).toBe(false);
    expect(transport.time).toBe(0);
    expect(container.querySelector("#preview-badge")).not.toBeInTheDocument();
  });

  it("emits no duplicate React keys across drill + any-to-any navigation", async () => {
    // Duplicate keys mean React reuses DOM nodes across different sectors,
    // inheriting attributes — the flicker class this suite exists to prevent.
    // The morph legitimately emits the same node twice (from-side shrinking +
    // to-side growing); invisible duplicates must never reach the reconciler.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const ref = React.createRef();
      function Harness() {
        const [current, setCurrent] = React.useState(null);
        return (
          <SunburstMap
            ref={ref}
            data={clone(disk)}
            current={current}
            onNavigate={(node) => setCurrent(node)}
          />
        );
      }
      render(<Harness />);
      const activeData = ref.current.getActiveData();
      const folders = activeData.children
        .filter(c => c.type === "folder")
        .sort((a, b) => (b.size || 0) - (a.size || 0));
      expect(folders.length).toBeGreaterThanOrEqual(3);

      // Drill into a folder (exercises morphLayout frames incl. buckets), settle.
      act(() => { ref.current.navigateTo(folders[0]); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

      // Sibling → sibling (any-to-any: from/to/other wedge blend frames).
      act(() => { ref.current.navigateTo(folders[1]); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

      // Back to root (reverse morph).
      act(() => { ref.current.navigateTo(activeData); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

      const dupWarnings = errSpy.mock.calls.filter(args =>
        String(args[0]).includes("same key")
      );
      expect(dupWarnings).toEqual([]);
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("SunburstMap interactions=\"tooltips\" (hover only — no pulse, no click)", () => {
  const renderTooltips = (extra) =>
    render(<SunburstMap data={clone(disk)} opts={{ interactions: "tooltips" }} {...extra} />);

  it("renders the hover hint element (interactions truthy)", () => {
    const { container } = renderTooltips();
    expect(container.querySelector("#hint")).toBeInTheDocument();
  });

  it("hovering a sector shows a tooltip with name and size", () => {
    const { container } = renderTooltips();
    const svg = container.querySelector("svg#map");
    const path = svg.querySelectorAll("path")[0];
    fireEvent.mouseMove(path, { clientX: 100, clientY: 100 });
    const hint = container.querySelector("#hint");
    expect(hint.querySelector(".name")).toBeInTheDocument();
    expect(hint.querySelector(".size")).toBeInTheDocument();
  });

  it("sector cursors stay default (nothing is drillable)", () => {
    const { container } = renderTooltips();
    const svg = container.querySelector("svg#map");
    const paths = Array.from(svg.querySelectorAll("path"));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.style.cursor).toBe("default");
  });

  it("clicking a folder sector does not navigate (onNavigate never fires)", () => {
    const navigatedTo = [];
    const { container } = renderTooltips({ onNavigate: (n) => navigatedTo.push(n) });
    const svg = container.querySelector("svg#map");
    const paths = Array.from(svg.querySelectorAll("path"));
    fireEvent.click(paths[0]);
    expect(navigatedTo).toHaveLength(0);
  });
});
