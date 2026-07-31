# Task 8 执行前校准报告：交互价格精度归一化与补丁发布

## 1. 校准结论

- 状态：`GO`
- 任务编号：Task 8
- 缺陷性质：Adapter engine→Scene 确定性导出缺陷
- Scene schema：保持 `@baron1996/kline-scene` version `1`
- Scene package：保持 `@baron1996/kline-scene-schema@0.1.0`
- 补丁目标：`@baron1996/klinecharts-adapter@0.1.1`、
  `@baron1996/klinecharts-runtime@0.1.1`
- 停止条件复核：不需要修改 Scene schema；既有正式 M1 fixture 与 21 类
  Overlay round-trip 输入均已符合 `symbol.pricePrecision=2`，不存在必须破坏
  已冻结正式 round-trip 契约的冲突。

用户给出的正式 `my-cage` 黑盒证据与本仓源码一致。坏值不是由数据库、API
或 Scene Schema 生成，而是 KLineCharts 把 canvas 像素换算为价格时产生的
IEEE-754 长浮点数。当前 Adapter 在 engine→Scene 边界只校验有限数后直接
透传，导致严格接受 `Numeric(30,10)` 的业务 API 拒绝 Drawing 创建。修复必须
位于本仓 Adapter，业务工程不得 `toFixed`、截断或引入其他图表实现。

## 2. 工作区与并行改动

校准基线：

- 分支：`main`
- HEAD / `origin/main`：
  `86d02f1046fd41b8cd5777c72b04ce4c0b575d03`
- 既有未提交文件：
  - `doc/m1/实施计划.md`
  - `doc/m1/目标说明.md`
- 既有未跟踪目录：`release-candidate-final-artifacts/`

两份既有文档修改说明 Task 1–7 已完成，只有总 session 根据真实跨仓黑盒
下发缺陷后才能恢复。本轮正是该条件成立后的 Task 8，因此后续只在原内容上
追加 Task 8，不覆盖或撤销这些文字。`release-candidate-final-artifacts/` 继续
保留为用户状态，不清理、不覆盖、不纳入提交或新制品构建。

## 3. 根因数据流

真实坏值示例：

```text
Scene symbol.pricePrecision = 2
canvas pixel → KLineCharts Point.value = 101.67084494773519
fromEngineOverlay.requirePoint() → 原值透传
Adapter overlay-created / overlay-updated / exportScene
Runtime getOverlay / listOverlays / exportScene
my-cage POST Drawing → Numeric(30,10) 严格校验 → 422
```

源码边界：

1. `packages/klinecharts-adapter/src/conversion/overlays.ts` 的
   `requirePoint()` 已检查 `Number.isFinite(point.value)`，但返回原始 value；
2. 交互创建和移动通过 `#commitEngineOverlay()` 调用 `fromEngineOverlay()`；
3. `exportScene()` 再次调用 `fromEngineOverlay()`；
4. `getOverlay()`、`listOverlays()` 都委托给 `exportScene()`；
5. Runtime 只克隆并转发 Adapter 结果，不应重复实现精度规则。

因此单一修复点是 `fromEngineOverlay` 使用的共享价格 value helper，而不是只对
`horizontalStraightLine` 特判。

## 4. 共享影响面

以下所有 engine Point 中的 `value` 都经过 `requirePoint(..., requireValue=true)`：

- `horizontalStraightLine`、`priceLine`、`simpleTag` 的 `anchor.value`；
- `horizontalRayLine`、`horizontalSegment` 的 `value`；
- `verticalRayLine`、`verticalSegment` 的 `startValue` / `endValue`；
- `rayLine`、`segment`、`straightLine`、`fibonacciLine`；
- `priceChannelLine`、`parallelStraightLine`、`brush` 的所有 point value；
- `simpleAnnotation`、`callout`、`text`、`crossLine` 的 point value；
- `rectangle`、`arrow` 的 start/end value。

时间字段仍由 `Number.isSafeInteger(timestamp)` 独立校验并原样输出。修复不得对
timestamp、paneId、ID、styles、metadata 或 Scene canonicalization 做任何改写。

## 5. 价格归一化契约

唯一精度来源是已经通过 Scene 校验的 `scene.symbol.pricePrecision`，范围
`0..16`。不读取、不推导 PostgreSQL `Numeric(30,10)`，也不使用业务字段兜底。

归一化规则：

1. 输入必须是有限 number，否则抛出 `SceneError('EXPORT_INVALID', ...)`；
2. 以 ECMAScript `Number#toString()` 的确定性最短十进制表示为输入；
3. 使用十进制位和 `BigInt` 完成缩放，不先乘浮点 `10 ** precision`；
4. 舍入到 `pricePrecision` 位小数，规则为“最接近；恰好半值时远离零”；
5. 结果再次校验为有限 number；
6. 任意 `-0` 结果统一返回正 `0`。

