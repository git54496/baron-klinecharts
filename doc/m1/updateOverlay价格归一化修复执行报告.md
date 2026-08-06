# baron-klinecharts updateOverlay 价格归一化修复执行报告

## 1. 结论

**READY_FOR_RELEASE_0.4.3**

`KLineChartsSceneAdapter.#updateOverlay` 提交路径未按 Scene `symbol.pricePrecision` 归一化 overlay 锚点、与绘制提交 `#commitEngineOverlay` 行为不一致的长期缺口已修复并完成本地全量验证。修复提交为 `ef22e81`，随后将版本从 `0.4.2` 统一提升至 `0.4.3` 并发布 npm 三个公共包与 PyPI 的 `baron-klinecharts`。

Scene `version` 保持 `1`，`ChartScene.runtime.runtimeVersion` 保持协议版本 `0.2.0`，engine 保持 `10.0.0`，事件 envelope `{ sceneVersion: 1, runtimeVersion: "0.2.0" }`、schema enum 与 fixture 均未变化。本次不修改 my-cage，不在实现或测试中加入延时等待，不以放宽 pricePrecision 或关闭校验作为绕过，未使用任何 fallback。

## 2. 背景与根因

my-cage M1 旅程在 `scene.symbol.pricePrecision = 2` 的场景中，绘制完成后通过 `runtime.updateOverlay` 把水平线价格更新为 `101.67084494773519`。Runtime 返回、`getOverlay`、`exportScene` 与 `overlay-updated` 事件载荷均保留原始浮点，提交给引擎的 `overrideOverlay` 参数（PUT 体）同样未归一化；而绘制提交路径 `#commitEngineOverlay` 会经 `fromEngineOverlay` 用 `normalizePriceValue` 把引擎返回价格按 `pricePrecision` 舍入，两者口径不一致。该缺口自 0.2.3 时代起即存在，属于长期缺口。

根因在 `packages/klinecharts-adapter/src/adapter.ts` 的 `#updateOverlay`：它只对入参做 `parseChartScene` 校验后直接构造引擎 overlay 提交并写回 `#scene`，没有走绘制提交的 Scene→引擎→Scene 归一化转换，导致超精度价格原样进入场景与事件。

## 3. RED 复现

在 `packages/web-runtime/test/runtime.browser.spec.ts` 新增真实浏览器回归测试，完整复现用户路径且不修改 my-cage：

1. `createKLineSceneRuntime(minimalScene)`（`pricePrecision=2`）；
2. `startOverlayDrawing('horizontalStraightLine')` 并点击完成（锚点先被绘制路径归一化）；
3. `runtime.updateOverlay({ ...overlay, anchor: { value: 101.67084494773519 } })`；
4. 断言 `updateOverlay` 返回值、`getOverlay`、`listOverlays`、`exportScene` 与 `overlay-updated` 事件载荷均为 `101.67`，序列化场景不含原始浮点，且无 `scene-error`、无页面异常。

修复前该测试失败：提交值与事件载荷为 `101.67084494773519`。测试不包含任何等待或延时。

## 4. 修复方案与影响

修复位置在适配层（`packages/klinecharts-adapter`）：

- 在 `src/conversion/overlays.ts` 新增 `normalizeSceneOverlayPrices`，复用 `toEngineOverlay` 与 `fromEngineOverlay` 与绘制提交完全一致的转换口径：`anchor.value`、`value`、`start.value`、`end.value`、`points[].value` 等可归一化价格字段按 `pricePrecision` 十进制舍入，时间戳与非价格字段保持原语义；
- `#updateOverlay` 在 `overrideOverlay` 前先归一化，提交给引擎的 PUT 体、写回的 `#scene`、返回值和 `overlay-updated`/`overlay-style-changed` 事件全部使用归一化后的 overlay；
- `startOverlayDrawing` 的点击仲裁复位逻辑与绘制进行中短路逻辑原样保留，既有绘制、拖拽、量度、快速双线回归全部保持通过。

兼容边界不变：Scene v1、Runtime protocol 0.2.0、engine 10.0.0、事件 envelope 不变；公共 API 签名不变；`updateOverlayStyles` 复用同一归一化路径，仅样式变化时价格保持不变。

## 5. 验证证据

验证环境：macOS，Node.js 22.12.0，npm 10.8.2，Playwright 1.61.0 / Chromium，Python 3.12。

- 完整 `npm run verify` 退出码 0：generate 幂等（仅随版本与修复重新生成嵌入运行时）、typecheck、mock、单元测试（scene-schema 178、adapter 60、web-runtime 38、render-runtime 20、cli 13）、真实 headless Chromium 浏览器测试（根套件 10、adapter 116、web-runtime 130、render-runtime 7）、渲染基线 6、Python 45、跨语言往返、安装门禁 38 项与 `npm audit --omit=dev` 0 漏洞全部通过；
- 新增回归测试在修复前失败、修复后通过，且 web-runtime 套件内既有绘制、拖拽、量度、快速双线、点击仲裁与命中测试短路用例全部保持通过；
- 适配层新增单元测试覆盖归一化结果与绘制提交 `fromEngineOverlay` 完全一致、`toEngineOverlay` 提交体（PUT 体）价格归一化、多点多端价格与负零规范化、时间戳与非价格字段不变；
- 版本提升至 `0.4.3` 后完整 `npm run verify` 通过，`release:check-version --tag v0.4.3` 确认发布目标。

## 6. 版本矩阵

| 制品/实现 | 发布版本 | 精确内部依赖 |
| --- | --- | --- |
| `@baron1996/kline-scene-schema` | `0.4.3` | 无内部依赖 |
| `@baron1996/klinecharts-adapter` | `0.4.3` | Scene `0.4.3` |
| `@baron1996/klinecharts-runtime` | `0.4.3` | Scene `0.4.3`、Adapter `0.4.3` |
| `@baron1996/klinecharts-cli` | `0.4.3` | Scene `0.4.3`；构建时私有 Render Runtime `0.4.3` |
| `@baron1996/klinecharts-render-runtime` | `0.4.3`，private | Scene `0.4.3`、Runtime `0.4.3` |
| Python `baron-klinecharts` | `0.4.3` | 与 Scene v1 / Runtime protocol 0.2 同步 |

发布目标为 npm 的 `@baron1996/kline-scene-schema`、`@baron1996/klinecharts-adapter`、`@baron1996/klinecharts-runtime` 三个公共包与 PyPI 的 `baron-klinecharts`，并打 tag `v0.4.3`。my-cage 随后升级依赖并重跑腾讯云 M2 组合旅程与 M1 浏览器回归。
