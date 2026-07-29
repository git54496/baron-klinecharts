# M1 Task 1 执行报告

## 1. 执行结论

Task 1“冻结 M1 Scene fixture”已完成，结论为 **PASS**。

本轮建立了中性 M1 蜡烛图与水平参考线 fixture，补齐了结构、语义、canonical JSON、SHA-256 和 TypeScript/Python 跨语言证据，并以最小改动修复了双语言 `horizontalStraightLine.anchor.timestamp` 语义校验缺口。

本轮范围严格停留在 Task 1，没有进入 Stable ID/Adapter round-trip 的 Task 2，也没有进入 Runtime/工具栏旅程的 Task 3。

## 2. 修改文件

### 2.1 Fixture 与测试

- `tests/fixtures/scenes/m1-candle-horizontal-line.json`
- `packages/scene-schema/test/overlay-schema.spec.ts`
- `packages/scene-schema/test/semantic-validator.spec.ts`
- `packages/scene-schema/test/canonicalize.spec.ts`
- `packages/scene-schema/test/canonical-json.spec.ts`
- `python/baron-klinecharts/tests/test_validation.py`
- `tests/cross-language/chart-scene-roundtrip.mjs`

### 2.2 最小实现修复

- `packages/scene-schema/src/semantic-validator.ts`
- `python/baron-klinecharts/src/baron_kline/validation.py`

### 2.3 自动生成的派生资产

- `packages/render-runtime/generated/runtime-template.html`
- `packages/render-runtime/src/assets.generated.ts`
- `python/baron-klinecharts/src/baron_kline/runtime/runtime-template.html`

### 2.4 实施记录

- `doc/m1/实施计划.md`
- `doc/m1/Task1执行报告.md`

## 3. RED 失败证据

### 3.1 TypeScript

命令：

```bash
PATH="/tmp/baron-task1-python.SwK26k/bin:$PATH" \
BARON_PYTHON="/tmp/baron-task1-python.SwK26k/bin/python" \
fnm exec --using=22.12.0 \
npm run test --workspace @baron1996/kline-scene-schema
```

结果：

- 8 个测试文件中 1 个失败、7 个通过；
- 107 项测试中 1 项失败、106 项通过；
- 唯一失败项为 `rejects timestamp from a horizontalStraightLine value anchor`；
- 失败信息为 `Expected parseChartScene to throw.`。

该失败证明 TypeScript 语义校验器会放行同时包含 `timestamp` 和 `value` 的水平直线锚点。

### 3.2 Python

命令：

```bash
/tmp/baron-task1-python.SwK26k/bin/python \
  -m unittest discover \
  -s python/baron-klinecharts/tests \
  -p 'test_validation.py'
```

结果：

- 5 项测试中 1 项失败、4 项通过；
- 唯一失败项为 `test_rejects_timestamp_from_horizontal_straight_line_anchor`；
- 失败信息为 `AssertionError: SceneError not raised`。

该失败证明 Python 语义校验器存在相同缺口。

首次直接按测试文件路径调用 unittest 时，因为仓库测试依赖 `discover -s` 将测试目录加入导入路径，出现 `ModuleNotFoundError: helpers`。该结果属于测试发现命令错误，不作为源码 RED；改用仓库既有 discovery 方式后获得了上述真实失败。

## 4. TypeScript/Python GREEN 证据

### 4.1 TypeScript

修复后重新运行 Scene Schema workspace 测试：

```text
Test Files  8 passed (8)
Tests       107 passed (107)
```

覆盖内容包括：

- 有效 M1 fixture；
- 缺少 ID、paneId、value 或 styles；
- `horizontalStraightLine.anchor` 含 timestamp；
- anchor 严格为 `{ value }`；
- NaN、正无穷和负无穷；
- 非法 pane 引用；
- opaque metadata 原样往返。

### 4.2 Python

修复后重新运行 Python validation 测试：

```text
Ran 5 tests
OK
```

TypeScript 与 Python 当前均对非法锚点返回：

- code：`SCENE_SCHEMA_INVALID`
- path：`/overlays/0/anchor`

## 5. Canonical 与跨语言结果

命令：

```bash
PATH="/tmp/baron-task1-python.SwK26k/bin:$PATH" \
BARON_PYTHON="/tmp/baron-task1-python.SwK26k/bin/python" \
fnm exec --using=22.12.0 \
npm run test:cross-language
```

结果：PASS。

M1 fixture 的 TypeScript/Python canonical bytes 完全一致，SHA-256 为：

```text
0664f38d9bb122800c054c8468516d8c17d7737b03eebdb1b7b1860ea03dec52
```

