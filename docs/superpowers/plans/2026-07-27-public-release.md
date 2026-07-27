# Baron KLineCharts Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository policy forbids subagents, worktrees, and Git mutations without explicit user approval.

**Goal:** Move the verified KLineCharts-only ChartScene platform into the clean public repository and prepare a secure `v0.1.0` npm/PyPI bootstrap release that can transition to OIDC-only `v1.0.0` publishing.

**Architecture:** Preserve the existing monorepo package boundaries and copy only the redesigned working tree, not the legacy Git history. Add release metadata and version gates as tested repository contracts, then use one GitHub Release workflow to build immutable npm/Python artifacts and publish them through a protected environment.

**Tech Stack:** Node.js 22.12/24, npm workspaces, TypeScript 5.9, Vitest 4, Playwright 1.61, Python 3.11–3.14, setuptools/build, GitHub Actions, npm provenance/OIDC, PyPI Trusted Publishing.

---

## File map

- `package.json`: private workspace identity, version, scripts, and public package orchestration.
- `package-lock.json`: exact `@baron1996` workspace graph at version `0.1.0`.
- `packages/*/package.json`: npm names, versions, dependencies, repository metadata, and public access rules.
- `python/baron-klinecharts/pyproject.toml`: Python version and verified project URLs.
- `tools/release/check-release-version.mjs`: fail-closed tag/manifest version gate.
- `tools/release/build-npm-artifacts.mjs`: create the four public tarballs in dependency order and emit checksums.
- `tests/installation/release-metadata.test.mjs`: assert canonical repository, public/private package boundaries, scope, and publish configuration.
- `tests/installation/release-version.test.mjs`: exercise the release version gate.
- `.github/workflows/verify.yml`: clean-repository compatibility matrix.
- `.github/workflows/release.yml`: build-once bootstrap release pipeline.
- `README.md`: public installation, package identity, reproducibility, and release status.

### Task 1: Import the clean KLineCharts source snapshot

**Files:**
- Create: all current non-ignored redesigned source files under the new repository
- Preserve: `docs/superpowers/specs/2026-07-27-public-release-design.md`
- Preserve: `docs/superpowers/plans/2026-07-27-public-release.md`
- Exclude: `.git`, `node_modules`, `output`, `test-results`, `playwright-report`, package build directories, Python build metadata, and legacy upstream-only files

- [ ] **Step 1: Produce the source inventory**

Run in the old repository:

```bash
git ls-files --cached --others --exclude-standard
```

Expected: only files present in the redesigned working tree are eligible; deleted legacy paths remain absent.

- [ ] **Step 2: Copy the eligible working-tree files**

Use a mechanical file copy that preserves modes and symlinks. Do not copy `.git` or ignored output.

- [ ] **Step 3: Verify the clean boundary**

Run:

```bash
node --test tests/installation/no-lightweight-charts.test.mjs
rg -n '"lightweight-charts"' package.json package-lock.json packages
```

Expected: legacy-path tests pass; no manifest or lockfile dependency matches.

- [ ] **Step 4: Stop at the commit checkpoint**

Do not stage or commit until the user explicitly authorizes Git operations.

### Task 2: Add failing public-release metadata tests

**Files:**
- Create: `tests/installation/release-metadata.test.mjs`
- Modify: `tests/installation/workspace-manifest.test.mjs`

- [ ] **Step 1: Assert the repository contract**

The new test must load the root and five workspace manifests and assert:

```js
const repositoryUrl = 'git+https://github.com/git54496/baron-klinecharts.git';
const scope = '@baron1996/';
const releaseVersion = '0.1.0';
```

For the four public packages, assert `publishConfig` equals:

```js
{
  access: 'public',
  registry: 'https://registry.npmjs.org/',
}
```

Assert every manifest uses the same repository URL and its exact workspace `directory`.
Assert render-runtime remains private and has no public publish configuration.

- [ ] **Step 2: Assert Python metadata**

Read `python/baron-klinecharts/pyproject.toml` and assert version `0.1.0` plus Source,
Issues, and Changelog URLs under `git54496/baron-klinecharts`.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
node --test tests/installation/release-metadata.test.mjs tests/installation/workspace-manifest.test.mjs
```

Expected: FAIL because copied manifests still use `@baron`, version `1.0.0`, and lack release metadata.

### Task 3: Migrate scope, version, and repository metadata

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/scene-schema/package.json`
- Modify: `packages/klinecharts-adapter/package.json`
- Modify: `packages/web-runtime/package.json`
- Modify: `packages/render-runtime/package.json`
- Modify: `packages/cli/package.json`
- Modify: `python/baron-klinecharts/pyproject.toml`
- Modify: all TypeScript imports, fixtures, examples, generated schemas, runtime assets, tests, and README references that contain `@baron/` or project runtime version `1.0.0`

