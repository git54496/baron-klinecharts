# Standard Toolbar Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Runtime standard toolbar's text buttons with the approved 24×24 / 2px icon system, grouped top-dock layout, and accessible Tooltip without changing Overlay, delete, export, or text-entry behavior.

**Architecture:** Keep `createStandardToolbar` as the public entry point and preserve its Runtime calls. Move icon geometry and tool presentation metadata into focused TypeScript modules, construct every SVG with DOM APIs, and inject a component-scoped stylesheet with the toolbar so consumers and offline HTML receive the same appearance without an additional CSS import.

**Tech Stack:** TypeScript 5.9.3, DOM/SVG APIs, Vitest 4.1.10, Playwright 1.61.0, Vite 7.3.6.

**Approved visual reference:** `tools/toolbar-icon-review/`

**Repository constraints:**

- Work in the current shared working tree and current branch.
- Do not create a worktree or branch.
- Do not use subagents.
- Do not run `git add`, `git commit`, or `git push`.
- Preserve unrelated concurrent changes.
- Run Node.js 22.12.0 through `fnm`; do not build or test under Node.js 20.

---

### Task 1: Add failing toolbar presentation tests

**Files:**

- Modify: `packages/web-runtime/test/toolbar.browser.spec.ts`
- Modify: `packages/web-runtime/test/runtime.spec.ts`
- Modify: `tests/browser/lifecycle.spec.ts`

- [ ] Assert that the toolbar renders all 21 registered Overlay tools plus delete and export actions as icon-only buttons in the approved order.
- [ ] Assert the seven visual groups, accessible Chinese labels, 24×24 SVG view boxes, 2px strokes, active tool state, and retained text-entry control.
- [ ] Assert the toolbar occupies normal flow immediately above the chart and scrolls internally on a narrow host.
- [ ] Assert hover and keyboard focus show a body-level Tooltip containing the Chinese label and underlying type.
- [ ] Assert `destroy()` removes the toolbar, Tooltip, listeners, and text entry through the existing 100-cycle lifecycle gate.
- [ ] Run the focused browser test under Node.js 22.12.0 and confirm the new expectations fail against the current text-button implementation.

### Task 2: Implement the icon and tool registries

**Files:**

- Create: `packages/web-runtime/src/toolbar/toolbar-icons.ts`
- Create: `packages/web-runtime/src/toolbar/toolbar-tools.ts`

- [ ] Encode the approved Tabler-derived and adapted icon geometry as typed SVG node specifications.
- [ ] Build SVG elements exclusively with `document.createElementNS`; do not use `innerHTML`.
- [ ] Define a complete `Record<SupportedOverlayType, ToolPresentation>` so TypeScript rejects any missing registered Overlay mapping.
- [ ] Define the seven approved groups and the delete/export action presentations.
- [ ] Preserve `SUPPORTED_OVERLAYS` as the ordering and capability source of truth.

### Task 3: Replace the Runtime toolbar presentation

**Files:**

- Modify: `packages/web-runtime/src/toolbar/standard-toolbar.ts`
- Create: `packages/web-runtime/src/toolbar/standard-toolbar-styles.ts`
- Delete: `packages/web-runtime/src/toolbar/standard-toolbar.css`

- [ ] Render grouped 34px icon buttons with 19px icons and separators.
- [ ] Keep calls to `runtime.startOverlayDrawing`, unlocked-selected deletion, canonical scene export, and text Overlay values unchanged.
- [ ] Keep the text input after the approved 23-icon sequence as an auxiliary control.
- [ ] Mark the last selected drawing tool with `aria-pressed="true"` and the approved active treatment.
- [ ] Create one body-level Tooltip per toolbar, clamp it to the toolbar viewport, support hover and focus, and hide it on leave, blur, scroll, and resize.
- [ ] Inject the component stylesheet using `textContent` so source examples, package consumers, and bundled offline Runtime share one implementation.
- [ ] Remove every created DOM node and event listener during `destroy()`.

### Task 4: Carry licensing and generated Runtime assets

**Files:**

- Modify: `NOTICE`
- Modify: `tools/sync-legal.mjs`
- Generate: package `NOTICE` and `licenses/Tabler-Icons-LICENSE` copies
- Generate: `packages/render-runtime/generated/runtime-template.html`
- Generate: `packages/render-runtime/src/assets.generated.ts`
- Generate: `python/baron-klinecharts/src/baron_kline/runtime/runtime-template.html`

- [ ] Update the Tabler notice from review-only wording to the production toolbar icon system.
- [ ] Add the Tabler MIT license to the legal synchronization map.
- [ ] Run legal synchronization and verify every distributed package carrying the toolbar has the notice and license.
- [ ] Rebuild and synchronize the self-contained Runtime so HTML/Python rendering uses the new toolbar.

### Task 5: Verify behavior, visuals, and packages

**Files:**

- Verify: `packages/web-runtime/test/toolbar.browser.spec.ts`
- Verify: `tests/browser/lifecycle.spec.ts`
- Verify: `examples/vanilla/`
- Verify: `packages/render-runtime/`

- [ ] Run Web Runtime unit, typecheck, build, and browser suites under Node.js 22.12.0.
- [ ] Run the root lifecycle browser test and the Render Runtime browser/unit suites.
- [ ] Build the vanilla, React, and Vue examples.
- [ ] Inspect the real vanilla example at desktop and narrow viewport sizes; confirm top-dock placement, internal horizontal scrolling, Tooltip placement, active state, and console cleanliness.
- [ ] Run `git diff --check` and report only the files changed for this toolbar implementation; do not stage or commit them.