fixture 的固定 Overlay ID、`anchor.value`、蓝色 `rgba(41, 98, 255, 1)`、`1px`、`solid` 样式和 opaque metadata 在重复 parse/canonicalize 后保持一致。

## 6. `npm run verify` 结果

环境：

- Node.js：`v22.12.0`
- Python：`3.12.2`
- 隔离环境：`/tmp/baron-task1-python.SwK26k`
- Python 包安装命令：

  ```bash
  /tmp/baron-task1-python.SwK26k/bin/python \
    -m pip install -e 'python/baron-klinecharts[dev]'
  ```

- `baron_kline` 实际导入路径：

  ```text
  /Users/yebingyue/code/baron/cage-project/baron-klinecharts/python/baron-klinecharts/src/baron_kline/__init__.py
  ```

完整验证命令：

```bash
PATH="/tmp/baron-task1-python.SwK26k/bin:$PATH" \
BARON_PYTHON="/tmp/baron-task1-python.SwK26k/bin/python" \
fnm exec --using=22.12.0 \
npm run verify
```

结果：退出码 0。

主要结果：

- 5 个 workspace typecheck：PASS；
- Mock：3/3 PASS；
- Unit：134/134 PASS；
- 根级 browser：6/6 PASS；
- Rendering：4/4 PASS；
- Python：16/16 PASS；
- TypeScript/Python cross-language：PASS；
- Installation：24/24 PASS；
- Python wheel、sdist 和 fresh-install smoke：PASS；
- production dependency audit：0 个漏洞。

Playwright WebServer 日志出现 `NO_COLOR` 因 `FORCE_COLOR` 被忽略的环境级 warning；浏览器与渲染共 10 项测试全部通过，没有源码断言失败。

## 7. Generate 执行情况与依据

没有在目标测试前单独执行 `npm run generate`。

`packages/scene-schema/src/semantic-validator.ts` 属于 Scene Schema 包的校验源码，本轮对它进行了真实修改。调度要求同时规定目标 GREEN 后必须运行完整 `npm run verify`，而仓库的 `verify` 脚本固定以 `npm run generate` 开始。因此完整验证中的 generate 阶段已执行，并自动同步了三个 Runtime 派生资产。

没有直接编辑 generated、`dist/` 或发布制品。生成后完整 typecheck、浏览器、渲染、Python、跨语言和安装验证均通过。

## 8. 契约前后差异

修复前：

- TypeScript 和 Python 都接受
  `horizontalStraightLine.anchor = { timestamp, value }`；
- `priceLine` 与 `horizontalStraightLine` 共用只检查 `value` 是否存在的分支。

修复后：

- `horizontalStraightLine.anchor` 的键集合必须严格为 `{ value }`；
- 无意义 timestamp 被 TypeScript/Python 同步拒绝；
- value 仍必须是有限数值；
- `priceLine` 原有行为保持不变；
- 蜡烛图、Overlay ID、Adapter、Runtime、canonicalization 和工具栏没有重写。

## 9. 未决项和阻塞

当前没有 Task 1 范围内的未决项或阻塞。

以下内容仍按计划留在后续任务：

- Stable ID 与 Adapter round-trip：Task 2；
- Runtime 与工具栏完整旅程：Task 3；
- registry、tag、Release、npm/PyPI 发布：后续发布门禁。

## 10. `git status --short`

```text
 M packages/render-runtime/generated/runtime-template.html
 M packages/render-runtime/src/assets.generated.ts
 M packages/scene-schema/src/semantic-validator.ts
 M packages/scene-schema/test/canonical-json.spec.ts
 M packages/scene-schema/test/canonicalize.spec.ts
 M packages/scene-schema/test/overlay-schema.spec.ts
 M packages/scene-schema/test/semantic-validator.spec.ts
 M python/baron-klinecharts/src/baron_kline/runtime/runtime-template.html
 M python/baron-klinecharts/src/baron_kline/validation.py
 M python/baron-klinecharts/tests/test_validation.py
 M tests/cross-language/chart-scene-roundtrip.mjs
?? doc/
?? tests/fixtures/scenes/m1-candle-horizontal-line.json
```

所有变更均保持未暂存状态。`doc/` 在 Task 1 开始前已经是未跟踪目录，本轮在其中更新实施计划并新增本报告，没有恢复或清理既有文档。

## 11. 操作边界确认

本轮明确确认：

- 没有执行 Task 2 或 Task 3；
- 没有使用子智能体、worktree，也没有新建或切换分支；
- 没有执行 `git add`、`git commit`、`git push` 或 `git tag`；
- 没有创建 GitHub Release；
- 没有发布 npm 或 PyPI；
- 没有修改其他仓库或总工程文档；
- 没有使用 fallback 或第二图表引擎；
- 没有修改真实数据、远端环境或生产环境。