- [ ] **Step 1: Change package identities**

Replace the npm namespace with `@baron1996`, set every workspace and the root workspace
to `0.1.0`, and update internal exact dependencies to `0.1.0`.

- [ ] **Step 2: Add repository and publish metadata**

Set the canonical repository URL and exact package directory on all public manifests.
Set public access and npmjs registry only on the four public packages.

- [ ] **Step 3: Update Python project metadata**

Set version `0.1.0` and add:

```toml
[project.urls]
Source = "https://github.com/git54496/baron-klinecharts"
Issues = "https://github.com/git54496/baron-klinecharts/issues"
Changelog = "https://github.com/git54496/baron-klinecharts/releases"
```

- [ ] **Step 4: Refresh the lockfile and generated assets**

Run:

```bash
npm install --package-lock-only
npm install
npm run generate
```

Expected: the lockfile contains only `@baron1996` workspace identities; synchronized JavaScript/Python schemas and runtime templates report `0.1.0`.

- [ ] **Step 5: Run metadata tests and verify GREEN**

Run:

```bash
node --test tests/installation/release-metadata.test.mjs tests/installation/workspace-manifest.test.mjs
```

Expected: PASS.

### Task 4: Implement the fail-closed release version gate

**Files:**
- Create: `tools/release/check-release-version.mjs`
- Create: `tests/installation/release-version.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write release-version test cases**

Cover:

- `v0.1.0` matching all manifests passes;
- a tag without the leading `v` fails;
- a mismatched tag fails;
- a mismatched workspace version fails;
- a mismatched Python version fails;
- missing tag input fails.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/installation/release-version.test.mjs
```

Expected: FAIL because the release checker does not exist.

- [ ] **Step 3: Implement the checker**

The script accepts `--tag` or `GITHUB_REF_NAME`, parses exact stable SemVer, reads all npm
manifests and `pyproject.toml`, and prints the validated version. It exits non-zero on the
first inconsistency and never edits files.

- [ ] **Step 4: Add the root script**

Add:

```json
"release:check-version": "node tools/release/check-release-version.mjs"
```

- [ ] **Step 5: Run the test and verify GREEN**

Run:

```bash
node --test tests/installation/release-version.test.mjs
npm run release:check-version -- --tag v0.1.0
```

Expected: PASS and output `0.1.0`.

### Task 5: Build deterministic release artifacts

**Files:**
- Create: `tools/release/build-npm-artifacts.mjs`
- Create: `tests/installation/release-artifacts.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write artifact-builder tests**

Assert the builder:

- produces exactly four npm tarballs;
- preserves dependency order;
- excludes render-runtime;
- records package name, version, filename, SHA-256, and SHA-512 integrity;
- fails if the output directory already contains release files;
- fails if a packed manifest contains workspace dependencies or a non-public package.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/installation/release-artifacts.test.mjs
```

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement the builder**

Use `npm pack --json` for each public package and write a machine-readable
`npm-artifacts.json` plus `SHA256SUMS`. Keep output under ignored `release-artifacts/`.

- [ ] **Step 4: Add the root script**

Add:

```json
"release:build-npm": "node tools/release/build-npm-artifacts.mjs"
```

- [ ] **Step 5: Verify GREEN and installation**

Run:

```bash
npm run build --workspaces
npm run release:build-npm
node --test tests/installation/release-artifacts.test.mjs tests/installation/fresh-install.spec.mjs
```

Expected: PASS; tarballs install without workspace links.

### Task 6: Add verification and bootstrap release workflows

**Files:**
- Modify: `.github/workflows/verify.yml`
- Create: `.github/workflows/release.yml`
- Create: `tests/installation/workflow-contract.test.mjs`

- [ ] **Step 1: Write workflow contract tests**

Assert:

