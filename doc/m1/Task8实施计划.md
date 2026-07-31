# Task 8 交互价格精度归一化与补丁发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`)
> tracking. The user forbids subagents, worktrees, branches and fallback paths.

**Goal:** 在 Adapter engine→Scene 边界按 `symbol.pricePrecision` 确定性归一化
所有引擎价格坐标，并正式发布 Adapter/Runtime `0.1.1`。

**Architecture:** Scene Schema 和 version 1 保持不变。Adapter 使用一个共享的
十进制价格 helper 处理所有 KLineCharts Point.value，Runtime 只转发纯 Scene。
正式发布继续使用 `release.yml`、GitHub Environment 与 npm Trusted Publisher，
但按 tag 版本选择本次两个 npm 包并条件跳过未升版的 Python。

**Tech Stack:** TypeScript、Vitest、Playwright、KLineCharts 10.0.0、npm
workspaces、GitHub Actions、npm Trusted Publishing/OIDC。

---

## Task 1：冻结校准与并行状态

**Files:**

- Create: `doc/m1/Task8执行前校准报告.md`
- Create: `doc/m1/Task8实施计划.md`
- Modify: `doc/m1/实施计划.md`
- Preserve: `doc/m1/目标说明.md`
- Preserve untracked: `release-candidate-final-artifacts/`

- [x] **Step 1: 记录工作区、分支、HEAD 与并行改动**
- [x] **Step 2: 追踪 engine→Scene 坏值数据流**
- [x] **Step 3: 枚举所有共享 Point.value 的 Overlay**
- [x] **Step 4: 确认 Scene schema/version 不变**
- [x] **Step 5: 查询 `0.1.1`、tag 与 Release 占用**
- [x] **Step 6: 校准独立 package 补丁发布路径**

## Task 2：共享价格 helper 的 RED→GREEN

**Files:**

- Create: `packages/klinecharts-adapter/src/conversion/price.ts`
- Create: `packages/klinecharts-adapter/test/price.spec.ts`

- [x] **Step 1: 写精确坏值红灯**

断言 `101.67084494773519` 在 precision `2` 输出 `101.67`。

- [x] **Step 2: 写舍入与错误红灯**

断言正负半值远离零、`-0` 变正 `0`、precision `0/16`，并拒绝
NaN/Infinity 和非法 precision。

- [x] **Step 3: 运行 RED**

```bash
fnm exec --using=22.12.0 npm run test --workspace \
  @baron1996/klinecharts-adapter -- --run test/price.spec.ts
```

Expected: FAIL，因为价格 helper 尚不存在。

- [x] **Step 4: 实现最小十进制 helper**

使用 `Number#toString()`、十进制位和 `BigInt`，规则为最接近且半值远离零；
不使用数据库精度、`toFixed` 或浮点乘法缩放。

- [x] **Step 5: 运行 GREEN**

Expected: `price.spec.ts` 全部 PASS。

## Task 3：统一 Overlay 转换与真实浏览器链路

**Files:**

- Modify: `packages/klinecharts-adapter/src/conversion/overlays.ts`
- Modify: `packages/klinecharts-adapter/src/adapter.ts`
- Create: `packages/klinecharts-adapter/test/overlays.spec.ts`
- Modify: `packages/web-runtime/test/runtime.browser.spec.ts`

- [x] **Step 1: 写 conversion 红灯**

以 `horizontalStraightLine` 和代表性多点 Overlay 证明所有 value 使用 precision
`2`，timestamp 完全不变。

- [x] **Step 2: 写真实 browser 红灯**

真实 canvas 创建和拖动水平线，断言 `overlay-created`、`overlay-updated`、
get/list/export 都只输出两位价格。

- [x] **Step 3: 运行 RED 并记录预期长浮点失败**
- [x] **Step 4: 把 `scene.symbol.pricePrecision` 传入统一转换边界**
- [x] **Step 5: 运行 Adapter unit、Adapter browser、Runtime browser GREEN**
- [x] **Step 6: 确认 21 类 fixture round-trip 保持通过**

