# KLineCharts Scene Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Lightweight Charts fork and experimental annotation platform with a KLineCharts 10.0.0 single-engine scene platform shared by Web, editable offline HTML, Node CLI, and Python.

**Architecture:** A strict, versioned `ChartScene` JSON Schema is the only cross-language contract. A KLineCharts Adapter is the only module allowed to import `klinecharts`; Web Runtime, Render Runtime, CLI, and Python operate on scene data and share one browser rendering bundle.

**Tech Stack:** TypeScript 5.9.3, Node.js 22.12+/24, npm workspaces, KLineCharts 10.0.0, JSON Schema 2020-12, Ajv 8.20.0, RFC 8785 canonical JSON, Vite 7.3.6, Vitest 4.1.10, Playwright 1.61.0 with its pinned Chromium revision, Python 3.11–3.14, `jsonschema` 4.26.0.

**Design:** `docs/superpowers/specs/2026-07-24-klinecharts-scene-platform-design.md`

**Repository constraints:**

- Work in the current shared working tree and current branch.
- Do not create a worktree or branch.
- Do not use subagents.
- Do not run `git add`, `git commit`, or `git push` without explicit user authorization.
- Preserve unrelated concurrent-agent changes.
- Use `apply_patch` for source-file edits and explicit file deletion.
- Do not implement a Lightweight Charts compatibility path or runtime fallback.
- Do not run the implementation under Node 20.

---

## 1. Target File Structure

```text
package.json
package-lock.json
tsconfig.base.json
README.md
LICENSE
NOTICE
packages/
├── scene-schema/
│   ├── package.json
│   ├── schema/
│   │   ├── common.schema.json
│   │   ├── runtime.schema.json
│   │   ├── market-data.schema.json
│   │   ├── chart-config.schema.json
│   │   ├── indicator.schema.json
│   │   ├── overlay.schema.json
│   │   ├── pane.schema.json
│   │   └── chart-scene.schema.json
│   ├── scripts/generate.mjs
│   ├── src/
│   │   ├── canonicalize.ts
│   │   ├── canonical-json.ts
│   │   ├── errors.ts
│   │   ├── semantic-validator.ts
│   │   ├── validator.ts
│   │   ├── version.ts
│   │   ├── generated/
│   │   └── index.ts
│   └── test/
├── klinecharts-adapter/
│   ├── package.json
│   ├── src/
│   │   ├── adapter.ts
│   │   ├── engine.ts
│   │   ├── errors.ts
│   │   ├── static-data-loader.ts
│   │   ├── version.ts
│   │   ├── conversion/
│   │   │   ├── chart-options.ts
│   │   │   ├── indicators.ts
│   │   │   ├── overlays.ts
│   │   │   ├── panes.ts
│   │   │   └── viewport.ts
│   │   ├── extensions/
│   │   │   ├── arrow.ts
│   │   │   ├── callout.ts
│   │   │   ├── cross-line.ts
│   │   │   ├── rectangle.ts
│   │   │   ├── text.ts
│   │   │   └── register.ts
│   │   ├── registry/
│   │   │   ├── indicators.ts
│   │   │   └── overlays.ts
│   │   └── index.ts
│   └── test/
├── web-runtime/
│   ├── package.json
│   ├── src/
│   │   ├── events.ts
│   │   ├── runtime.ts
│   │   ├── types.ts
│   │   ├── index.ts
│   │   └── toolbar/
│   │       ├── standard-toolbar.ts
│   │       └── standard-toolbar.css
│   └── test/
├── render-runtime/
│   ├── package.json
│   ├── browser/
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── style.css
│   ├── scripts/
│   │   ├── build-runtime.mjs
│   │   └── sync-python-runtime.mjs
│   ├── src/
│   │   ├── assets.generated.ts
│   │   ├── html.ts
│   │   ├── png.ts
│   │   ├── protocol.ts
│   │   └── index.ts
│   └── test/
└── cli/
    ├── package.json
    ├── src/
    │   ├── cli.ts
    │   ├── args.ts
    │   ├── errors.ts
    │   ├── files.ts
    │   └── commands/
    │       ├── validate.ts
    │       ├── inspect.ts
    │       ├── overlays.ts
    │       ├── indicators.ts
    │       └── render.ts
    └── test/
python/
└── baron-klinecharts/
    ├── pyproject.toml
    ├── src/baron_kline/
    │   ├── __init__.py
    │   ├── errors.py
    │   ├── validation.py
    │   ├── models.py
    │   ├── collections.py
    │   ├── io.py
    │   ├── render.py
    │   ├── schemas/
    │   └── runtime/
    └── tests/
examples/
├── vanilla/
├── react/
├── vue/
└── python/
tests/
├── fixtures/scenes/
├── browser/
├── rendering/
├── cross-language/
└── installation/
```

## 2. Dependency Order

```text
Workspace foundation
→ Scene Schema structural validation
→ Scene semantic validation and canonicalization
→ KLineCharts Adapter base and static data
→ Pane, Y-axis, Indicator support
→ Overlay registry and official extensions
→ Overlay export
→ Web Runtime
→ Editable offline HTML
→ Deterministic PNG
→ CLI
→ Python SDK
→ Cross-language and real-browser gates
→ Legacy removal and final cutover
```

---

### Task 1: Establish the Target Workspace and Hard Runtime Gate

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.npmrc`
- Modify: `.gitignore`
- Modify: `tsconfig.base.json`
- Create: `.nvmrc`
- Delete with `apply_patch`: experimental files under `packages/annotations/`
- Delete with `apply_patch`: experimental files under `packages/schemas/`
- Delete with `apply_patch`: experimental files under `packages/cli/`
- Delete with `apply_patch`: experimental files under `python/baron_charts/`
- Delete with `apply_patch`: `tests/cross-language/annotation-document-roundtrip.mjs`
- Test: `tests/installation/workspace-manifest.test.mjs`

- [ ] **Step 1: Verify the hard prerequisites**

Run:

```bash
node --version
npm --version
python3 --version
git status --short --branch
```

Expected:

- Node is 22.12+ or 24.x.
- npm is 10.x.
- Python is 3.11–3.14.
- Existing dirty files are recorded before any deletion.

If Node does not satisfy `^22.12.0 || ^24.0.0`, stop. Ask the user to switch Node; do not change engine constraints or run a fallback build.

- [ ] **Step 2: Write the failing workspace-manifest test**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));

assert.deepEqual(manifest.workspaces, [
  'packages/scene-schema',
  'packages/klinecharts-adapter',
  'packages/web-runtime',
  'packages/render-runtime',
  'packages/cli',
]);
assert.equal(manifest.engines.node, '^22.12.0 || ^24.0.0');
assert.equal(manifest.packageManager, 'npm@10.8.2');
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
node --test tests/installation/workspace-manifest.test.mjs
```

Expected: FAIL because the current workspace still names the experimental packages.

- [ ] **Step 4: Replace the root workspace metadata**

Set:

```json
{
  "name": "@baron/klinecharts-scene-workspace",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "Apache-2.0",
  "packageManager": "npm@10.8.2",
  "engines": {
    "node": "^22.12.0 || ^24.0.0"
  },
  "workspaces": [
    "packages/scene-schema",
    "packages/klinecharts-adapter",
    "packages/web-runtime",
    "packages/render-runtime",
    "packages/cli"
  ]
}
```

Add scripts only as their packages are created. Do not leave `--if-present` on the final verification path because missing packages must fail.

- Write `22.12.0` to `.nvmrc`.
- Keep `tsconfig.base.json` as the only root TypeScript base configuration.

- [ ] **Step 5: Remove the experimental annotation-platform files**

Delete only the exact experimental paths listed in this task. Do not delete upstream Lightweight Charts source yet; final cutover happens only after the replacement passes end-to-end tests.

- [ ] **Step 6: Add package skeletons**

Create minimal `package.json`, `tsconfig.json`, `src/index.ts`, and `test/smoke.spec.ts` for the five target workspaces.

