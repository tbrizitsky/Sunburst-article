// sample-data.js
// Synthetic "Macintosh HD" file-system tree for the Sunburst Map demo.
// Folder sizes are computed at load time (sum of children); only leaves carry sizes.
// mtimes are assigned deterministically per-leaf (relative to a base date via the
// shared rng), then propagated up as max(child mtime) by computeMtimes().

const GB = 1_000_000_000;
const MB = 1_000_000;
const KB = 1_000;

// Base date for mtime generation: a fixed reference (deterministic across loads).
// Leaves get mtime = BASE_DATE - rng()*365 days (newest = BASE_DATE, oldest = up to 1 year back).
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_DATE = Date.UTC(2026, 6, 23); // 2026-07-23 (fixed; deterministic)

function folder(name, children) { return { name, type: "folder", children }; }
function file(name, size) { return { name, type: "file", size }; }
function free(size) { return { name: "free space", type: "free", size }; }

// Deterministic PRNG so the sample data is stable across loads.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Assign a deterministic mtime to every leaf node (file/free), then propagate
// max(child mtime) up to folders. Called once at load time (after the tree is built).
// A single rng seeded with a fixed value walks the tree in creation order so every
// leaf gets a stable, distinct mtime in [BASE_DATE - 365d, BASE_DATE].
const mtimeRng = rng(0xC0FFEE);
export function computeMtimes(node) {
  if (node.type === "folder") {
    let max = 0;
    const kids = Array.isArray(node.children) ? node.children : null;
    if (kids) {
      for (const c of kids) {
        const m = computeMtimes(c);
        if (m > max) max = m;
      }
    }
    node.mtime = max;
  } else if (node.mtime === undefined) {
    // Leaf: assign a deterministic mtime if not already set.
    node.mtime = Math.round(BASE_DATE - mtimeRng() * 365 * DAY_MS);
  }
  return node.mtime || 0;
}

// Structural validator (Phase 2 — kills the "dataset integrity is found late"
// recurring class). Walks the source tree and throws at module load with the
// offending node PATH if the structure violates the spec/§2 data model. Runs once
// per dataset at import, so a corrupt dataset surfaces the moment the module is
// loaded in dev (instead of crashing the renderer after a dataset switch).
export function validateTree(root) {
  const allowed = new Set(["folder", "file", "free", "smaller"]);
  const walk = (n, path, depth) => {
    if (!n || typeof n !== "object") throw new Error(`validateTree: non-object node at ${path}`);
    if (typeof n.name !== "string") throw new Error(`validateTree: non-string .name at ${path}: ${JSON.stringify(n)}`);
    if (!allowed.has(n.type)) throw new Error(`validateTree: bad .type "${n.type}" at ${path}/${n.name}`);
    if (n.type === "folder") {
      if (!Array.isArray(n.children)) throw new Error(`validateTree: folder without .children array at ${path}/${n.name}`);
      // `free` appears only at disk root (depth 1). A corrupt folder() wrapping
      // a free node crashes computeSizes later; fail fast with a clear message.
      for (const c of n.children) walk(c, `${path}/${n.name}`, depth + 1);
    } else {
      // file / free / smaller are leaves: no children (a folder() accidentally
      // wrapping a leaf was the f0c8e9c crash). `size` is required on file/free.
      if (Array.isArray(n.children) && n.children.length > 0)
        throw new Error(`validateTree: leaf .${n.type} with children at ${path}/${n.name}`);
      if (n.type === "file" && (typeof n.size !== "number" || n.size < 0))
        throw new Error(`validateTree: file without non-negative numeric .size at ${path}/${n.name}`);
      if (n.type === "free" && depth !== 1)
        throw new Error(`validateTree: 'free' node only allowed as a direct child of root (depth 1), found at depth ${depth} (${path}/${n.name})`);
    }
  };
  walk(root, "", 0);
  return root;
}