## Task 4：`0.1.1` 版本与定向 OIDC 发布

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/klinecharts-adapter/package.json`
- Modify: `packages/klinecharts-adapter/src/version.ts`
- Modify: `packages/web-runtime/package.json`
- Modify: `packages/web-runtime/src/index.ts`
- Modify: `packages/render-runtime/package.json`
- Modify: `tools/release/check-release-version.mjs`
- Modify: `tools/release/build-npm-artifacts.mjs`
- Modify: `.github/workflows/release.yml`
- Modify: `tests/installation/release-version.test.mjs`
- Modify: `tests/installation/release-artifacts.test.mjs`
- Modify: `tests/installation/release-metadata.test.mjs`
- Modify: `tests/installation/workflow-contract.test.mjs`
- Modify: `tests/installation/m1-runtime-consumer.test.mjs`
- Modify: `tests/installation/fresh-install.spec.mjs`
- Modify: `tests/installation/workspace-manifest.test.mjs`

- [x] **Step 1: 写 partial release 红灯**

断言 `v0.1.1` 只选择版本为 `0.1.1` 的 Adapter/Runtime，内部依赖必须精确，
Python `0.1.0` 不发布。

- [x] **Step 2: 写 workflow 红灯**

断言同一 `release.yml` 只 build 一次、npm OIDC 不变、PyPI 可条件跳过、Release
assets 接受无 Python 目录。

- [x] **Step 3: 运行 RED**
- [x] **Step 4: 更新版本矩阵和 lockfile**
- [x] **Step 5: 实现按 tag version 选择 npm artifact**
- [x] **Step 6: 实现 conditional PyPI 与 release assets**
- [x] **Step 7: 运行 release/installation GREEN**

## Task 5：文档、生成物与完整候选验证

**Files:**

- Modify: `packages/klinecharts-adapter/README.md`
- Generate only through scripts: render-runtime/Python embedded assets
- Create after completion: `doc/m1/Task8执行报告.md`

- [x] **Step 1: 记录舍入规则和唯一精度来源**
- [x] **Step 2: 运行 `npm run generate` 并检查派生差异**
- [x] **Step 3: 运行完整 `npm run verify`**
- [x] **Step 4: 显式运行 Adapter/Runtime package browser suites**
- [x] **Step 5: 使用正式脚本构建且仅构建两个 `0.1.1` npm tarball**
- [x] **Step 6: 审计内容、路径、secret、许可证、SHA-256 与 SRI**
- [x] **Step 7: 用本地不可变候选做干净 package-exports 消费验证**

## Task 6：源码提交与正式发布

- [ ] **Step 1: 复核 staged scope，排除既有候选目录**
- [ ] **Step 2: 中文提交并 push `main`**
- [ ] **Step 3: 从发布提交创建 annotated `v0.1.1` tag 并 push**
- [ ] **Step 4: 创建 GitHub Release，触发同一 `release.yml` run**
- [ ] **Step 5: 若 Environment 等待审批，返回同一 run/job 最小动作**
- [ ] **Step 6: 监控 Adapter→Runtime OIDC 发布与 Release assets**
- [ ] **Step 7: 不发布 Scene/CLI/Python/private Render Runtime**

## Task 7：registry 黑盒与最终证据

- [ ] **Step 1: 新临时 Node 22 消费者使用新 cache 安装精确版本**
- [ ] **Step 2: 记录 resolved URL、SRI、SHA-256 与模块解析路径**
- [ ] **Step 3: 验证 Runtime manifest 精确依赖 Adapter `0.1.1`**
- [ ] **Step 4: 真实 Chromium 证明两位价格创建/移动/export/recreate**
- [ ] **Step 5: 更新 `doc/m1/Task8执行报告.md` 和主计划**
- [ ] **Step 6: 中文提交/push 最终发布证据**

Expected: my-cage 可升级为 Scene `0.1.0`、Adapter `0.1.1`、Runtime
`0.1.1`，且严格 Drawing API 不再接收长浮点价格。
