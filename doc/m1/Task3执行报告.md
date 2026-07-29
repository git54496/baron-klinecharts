# M1 Task 3 执行报告

## 1. 执行结论

Task 3“证明 Runtime 与标准工具栏 M1 旅程”已完成，结论为 **PASS**。

本轮使用 Task 1 的 `m1-candle-horizontal-line.json` fixture 新增三类真实浏览器证据：

- Runtime 创建、完成绘制、查询、导出、销毁、重建、选择和删除水平参考线；
- 标准工具栏通过真实 DOM、键盘和触摸完成水平线创建、选择、Scene 下载导出和删除；
- Scene 经过 export → serialize → Runtime/page teardown → page reload → deserialize → recreate 后保持一致。

所有正式旅程均由现有实现直接满足，因此没有修改 Runtime、toolbar 或 lifecycle 源码。本轮范围严格停留在 Task 3，没有进入 Task 4。

## 2. 修改文件

本轮实际修改：

- `packages/web-runtime/test/runtime.browser.spec.ts`
- `packages/web-runtime/test/toolbar.browser.spec.ts`
- `tests/browser/edit-and-export.spec.ts`
- `doc/m1/实施计划.md`
- `doc/m1/Task3执行报告.md`

Task 1、Task 2 的 fixture、源码、测试、派生资产和文档改动全部保留，没有恢复、清理或覆盖。

## 3. 首次执行与测试校准证据

新增三类测试后首次运行：

```bash
fnm exec --using=22.12.0 \
  npm run test:browser --workspace @baron1996/klinecharts-runtime
```

结果：

```text
Running 10 tests using 1 worker
9 passed
1 failed
```

首次即通过的新增证据包括：

- Runtime 完整水平线生命周期；
- 标准工具栏触摸创建路径。

唯一失败发生在桌面工具栏测试的键盘前置假设：测试假设从页面初始焦点按三次 Tab 会到达“水平直线”，实际页面焦点顺序为：

```text
BODY
→ KLineCharts 可聚焦根 DIV
→ 水平射线
→ 水平线段
→ 水平直线
```

因此该失败是测试漏算 KLineCharts 根节点这一真实 tab stop，不是 Runtime 或 toolbar 行为缺口。只把测试操作从三次 Tab 校准为四次 Tab，没有修改生产源码、降低断言或人为破坏实现。

校准后单独重跑目标测试：

```text
1 passed
```

再顺序重跑完整 Runtime package browser suite：

```text
10 passed
```

## 4. Runtime M1 旅程证据

新增 Runtime browser 测试执行：

```text
create runtime with M1 fixture
→ start horizontalStraightLine drawing
→ browser canvas click completes drawing
→ get/list overlay
→ export scene
→ JSON serialize
→ destroy
→ JSON deserialize
→ recreate runtime
→ browser click selects recreated line
→ remove selected line
→ destroy
```

关键断言：

- 调用方指定 stable ID 为 `overlay-m1-runtime-horizontal`；
- `overlay-created` 事件严格只出现 1 次；
- 原 fixture 水平线与新绘制水平线共 2 条，没有重复创建；
- `getOverlay` 与 `listOverlays` 能查询新水平线；
- 新水平线 type 为 `horizontalStraightLine`，paneId 为 `pane-candle`；
- anchor 严格只有有限数值 `value`；
- styles 和 opaque metadata 与传入的 M1 fixture 数据一致；
- serialize/deserialize/recreate 后新水平线完整等于首次 export；
- 重建后真实画布点击选中同一个 stable ID；
- 删除后只剩原 fixture 水平线，证明删除只影响目标线；
- `overlay-removed` 事件只包含目标 ID。

## 5. Destroy、事件和生命周期证据

Runtime 旅程同时证明：

- 第一次 destroy 后调用 `getScene()` 明确抛出 `RUNTIME_INIT_FAILED`；
- 第二次 destroy 后调用 `removeOverlay()` 明确抛出 `RUNTIME_INIT_FAILED`；
- 两次 destroy 后事件数组长度均不再增加；
- 每次 destroy 后 chart container 子节点数量均为 0；
- 重建期间 container 重新拥有真实引擎 DOM。

根级既有生命周期测试继续真实执行 100 次 Runtime + toolbar 创建和销毁，并断言：

- chart DOM 为 0；
- toolbar DOM 为 0；
- editor 为 0；
- tooltip 为 0；
- object URL 为 0；
- 每轮只有预期的 `scene-ready` 事件。

## 6. 标准工具栏真实 DOM 证据

桌面 M1 toolbar 测试没有替换或 mock Runtime 方法，完整使用真实 Runtime、KLineCharts 和 DOM：

1. 通过真实 Tab 顺序聚焦“水平直线”按钮；
2. 按 Enter 启动 `horizontalStraightLine`；
3. 点击真实 overlay canvas 完成绘制；
4. 再次点击同一水平线完成选择；
5. 点击真实“导出场景”按钮；
6. 接收浏览器下载并读取 `m1-scene.json`；
7. 断言下载 Scene 同时包含原 fixture 水平线和新建水平线；
8. 点击真实“删除选中标注”按钮；
9. 断言只删除新建目标线，原 fixture 水平线仍存在；
10. destroy 后 chart、toolbar 和 tooltip DOM 均清零。

