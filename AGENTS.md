# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes, plus project-specific instructions for this repository.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Project-specific instructions

### What this project is

A **spec-driven** project describing a **Sunburst map** (a radial space-filling visualization of hierarchical data, similar to the one used in DaisyDisk). The repository contains:

- `spec/sunburst-map.md` — the specification. Source of truth.
- `spec/vocabulary.md` — glossary of project terms; kept in sync with the spec and demo.
- `spec/staging.md` — demo implementation spec: staged build plan + binding implementation values.
- `spec/animation.md` — navigation animation spec (the detailed animation model; see `sunburst-map.md` §10, `staging.md` Stage 5).
- `spec/article.md` — interactive explorable explanation article (prose + widget directives).
- `spec/staging-article.md` — article staging spec: directive syntax, widget configuration, and styling for the article.
- `demo/` — a web-based interactive app built from the spec.

### Spec-first workflow

1. The spec comes first. It must be **sufficient to recreate the demo** at any time, without relying on undocumented decisions baked into code.
2. When asked to change behavior, **edit the spec first**, then implement the demo to match. Do not drive demo behavior from ad-hoc code changes that diverge from the spec.
3. When working in `demo/` and you find a spec gap, ambiguity, or contradiction, **stop and flag it back to the spec** (raise it with the user or propose a spec edit). Do not silently resolve it in code.
4. The demo is a **consequence** of the spec, not the other way around. If the demo and spec disagree, the spec wins unless explicitly decided otherwise.
5. Keep `spec/vocabulary.md` in sync: when a term is introduced or its meaning changes in the spec or demo, update the vocabulary to match.
6. **Article spec propagation**: `spec/article.md` references `sunburst-map.md` / `animation.md` by section number. When a referenced section's behavior changes, update the article's prose to match. The article's interactive widgets self-update (they share the same rendering code), but the narrative must stay accurate.
7. **Decision log**: when you make a non-obvious decision (resolving a spec ambiguity, picking between approaches, trading off one invariant against another), **log it in `DECISIONS.md`** with context, decision, reasoning, spec/code impact, and status. Before merging to `main`, **check `DECISIONS.md` for conflicts** — a new change should not contradict a prior decision without an explicit superseding entry. Never edit or delete past entries (corrections go in a new entry referencing the original).
8. **TODO.md workflow**: If `TODO.md` exists at the repository root at any point (including if created mid-session), follow this algorithm:
   - Ask the user if they want to use the instructions in the file. If no — ignore the file for the rest of the session.
   - If yes — enter planning mode. Read the instructions from `TODO.md`, turn them into a plan. Present the plan to the user clearly marked as instructions from `TODO.md`.
   - If the user does not accept the plan — ask what to do: change the plan, ignore the file for the session, or implement as-is.
   - If the user picks implement — proceed with implementation.
   - Once implementation is done — delete `TODO.md` and commit the changes.
9. **Conformance is tested, not remembered**: changing a binding visual/timing value (e.g. `CENTER_OPACITY`, `SMALLER_ALPHA`, `S`, `L`, `DURATION_MS`, `θ_min`), an animation hard invariant (no-overlap / no-orphans / endpoint continuity), or a navigation state-flow channel (`current`/`currentPair`/timeline preview) without (a) the matching spec edit and (b) a test that would fail on the drift is an **incomplete task**. `demo/tests/spec/conformance.test.js` enforces binding-value agreement between `spec/` text and `demo/src/layout.js` — extend it whenever you add or change a binding value. `demo/src/sample-data.js` runs `validateTree()` at load; a corrupt dataset must surface at import time, not after a runtime navigation.

### Inheritance note

Sections 1–4 above are inherited verbatim (with light header reframing) from [`CLAUDE.md`](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md) in the `multica-ai/andrej-karpathy-skills` repo. Keep them in sync with upstream if the principles are ever updated.