- verify runs on pull requests and `main`;
- release runs only for `release.published`;
- build job has read-only contents permission;
- only publishing jobs receive `id-token: write`;
- npm and PyPI jobs use GitHub Environment `release`;
- bootstrap npm auth references only `secrets.NPM_TOKEN`;
- PyPI publishing contains no username, password, or token;
- release workflow calls the version gate before verification;
- release workflow builds artifacts once and downstream jobs download them.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
node --test tests/installation/workflow-contract.test.mjs
```

Expected: FAIL because `release.yml` does not exist.

- [ ] **Step 3: Update verification workflow**

Keep Node 22.12, Node 24, and Python 3.11–3.14 coverage; switch branch filtering to the
new repository's `main` identity.

- [ ] **Step 4: Implement bootstrap `release.yml`**

Build on Node 24 with npm 11.5.1+, Python 3.12, and GitHub-hosted runners. Run the version
gate, full verification, npm artifact builder, Python wheel/sdist build, and checksum
generation before protected publishing jobs.

Use the one-time `NPM_TOKEN` only in the npm job for `v0.1.0`. Use PyPI OIDC and
`pypa/gh-action-pypi-publish` without credentials. Attach built artifacts to the existing
GitHub Release after both registries succeed.

- [ ] **Step 5: Run workflow contract tests and verify GREEN**

Run:

```bash
node --test tests/installation/workflow-contract.test.mjs
```

Expected: PASS.

### Task 7: Update public documentation and legal synchronization

**Files:**
- Modify: `README.md`
- Modify: `python/baron-klinecharts/README.md`
- Create: `packages/scene-schema/README.md`
- Create: `packages/klinecharts-adapter/README.md`
- Create: `packages/web-runtime/README.md`
- Create: `packages/cli/README.md`
- Verify: `LICENSE`
- Verify: `NOTICE`
- Verify: `licenses/*`
- Verify: package-local legal files

- [ ] **Step 1: Update installation examples**

Use `@baron1996/klinecharts-runtime`, `@baron1996/klinecharts-cli`, and
`baron-klinecharts==0.1.0`. Explain Chromium installation as an explicit action.

- [ ] **Step 2: Document release status**

State that `0.1.0` is the complete bootstrap release and that npm OIDC replaces the
one-time token before `1.0.0`.

- [ ] **Step 3: Regenerate and verify legal files**

Run:

```bash
npm run generate
node --test tests/installation/license-notice.spec.mjs
```

Expected: all distributable packages contain synchronized Apache/OFL notices.

### Task 8: Run full release-candidate verification

**Files:**
- Verify only

- [ ] **Step 1: Clean-install dependencies**

Run with the repository's supported Node/Python versions:

```bash
npm ci
python3 -m pip install -e 'python/baron-klinecharts[dev]'
npx playwright install chromium
```

- [ ] **Step 2: Run the full suite**

Run:

```bash
npm run verify
```

Expected: schema, adapter, runtime, render, CLI, browser, rendering, Python,
cross-language, package installation, and audit gates all pass.

- [ ] **Step 3: Build final release artifacts**

Run:

```bash
npm run release:check-version -- --tag v0.1.0
npm run release:build-npm
python3 -m build --wheel --sdist --outdir release-artifacts/python python/baron-klinecharts
```

Expected: four npm tarballs, one wheel, one sdist, manifests, and checksums.

- [ ] **Step 4: Inspect repository status**

Run:

```bash
git diff --check
git status --short
```

Expected: only intended source, generated, test, workflow, and documentation files.

- [ ] **Step 5: Request Git authorization**

Report exact verification evidence and external npm/PyPI/GitHub configuration steps.
Request explicit permission before any `git add`, Chinese commit, tag, or push.

### Task 9: Post-bootstrap OIDC transition

**Files:**
- Modify after successful `v0.1.0`: `.github/workflows/release.yml`
- Modify after successful `v0.1.0`: every npm/Python version source

- [ ] **Step 1: Configure registry trust**

The repository owner binds the four npm packages and the PyPI project to
`git54496/baron-klinecharts`, `release.yml`, and Environment `release`.

- [ ] **Step 2: Remove bootstrap authentication**

Delete the GitHub `NPM_TOKEN` secret and remove every `NODE_AUTH_TOKEN` reference from
`release.yml`. Do not retain a token fallback.

- [ ] **Step 3: Require OIDC-only npm publishing**

Keep `id-token: write`, npm 11.5.1+, public access, and provenance. Configure npm package
settings to require 2FA and disallow traditional tokens.

- [ ] **Step 4: Prepare `1.0.0`**

Update all manifests, generated runtime version fields, fixtures, tests, and lockfile to
`1.0.0`; regenerate and rerun Task 8 before creating `v1.0.0`.
