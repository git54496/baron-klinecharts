# Task 8 交互价格精度归一化与补丁发布执行报告

## 1. 当前结论

状态：`READY_FOR_RELEASE`

Adapter engine→Scene 价格归一化、Runtime 真实交互链路、`0.1.1` 独立包版本矩阵、
定向 OIDC workflow 和本地不可变候选均已通过。此快照尚未创建 Git tag、GitHub
Release 或写入 npm registry；正式发布和 registry 黑盒证据将在同一报告继续收口。

## 2. 根因与契约

`horizontalStraightLine` 的像素转价格由 KLineCharts 返回长浮点数，例如
`101.67084494773519`。旧 Adapter 在 `fromEngineOverlay` 直接透传 `Point.value`，
所以 created/updated/get/list/export 都可能把超出 Scene 标的价格精度的值交给严格
消费者。

修复统一覆盖所有包含 `Point.value` 的 Overlay，不特判水平线：

- 唯一精度来源是已校验的 `scene.symbol.pricePrecision`（`0..16`）；
- 只在 engine→Scene 边界归一化价格，不修改 timestamp；
- 依据有限 JavaScript Number 的十进制字符串做 `BigInt` 缩放；
- 舍入为最接近，精确半值远离零；
- 非有限输入/输出显式抛出 `EXPORT_INVALID`；
- `-0` 统一为正 `0`；
- 不引入 PostgreSQL `Numeric(30,10)`、`toFixed` 或浮点乘法缩放。

Scene Schema 继续为 package `0.1.0`、Scene version `1`、runtimeVersion `0.1.0`；
本次没有数据结构或 schema 版本变化。

## 3. TDD 证据

RED 阶段先证明：

- `price.spec.ts` 因共享 helper 不存在失败；
- `overlays.spec.ts` 实际得到 `101.67084494773519`、`12.345` 和负零；
- Runtime 真实 canvas 创建链路的 created/get/list/export 实际得到
  `101.67149825783973`。

GREEN 阶段：

- 精确生产坏值在 precision `2` 输出 `101.67`；
- 正负半值、precision `0/16`、负零、非有限数和非法 precision 均有单测；
- 代表性多点 Overlay 的所有 value 被归一化，timestamp 原样保留；
- 真实 canvas 创建和拖动后，created/updated/get/list/export 均只输出两位价格；
- export→destroy→recreate 继续保持 Overlay 数据稳定；
- Adapter 21 类 Overlay 浏览器 round-trip 保持通过。

## 4. 版本与发布矩阵

| 组件 | 版本 | 本次是否发布 |
|---|---:|---|
| 根发布协调版本 | `0.1.1` | 对应 `v0.1.1` |
| Scene Schema | `0.1.0` | 否 |
| Adapter | `0.1.1` | 是 |
| Web Runtime | `0.1.1` | 是 |
| private Render Runtime | `0.1.0` | 否 |
| CLI | `0.1.0` | 否 |
| Python | `0.1.0` | 否 |

Runtime 精确依赖 Adapter `0.1.1` 和 Scene `0.1.0`；private Render Runtime
精确依赖 Runtime `0.1.1`，但自身不发布。`release.yml` 仍只构建一次并复用同一
Actions artifact，只选择 manifest 版本等于 tag 的公共 npm 包；Python 版本不等于
tag 时明确跳过，npm Trusted Publisher/OIDC 和 `release` Environment 不变。

## 5. 验证结果

执行环境：Node.js `22.12.0`、Python `3.12.2`。

- Adapter unit：`19/19`；Runtime unit：`4/4`；
- 根 unit：Scene `107/107`、Adapter `19/19`、Runtime `4/4`、Render Runtime
  `11/11`、CLI `8/8`；
- 根 browser：`7/7`；Adapter browser：`10/10`；Runtime browser：`10/10`；
  Render Runtime browser：`2/2`；
- rendering：`4/4`；Python：`16/16`；installation：`28/28`；
- cross-language、生成物、mock、typecheck、package verification 全部通过；
- `npm audit --omit=dev --audit-level=high`：生产漏洞 `0`。

第一次完整 verify 在 Python 阶段因当前 shell 未安装本仓 Python package 而出现
7 个一致的 `ModuleNotFoundError: baron_kline`；按 release workflow 的正式步骤在
隔离 venv 执行 editable 安装后，完整 verify 从头重跑并通过。未用代码改动或
fallback 隐藏环境问题。

## 6. 本地不可变候选

正式脚本按 `0.1.1` 只生成两份 tarball：

| 文件 | SHA-256 | npm SRI |
|---|---|---|
| `baron1996-klinecharts-adapter-0.1.1.tgz` | `ceb5ecd0463927f6ce857d5512ed606c3f3f053a36c34aecb6577a3d3dfb1d76` | `sha512-AcwuGHqWeFltccGThL/Y7eei16GqUW6TyBGawQGEjAQ7Id08GWLU//hY11dXfcdBTEaWLFBwkHiO+N19iu06+A==` |
| `baron1996-klinecharts-runtime-0.1.1.tgz` | `cdbd0b8fbbff9e7338cb8a8c0eb3c1bee5aece7f6d9df0ad5a7621707855f3d3` | `sha512-MPgSW40GAwVvxJRynhui8KN+ZZSH1CbPZW+olpDh2k0NIy4GzTOi04SC8Qt9qASLl0yC/Nb5hs3SbRUDbDWtDA==` |

两份候选的 SHA-256 与 SRI 已独立复算；内容、精确依赖、package exports、许可证、
秘密模式、本地绝对路径、`file:`/workspace 依赖审计全部通过。全新 Node 22 临时消费
工程以新 cache、无 lockfile、`--no-save` 安装官方 Scene `0.1.0` 加两份候选后，
公共 exports 报告 Scene `0.1.0`、Adapter `0.1.1`、Runtime `0.1.1`，Runtime
manifest 精确依赖 Adapter `0.1.1`。

## 7. 尚未执行

- 尚未 Git add/commit/push；
- 尚未创建或 push `v0.1.1`；
- 尚未创建 GitHub Release 或触发发布 workflow；
- 尚未写入 npm registry；
- 未发布 Scene、CLI、Python 或 private Render Runtime；
- 未修改、重发或覆盖任何 `0.1.0` 制品；
- 未修改 `my-cage`，未启动其已停止的服务。