// Generate `n` small items with stable names and sizes in [min, max].
// A fraction `folderProb` are folders containing a few tiny children.
function smallItems(prefix, n, min, max, seed, folderProb = 0.2) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = `${prefix}-${String(i).padStart(3, "0")}`;
    const size = Math.max(1, Math.round(min + r() * (max - min)));
    if (r() < folderProb) {
      out.push(folder(name, smallItems(name, 2 + Math.floor(r() * 3), Math.floor(size / 8), size, seed + i + 1, 0.1)));
    } else {
      out.push(file(name, size));
    }
  }
  return out;
}

export const disk = folder("Macintosh HD", [
  free(40 * GB),

  folder("Applications", [
    folder("Xcode.app", [
      folder("Contents", [
        folder("MacOS", [file("Xcode", 82 * MB)]),
        folder("Resources", smallItems("Resource", 40, 1 * MB, 6 * MB, 11, 0.15)),
        folder("PlugIns", smallItems("PlugIn", 30, 1 * MB, 5 * MB, 12, 0.15)),
        folder("Frameworks", smallItems("Fwk", 12, 5 * MB, 40 * MB, 13, 0.25)),
      ]),
    ]),
    folder("Safari.app", [
      folder("Contents", [
        folder("MacOS", [file("Safari", 18 * MB)]),
        folder("Resources", smallItems("Res", 24, 100 * KB, 4 * MB, 21, 0.1)),
      ]),
    ]),
    folder("Mail.app", [
      folder("Contents", [file("Mail", 22 * MB), ...smallItems("Res", 18, 80 * KB, 2 * MB, 22, 0.1)]),
    ]),
    folder("Notes.app", [folder("Contents", [file("Notes", 9 * MB), ...smallItems("R", 10, 40 * KB, 800 * KB, 23, 0.1)])]),
    folder("Maps.app", [folder("Contents", [file("Maps", 14 * MB), ...smallItems("R", 12, 60 * KB, 900 * KB, 24, 0.1)])]),
    folder("Music.app", [
      folder("Contents", [file("Music", 12 * MB), ...smallItems("R", 10, 50 * KB, 700 * KB, 25, 0.1)]),
    ]),
    ...smallItems("App", 60, 3 * MB, 60 * MB, 26, 0.1),
  ]),

  folder("Library", [
    folder("Developer", [
      folder("CoreSimulator", [
        folder("Devices", smallItems("Device", 8, 200 * MB, 2 * GB, 31, 0.3)),
        folder("Profiles", smallItems("Profile", 6, 50 * MB, 600 * MB, 32, 0.2)),
      ]),
      folder("Xcode", [
        folder("UserData", smallItems("UD", 14, 1 * MB, 80 * MB, 33, 0.2)),
        folder("iOS DeviceSupport", smallItems("iOS", 5, 200 * MB, 1 * GB, 34, 0.2)),
      ]),
    ]),
    folder("Caches", smallItems("Cache", 50, 1 * MB, 200 * MB, 41, 0.15)),
    folder("Application Support", [
      folder("MobileSync", [folder("Backup", smallItems("Backup", 4, 500 * MB, 3 * GB, 51, 0.2))]),
      folder("CloudDocs", smallItems("CD", 20, 1 * MB, 60 * MB, 52, 0.1)),
      ...smallItems("AS", 18, 2 * MB, 120 * MB, 53, 0.1),
    ]),
    folder("Preferences", smallItems("plist", 40, 1 * KB, 60 * KB, 61, 0.0)),
    folder("Logs", smallItems("log", 24, 4 * KB, 8 * MB, 62, 0.0)),
    ...smallItems("Lib", 16, 500 * KB, 40 * MB, 63, 0.15),
  ]),

  folder("System", [
    folder("Library", [
      folder("Extensions", smallItems("kext", 14, 200 * KB, 12 * MB, 71, 0.1)),
      folder("Frameworks", smallItems("Fw", 30, 1 * MB, 80 * MB, 72, 0.2)),
      folder("CoreServices", [
        folder("Apps", smallItems("CSApp", 10, 1 * MB, 30 * MB, 73, 0.1)),
        ...smallItems("CS", 8, 500 * KB, 10 * MB, 74, 0.1),
      ]),
      ...smallItems("SL", 18, 100 * KB, 8 * MB, 75, 0.1),
    ]),
  ]),

  folder("Users", [
    folder("tbrizitsky", [
      folder("Documents", [
        folder("Projects", [
          folder("myapp", [
            folder("node_modules", [
              folder("lodash", [
                folder("internal", smallItems("util", 60, 2 * KB, 40 * KB, 811, 0.05)),
                folder("fp", smallItems("fp", 30, 1 * KB, 20 * KB, 812, 0.05)),
                ...smallItems("lod", 20, 4 * KB, 80 * KB, 813, 0.1),
              ]),
              folder("react", [
                folder("cjs", smallItems("cj", 40, 3 * KB, 30 * KB, 821, 0.05)),
                folder("umd", smallItems("umd", 8, 5 * KB, 40 * KB, 822, 0.05)),
                ...smallItems("r", 12, 2 * KB, 25 * KB, 823, 0.1),
              ]),
              ...smallItems("mod", 100, 1 * KB, 60 * KB, 830, 0.15),
            ]),
            folder("src", [
              folder("components", smallItems("comp", 40, 1 * KB, 14 * KB, 841, 0.05)),
              folder("hooks", smallItems("hook", 16, 1 * KB, 8 * KB, 842, 0.0)),
              folder("utils", smallItems("ut", 20, 1 * KB, 10 * KB, 843, 0.0)),
              ...smallItems("s", 10, 2 * KB, 20 * KB, 844, 0.0),
            ]),
            folder("public", smallItems("asset", 12, 1 * KB, 80 * KB, 851, 0.0)),
            ...smallItems("rootfile", 6, 1 * KB, 12 * KB, 852, 0.0),
          ]),
        ]),
      ]),
      folder("Downloads", smallItems("dl", 30, 1 * MB, 400 * MB, 861, 0.1)),
      folder(".ollama", [
        folder("models", [
          folder("llama3", [file("model.bin", 4 * GB), file("config.json", 2 * KB), file("tokenizer.json", 5 * MB)]),
          folder("mistral", [file("model.bin", 4 * GB), file("config.json", 2 * KB)]),
          folder("qwen", [file("model.bin", 2 * GB), file("config.json", 1 * KB)]),
        ]),
      ]),
      folder("Movies", smallItems("mov", 18, 50 * MB, 2 * GB, 871, 0.1)),
      folder("Pictures", [
        folder("Photos Library", [file("library.photoslibrary", 3 * GB), ...smallItems("ph", 30, 200 * KB, 30 * MB, 872, 0.0)]),
        ...smallItems("img", 24, 100 * KB, 12 * MB, 873, 0.0),
      ]),
      folder("Music", [
        folder("Music", smallItems("track", 40, 2 * MB, 16 * MB, 881, 0.0)),
      ]),
      folder("Library", [
        folder("Caches", smallItems("c", 30, 1 * MB, 200 * MB, 891, 0.1)),
        ...smallItems("l", 14, 100 * KB, 30 * MB, 892, 0.05),
      ]),
    ]),
    folder("Shared", [
      folder("Public", smallItems("pub", 8, 10 * KB, 4 * MB, 911, 0.0)),
      ...smallItems("sh", 12, 4 * KB, 1 * MB, 912, 0.0),
    ]),
  ]),

  folder("private", [
    folder("var", [
      folder("log", smallItems("log", 16, 20 * KB, 60 * MB, 1011, 0.0)),
      folder("db", smallItems("db", 10, 100 * KB, 40 * MB, 1012, 0.1)),
      folder("folders", smallItems("f", 20, 1 * KB, 10 * MB, 1013, 0.2)),
      ...smallItems("v", 8, 4 * KB, 8 * MB, 1014, 0.1),
    ]),
    folder("tmp", smallItems("tmp", 10, 1 * KB, 4 * MB, 1021, 0.0)),
    folder("etc", smallItems("etc", 8, 1 * KB, 200 * KB, 1031, 0.0)),
  ]),

  folder("usr", [
    folder("lib", smallItems("lib", 14, 40 * KB, 20 * MB, 1111, 0.1)),
    folder("bin", smallItems("bin", 40, 4 * KB, 2 * MB, 1112, 0.0)),
    folder("local", [
      folder("bin", smallItems("lb", 20, 4 * KB, 4 * MB, 1121, 0.0)),
      folder("lib", smallItems("ll", 16, 40 * KB, 30 * MB, 1122, 0.1)),
      ...smallItems("loc", 8, 1 * KB, 800 * KB, 1123, 0.0),
    ]),
  ]),

  // Loose files at the disk root
  file("swapfile0", 1 * GB),
  file("mach.sym", 20 * MB),
  file(".DS_Store", 10 * KB),
]);