Use this exact package identity:

| Directory | Package name | Version | Published |
|---|---|---:|---|
| `packages/scene-schema` | `@baron/kline-scene-schema` | `1.0.0` | yes |
| `packages/klinecharts-adapter` | `@baron/klinecharts-adapter` | `1.0.0` | yes |
| `packages/web-runtime` | `@baron/klinecharts-runtime` | `1.0.0` | yes |
| `packages/render-runtime` | `@baron/klinecharts-render-runtime` | `1.0.0` | no; set `private: true` |
| `packages/cli` | `@baron/klinecharts-cli` | `1.0.0` | yes |

The later Python package also uses version `1.0.0`. Public npm packages and Python must remain in one
release version group. Use exact `1.0.0` cross-package dependencies in publishable manifests, not
version ranges. Bundle the private Render Runtime into CLI and Python artifacts; do not leave consumers
with an unpublishable workspace dependency.

Every npm package must use:

```json
{
  "type": "module",
  "engines": {
    "node": "^22.12.0 || ^24.0.0"
  }
}
```

- [ ] **Step 7: Install exact workspace dependencies**

Use exact versions:

```bash
npm install --save-dev --save-exact typescript@5.9.3 vite@7.3.6 vitest@4.1.10 @types/node@22.20.0 @playwright/test@1.61.0
npm install --save-exact --workspace @baron/klinecharts-adapter klinecharts@10.0.0
npm install --save-dev --save-exact --workspace @baron/kline-scene-schema ajv@8.20.0 json-schema-to-typescript@15.0.4
npm install --save-exact --workspace @baron/kline-scene-schema canonicalize@3.0.0
npm install --save-exact --workspace @baron/klinecharts-render-runtime playwright@1.61.0
npm install --save-exact --workspace @baron/klinecharts-cli playwright@1.61.0
npx playwright install chromium
```

The registry check on 2026-07-24 confirmed these exact versions and their Node compatibility. Keep the Node test runner, Node renderer, and Python Playwright packages on exactly 1.61.0 so both rendering entry points install the same Chromium revision. If an exact version later becomes unavailable, stop and update the plan explicitly; do not choose a version silently.

- [ ] **Step 8: Run the workspace test**

Run:

```bash
node --test tests/installation/workspace-manifest.test.mjs
npm install
npm ls klinecharts
npm query '[name="lightweight-charts"]'
```

Expected:

- Workspace test passes.
- `klinecharts@10.0.0` appears once.
- The dependency query returns `[]`.

---

### Task 2: Define Runtime, Common, Market Data, and Chart Configuration Schemas

**Files:**

- Create: `packages/scene-schema/schema/common.schema.json`
- Create: `packages/scene-schema/schema/runtime.schema.json`
- Create: `packages/scene-schema/schema/market-data.schema.json`
- Create: `packages/scene-schema/schema/chart-config.schema.json`
- Create: `packages/scene-schema/schema/chart-scene.schema.json`
- Create: `packages/scene-schema/src/version.ts`
- Create: `packages/scene-schema/test/schema-foundation.spec.ts`
- Create: `tests/fixtures/scenes/minimal-valid.json`
- Create: `tests/fixtures/scenes/invalid-duplicate-time.json`

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from 'vitest';
import minimalScene from '../../../tests/fixtures/scenes/minimal-valid.json';
import duplicateTime from '../../../tests/fixtures/scenes/invalid-duplicate-time.json';
import { parseChartScene } from '../src/index.js';