工具栏默认生成的新 stable ID 为：

```text
overlay-horizontalStraightLine-0
```

下载 Scene 中该 Overlay 的 type 为 `horizontalStraightLine`，anchor.value 为有限数值。

独立移动触摸上下文还通过真实 `tap()` 和 `touchscreen.tap()` 完成水平线创建，导出的 Overlay 同样具有稳定 ID、正确类型和有限数值 anchor.value；销毁后 chart 与 toolbar DOM 均清零。

## 7. 页面刷新等价旅程证据

根级 browser 测试执行：

```text
create Runtime with M1 fixture
→ export Scene
→ JSON.stringify
→ destroy Runtime
→ page.reload
→ JSON.parse
→ create new Runtime
→ export again
→ destroy
```

结果：

- 重建后 Overlay 数量严格为 1；
- stable ID、type、paneId、anchor.value、styles 和 opaque metadata 与刷新前完全一致；
- anchor 键严格为 `["value"]`；
- 重建只产生预期的 `scene-ready` 事件；
- 页面刷新前后 destroy 均清空 container。

该测试只证明页面刷新所需的图表契约，没有实现浏览器数据库或任何持久化存储。

## 8. 定向验证结果

环境：

- Node.js：`v22.12.0`
- Python 隔离环境：`/tmp/baron-task1-python.SwK26k`

顺序执行结果：

| 命令 | 结果 |
|---|---|
| `npm run test --workspace @baron1996/klinecharts-runtime` | 2 个测试文件、4/4 PASS |
| `npm run typecheck --workspace @baron1996/klinecharts-runtime` | PASS，退出码 0 |
| `npm run test:browser --workspace @baron1996/klinecharts-runtime` | 10/10 PASS |
| `npm run test:browser` | 7/7 PASS |

Playwright WebServer 日志出现 `NO_COLOR` 因 `FORCE_COLOR` 被忽略的环境 warning；所有定向浏览器断言通过。

## 9. 完整 `npm run verify` 结果

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
- 根级 browser：7/7 PASS；
- Rendering：4/4 PASS；
- Python：16/16 PASS；
- TypeScript/Python cross-language：PASS；
- M1 fixture SHA-256 仍为 `0664f38d9bb122800c054c8468516d8c17d7737b03eebdb1b7b1860ea03dec52`；
- Installation：24/24 PASS；
- Python wheel、sdist 和 fresh-install smoke：PASS；
- production dependency audit：0 个漏洞。

## 10. 是否修改 Runtime 源码及依据

没有修改计划中仅允许在测试证明缺口时修改的源码：

- `packages/web-runtime/src/runtime.ts`
- `packages/web-runtime/src/types.ts`
- `packages/web-runtime/src/toolbar/toolbar-tools.ts`
- `packages/web-runtime/src/toolbar/standard-toolbar.ts`
- `packages/web-runtime/src/lifecycle.ts`

依据是 Runtime、toolbar、touch、refresh 和 lifecycle 正式旅程均由现有实现通过。最终 `git diff` 对上述源码文件为空。

## 11. Task 3/Task 4 边界与后续门禁

本轮没有进入 Task 4。以下内容仍保持未开始：

- M1 tarball 消费测试；
- 只通过 package exports 的 public API 消费边界；
- Task 4 README 消费示例；
- 正式 registry 干净安装。

后续发布门禁也未关闭：

- 根 `verify` 纳入三个 package browser suites；
- 正式发布候选构建；
- registry 发布前复查；
- npm/PyPI/tag/GitHub Release；
- registry 黑盒和消费者仓升级。

这些内容分别属于 Task 4 及更后续任务，仍需要相应授权。

## 12. `git status --short` 与暂存区状态

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
 M packages/web-runtime/test/runtime.browser.spec.ts
 M packages/web-runtime/test/toolbar.browser.spec.ts
 M python/baron-klinecharts/src/baron_kline/runtime/runtime-template.html
 M python/baron-klinecharts/src/baron_kline/validation.py
 M python/baron-klinecharts/tests/test_validation.py
 M tests/browser/edit-and-export.spec.ts
 M tests/cross-language/chart-scene-roundtrip.mjs
?? doc/
?? tests/fixtures/scenes/m1-candle-horizontal-line.json
```

暂存区为空。除本轮新增的三个 Runtime/toolbar browser 测试文件和 Task 3 文档记录外，其余状态均来自并被保留的 Task 1、Task 2 未提交改动。

## 13. 操作边界确认

本轮明确确认：

- 没有执行 Task 4 或任何后续任务；
- 没有修改 Runtime、toolbar 或 lifecycle 生产源码；
- 没有实现确认按钮、对数轴、量度工具、全屏、完整样式系统或数据库持久化；
- 没有引入第二图表引擎、模拟替代能力或 fallback；
- 没有修改其他仓库或总工程文档；
- 没有使用子智能体、worktree，也没有新建或切换分支；
- 没有执行 `git add`、`git commit`、`git push` 或 `git tag`；
- 没有发布 npm 或 PyPI；
- 没有创建 GitHub Release；
- 没有部署或修改腾讯云、其他远端状态或生产环境。