// ---- Workstation HD ----
// Synthetic developer workstation (macOS) — 14+ levels deep, heavy on small files.

export const workstation = folder("Workstation HD", [
  free(25 * GB),

  folder("System", [
    folder("Library", [
      folder("Extensions", smallItems("kext", 18, 200 * KB, 12 * MB, 201, 0.1)),
      folder("Frameworks", smallItems("Fw", 40, 1 * MB, 80 * MB, 202, 0.2)),
      folder("CoreServices", [
        folder("Apps", smallItems("CSApp", 12, 1 * MB, 30 * MB, 203, 0.1)),
        ...smallItems("CS", 10, 500 * KB, 10 * MB, 204, 0.1),
      ]),
      ...smallItems("SL", 20, 100 * KB, 8 * MB, 205, 0.1),
    ]),
    folder("Library", [
      folder("Developer", [
        folder("Toolchains", [
          folder("XcodeDefault.xctoolchain", [
            folder("usr", [
              folder("lib", [
                folder("clang", [
                  folder("16.0.0", [
                    folder("lib", [
                      folder("darwin", smallItems("header", 30, 2 * KB, 8 * KB, 211, 0.0)),
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]),
  ]),

  folder("Applications", [
    folder("Xcode.app", [
      folder("Contents", [
        folder("MacOS", [file("Xcode", 95 * MB)]),
        folder("Resources", smallItems("Res", 50, 1 * MB, 6 * MB, 301, 0.15)),
        folder("PlugIns", smallItems("PlugIn", 35, 1 * MB, 5 * MB, 302, 0.15)),
        folder("Frameworks", smallItems("Fwk", 15, 5 * MB, 40 * MB, 303, 0.25)),
        folder("Developer", [
          folder("Toolchains", [
            folder("XcodeDefault.xctoolchain", [
              folder("usr", [
                folder("bin", smallItems("xcbin", 20, 400 * KB, 4 * MB, 311, 0.0)),
                folder("lib", smallItems("xclib", 30, 200 * KB, 20 * MB, 312, 0.1)),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]),
    folder("Safari.app", [
      folder("Contents", [
        folder("MacOS", [file("Safari", 22 * MB)]),
        folder("Resources", smallItems("Res", 28, 100 * KB, 4 * MB, 321, 0.1)),
      ]),
    ]),
    folder("Terminal.app", [
      folder("Contents", [
        folder("MacOS", [file("Terminal", 8 * MB)]),
        folder("Resources", smallItems("R", 12, 40 * KB, 600 * KB, 322, 0.0)),
      ]),
    ]),
    ...smallItems("App", 40, 3 * MB, 60 * MB, 330, 0.1),
  ]),

  folder("Library", [
    folder("Developer", [
      folder("Xcode", [
        folder("DerivedData", [
          folder("MyApp-abc123", [
            folder("Build", [
              folder("Intermediates.noindex", [
                folder("MyApp.build", [
                  folder("Debug-iphonesimulator", [
                    folder("MyApp.build", [
                      folder("Objects-normal", [
                        folder("arm64", smallItems("Obj", 60, 4 * KB, 400 * KB, 401, 0.0)),
                      ]),
                      folder("Objects-normal", [
                        folder("x86_64", smallItems("Obj", 60, 4 * KB, 400 * KB, 402, 0.0)),
                      ]),
                    ]),
                  ]),
                ]),
              ]),
              folder("Products", [
                folder("Debug-iphonesimulator", [
                  folder("MyApp.app", [
                    folder("Frameworks", smallItems("dylib", 12, 500 * KB, 8 * MB, 411, 0.1)),
                    folder("_CodeSignature", smallItems("cs", 6, 10 * KB, 40 * KB, 412, 0.0)),
                    ...smallItems("app", 10, 20 * KB, 2 * MB, 413, 0.0),
                  ]),
                ]),
              ]),
            ]),
          ]),
          folder("ServerApp-xyz789", [
            folder("Build", [
              folder("Intermediates.noindex", [
                folder("ServerApp.build", [
                  folder("Debug", [
                    folder("Objects-normal", [
                      folder("arm64", smallItems("Obj", 40, 4 * KB, 300 * KB, 421, 0.0)),
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ]),
          ...smallItems("DD", 8, 50 * MB, 800 * MB, 430, 0.3),
        ]),
      ]),
      folder("CoreSimulator", [
        folder("Devices", smallItems("Device", 10, 200 * MB, 2 * GB, 441, 0.3)),
        folder("Profiles", smallItems("Profile", 8, 50 * MB, 600 * MB, 442, 0.2)),
      ]),
    ]),
    folder("Caches", smallItems("Cache", 60, 1 * MB, 200 * MB, 451, 0.15)),
    folder("Application Support", [
      folder("MobileSync", [folder("Backup", smallItems("Backup", 6, 500 * MB, 3 * GB, 461, 0.2))]),
      folder("CloudDocs", smallItems("CD", 24, 1 * MB, 60 * MB, 462, 0.1)),
      ...smallItems("AS", 22, 2 * MB, 120 * MB, 463, 0.1),
    ]),
    folder("Preferences", smallItems("plist", 50, 1 * KB, 60 * KB, 471, 0.0)),
    folder("Logs", smallItems("log", 30, 4 * KB, 8 * MB, 472, 0.0)),
    ...smallItems("Lib", 20, 500 * KB, 40 * MB, 473, 0.15),
  ]),

  folder("Users", [
    folder("developer", [
      folder("Projects", [
        folder("webapp", [
          folder("node_modules", [
            folder("@babel", [
              folder("core", [
                folder("lib", [
                  folder("config", [
                    folder("files", [
                      folder("module-handlers", [
                        folder("node", smallItems("n", 8, 1 * KB, 6 * KB, 501, 0.0)),
                        folder("browser", smallItems("b", 10, 1 * KB, 8 * KB, 502, 0.0)),
                        ...smallItems("handler", 6, 2 * KB, 12 * KB, 503, 0.0),
                      ]),
                      folder("plugins", smallItems("plugin", 14, 1 * KB, 10 * KB, 504, 0.0)),
                      ...smallItems("file", 8, 2 * KB, 16 * KB, 505, 0.0),
                    ]),
                    folder("helpers", smallItems("h", 10, 1 * KB, 8 * KB, 506, 0.0)),
                    ...smallItems("cfg", 6, 2 * KB, 20 * KB, 507, 0.0),
                  ]),
                  folder("transformation", smallItems("tf", 20, 1 * KB, 14 * KB, 511, 0.0)),
                  folder("util", smallItems("u", 16, 1 * KB, 12 * KB, 512, 0.0)),
                  ...smallItems("mod", 10, 2 * KB, 20 * KB, 513, 0.0),
                ]),
                ...smallItems("core", 12, 2 * KB, 30 * KB, 514, 0.0),
              ]),
            ]),
            folder("@typescript-eslint", [
              folder("parser", [
                folder("node_modules", [
                  folder("@typescript-eslint", [
                    folder("typescript-estree", [
                      folder("node_modules", [
                        folder("typescript", [
                          folder("lib", [
                            file("typescript.js", 12 * MB),
                            ...smallItems("tsc", 40, 8 * KB, 60 * KB, 521, 0.0),
                            folder("types", smallItems("type", 30, 1 * KB, 8 * KB, 522, 0.0)),
                          ]),
                        ]),
                      ]),
                      ...smallItems("estree", 16, 2 * KB, 16 * KB, 523, 0.0),
                    ]),
                  ]),
                ]),
                ...smallItems("parser", 12, 2 * KB, 20 * KB, 524, 0.0),
              ]),
            ]),
            folder("react", [
              folder("cjs", smallItems("cj", 50, 3 * KB, 30 * KB, 531, 0.05)),
              folder("umd", smallItems("umd", 10, 5 * KB, 40 * KB, 532, 0.05)),
              ...smallItems("r", 14, 2 * KB, 25 * KB, 533, 0.1),
            ]),
            folder("typescript", [
              folder("lib", [
                file("typescript.js", 10 * MB),
                ...smallItems("tsserver", 30, 8 * KB, 50 * KB, 541, 0.0),
                folder("types", smallItems("type", 40, 1 * KB, 6 * KB, 542, 0.0)),
              ]),
            ]),
            ...smallItems("mod", 120, 1 * KB, 60 * KB, 550, 0.15),
          ]),
          folder("src", [
            folder("components", smallItems("comp", 50, 1 * KB, 14 * KB, 561, 0.05)),
            folder("hooks", smallItems("hook", 20, 1 * KB, 8 * KB, 562, 0.0)),
            folder("utils", smallItems("ut", 24, 1 * KB, 10 * KB, 563, 0.0)),
            ...smallItems("s", 12, 2 * KB, 20 * KB, 564, 0.0),
          ]),
          folder("public", smallItems("asset", 14, 1 * KB, 80 * KB, 571, 0.0)),
          ...smallItems("rootfile", 8, 1 * KB, 12 * KB, 572, 0.0),
        ]),
        folder("mobile-app", [
          folder("Pods", [
            folder("Headers", [
              folder("Public", smallItems("pub", 30, 1 * KB, 4 * KB, 581, 0.0)),
              folder("Private", smallItems("priv", 20, 1 * KB, 6 * KB, 582, 0.0)),
            ]),
            folder("Target Support Files", [
              folder("Pods-MyApp", [
                folder("Pods-MyApp.debug.xcconfig", [file("xcconfig", 2 * KB)]),
                ...smallItems("pf", 8, 4 * KB, 40 * KB, 583, 0.0),
              ]),
            ]),
            ...smallItems("Pod", 20, 200 * KB, 4 * MB, 584, 0.1),
          ]),
          folder("ios", [
            folder("MyApp", [
              folder("Models", smallItems("Model", 14, 2 * KB, 16 * KB, 591, 0.0)),
              folder("Views", smallItems("View", 18, 2 * KB, 20 * KB, 592, 0.05)),
              folder("Networking", smallItems("Net", 10, 1 * KB, 12 * KB, 593, 0.0)),
            ]),
          ]),
        ]),
        folder("cli-tool", [
          folder("src", smallItems("src", 16, 2 * KB, 14 * KB, 601, 0.0)),
          folder("test", smallItems("test", 12, 1 * KB, 8 * KB, 602, 0.0)),
        ]),
      ]),
      folder("Documents", [
        folder("Research", smallItems("paper", 20, 100 * KB, 8 * MB, 611, 0.0)),
        folder("Notes", smallItems("note", 30, 4 * KB, 40 * KB, 612, 0.0)),
      ]),
      folder("Downloads", smallItems("dl", 40, 1 * MB, 400 * MB, 621, 0.1)),
      folder(".pyenv", [
        folder("versions", [
          folder("3.11.7", [
            folder("lib", [
              folder("python3.11", [
                folder("site-packages", [
                  folder("numpy", [
                    folder("core", [
                      folder("include", [
                        folder("numpy", smallItems("npy", 40, 1 * KB, 8 * KB, 631, 0.0)),
                      ]),
                      folder("src", smallItems("src", 30, 2 * KB, 20 * KB, 632, 0.0)),
                    ]),
                    ...smallItems("np", 16, 4 * KB, 40 * KB, 633, 0.0),
                  ]),
                  folder("pandas", [
                    folder("_libs", smallItems("lib", 50, 2 * KB, 16 * KB, 641, 0.0)),
                    folder("core", smallItems("core", 40, 2 * KB, 20 * KB, 642, 0.0)),
                    ...smallItems("pd", 20, 4 * KB, 30 * KB, 643, 0.0),
                  ]),
                  ...smallItems("pkg", 30, 40 * KB, 4 * MB, 650, 0.1),
                ]),
                folder("lib-dynload", smallItems("dyn", 20, 20 * KB, 200 * KB, 651, 0.0)),
                ...smallItems("py", 40, 4 * KB, 80 * KB, 652, 0.0),
              ]),
            ]),
          ]),
        ]),
      ]),
      folder(".nvm", [
        folder("node", [
          folder("v18.19.0", [
            folder("lib", [
              folder("node_modules", [
                folder("npm", [
                  folder("lib", [
                    folder("utils", smallItems("u", 30, 2 * KB, 16 * KB, 661, 0.0)),
                    folder("commands", smallItems("cmd", 24, 2 * KB, 12 * KB, 662, 0.0)),
                    ...smallItems("np", 16, 4 * KB, 20 * KB, 663, 0.0),
                  ]),
                ]),
                folder("corepack", smallItems("cp", 12, 4 * KB, 20 * KB, 664, 0.0)),
              ]),
            ]),
            folder("include", [
              folder("node", smallItems("h", 40, 1 * KB, 8 * KB, 671, 0.0)),
            ]),
          ]),
        ]),
      ]),
      folder("Library", [
        folder("Caches", smallItems("c", 40, 1 * MB, 200 * MB, 681, 0.1)),
        ...smallItems("l", 18, 100 * KB, 30 * MB, 682, 0.05),
      ]),
    ]),
  ]),

  folder("private", [
    folder("var", [
      folder("log", smallItems("log", 20, 20 * KB, 60 * MB, 701, 0.0)),
      folder("db", smallItems("db", 14, 100 * KB, 40 * MB, 702, 0.1)),
      folder("folders", smallItems("f", 24, 1 * KB, 10 * MB, 703, 0.2)),
      ...smallItems("v", 10, 4 * KB, 8 * MB, 704, 0.1),
    ]),
    folder("tmp", smallItems("tmp", 12, 1 * KB, 4 * MB, 711, 0.0)),
    folder("etc", smallItems("etc", 10, 1 * KB, 200 * KB, 721, 0.0)),
  ]),

  folder("usr", [
    folder("lib", smallItems("lib", 18, 40 * KB, 20 * MB, 801, 0.1)),
    folder("bin", smallItems("bin", 50, 4 * KB, 2 * MB, 802, 0.0)),
    folder("local", [
      folder("Cellar", [
        folder("python@3.11", [
          folder("3.11.7", [
            folder("Frameworks", [
              folder("Python.framework", [
                folder("Versions", [
                  folder("3.11", [
                    folder("lib", [
                      folder("python3.11", [
                        folder("lib-dynload", smallItems("dyn", 24, 20 * KB, 200 * KB, 811, 0.0)),
                        ...smallItems("py", 30, 4 * KB, 80 * KB, 812, 0.0),
                      ]),
                    ]),
                  ]),
                ]),
              ]),
            ]),
            folder("bin", smallItems("bin", 8, 40 * KB, 2 * MB, 813, 0.0)),
          ]),
        ]),
        folder("node", [
          folder("18.19.0", [
            folder("lib", [
              folder("node_modules", smallItems("pkg", 16, 40 * KB, 4 * MB, 821, 0.1)),
            ]),
          ]),
        ]),
        ...smallItems("pkg", 12, 1 * MB, 40 * MB, 830, 0.1),
      ]),
      folder("bin", smallItems("lb", 24, 4 * KB, 4 * MB, 841, 0.0)),
      folder("lib", smallItems("ll", 20, 40 * KB, 30 * MB, 842, 0.1)),
      ...smallItems("loc", 10, 1 * KB, 800 * KB, 843, 0.0),
    ]),
  ]),

  // Loose files at the root
  file("swapfile0", 2 * GB),
  file(".Spotlight-V100", 4 * MB),
  file(".DS_Store", 12 * KB),
]);

// Assign mtimes once at module load so the `lastUpdated` coloring mode has data.
// `computeMtimes` is idempotent (leaves keep their assigned mtime on re-runs).
computeMtimes(disk);
computeMtimes(workstation);

// Fail fast at load (Phase 2): a structurally bad dataset shows up here, not
// after a DialKit dataset switch in the browser. See cfde7a9's regression tests
// for the disk tree; this catches the class going forward, not just that case.
validateTree(disk);
validateTree(workstation);