describe('ChartScene foundation', () => {
  it('accepts a complete minimal scene', () => {
    expect(parseChartScene(minimalScene).schema).toBe('@baron/kline-scene');
  });

  it('rejects duplicate timestamps', () => {
    expect(() => parseChartScene(duplicateTime)).toThrowError(
      expect.objectContaining({ code: 'INVALID_MARKET_DATA' }),
    );
  });
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
npm test --workspace @baron/kline-scene-schema -- schema-foundation.spec.ts
```

Expected: FAIL because schemas and `parseChartScene` do not exist.

- [ ] **Step 3: Implement common JSON definitions**

Define:

- non-empty stable ID
- finite JSON-compatible number
- IEEE 754 safe integer
- RGBA color
- line style
- JSON metadata
- locale
- timezone
- exact semantic version string

Use `additionalProperties: false` everywhere except the explicit metadata value object.

- [ ] **Step 4: Implement RuntimeIdentity**

Require:

```json
{
  "engine": "klinecharts",
  "engineVersion": "10.0.0",
  "runtimeVersion": "1.0.0"
}
```

- [ ] **Step 5: Implement MarketData**

Require millisecond timestamp and OHLC. Keep `volume` and `turnover` independently optional.

Reject timestamps outside the IEEE 754 safe-integer range. Require every numeric value to be finite
and representable in the shared binary64 domain. Do not encode cross-record ordering in JSON Schema;
reserve it for semantic validation.

- [ ] **Step 6: Implement controlled ChartConfig**

Include only pure-data configuration:

- locale
- timezone
- layout
- styles
- thousands separator enum/config
- decimal fold enum/config
- zoom anchor
- predefined date and large-number formatting modes

Do not expose callback-shaped KLineCharts fields.

- [ ] **Step 7: Add the minimal top-level scene**

At this stage, `panes` and `overlays` can be empty arrays while their detailed schemas are added in later tasks.

- [ ] **Step 8: Run structural tests**

Run:

```bash
npm test --workspace @baron/kline-scene-schema -- schema-foundation.spec.ts
```

Expected: the valid fixture passes; structural invalid fixtures fail with schema paths.

---

### Task 3: Define Pane, Y-Axis, and Built-In Indicator Schemas

**Files:**

- Create: `packages/scene-schema/schema/pane.schema.json`
- Create: `packages/scene-schema/schema/indicator.schema.json`
- Modify: `packages/scene-schema/schema/chart-scene.schema.json`
- Create: `packages/scene-schema/test/indicator-schema.spec.ts`
- Modify: `tests/fixtures/scenes/minimal-valid.json`
- Create: `tests/fixtures/scenes/all-indicators.json`
- Create: `tests/fixtures/scenes/invalid-indicator-reference.json`

- [ ] **Step 1: Write failing indicator tests**

Test all 27 KLineCharts 10.0.0 built-ins:

```ts
const supported = [
  'MA', 'EMA', 'SMA', 'BBI', 'VOL', 'MACD', 'BOLL', 'KDJ', 'RSI',
  'BIAS', 'BRAR', 'CCI', 'DMI', 'CR', 'PSY', 'DMA', 'TRIX', 'OBV',
  'VR', 'WR', 'MTM', 'EMV', 'SAR', 'AO', 'ROC', 'PVT', 'AVP',
] as const;
```

Assert:

- each name parses;
- unknown names fail with `UNKNOWN_INDICATOR`;
- each Indicator ID is stable;
- Pane and Y-axis references are required.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/kline-scene-schema -- indicator-schema.spec.ts
```

Expected: FAIL because Pane and Indicator schemas do not exist.

- [ ] **Step 3: Implement ScenePane and SceneYAxis schemas**

Require explicit values for:

- Pane ID
- Pane kind: `candle` or `indicator`
- order
- height
- minHeight
- state
- Y-axis ID
- Y-axis role: `primary` or `additional`
- position
- reverse
- inside
- scrollZoomEnabled
- top/bottom gap

Do not read KLineCharts defaults during parsing.

- [ ] **Step 4: Implement the Indicator discriminated union**

Each indicator branch must define:

- exact `name`;
- allowed `calcParams`;
- Pane and Y-axis references;
- precision;
- visibility;
- z-level;
- controlled styles.

Do not expose `calc`, `figures`, `draw`, `extendData`, or tooltip callbacks.

- [ ] **Step 5: Add semantic reference validation placeholders**

Make unknown Pane/Y-axis references fail in `semantic-validator.ts` with `INVALID_REFERENCE`.

Require exactly one candle Pane. Require every indicator Pane to contain at least one Indicator because
KLineCharts cannot independently create an empty indicator Pane.

Require exactly one primary Y-axis in every Pane. Require every indicator Pane to contain at least one
Indicator that references its primary Y-axis so Adapter creation has a deterministic first Indicator.

Update `minimal-valid.json` from the Task 2 temporary empty-Pane form to its final one-candle-Pane form.

- [ ] **Step 6: Run indicator tests**

Run:

```bash
npm test --workspace @baron/kline-scene-schema -- indicator-schema.spec.ts
```

Expected: all 27 names and reference errors pass.

---

### Task 4: Define Built-In and Project Overlay Schemas

**Files:**

- Create: `packages/scene-schema/schema/overlay.schema.json`
- Modify: `packages/scene-schema/schema/chart-scene.schema.json`
- Create: `packages/scene-schema/test/overlay-schema.spec.ts`
- Create: `tests/fixtures/scenes/all-overlays.json`
- Create: `tests/fixtures/scenes/invalid-overlay-anchor.json`
- Create: `tests/fixtures/scenes/invalid-overlay-code.json`

- [ ] **Step 1: Write failing overlay tests**

Cover the 16 KLineCharts built-ins:

```ts
const builtIns = [
  'horizontalRayLine',
  'horizontalSegment',
  'horizontalStraightLine',
  'verticalRayLine',
  'verticalSegment',
  'verticalStraightLine',
  'rayLine',
  'segment',
  'straightLine',
  'priceLine',
  'priceChannelLine',
  'parallelStraightLine',
  'fibonacciLine',
  'brush',
  'simpleAnnotation',
  'simpleTag',
] as const;
```

Cover project extensions:

```ts
const extensions = ['rectangle', 'arrow', 'crossLine', 'callout', 'text'] as const;
```

Assert callback-shaped values, unknown fields, and JavaScript strings in executable fields fail.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/kline-scene-schema -- overlay-schema.spec.ts
```

Expected: FAIL because the union does not exist.

- [ ] **Step 3: Implement dimension-specific anchors**

Define:

```ts
type SceneTimeAnchor = { timestamp: number };
type SceneValueAnchor = { value: number };
type SceneTimeValueAnchor = { timestamp: number; value: number };
```

Do not require a price on a vertical straight line or a timestamp on a horizontal straight/price line.
For ray and segment variants, store the one shared axis value plus the two meaningful range/direction
coordinates instead of duplicating the shared value in two points.

- [ ] **Step 4: Implement Overlay base fields**

Require:

- ID
- type
- Pane ID
- visible
- locked
- z-level
- mode
- controlled styles

Keep metadata JSON-only.

- [ ] **Step 5: Implement each discriminated branch**

Examples:

```ts
type HorizontalStraightLine = SceneOverlayBase & {
  type: 'horizontalStraightLine';
  anchor: SceneValueAnchor;
};

type Segment = SceneOverlayBase & {
  type: 'segment';
  points: [SceneTimeValueAnchor, SceneTimeValueAnchor];
};

type Rectangle = SceneOverlayBase & {
  type: 'rectangle';
  start: SceneTimeValueAnchor;
  end: SceneTimeValueAnchor;
  stroke: SceneLineStyle;
  fill: SceneFillStyle;
};
```

Give Brush a strict point-count limit. Give text and callout explicit text fields; do not use `extendData: any`.

- [ ] **Step 6: Run overlay tests**

Run:

```bash
npm test --workspace @baron/kline-scene-schema -- overlay-schema.spec.ts
```

Expected: all 21 supported types pass; invalid anchors and code-shaped fields fail.

---

### Task 5: Generate Types and a Self-Contained Structural Validator

**Files:**

- Create: `packages/scene-schema/scripts/generate.mjs`
- Create: `packages/scene-schema/src/generated/schemas.ts`
- Create: `packages/scene-schema/src/generated/chart-scene.ts`
- Create: `packages/scene-schema/src/generated/validate-chart-scene.ts`
- Create: `packages/scene-schema/src/validator.ts`
- Create: `packages/scene-schema/src/errors.ts`
- Create: `packages/scene-schema/src/index.ts`
- Create: `packages/scene-schema/test/generation.spec.ts`
- Create: `packages/scene-schema/scripts/verify-package.mjs`

- [ ] **Step 1: Write failing generation tests**

Assert:

- generated files match source schemas;
- the validator imports no runtime Ajv package;
- generated types contain no `any`;
- package exports the scene schema and parser.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/kline-scene-schema -- generation.spec.ts
```

Expected: FAIL because generated outputs do not exist.

- [ ] **Step 3: Adapt the existing Ajv generation approach**

Use Ajv 2020 standalone output and `json-schema-to-typescript`.

The parser API:

```ts
export function parseChartScene(value: unknown): ChartScene {
  if (!validateChartScene(value)) {
    throw SceneError.fromAjv(validateChartScene.errors);
  }
  return structuredClone(value) as ChartScene;
}
```

- [ ] **Step 4: Make generation deterministic**

Only write generated files when content changes. Use stable input order and LF newlines.

- [ ] **Step 5: Add package verification**

Pack the workspace into a temporary directory, import it from a clean ESM script, and validate `minimal-valid.json`.

- [ ] **Step 6: Run generation and verification**

Run:

```bash
npm run generate --workspace @baron/kline-scene-schema
npm test --workspace @baron/kline-scene-schema
npm run verify:package --workspace @baron/kline-scene-schema
```

Expected: generated sources are current, all tests pass, packaged import works.

---

### Task 6: Add Semantic Validation and Canonicalization

**Files:**

- Create: `packages/scene-schema/src/semantic-validator.ts`
- Create: `packages/scene-schema/src/canonicalize.ts`
- Create: `packages/scene-schema/src/canonical-json.ts`
- Modify: `packages/scene-schema/src/validator.ts`
- Create: `packages/scene-schema/test/semantic-validator.spec.ts`
- Create: `packages/scene-schema/test/canonicalize.spec.ts`
- Create: `packages/scene-schema/test/canonical-json.spec.ts`
- Create: `tests/fixtures/scenes/invalid-ohlc.json`
- Create: `tests/fixtures/scenes/invalid-duplicate-id.json`

- [ ] **Step 1: Write failing semantic tests**

Cover:

- timestamp ordering;
- duplicate timestamps;
- `low <= open/close <= high`;
- unique Pane, Y-axis, Indicator, and Overlay IDs;
- valid references;
- tool-specific point counts;
- unsafe integer and non-finite numeric values;
- exact engine/runtime versions.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/kline-scene-schema -- semantic-validator.spec.ts
```

Expected: FAIL because structural validation alone accepts cross-object errors.

- [ ] **Step 3: Implement ordered semantic checks**

Return the first stable high-level error while retaining all detailed issues:

```ts
interface SceneIssue {
  code: SceneErrorCode;
  path: string;
  message: string;
}
```

Do not coerce or repair invalid data.

- [ ] **Step 4: Implement canonicalization**

Canonicalization must:

- deep clone input;
- write all protocol defaults explicitly;
- preserve array order where semantic;
- sort object keys only for deterministic JSON output;
- never invent business values;
- never replace missing `volume` with `turnover` or vice versa.

- [ ] **Step 5: Implement RFC 8785 canonical bytes**

Expose:

```ts
export function serializeCanonicalScene(scene: unknown): Uint8Array;
export function hashCanonicalScene(scene: unknown): Promise<string>;
```

Both functions first call `parseChartScene`. Use RFC 8785 for number serialization, string escaping,
and object-key ordering. Implement hashing with the standard Web Crypto API so the package remains
browser-safe. Reject unsafe integers and non-finite values; do not stringify them with language-specific
behavior.

- [ ] **Step 6: Make `parseChartScene` structural plus semantic**

```ts
export function parseChartScene(value: unknown): ChartScene {
  const structural = parseStructuralScene(value);
  assertSemanticScene(structural);
  return canonicalizeScene(structural);
}
```

- [ ] **Step 7: Run all schema tests**

Run:

```bash
npm test --workspace @baron/kline-scene-schema
npm run typecheck --workspace @baron/kline-scene-schema
```

Expected: PASS.

---

### Task 7: Build the Adapter Engine Boundary and Static Data Loader

**Files:**

- Create: `packages/klinecharts-adapter/src/version.ts`
- Create: `packages/klinecharts-adapter/src/errors.ts`
- Create: `packages/klinecharts-adapter/src/engine.ts`
- Create: `packages/klinecharts-adapter/src/static-data-loader.ts`
- Create: `packages/klinecharts-adapter/src/conversion/chart-options.ts`
- Create: `packages/klinecharts-adapter/src/adapter.ts`
- Create: `packages/klinecharts-adapter/src/index.ts`
- Create: `packages/klinecharts-adapter/test/static-data-loader.spec.ts`
- Create: `packages/klinecharts-adapter/test/adapter-init.browser.spec.ts`

- [ ] **Step 1: Write the static loader test**

```ts
it('returns the exact embedded bars only for init', async () => {
  const loader = createStaticDataLoader(scene.data);
  const init = await collectBars(loader, 'init');
  const forward = await collectBars(loader, 'forward');

  expect(init).toEqual(scene.data);
  expect(forward).toEqual([]);
  expect(init).not.toBe(scene.data);
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/klinecharts-adapter -- static-data-loader.spec.ts
```

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement the immutable static DataLoader**

Use:

```ts
export function createStaticDataLoader(data: readonly SceneBar[]) {
  const snapshot = structuredClone(data);
  return {
    getBars({ type, callback }: StaticGetBarsParams): void {
      callback(type === 'init' ? structuredClone(snapshot) : [], {
        forward: false,
        backward: false,
      });
    },
  };
}
```

No subscribe/unsubscribe callbacks.

- [ ] **Step 4: Add exact version checks**

Compare:

- `scene.runtime.engineVersion`
- imported KLineCharts `version()`
- Adapter constant
- Runtime package version

Return `ENGINE_VERSION_MISMATCH` on any mismatch.

- [ ] **Step 5: Implement engine creation**

Call KLineCharts in this order and verify with a real browser test:

```text
init container with controlled options
→ setSymbol
→ setPeriod
→ setDataLoader static loader
```

If `init` returns null, throw `RUNTIME_INIT_FAILED`.

- [ ] **Step 6: Implement disposal**

Use KLineCharts `dispose(container)` exactly once and make repeated Adapter disposal safe.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test --workspace @baron/klinecharts-adapter -- static-data-loader.spec.ts
npm run test:browser --workspace @baron/klinecharts-adapter -- adapter-init.browser.spec.ts
```

Expected: static bars render; no network request occurs.

---

### Task 8: Add Pane, Y-Axis, Indicator, and Viewport Conversion

**Files:**

- Create: `packages/klinecharts-adapter/src/registry/indicators.ts`
- Create: `packages/klinecharts-adapter/src/conversion/panes.ts`
- Create: `packages/klinecharts-adapter/src/conversion/id-map.ts`
- Create: `packages/klinecharts-adapter/src/conversion/indicators.ts`
- Create: `packages/klinecharts-adapter/src/conversion/viewport.ts`
- Modify: `packages/klinecharts-adapter/src/adapter.ts`
- Create: `packages/klinecharts-adapter/test/indicators.browser.spec.ts`
- Create: `packages/klinecharts-adapter/test/viewport.browser.spec.ts`

- [ ] **Step 1: Write a real-engine all-indicators test**

Load `all-indicators.json` and query KLineCharts `getIndicators()`. Assert Indicator IDs and names match
directly, then resolve engine Pane/Y-axis IDs through the inverse ID map and compare the resulting Scene
IDs. Also assert no engine Pane/Y-axis ID appears in exported Scene JSON.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm run test:browser --workspace @baron/klinecharts-adapter -- indicators.browser.spec.ts
```

Expected: FAIL because indicators are not created.

- [ ] **Step 3: Implement the indicator allowlist**

The registry contains exactly the 27 Schema-supported names. Do not call `getSupportedIndicators()` to accept newly added upstream indicators automatically.

- [ ] **Step 4: Implement Scene-to-engine ID mapping**

Maintain explicit bidirectional maps:

```ts
interface EngineIdMap {
  readonly paneToEngine: ReadonlyMap<string, string>;
  readonly paneFromEngine: ReadonlyMap<string, string>;
  readonly yAxisToEngine: ReadonlyMap<string, string>;
  readonly yAxisFromEngine: ReadonlyMap<string, string>;
}
```

Map the one Scene candle Pane to KLineCharts `candle_pane`. After engine initialization, query the
actual default Y-axis ID and map it to the Scene primary Y-axis ID.

For indicator Panes and additional Y-axes, allocate deterministic internal IDs from canonical Pane and
Y-axis array positions, such as `baron_pane_0` and `baron_y_0_1`. Do not use random IDs, Scene IDs, or
persisted engine-generated IDs.

- [ ] **Step 5: Create indicators with mapped IDs and references**

For each indicator Pane, create the first Indicator that references its primary Y-axis before any other
Indicator in that Pane. Call:

```ts
chart.createIndicator({
  id: indicator.id,
  name: indicator.name,
  paneId: idMap.paneToEngine.get(indicator.paneId),
  yAxisId: idMap.yAxisToEngine.get(indicator.yAxisId),
  calcParams: [...indicator.calcParams],
  precision: indicator.precision,
  visible: indicator.visible,
  zLevel: indicator.zLevel,
  styles: toKLineChartsIndicatorStyles(indicator.styles),
});
```

Null return is a hard `UNKNOWN_INDICATOR` or `RUNTIME_INIT_FAILED`, not success.

- [ ] **Step 6: Apply Pane and Y-axis options**

Create the first primary-axis Indicator in each indicator Pane before applying that Pane's layout. Then
use `setPaneOptions`, `createYAxis`, and `overrideYAxis` with mapped IDs. After creation, query
`getPaneOptions` and `getYAxes` to assert every intended mapping exists.

- [ ] **Step 7: Apply initial viewport**

Use controlled combinations of `setBarSpace`, `setOffsetRightDistance`, and `scrollToTimestamp`.

Do not persist later pan/zoom changes.

- [ ] **Step 8: Run browser tests**

Run:

```bash
npm run test:browser --workspace @baron/klinecharts-adapter
```

Expected: all indicator and viewport tests pass against real KLineCharts.

---

### Task 9: Register Built-In Overlay Mapping and Project Extensions

**Files:**

- Create: `packages/klinecharts-adapter/src/registry/overlays.ts`
- Create: `packages/klinecharts-adapter/src/conversion/overlays.ts`
- Create: `packages/klinecharts-adapter/src/extensions/rectangle.ts`
- Create: `packages/klinecharts-adapter/src/extensions/arrow.ts`
- Create: `packages/klinecharts-adapter/src/extensions/cross-line.ts`
- Create: `packages/klinecharts-adapter/src/extensions/callout.ts`
- Create: `packages/klinecharts-adapter/src/extensions/text.ts`
- Create: `packages/klinecharts-adapter/src/extensions/register.ts`
- Create: `packages/klinecharts-adapter/test/overlays.browser.spec.ts`
- Create: `packages/klinecharts-adapter/test/extensions.browser.spec.ts`

- [ ] **Step 1: Write failing built-in Overlay tests**

For each supported built-in:

- create from scene;
- query by stable ID;
- inverse-map the engine Pane ID and compare the Scene Pane ID;
- compare points, visible, locked, z-level, mode, and controlled styles;
- assert no engine Pane ID appears in exported Scene JSON.

- [ ] **Step 2: Write failing extension tests**

Render rectangle, arrow, cross-line, callout, and text. Assert each extension registers once and creates a non-null Overlay ID.

- [ ] **Step 3: Verify failure**

Run:

```bash
npm run test:browser --workspace @baron/klinecharts-adapter -- overlays.browser.spec.ts extensions.browser.spec.ts
```

Expected: FAIL because registry and extensions do not exist.

- [ ] **Step 4: Implement the explicit built-in registry**

Each entry has:

```ts
interface OverlayDefinition<T extends SceneOverlay> {
  readonly type: T['type'];
  toEngine(value: T): EngineOverlayCreate;
  fromEngine(value: EngineOverlay): T;
}
```

Do not export `EngineOverlayCreate` or `EngineOverlay` from the package.

- [ ] **Step 5: Implement official extensions**

Use `registerOverlay` with project-owned pure rendering functions. Derive the parameter type with:

```ts
type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];
```

Do not import KLineCharts internal source paths.

- [ ] **Step 6: Preserve dimension-specific anchors**

Map:

- vertical straight line: timestamp only;
- horizontal straight line and price line: value only;
- vertical ray/segment: timestamp plus start/end values;
- horizontal ray/segment: value plus start/end timestamps;
- segment/rectangle/arrow/callout: timestamp plus value;
- brush: bounded timestamp/value path.

Never invent an unused price or timestamp.

Resolve every Overlay `paneId` through the Adapter ID map. Missing mappings are `INVALID_REFERENCE`;
do not let KLineCharts silently move the Overlay to its default candle Pane.

- [ ] **Step 7: Run Overlay browser tests**

Run:

```bash
npm run test:browser --workspace @baron/klinecharts-adapter -- overlays.browser.spec.ts extensions.browser.spec.ts
```

Expected: all 21 Overlay types create successfully.

---

### Task 10: Implement Atomic Scene Load and Overlay Export

**Files:**

- Modify: `packages/klinecharts-adapter/src/adapter.ts`
- Modify: `packages/klinecharts-adapter/src/conversion/overlays.ts`
- Create: `packages/klinecharts-adapter/test/roundtrip.browser.spec.ts`
- Create: `packages/klinecharts-adapter/test/lifecycle.browser.spec.ts`

- [ ] **Step 1: Write failing round-trip tests**

```ts
it('round-trips scene overlays without engine fields', async () => {
  const adapter = await KLineChartsSceneAdapter.create(container, scene);
  const exported = adapter.exportScene();

  expect(exported.overlays).toEqual(scene.overlays);
  expect(JSON.stringify(exported)).not.toMatch(
    /createPointFigures|onClick|extendData|function/,
  );
});
```

- [ ] **Step 2: Write failing atomic-init test**

Use a scene containing an unsupported Overlay after valid indicators. Assert:

- creation rejects;
- container has no KLineCharts child;
- no engine instance remains;
- no partial scene is exportable.

- [ ] **Step 3: Implement atomic creation**

Validate all mappings before DOM creation where possible. Wrap engine creation in `try/catch/finally`; on failure call disposal and clear the container.

- [ ] **Step 4: Implement export**

Export rules:

- start from the canonical source scene;
- replace only `overlays`;
- retain original data, Pane, Y-axis, Indicator, style, viewport, and render settings;
- map only registered Overlay definitions;
- parse the completed scene again before returning.

- [ ] **Step 5: Add lifecycle cycles**

Create and destroy 100 Adapter instances sequentially in a browser test. Assert the container returns to its initial child count and listener probes return to zero.

- [ ] **Step 6: Run Adapter gates**

Run:

```bash
npm test --workspace @baron/klinecharts-adapter
npm run test:browser --workspace @baron/klinecharts-adapter
npm run typecheck --workspace @baron/klinecharts-adapter
npm run build --workspace @baron/klinecharts-adapter
```

Expected: PASS.

---

### Task 11: Build the Web Runtime API and Event Boundary

**Files:**

- Create: `packages/web-runtime/src/types.ts`
- Create: `packages/web-runtime/src/events.ts`
- Create: `packages/web-runtime/src/runtime.ts`
- Create: `packages/web-runtime/src/index.ts`
- Create: `packages/web-runtime/test/runtime.spec.ts`
- Create: `packages/web-runtime/test/runtime.browser.spec.ts`

- [ ] **Step 1: Write failing public API tests**

Test:

- `createKLineSceneRuntime`
- `getScene`
- `exportScene`
- `startOverlayDrawing`
- `addOverlay`
- `updateOverlay`
- `removeOverlay`
- `getOverlay`
- `listOverlays`
- `subscribe`
- `destroy`

Assert no method exposes a KLineCharts Chart object.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/klinecharts-runtime
```

Expected: FAIL because Runtime does not exist.

- [ ] **Step 3: Implement Runtime as scene orchestration**

Runtime owns:

- one Adapter;
- one immutable canonical source scene;
- current selection ID;
- subscribers;
- destroyed state.

No undo/redo state is allowed.

- [ ] **Step 4: Return clones from public getters**

```ts
public getScene(): ChartScene {
  return structuredClone(this.adapter.exportScene());
}
```

Prevent caller mutation of Runtime state.

- [ ] **Step 5: Implement pure-data events**

Emit only:

- `scene-ready`
- `overlay-created`
- `overlay-updated`
- `overlay-removed`
- `overlay-selected`
- `scene-error`

Event payloads contain cloned scene values and stable IDs.

- [ ] **Step 6: Map drawing completion**

Attach callbacks inside the Adapter mapping, not in Scene. On draw completion:

- query the completed Overlay;
- convert it through the registry;
- emit `overlay-created` or `overlay-updated`.

- [ ] **Step 7: Run Runtime gates**

Run:

```bash
npm test --workspace @baron/klinecharts-runtime
npm run test:browser --workspace @baron/klinecharts-runtime
npm run typecheck --workspace @baron/klinecharts-runtime
```

Expected: PASS.

---

### Task 12: Add the Standard Offline Editing Toolbar

**Files:**

- Create: `packages/web-runtime/src/toolbar/standard-toolbar.ts`
- Create: `packages/web-runtime/src/toolbar/standard-toolbar.css`
- Modify: `packages/web-runtime/src/index.ts`
- Create: `packages/web-runtime/test/toolbar.browser.spec.ts`

- [ ] **Step 1: Write failing toolbar tests**

Test:

- tool buttons use the registered Overlay list;
- selecting a tool starts drawing;
- delete removes the selected unlocked Overlay;
- export emits a validated scene download;
- toolbar uses no `innerHTML` for scene text.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm run test:browser --workspace @baron/klinecharts-runtime -- toolbar.browser.spec.ts
```

Expected: FAIL because the toolbar does not exist.

- [ ] **Step 3: Implement toolbar creation with DOM APIs**

Use `createElement`, `textContent`, `addEventListener`, and explicit cleanup callbacks.

Do not hardcode user-visible scene text into HTML strings.

- [ ] **Step 4: Add explicit export**

Serialize the Scene with `serializeCanonicalScene`, create an object URL, click an explicit download
anchor, and revoke the URL immediately after use.

- [ ] **Step 5: Add teardown**

Toolbar `destroy()` removes all DOM and listeners. Runtime destroy calls it.

- [ ] **Step 6: Run browser tests**

Run:

```bash
npm run test:browser --workspace @baron/klinecharts-runtime
```

Expected: PASS.

---

### Task 13: Build the Shared Self-Contained Render Runtime

**Files:**

- Create: `packages/render-runtime/browser/index.html`
- Create: `packages/render-runtime/browser/main.ts`
- Create: `packages/render-runtime/browser/style.css`
- Create: `packages/render-runtime/src/protocol.ts`
- Create: `packages/render-runtime/src/html.ts`
- Create: `packages/render-runtime/src/assets.generated.ts`
- Create: `packages/render-runtime/scripts/build-runtime.mjs`
- Create: `packages/render-runtime/test/html.spec.ts`
- Create: `packages/render-runtime/test/runtime.browser.spec.ts`

- [ ] **Step 1: Write failing self-contained HTML tests**

Assert generated HTML:

- contains no executable external asset reference, CDN tag, module import, network API call, or external
  font source;
- contains a Base64 scene placeholder;
- contains fixed Runtime/KLineCharts version metadata;
- can be opened with network disabled.

Do not blanket-reject inert URL text inside Scene metadata or license attribution. Parse the HTML/CSS
and inspect executable/resource-bearing locations, then rely on the zero-request browser test.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/klinecharts-render-runtime -- html.spec.ts
```

Expected: FAIL because the HTML builder does not exist.

- [ ] **Step 3: Define the browser bridge**

```ts
interface BaronSceneBridge {
  readonly ready: Promise<void>;
  exportScene(): ChartScene;
  destroy(): void;
}

declare global {
  interface Window {
    __BARON_KLINE_SCENE__: BaronSceneBridge;
  }
}
```

Resolve `ready` only after static bars are applied, Indicators finish their initial calculation,
`document.fonts.ready` resolves, and two animation frames complete after the final layout. Disable
KLineCharts animation in the controlled chart options; do not use a time-based sleep as readiness.

- [ ] **Step 4: Build a deterministic inline bundle**

`build-runtime.mjs` must:

- run Vite for browser code;
- inline JS and CSS;
- inline licensed fonts;
- reject any remaining external executable or fetchable asset reference;
- emit `assets.generated.ts`;
- include a single Base64 scene placeholder.

- [ ] **Step 5: Implement `buildStandaloneHtml(scene)`**

Serialize the Scene to RFC 8785 UTF-8 bytes, Base64-encode those exact bytes, replace the one
placeholder, and return a complete HTML string.

- [ ] **Step 6: Add offline browser test**

Open the generated file with Playwright, abort every network request, wait for the bridge, edit one Overlay, export, and parse the result.

- [ ] **Step 7: Run Render Runtime HTML gates**

Run:

```bash
npm run generate --workspace @baron/klinecharts-render-runtime
npm test --workspace @baron/klinecharts-render-runtime
npm run test:browser --workspace @baron/klinecharts-render-runtime
```

Expected: PASS with zero network requests.

---

### Task 14: Add Deterministic PNG Rendering

**Files:**

- Create: `packages/render-runtime/src/png.ts`
- Modify: `packages/render-runtime/src/index.ts`
- Create: `packages/render-runtime/test/png.spec.ts`
- Create: `tests/rendering/baselines/minimal.png`
- Create: `tests/rendering/baselines/all-overlays.png`
- Create: `tests/rendering/baselines/all-indicators.png`

- [ ] **Step 1: Write failing PNG tests**

Test:

- browser missing returns `BROWSER_NOT_INSTALLED`;
- render waits for fonts and `scene-ready`;
- exact width, height, and DPR are applied;
- only the chart render root is captured;
- image includes Overlay layers.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/klinecharts-render-runtime -- png.spec.ts
```

Expected: FAIL because PNG rendering does not exist.

- [ ] **Step 3: Implement the Playwright renderer**

```ts
export async function renderScenePng(
  scene: unknown,
  outputPath: string,
): Promise<void> {
  const parsed = parseChartScene(scene);
  const browser = await launchPinnedChromium();
  try {
    const context = await browser.newContext({
      viewport: {
        width: parsed.render.width,
        height: parsed.render.height,
      },
      deviceScaleFactor: parsed.render.deviceScaleFactor,
      locale: parsed.chart.locale,
      timezoneId: parsed.chart.timezone,
      offline: true,
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.setContent(buildStandaloneHtml(parsed), {
        waitUntil: 'load',
      });
      await page.evaluate(() => window.__BARON_KLINE_SCENE__.ready);
      await page.locator('[data-baron-render-root]').screenshot({
        path: outputPath,
        animations: 'disabled',
        caret: 'hide',
      });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Enforce timeout and cleanup**

Map timeout to `RENDER_TIMEOUT`. Close page, context, and browser in `finally`.

- [ ] **Step 5: Generate and review baselines**

Generate the three baseline fixtures. Inspect them visually before accepting. Do not update baselines automatically during ordinary test runs.

- [ ] **Step 6: Run PNG tests**

Run:

```bash
npm test --workspace @baron/klinecharts-render-runtime
```

Expected: PASS and no browser process remains.

---

### Task 15: Rebuild the Node CLI Around ChartScene

**Files:**

- Create: `packages/cli/src/args.ts`
- Create: `packages/cli/src/errors.ts`
- Create: `packages/cli/src/files.ts`
- Create: `packages/cli/src/commands/validate.ts`
- Create: `packages/cli/src/commands/inspect.ts`
- Create: `packages/cli/src/commands/overlays.ts`
- Create: `packages/cli/src/commands/indicators.ts`
- Create: `packages/cli/src/commands/render.ts`
- Create: `packages/cli/src/cli.ts`
- Create: `packages/cli/test/cli.spec.ts`
- Create: `packages/cli/test/files.spec.ts`
- Create: `packages/cli/scripts/verify-package.mjs`

- [ ] **Step 1: Write failing CLI contract tests**

Cover:

```text
validate
inspect --json
overlays list/get/add/replace/remove
indicators list/add/replace/remove
render --format html/png
install-browser
```

Assert stdout contains only query output and stderr contains JSON errors.

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test --workspace @baron/klinecharts-cli
```

Expected: FAIL because commands do not exist.

- [ ] **Step 3: Implement strict argument parsing**

Use `node:util.parseArgs` or a small explicit parser. Unknown flags are errors.

- [ ] **Step 4: Implement atomic files**

```ts
export async function writeOutputAtomic(
  outputPath: string,
  content: string | Uint8Array,
  force: boolean,
): Promise<void> {
  // Resolve exact parent and basename.
  // Reject existing output unless force is true.
  // Write a temp file in the same directory.
  // Rename temp file to the exact output.
  // Remove temp file on every failure.
}
```

Do not overwrite input in place.

- [ ] **Step 5: Implement collection commands**

Every mutation:

- parses full source Scene;
- applies one explicit mutation;
- reparses full output Scene;
- serializes the result with `serializeCanonicalScene`;
- writes only to `--output`.

- [ ] **Step 6: Implement render commands**

HTML uses `buildStandaloneHtml`. PNG uses `renderScenePng`. No alternate browser path.

`install-browser` resolves the packaged Playwright 1.61.0 CLI and invokes it with
`process.execPath` plus the argument array `['install', 'chromium']`. Do not use a shell command string
or install system Chrome.

- [ ] **Step 7: Add packaged smoke**

Pack into a temporary project, invoke `baron-kline validate`, render HTML, and verify the package does not import private workspace source paths.
The built CLI must contain the private Render Runtime code and generated template; its packed manifest
must not depend on `@baron/klinecharts-render-runtime`.

- [ ] **Step 8: Run CLI gates**

Run:

```bash
npm test --workspace @baron/klinecharts-cli
npm run typecheck --workspace @baron/klinecharts-cli
npm run build --workspace @baron/klinecharts-cli
npm run verify:package --workspace @baron/klinecharts-cli
```

Expected: PASS.

---

### Task 16: Build the Python Scene SDK

**Files:**

- Create: `python/baron-klinecharts/pyproject.toml`
- Create: `python/baron-klinecharts/src/baron_kline/__init__.py`
- Create: `python/baron-klinecharts/src/baron_kline/errors.py`
- Create: `python/baron-klinecharts/src/baron_kline/validation.py`
- Create: `python/baron-klinecharts/src/baron_kline/models.py`
- Create: `python/baron-klinecharts/src/baron_kline/collections.py`
- Create: `python/baron-klinecharts/src/baron_kline/io.py`
- Create: `python/baron-klinecharts/tests/test_validation.py`
- Create: `python/baron-klinecharts/tests/test_canonical_json.py`
- Create: `python/baron-klinecharts/tests/test_models.py`
- Create: `python/baron-klinecharts/tests/test_collections.py`
- Create: `python/baron-klinecharts/tests/test_io.py`

- [ ] **Step 1: Write failing Python model tests**

```python
def test_scene_round_trip_preserves_missing_volume():
    scene = ChartScene.from_dict(load_fixture("minimal-valid.json"))
    assert "volume" not in scene.data[0].to_dict()
    assert scene.to_dict()["runtime"]["engineVersion"] == "10.0.0"
```

- [ ] **Step 2: Verify failure in a clean virtual environment**

Run:

```bash
python3 -m venv /tmp/baron-kline-plan-venv
/tmp/baron-kline-plan-venv/bin/pip install -e python/baron-klinecharts
/tmp/baron-kline-plan-venv/bin/python -m unittest discover -s python/baron-klinecharts/tests -p 'test_*.py'
```

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Implement shared-schema validation**

Bundle the exact JSON schemas. Set `jsonschema==4.26.0` and `rfc8785==0.1.4` as exact runtime
dependencies in `pyproject.toml`. Use `Draft202012Validator`.

Port the ordered semantic checks and canonical defaults from the TypeScript package. Map structural and
semantic errors to the same stable error codes and JSON paths as TypeScript. Add fixture-driven parity
tests so Python cannot accept a Scene that TypeScript rejects, or reject one that TypeScript accepts.

Expose canonical serialization and SHA-256 hashing with the same RFC 8785 bytes as TypeScript. Reject
numeric values outside the shared binary64 and safe-integer domain.

- [ ] **Step 4: Implement explicit models**

Use dataclasses or focused hand-written classes. Do not generate a monolithic untyped dictionary wrapper.

Preserve missing optional fields as missing.

- [ ] **Step 5: Implement collections**

Provide:

- `scene.overlays.list/get/add/replace/remove`
- `scene.indicators.list/get/add/replace/remove`

Each mutation validates the full resulting Scene before assignment.

- [ ] **Step 6: Implement JSON, CSV, list, and DataFrame input**

Require explicit column mapping:

```python
SceneData.from_rows(
    rows,
    columns={
        "timestamp": "ts",
        "open": "o",
        "high": "h",
        "low": "l",
        "close": "c",
        "volume": "v",
    },
)
```

Do not guess column names.

- [ ] **Step 7: Implement atomic JSON output**

Write the RFC 8785 canonical Scene bytes. Use a temporary file in the exact target directory and
`os.replace`. Reject existing targets unless `force=True`.

- [ ] **Step 8: Run Python tests**

Run:

```bash
/tmp/baron-kline-plan-venv/bin/python -m unittest discover -s python/baron-klinecharts/tests -p 'test_*.py'
```

Expected: PASS.

---

### Task 17: Bundle the Shared Runtime into Python and Add Python Rendering

**Files:**

- Create: `packages/render-runtime/scripts/sync-python-runtime.mjs`
- Create: `python/baron-klinecharts/src/baron_kline/runtime/runtime-template.html`
- Create: `python/baron-klinecharts/src/baron_kline/render.py`
- Modify: `python/baron-klinecharts/pyproject.toml`
- Create: `python/baron-klinecharts/tests/test_runtime_sync.py`
- Create: `python/baron-klinecharts/tests/test_render.py`

- [ ] **Step 1: Write failing runtime-sync test**

Hash the Node-generated runtime template and Python-bundled template. Assert exact equality.

- [ ] **Step 2: Verify failure**

Run:

```bash
/tmp/baron-kline-plan-venv/bin/python -m unittest python/baron-klinecharts/tests/test_runtime_sync.py
```

Expected: FAIL because no bundled runtime exists.

- [ ] **Step 3: Implement deterministic sync**

The Node generation script copies the exact template into Python package data only when content changes.

- [ ] **Step 4: Implement Python HTML rendering**

Serialize the Scene to the same RFC 8785 UTF-8 bytes as TypeScript, Base64-encode those exact bytes,
replace the single template placeholder, and write atomically.

- [ ] **Step 5: Implement Python PNG rendering**

Use Playwright Python with the same:

- HTML template;
- scene;
- Chromium family;
- viewport;
- DPR;
- ready bridge;
- screenshot selector.

Do not call the Node CLI.

Add `playwright==1.61.0` as an exact Python runtime dependency. The Python package installs the client
library but never downloads a browser implicitly.

- [ ] **Step 6: Map browser errors**

Return `BROWSER_NOT_INSTALLED` and `RENDER_TIMEOUT` with the same semantics as Node.

- [ ] **Step 7: Run Python render tests**

Run:

```bash
npm run sync:python --workspace @baron/klinecharts-render-runtime
/tmp/baron-kline-plan-venv/bin/pip install -e python/baron-klinecharts
/tmp/baron-kline-plan-venv/bin/python -m playwright install chromium
/tmp/baron-kline-plan-venv/bin/python -m unittest discover -s python/baron-klinecharts/tests -p 'test_*.py'
```

Expected: PASS; HTML is self-contained; PNG matches dimensions.

---

### Task 18: Add Cross-Language, Browser, and Visual Gates

**Files:**

- Create: `tests/cross-language/chart-scene-roundtrip.mjs`
- Create: `tests/browser/edit-and-export.spec.ts`
- Create: `tests/browser/offline-html.spec.ts`
- Create: `tests/rendering/render-baselines.spec.ts`
- Create: `tests/installation/npm-pack.spec.mjs`
- Create: `tests/installation/python-package.py`
- Modify: `package.json`

- [ ] **Step 1: Write the full cross-language test**

Flow:

```text
Python creates Scene
→ CLI adds Overlay
→ browser loads and edits
→ browser exports
→ Python reads exported Scene
→ CLI and Python each render HTML and PNG
```

Compare canonical semantics, not the property order of non-canonical input JSON. On the same pinned
test host, also assert:

- TypeScript and Python emit byte-identical RFC 8785 canonical Scene JSON and SHA-256 hashes;
- CLI and Python emit byte-identical standalone HTML for the same canonical Scene;
- CLI and Python emit byte-identical PNG for the same canonical Scene and render settings;
- the HTML metadata records the exact Scene, Runtime, KLineCharts, and Playwright versions.

- [ ] **Step 2: Write the offline-network test**

Abort all page requests. Generated HTML must still load, edit, and export.

- [ ] **Step 3: Write the browser interaction matrix**

Cover:

- desktop mouse;
- emulated mobile touch;
- create/select/drag/update/delete;
- Chinese text input;
- pan/zoom not persisted;
- no undo/redo UI or hotkeys.

- [ ] **Step 4: Write visual baseline tests**

Cover:

- minimal candlestick scene;
- every built-in indicator across fixtures;
- every supported Overlay;
- dark and light controlled styles;
- fixed locale and timezone.

- [ ] **Step 5: Add top-level verification scripts**

```json
{
  "scripts": {
    "generate": "npm run generate --workspaces",
    "typecheck": "npm run typecheck --workspaces",
    "test:unit": "npm run test --workspaces",
    "test:browser": "playwright test tests/browser",
    "test:rendering": "playwright test tests/rendering",
    "test:cross-language": "node tests/cross-language/chart-scene-roundtrip.mjs",
    "test:python": "python3 -m unittest discover -s python/baron-klinecharts/tests -p 'test_*.py'",
    "verify:packages": "npm run verify:package --workspaces",
    "verify": "npm run generate && npm run typecheck && npm run test:unit && npm run test:browser && npm run test:rendering && npm run test:python && npm run test:cross-language && npm run build --workspaces && npm run verify:packages && npm audit --omit=dev --audit-level=high"
  }
}
```

Do not use `--if-present` in `verify`.

- [ ] **Step 6: Run the complete replacement stack before legacy deletion**

Run:

```bash
npm run verify
```

Expected: PASS.

---

### Task 19: Remove the Legacy Lightweight Charts Repository Surface

**Files to delete with explicit `apply_patch` operations after Task 18 passes:**

- `.circleci/`
- `debug/`
- `indicator-examples/`
- `plugin-examples/`
- `website/`
- `packages/create-lwc-plugin/`
- `src/`
- `tests/e2e/`
- `tests/type-checks/`
- `tests/unittests/`
- `tests/README.md`
- `tests/setup.mjs`
- `tests/tsconfig.composite.json`
- `scripts/`
- `rollup.config.js`
- `dts-config.json`
- `tsdoc.json`
- `tsconfig.composite.base.json`
- `tsconfig.composite.json`
- `tsconfig.json`
- `tsconfig.options.json`
- `tsconfig.prod.json`
- `.puppeteerrc.cjs`
- `.size-limit.js`
- `.vscode/launch.json`
- `.vscode/settings.json`
- `.github/ISSUE_TEMPLATE/`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/logo.svg`
- `.github/workflows/deploy.yml`
- `.github/workflows/pkg-pr-new.yml`
- `.github/workflows/size-limit.yml`
- `BUILDING.md`
- `CONTRIBUTING.md`
- `docs/superpowers/specs/2026-04-15-line-tools-design.md`
- `docs/superpowers/specs/2026-07-24-lightweight-charts-annotations-platform-design.md`
- `docs/superpowers/plans/2026-04-15-line-tools-implementation.md`
- `docs/superpowers/plans/2026-07-24-browser-annotation-core.md`
- `docs/superpowers/plans/2026-07-24-cli-python-document-interop.md`
- `docs/superpowers/plans/2026-07-24-interactive-tools-and-pointer-input.md`
- `docs/superpowers/plans/2026-07-24-workspace-schema-foundation.md`

**Files to create or modify:**

- Rewrite: `README.md`
- Rewrite: `NOTICE`
- Verify: `LICENSE`
- Create: `.github/workflows/verify.yml`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Test: `tests/installation/no-lightweight-charts.test.mjs`

- [ ] **Step 1: Write the failing no-legacy test**

```js
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const forbiddenPaths = [
  'src',
  'website',
  'debug',
  'indicator-examples',
  'plugin-examples',
  'packages/create-lwc-plugin',
  'tests/e2e',
  'tests/type-checks',
  'tests/unittests',
  'rollup.config.js',
];

for (const path of forbiddenPaths) {
  await assert.rejects(access(path), `legacy path still exists: ${path}`);
}

const lock = await readFile('package-lock.json', 'utf8');
assert.doesNotMatch(lock, /"lightweight-charts"/);
```

Also scan target source:

```bash
rg -n "lightweight-charts|createLineTools|Primitive" \
  package.json package-lock.json packages python tests README.md
```

- [ ] **Step 2: Verify the test fails before deletion**

Run:

```bash
node --test tests/installation/no-lightweight-charts.test.mjs
```

Expected: FAIL because legacy source remains.

- [ ] **Step 3: Re-read repository status and resolve concurrent ownership**

Before deleting any path:

```bash
git status --short
```

If a concurrent agent modified a target path for unrelated work, stop and ask the user. Do not overwrite it.

- [ ] **Step 4: Delete exact legacy files**

Use explicit `apply_patch` deletes. Do not use broad recursive deletion, `git rm`, `git reset`, or `git restore`.

Keep:

- the new design document;
- this implementation plan;
- new packages and tests;
- license notices required by KLineCharts and embedded fonts.

- [ ] **Step 5: Rewrite repository documentation**

README must describe:

- KLineCharts single engine;
- ChartScene;
- Web Runtime;
- editable offline HTML;
- CLI;
- Python;
- deterministic rendering;
- exact version support;
- no network data sources;
- no arbitrary callbacks;
- no undo/redo.

- [ ] **Step 6: Add CI**

Run Node 22 and 24 where appropriate. Use one fixed Playwright browser version. Run all release gates, including Python 3.11–3.14 matrix where feasible.

- [ ] **Step 7: Regenerate lockfile and verify no legacy dependency**

Run:

```bash
npm install
npm query '[name="lightweight-charts"]'
node --test tests/installation/no-lightweight-charts.test.mjs
```

Expected:

- The dependency query returns `[]`.
- no-legacy test passes.

---

### Task 20: Final Package, License, Lifecycle, and Release Verification

**Files:**

- Create: `examples/vanilla/`
- Create: `examples/react/`
- Create: `examples/vue/`
- Create: `examples/python/`
- Create: `tests/installation/examples.spec.mjs`
- Create: `tests/installation/license-notice.spec.mjs`
- Create: `tests/installation/fresh-install.spec.mjs`
- Create: `tests/browser/lifecycle.spec.ts`
- Create: `tests/browser/mobile-acceptance.md`
- Modify: package verification scripts as needed

- [ ] **Step 1: Add and verify consumer examples**

Create minimal, executable examples for:

- vanilla browser usage;
- React 19.2.7 using Runtime create/destroy lifecycle;
- Vue 3.5.34 using Runtime mount/unmount lifecycle;
- Python Scene construction plus HTML/PNG rendering.

Use the same full Scene fixture and no network market-data source. Do not add framework-specific chart
engines or wrappers. Build the three Web examples with Vite and run the Python example against the
packed package in a clean environment.

- [ ] **Step 2: Verify package contents**

Pack every public npm package and Python wheel/sdist into temporary directories.

Assert inclusion of:

- built artifacts;
- declarations;
- Schema;
- Runtime template where required;
- LICENSE;
- NOTICE;
- KLineCharts attribution;
- font licenses.

- [ ] **Step 3: Verify fresh installation**

Create clean temporary npm and Python projects. Install packed artifacts only, with no workspace links.

Run:

- Web Runtime import smoke.
- CLI validation and HTML render.
- Python import and HTML render.
- PNG render after explicit browser installation.

- [ ] **Step 4: Verify lifecycle**

In a real browser, create/destroy 100 Runtime instances. Assert:

- no KLineCharts DOM remains;
- no toolbar DOM remains;
- no Runtime listener remains;
- no text editor remains;
- no object URL remains;
- no browser process remains after render.

- [ ] **Step 5: Perform mobile acceptance**

Manually verify the release candidate on:

- current and previous iOS Safari;
- current Android Chrome.

Record exact OS/browser versions and results in `tests/browser/mobile-acceptance.md`.

- [ ] **Step 6: Run all final gates**

Run:

```bash
npm run verify
git diff --check
git status --short
```

Expected:

- all automated gates pass;
- no whitespace errors;
- status contains only intended migration files and pre-existing unrelated changes.

- [ ] **Step 7: Stop before any Git mutation**

Report:

- files created, modified, and deleted;
- verification results;
- remaining manual mobile acceptance, if any;
- exact uncommitted status.

Do not stage, commit, push, branch, or deploy unless the user explicitly authorizes it.

---

## 3. Milestone Checkpoints

### Checkpoint A: Scene Contract

Tasks 1–6 complete.

Required proof:

- canonical Scene validates in TypeScript;
- all 27 indicators and 21 Overlays have strict Schema;
- invalid references and market data fail;
- generated package works from a clean import.

### Checkpoint B: Real KLineCharts Runtime

Tasks 7–12 complete.

Required proof:

- real KLineCharts loads the Scene;
- static data uses no network;
- indicators and Overlays map correctly;
- Web editing exports a valid complete Scene;
- Runtime lifecycle is clean.

### Checkpoint C: Offline Rendering

Tasks 13–14 complete.

Required proof:

- HTML is self-contained and editable;
- PNG is deterministic under fixed inputs;
- no browser fallback exists.

### Checkpoint D: Cross-Language Tools

Tasks 15–18 complete.

Required proof:

- CLI and Python share Scene semantics;
- Python does not compute indicators;
- full cross-language flow passes;
- npm and Python packaged artifacts work.

### Checkpoint E: Cutover

Tasks 19–20 complete.

Required proof:

- no Lightweight Charts source, dependency, or import remains;
- KLineCharts is the only engine;
- complete release verification passes;
- no Git mutation occurred without authorization.
