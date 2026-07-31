# Sunburst Map

<p>An interactive article about the less obvious aspects of sunburst visualization</p>

<p>
  <a href="https://tbrizitsky.github.io/Sunburst-article/">
    <img alt="Live article" src="https://img.shields.io/badge/read_the_article-live-blue?style=flat&logo=githubpages&logoColor=white" />
  </a>
  <a href="LICENSE">
    <img alt="License: CC0" src="https://img.shields.io/badge/demo%20code-CC0_1.0-success?style=flat" />
  </a>
  <a href="LICENSE-CC-BY-4.0">
    <img alt="License: CC-BY" src="https://img.shields.io/badge/specs-CC_BY_4.0-blue?style=flat" />
  </a>
  <a href="demo/package.json">
    <img alt="React" src="https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react&logoColor=white" />
  </a>
  <a href="demo/package.json">
    <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?style=flat&logo=vite&logoColor=white" />
  </a>
</p>

---

The whole project is **spec-first**: every behavior is specified in `spec/` before it's implemented in `demo/`. An AI agent can rebuild the demo from the specs alone. The repo also contains a fully working interactive playground where you can explore the sunburst map, tweak parameters, and see how it works.

> **▶ Read the article live:** [https://tbrizitsky.github.io/Sunburst-article/](https://tbrizitsky.github.io/Sunburst-article/)

## Table of contents

- [What this is](#what-this-is)
- [What this isn't](#what-this-isnt)
- [Project structure](#project-structure)
- [Spec-first workflow](#spec-first-workflow)
- [Running the demo](#running-the-demo)
- [Debug mode](#debug-mode)
- [Running tests](#running-tests)
- [License](#license)

## What this is

- **A freely available article** — an interactive explorable explanation of sunburst visualization, written by the original DaisyDisk designer.
- **An interactive playground** — a working sunburst map demo with hover, navigation, and animation, built from the specs in this repo.
- **A spec-first experiment** — the specs are the source of truth; the demo is a consequence of the specs, not the other way around.

<p align="right"><a href="#sunburst-map">back to top ↑</a></p>

## What this isn't

- **Not a production-ready component.** This is a proof-of-concept playground, not a drop-in library. If you want to build your own visualization primitive, you'll need to do it yourself.
- **Not a DaisyDisk / Filelight / Scanner replacement.** The demo is missing the vast majority of features needed to build a real disk-usage tool.

<p align="right"><a href="#sunburst-map">back to top ↑</a></p>

## Project structure

```
spec/                         # Specifications (source of truth)
  sunburst-map.md             #   Core spec — semantics, layout, color, navigation
  animation.md                #   Navigation animation model
  staging.md                  #   Demo implementation plan + binding constants
  vocabulary.md               #   Glossary of terms
  article.md                  #   Interactive explorable explanation (the article)
  staging-article.md          #   Article infrastructure (parser, directives, styling)
  other-widgets/              #   Per-widget embed specs
    sunburst.md               #     Sunburst widget
    treemap.md                #     Treemap widget
    icicle.md                 #     Icicle widget
  SOURCES-FOR-THE-ARTICLE.md  #   Academic sources cited in the article
demo/                        # Web-based interactive demo (Vite + React + SVG)
  src/
    SunburstMap.jsx           #   Layout + SVG rendering + hover
    layout.js                 #   Pure layout algorithm
    sample-data.js            #   Synthetic disk tree
  tests/                      #   Test suite (unit, spec conformance, animation invariants)
```

<p align="right"><a href="#sunburst-map">back to top ↑</a></p>

## Spec-first workflow

The spec is the source of truth. The demo is a consequence of the spec, not the other way around. If the demo and spec disagree, **the spec wins.**

| File | Role |
| :--- | :--- |
| `spec/sunburst-map.md` | What the map means (implementation-agnostic) |
| `spec/animation.md` | The detailed navigation animation model |
| `spec/staging.md` | How the demo is built, with binding constants |

<p align="right"><a href="#sunburst-map">back to top ↑</a></p>

## Running the demo

```bash
cd demo
npm install
npm run dev
```

This starts a Vite dev server on `localhost`. The demo is desktop-only.

<p align="right"><a href="#sunburst-map">back to top ↑</a></p>

## Debug mode

The demo has a debug mode that reveals the full interactive UI — a DialKit animation timeline for scrubbing navigation transitions, a sidebar with live parameters, and React Grab integration for visual debugging. Without debug mode, the demo shows the article view only.

Debug mode can be turned on in three ways (checked in priority order):

| Method | How |
| :--- | :--- |
| URL parameter | Append `?debug=true` to the dev server URL (e.g. `localhost:5173/?debug=true`). Use `?debug=false` to explicitly disable. |
| localStorage | `localStorage.setItem('sunburst:debug', 'true')` in the browser console. Persists across reloads. |
| Environment variable | Set `VITE_DEBUG=true` (or `=1`) in a `.env` file in `demo/` before starting the dev server. |

You can also toggle it at runtime with the keyboard shortcut **`Ctrl + `** (backtick). This switches between the article view and the debug UI without reloading the page.

<p align="right"><a href="#sunburst-map">back to top ↑</a></p>

## Running tests

```bash
cd demo
npm test          # run full suite
npm run test:watch # watch mode
```

The test suite includes spec conformance checks that verify binding values in the code match values in the spec, as well as animation invariant tests (no-overlap, no-orphans, endpoint continuity).

<p align="right"><a href="#sunburst-map">back to top ↑</a></p>

## License

The author is not looking for contributions/MRs, but you are free to fork the repo and do whatever you want.

| Layer | License |
| :--- | :--- |
| Demo code (`demo/`) | [![License: CC0](https://img.shields.io/badge/CC0_1.0-success?style=flat)](https://creativecommons.org/publicdomain/zero/1.0/)|
| Specifications (`spec/`) | [![License: CC BY 4.0](https://img.shields.io/badge/CC_BY_4.0-blue?style=flat)](https://creativecommons.org/licenses/by/4.0/) |
| Dependencies (React, Vite, etc.) | Each has its own license as specified in their `package.json` or repository |

<p align="right"><a href="#sunburst-map">back to top ↑</a></p>