代表结果：

| 输入 | precision | 输出 |
|---:|---:|---:|
| `101.67084494773519` | `2` | `101.67` |
| `1.005` | `2` | `1.01` |
| `-1.005` | `2` | `-1.01` |
| `-0.004` | `2` | `0` |

Schema 继续负责“结构合法且有限”，Adapter 负责“从引擎导出的价格符合当前标的
精度”。这是 Adapter 导出确定性修复，不是 Scene Schema 演进。

## 6. TDD 与验证设计

先写并观察以下红灯：

1. unit：精确坏值、半值舍入、`-0`、precision `0/16`、NaN/Infinity；
2. conversion：`horizontalStraightLine` 与代表性多点 Overlay 共用同一 helper，
   timestamp 不变；
3. browser：真实 canvas 创建水平线后，`overlay-created`、get/list/export 均只含
   两位价格；拖动后 `overlay-updated` 与相同读取链仍只含两位价格；
4. import→engine→export：已符合精度的 fixture 保持字节语义稳定。

红灯必须因当前直接透传长浮点而失败，不能用人为语法错误制造。生产代码只在
确认红灯后实现。

完成后运行：生成物检查、typecheck、全部 unit、Adapter/Runtime/root browser、
rendering、Python、cross-language、installation/package verification 和 production
npm audit。发布后还要从官方 registry 的新 cache 安装精确版本并重跑真实浏览器
黑盒。

## 7. 版本矩阵

| 工程/包 | 当前 | Task 8 | 说明 |
|---|---:|---:|---|
| 根 workspace | `0.1.0` | `0.1.1` | 对应 tag `v0.1.1` |
| Scene Schema | `0.1.0` | `0.1.0` | schema/version 均不变 |
| Adapter | `0.1.0` | `0.1.1` | 缺陷修复包 |
| Web Runtime | `0.1.0` | `0.1.1` | 精确依赖 Adapter `0.1.1` |
| private Render Runtime | `0.1.0` | `0.1.0` | 不发布；内部精确依赖 Runtime `0.1.1` |
| CLI | `0.1.0` | `0.1.0` | 不发布 |
| Python | `0.1.0` | `0.1.0` | 不发布 PyPI |

`0.1.1` 对四个 npm 公共包均实时查询为未占用；tag `v0.1.1` 和 GitHub
Release 也不存在。本轮只发布 Adapter 与 Runtime，不覆盖或重发 `0.1.0`。

## 8. 发布流水线校准

现有 `release.yml` 的 OIDC、`release` Environment、build-once artifact 和
`--provenance` 路径有效，但当前版本门强制所有 workspace/Python 与 tag 同版，
artifact builder 固定构建四个 npm 包，PyPI job 也固定执行。这与 Task 8 的两个
npm 补丁包版本矩阵冲突。

评估方案：

1. **所有 npm/Python 一起升 `0.1.1`：** 无需改流水线，但会发布未变化的
   Scene、CLI 和 Python，扩大不可逆 registry 写入面；不采用。
2. **本机 token 或手工 npm publish：** 绕过已验证 Trusted Publisher/OIDC，
   且当前 token 已清空；禁止采用。
3. **推荐并采用：同一 `release.yml` 的 tag 选择发布：** 根 workspace 匹配
   `v0.1.1`，只构建版本等于 tag 的公共 npm 包；Python 版本不等于 tag 时跳过
   PyPI；下游继续复用同一个不可变 Actions artifact。保持 workflow 文件名、
   Environment、OIDC 与 Trusted Publisher 绑定不变。

该调整是现有正式流水线对独立 package patch version 的最小扩展，不是 fallback。
发布顺序仍由公共依赖顺序决定，本次为 Adapter → Runtime。

## 9. 外部门禁

- GitHub CLI 已认证为 `git54496`；
- `release.yml` 启用；
- `release` Environment 存在，GitHub secret 列表为空；
- Task 6 已记录四个 npm 包均绑定同一 Trusted Publisher：
  `git54496/baron-klinecharts`、`release.yml`、Environment `release`；
- 不读取或输出任何 secret 值；
- publish job 若等待 Environment 审批，必须停点并返回同一 run/job 的最小操作；
- 同一版本失败后不得重建不同制品或改用 token fallback。

## 10. 最终校准判定

没有 Scene schema 变更或不可兼容的正式 round-trip 冲突。用户既有授权覆盖继续
执行 TDD、完整验证、中文 Git 提交/push、`v0.1.1` tag、GitHub Release 与两个
npm 正式包发布，无需重复等待。
