# M1 Task 2 执行报告

## 1. 执行结论

Task 2“证明 Adapter 水平参考线 round-trip”已完成，结论为 **PASS**。

本轮使用 Task 1 的 `m1-candle-horizontal-line.json` fixture 新增了两条真实 Adapter browser 测试，分别证明水平参考线的创建/export，以及 create → export → dispose → recreate → export 生命周期。新增测试首次运行即 10/10 PASS，说明现有 Adapter 已满足 Task 2 契约，因此没有修改 Adapter 源码。

本轮范围严格停留在 Task 2，没有进入 Runtime/标准工具栏的 Task 3。

## 2. 修改文件

本轮实际修改：

- `packages/klinecharts-adapter/test/overlays.browser.spec.ts`
- `packages/klinecharts-adapter/test/roundtrip.browser.spec.ts`
- `doc/m1/实施计划.md`
- `doc/m1/Task2执行报告.md`

Task 1 的 fixture、源码、测试、派生资产和文档改动全部保留，没有恢复、清理或覆盖。

## 3. 现有实现直接 PASS 的证据

新增 browser 测试后首次运行：

```bash
fnm exec --using=22.12.0 \
  npm run test:browser --workspace @baron1996/klinecharts-adapter
```

结果：

```text
Running 10 tests using 1 worker
10 passed
```

其中新增测试均在首次执行时通过：

- `@browser adds the M1 horizontal line with its stable Scene ID and data anchor`
- `@browser preserves one M1 horizontal line across dispose and recreate`

该结果属于调度提示词允许的“现有实现直接 PASS”。没有为了制造 RED 而修改或破坏现有实现，也没有制造 Adapter 源码改动。

## 4. 创建/export 与 dispose/recreate 旅程证据

### 4.1 创建与 export

创建测试执行以下真实浏览器旅程：

```text
加载 Task 1 M1 fixture
→ 在内存副本中清空 overlays
→ 创建 KLineChartsSceneAdapter
→ 调用 addOverlay 添加 fixture 水平线
→ inspect
→ exportScene
→ dispose
```

断言结果：

- `addOverlay` 返回 ID 为 `overlay-m1-horizontal-reference`；
- Adapter snapshot 中只有同一个 ID；
- export 后 Overlay 数量严格为 1；
- export 后 Overlay 与 fixture 中的 type、id、paneId、anchor、styles、metadata 逐字段一致。

`addOverlay` 只有在真实 KLineCharts `createOverlay` 返回值等于 Scene Overlay ID 时才会成功返回，因此该浏览器 PASS 同时证明 engine ID 等于 Scene stable Overlay ID。

### 4.2 dispose 与 recreate

round-trip 测试真实执行：

```text
create adapter
→ export scene
→ dispose
→ create new adapter with export
→ export again
→ dispose
```

断言结果：

- 第一次和第二次 export 的 Overlay 数量均严格为 1；
- 第二次 export 的 Overlay 与第一次完全相同；
- stable ID、value、styles 和 metadata 均未改变；
- 两次 Adapter 活跃期间容器都存在真实引擎 DOM；
- 每次 dispose 后容器子节点数量均恢复为 0；
- 原容器内联背景均恢复为 `rgb(1, 2, 3)`；
- 没有重复 Overlay，也没有生成新 ID。

## 5. Stable ID 与数据坐标证据

测试固定使用 Task 1 fixture 的：

- stable ID：`overlay-m1-horizontal-reference`
- type：`horizontalStraightLine`
- paneId：`pane-candle`
- anchor：`{ "value": 101.25 }`
- line style：蓝色 `rgba(41, 98, 255, 1)`、`1px`、`solid`
- opaque metadata：fixture 中的 `labels` 与 `opaque` 对象

创建与两次 export 后，上述字段均保持一致。测试还断言：

- `anchor` 的键严格为 `["value"]`；
- 递归检查导出 Overlay，不存在名称含 `pixel`、`screen`、`coordinate` 或 `index` 的字段；
- Scene 不保存像素坐标、屏幕坐标或数组 index。

## 6. Adapter unit/browser/typecheck 结果

环境：

- Node.js：`v22.12.0`
- npm：`10.9.0`

执行结果：

| 命令 | 结果 |
|---|---|
| `npm run test --workspace @baron1996/klinecharts-adapter` | 2 个测试文件、4/4 PASS |
| `npm run test:browser --workspace @baron1996/klinecharts-adapter` | 10/10 PASS |
| `npm run typecheck --workspace @baron1996/klinecharts-adapter` | PASS，退出码 0 |

Adapter browser suite 的环境日志出现 `NO_COLOR` 因 `FORCE_COLOR` 被忽略的 warning；10 项测试全部通过，没有源码断言失败。

完成前曾将 unit、browser、typecheck 三个 npm 进程并行启动做额外复核，其中一轮既有 indicator 用例出现一次 `Execution context was destroyed`，两条 Task 2 新用例在该轮仍通过。检查 error context 和相关文件差异后，独占顺序重跑该 indicator 用例为 1/1 PASS，再按正式 browser 命令顺序重跑完整 suite 为 10/10 PASS；没有修改用例、配置或源码，也没有降低断言。

## 7. 完整 `npm run verify` 结果

复用 Task 1 已验证的隔离 Python 环境：

- Python：`3.12.2`
- venv：`/tmp/baron-task1-python.SwK26k`
- `baron_kline` 导入路径：当前仓 `python/baron-klinecharts/src/baron_kline/__init__.py`

命令：

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
- M1 fixture SHA-256 仍为 `0664f38d9bb122800c054c8468516d8c17d7737b03eebdb1b7b1860ea03dec52`；
- Installation：24/24 PASS；
- Python wheel、sdist 和 fresh-install smoke：PASS；
- production dependency audit：0 个漏洞。

## 8. 是否修改 Adapter 源码及依据

没有修改以下允许但仅限测试证明缺口时才能修改的 Adapter 源码：

- `packages/klinecharts-adapter/src/conversion/overlays.ts`
- `packages/klinecharts-adapter/src/conversion/id-map.ts`
- `packages/klinecharts-adapter/src/adapter.ts`

依据是新增的创建/export 与 dispose/recreate 测试首次执行即全部通过，后续目标回归和完整 `npm run verify` 也全部通过。最终 `git diff` 对上述三个源码文件为空。

## 9. `git status --short` 与暂存区状态

```text
 M packages/klinecharts-adapter/test/overlays.browser.spec.ts
 M packages/klinecharts-adapter/test/roundtrip.browser.spec.ts
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

暂存区为空。除本轮新增的两个 Adapter browser 测试和 Task 2 文档记录外，其余状态均来自并被保留的 Task 1 未提交改动。

## 10. 操作边界确认

本轮明确确认：

- 没有执行 Task 3 或任何后续任务；
- 没有修改 Runtime、标准工具栏或 `my-cage`；
- 没有修改 Adapter 源码；
- 没有引入业务规则字段、screen coordinate、第二图表引擎或 fallback；
- 没有使用子智能体、worktree，也没有新建或切换分支；
- 没有执行 `git add`、`git commit`、`git push` 或 `git tag`；
- 没有发布 npm 或 PyPI；
- 没有创建 GitHub Release；
- 没有修改其他仓库、总工程文档、远端状态或生产环境。
