# M2 Task 1 图表契约复核报告

> 复核结论：`READY`
> 复核范围：只读复核根冻结契约、唯一黄金 fixture 与本仓 Task 1 证据；不进入生产实现
> 根契约：`../../../doc/m2/契约与验收样本.md`
> 根契约 SHA-256：`5a7ddcf3c2b3246df61b725d96b108a55f7bb6007868d4c7c308937024d704e9`
> 根 fixture：`../../../doc/m2/fixtures/structure_replay_v1_golden.json`
> 根 fixture SHA-256：`7102fb332a9fb65e47e3d5d3b7fb62388fdeabe22fb88c5f69bbc9891fb026cd`
> 根 fixture 状态：`FROZEN`

## 1. 结论

根 fixture 的真实行情、`300 → 330` 数值语义、三个 replay case、内嵌精确 hash payload 和六个业务 hash 彼此自洽；AAPL 与 IXIC 各 21 根日 K，AAPL 全部 OHLC 均为正，因此同一组 AAPL 数据可以作为 linear/logarithmic 图表验收输入。当前 KLineCharts 10.0.0 也具备 `normal`/`logarithm` 轴、整体拖动、锚点拖动和 start/moving/end 回调，M2 不需要替换引擎。

总控已把上一轮指出的五组修正全部写入根契约/fixture：唯一 `chart_projection`、M1/M2 协议交叉约束、事件精确 payload/顺序、取消与删除/宿主动作行为，以及 `0.2.0` 版本矩阵均已冻结。逐项复核未发现会改变根 fixture 任一字节的冲突，`ChartScene.version` 继续为 1，本仓结论由 `READY_WITH_CORRECTIONS` 更新为 `READY`。

## 2. 复核依据与操作边界

已完整读取：

- `../../../doc/m2/Task0总校准结论.md`；
- `../../../doc/m2/契约与验收样本.md`；
- `../../../doc/m2/fixtures/structure_replay_v1_golden.json`；
- `执行前校准报告.md`、`目标说明.md`、`实施计划.md`；
- 当前 Scene JSON Schema、语义校验、canonical、Adapter overlay/pane 转换、Runtime 事件/API、标准工具栏及相关单元/浏览器测试；
- KLineCharts 10.0.0 的公开类型与本地安装产物中 y-axis、overlay 拖动、figure hit-test 实现。

本轮只更新本报告。未修改生产 Schema、TypeScript、Python、Adapter、Runtime、工具栏、测试、依赖、manifest、lockfile、版本号或生成物；未启动浏览器监听，未执行 generate、完整 verify、Git 或发布操作，也未复制第二份业务 fixture。

## 3. 根 fixture 独立校验

### 3.1 文件与结构

使用系统 `shasum -a 256`、`jq` 和独立 Node `JSON.parse`/`crypto` 三条只读路径交叉复核，结果如下：

| 项目 | 结果 |
|---|---|
| JSON 解析 | PASS |
| `fixture_id` | `m2-structure-replay-aapl-ixic-v1` |
| `fixture_version` | `1` |
| 当前状态 | `FROZEN` |
| AAPL `subject_bars` | 21 根，严格按 `bar_start` 递增 |
| IXIC `context_index.bars` | 21 根，严格按 `bar_start` 递增 |
| replay cases | 3 个，输入数分别为 11、17、21 |
| OHLC 结构 | 全部满足 `low <= open/close <= high` |
| AAPL/IXIC OHLC 非正值 | 0 个 |
| 根契约 SHA-256 | `5a7ddcf3c2b3246df61b725d96b108a55f7bb6007868d4c7c308937024d704e9` |
| 根 fixture SHA-256 | `7102fb332a9fb65e47e3d5d3b7fb62388fdeabe22fb88c5f69bbc9891fb026cd` |

### 3.2 AAPL `300 → 330` 语义

根 fixture 冻结的两个人工价位均为正数：

```text
start value = 300
end value = 330
absoluteChange = 330 - 300 = 30
percentageChange = 30 / 300 * 100 = 10
```

三个业务 case 也与日 K 一致：

- 2026-07-01 前 11 根收盘均未突破 300，状态为 `waiting_for_breakout`；
- 2026-07-02 收盘 308.63 首次突破，至 2026-07-10 峰值 316.91，`(316.91 - 300) / 30 * 100 = 56.366666667`；
- 2026-07-16 最高价 334.68 触达 330，完成度 clamp 为 100。

这些 replay 状态和完成度属于宿主业务，不是 `priceMeasurement` 的持久化字段。图表只从两个价格锚点派生 `30` 与 `10%`。

### 3.3 唯一图表投影复核

根 fixture 现已内嵌唯一 `chart_projection`。它是业务 fixture 到后续 ChartScene 的冻结投影规则，不把完整 fixture 冒充为当前 Scene Schema 可直接读取的 ChartScene：

| 字段 | 冻结值/规则 |
|---|---|
| 图表数据源 | 只取 `subject_bars`；IXIC 是显示上下文，不混入 AAPL Scene |
| symbol | `ticker: "AAPL.US"`、`pricePrecision: 3`、`volumePrecision: 0` |
| period/timezone | `1 day`、`America/New_York` |
| bar timestamp | `Date.parse(bar_start)` 的 UTC epoch milliseconds |
| OHLC/volume/turnover | 先校验十进制字符串有限且在安全范围内，再转为 Scene number |
| neckline line | `m2-aapl-neckline-300`、`horizontalStraightLine`、`anchor.value: 300` |
| target line | `m2-aapl-target-330`、`horizontalStraightLine`、`anchor.value: 330` |
| measurement ID | `m2-aapl-measurement-300-330` |
| start | `{ timestamp: 1781582400000, value: 300 }`，即首根 AAPL bar 的 `2026-06-16T04:00:00Z` |
| end | `{ timestamp: 1784174400000, value: 330 }`，即末根 AAPL bar 的 `2026-07-16T04:00:00Z` |
| derived | absolute 30、percentage 10、`derived_fields_persisted: false` |
| replay boundary | `affects_replay_hash: false` |

选用首末 bar 只是在真实样本中冻结图形的水平位置，不表示“突破日”“确认日”或“目标触达日”。根 fixture 的价格字符串最多有 3 位有效小数，因此图表投影使用 `pricePrecision: 3`；这不会把宿主的 Decimal/hash 计算改成 JavaScript number。

IXIC 的数据源明确为 `context_index.bars`，角色是 `display_context_only`，且 `affects_replay_result: false`；它没有混入 AAPL `subject_bars`。本轮没有生成或复制第二份投影，后续图表测试必须引用最终根 SHA，并只承载图表字段，不能成为第二份 replay 业务真相。

### 3.4 payload、NUL domain 与六个业务 hash

独立 Node 校验直接读取 fixture 内嵌 payload，按 key 递归排序生成本 ASCII-key fixture 的 canonical JSON，并使用 fixture 冻结的 domain UTF-8 hex 作为前缀。两个 domain hex 均以真实 `00` byte 结尾，不是可见的 `\\u0000` 文本。

| case | bars 前缀 | input hash 复算 | result hash 复算 |
|---|---:|---|---|
| waiting | 11 | `1b6e2ca7b2c892d11d8e284cd1fe7cda050184ea8e259c9be7869789f93210e9` | `bc1e36433246e50b2538a6a5acea28feb0f0ee0545fb37aefe5516bed7c122b8` |
| in progress | 17 | `0823d7de84370d751a51b87f9968c4f23de74258ebae645606efb467d1b8cf22` | `0fb85295ba73dc88ebfa78ef6a03a81b6a74eb96d8565d408e4459ca321a83b9` |
| completed | 21 | `bb72c14da25e44627dd5275af58b0efb09c31cd3653369caf7395f0732fe85ba` | `5f1a2af8e125eefbd7b432c895807c11aee68dcae2c4dc0314ac2f1655cff702` |

三组 `input_hash_payload.market_data.bars` 均逐字段等于 `subject_bars[0:input_bar_count]`，三个 `result_hash_payload.output` 均逐字段等于对应 `expected_result`。AAPL bar 的 price/turnover 全部保持 12 位小数，volume 全部保持 18 位小数；nullable 与 `ingested_at` 字段均保留。结果为 PASS。

## 4. 冻结后的 Scene 与轴契约

### 4.1 字段和映射

- 正式字段保持 `ChartScene.panes[].yAxes[].scale`；不放入全图 `chart` 配置。
- 允许值只为 `linear | logarithmic`。
- Adapter 唯一映射为 `linear -> KLineCharts normal`、`logarithmic -> KLineCharts logarithm`。
- M2 只允许 candle pane 的 primary Y-axis 使用 `logarithmic`；其他轴在协议 `0.2.0` 下必须显式为 `linear`。
- Runtime 的公开切轴操作只修改 candle primary Y-axis；成功后 `getScene/exportScene` 返回新 scale，失败时 Scene 与引擎均保持最后一次提交状态。根契约冻结行为，不在 Task 1 提前冻结实现方法名。

### 4.2 M1/M2 协议交叉约束

`ChartScene.version` 保持 `1`，结构层允许 scale 缺失以读取 M1，但语义层必须按 runtime protocol 区分：

| Scene runtime | `scale` | `priceMeasurement` | 处理规则 |
|---|---|---|---|
| `0.1.0` | 允许缺失 | 禁止 | 缺失按唯一兼容规则解释为 linear；无修改 round-trip 不插入字段，M1 canonical bytes/hash 不变 |
| `0.2.0` | 每个 Y-axis 必填 | 允许 | candle primary 可 linear/logarithmic，其余轴只能 linear |

新 Runtime 0.2.0 必须能读取两种 Scene。只做 M1 能力的读写不强制提升协议；首次调用 M2-only 能力（切 scale 或加入 `priceMeasurement`）时，必须原子提升 `runtime.runtimeVersion` 为 `0.2.0` 并给全部 Y-axis 写入显式 scale。旧 Runtime 0.1.x 会因 runtime enum、额外 scale 或新 overlay type 明确拒绝 M2 Scene，不会静默解释。

### 4.3 logarithmic 非正值边界

进入引擎前统一验证：

- candle pane 每根 bar 的 open/high/low/close 全部 `> 0`；
- candle pane 上每个含 value 的 Overlay，其全部价格坐标均 `> 0`；
- `priceMeasurement.start.value/end.value` 在 linear/logarithmic 两种模式下都必须 `> 0`，并且派生 absolute/percentage 必须有限；
- 切轴、创建、程序化更新、交互 commit 和 restore 使用同一验证；
- 非法值明确抛出/发出 `SceneError`，禁止切回 linear、钳制 epsilon、丢弃 Overlay 或保留引擎临时值。

根真实样本全部为正，证明正向旅程自洽；`0`、负数、NaN/Infinity 必须在后续 Schema/Adapter 单元测试中用最小合成边界向量覆盖，不得篡改根业务 fixture 来制造负例。

### 4.4 固定价位与恢复

- linear/logarithmic 只改变 value-to-pixel 映射；300、330、Overlay ID、styles、metadata 和 Scene 数组顺序不变。
- 两种 scale 下，`priceMeasurement` 都直接从 Scene data values 得出 absolute 30、percentage 10，禁止从像素距离反推。
- 切轴时完整 Scene hash应因 `scale` 改变；只包含 overlays 的 canonical projection hash 应保持不变。
- 在任一 scale 下 export -> destroy -> recreate 后，完整 canonical Scene hash必须保持不变；再切回最初 scale 后完整 hash回到初始值。

## 5. 冻结后的 `priceMeasurement` 契约

### 5.1 Scene 形状

`priceMeasurement` 只允许通用 Overlay 基础字段和：

```ts
start: { timestamp: number; value: number }
end: { timestamp: number; value: number }
styles: { line; fill; text }
metadata?: JsonObject
```

- 两个 timestamp 都必须是安全整数并引用 Scene 内嵌 bar；start/end 保留用户绘制顺序，不强制时间先后。
- 两个 value 都必须有限且 `> 0`，engine -> Scene commit 使用当前 `symbol.pricePrecision` 的既有确定性归一化。
- absolute/percentage、像素坐标、label 文本和交互状态均不得持久化。
- stable ID、paneId、groupId、visible、locked、zLevel、mode、styles、opaque metadata 沿用现有 Overlay 约束。

### 5.2 派生和显示

```text
absoluteChange = end.value - start.value
percentageChange = absoluteChange / start.value * 100
```

- start/end/absolute 按 `symbol.pricePrecision` 展示；percentage 固定两位小数。
- 正数前缀 `+`，零不带正负号，负数保留 `-`；例如 `+30.000`、`+10.00%`、`0.000`、`0.00%`。
- 图表格式化使用本仓确定性 half-away-from-zero 规则，不继承宿主 replay 的 `ROUND_HALF_EVEN`；宿主 Decimal 规则不得进入 Scene/Runtime。
- linear/logarithmic 都按归一化后的 Scene numbers 计算，export/recreate 后重新派生同一读数。

### 5.3 整体移动与锚点移动

整体移动采用唯一的绝对平移语义：

```text
newStartIndex = oldStartIndex + deltaBarIndex
newEndIndex   = oldEndIndex   + deltaBarIndex
newStartValue = oldStartValue + deltaValue
newEndValue   = oldEndValue   + deltaValue
```

- `deltaBarIndex` 由按最近 bar 吸附的数据索引计算，两个结果都必须仍引用内嵌 bar。
- 两个价格增加相同 `deltaValue`，因此绝对价差保持；不隐式提供“保持百分比”模式。
- logarithmic 下仍保持绝对价格差，不保持像素刚体距离；若任一新值 `<= 0`，整个事务取消。
- 锚点拖动只更新被命中的 start 或 end；另一个锚点、ID、styles、metadata 不变。
- `horizontalStraightLine` 没有时间坐标，整体移动只改变唯一 `anchor.value`。
- committed Scene 在成功结束前不变；progress 只用于事件/预览，`get/list/export` 始终返回最后一次已提交 Scene。

## 6. 精确命中契约

M2 最小承诺只覆盖 `horizontalStraightLine` 与 `priceMeasurement`；其他 M1 Overlay 不因本里程碑获得新的统一命中保证。

- 主体到可见线几何的最短距离 `<= 12 CSS px` 命中，`> 12` 不命中；验收点使用 12/13 px。
- 锚点中心欧氏距离 `<= 14 CSS px` 命中，`> 14` 不命中；验收点使用 14/15 px。
- 全局优先级为 anchor > body；同类命中先取最高 zLevel，再取 Scene 数组中后出现者；同一 Overlay 多锚点完全重合时取较小 anchor index。
- invisible Overlay 不参与命中；locked Overlay 可被选择，但不能开始拖动，也不发 drag 事件。
- priceMeasurement 的文字 label 不属于 M2 主体命中区域。
- 所有阈值均是 CSS px，与 devicePixelRatio 无关；resize、滚动、缩放、切轴后规则不变。

KLineCharts 当前内部 line deviation 为约 2 px，默认 point radius/active border 合计约 5–8 px，且不是公开稳定 API。因此 12/14 不能依赖引擎私有常量，必须在本仓受控扩展/命中层实现。

## 7. Runtime 事件、顺序和取消语义

### 7.1 公共 envelope

Runtime 0.2.0 发出的所有公共事件都是可 `structuredClone` 的纯数据，统一包含：

```ts
{
  type: string
  sceneVersion: 1
  runtimeVersion: '0.2.0'
}
```

禁止携带 KLineCharts Chart、Overlay 实例、figure、DOM Event、Element 或像素坐标。`interactionId` 是一次交互事务内稳定的 opaque string，不进入 Scene/canonical/hash。

### 7.2 精确 payload

| 事件 | 额外 payload |
|---|---|
| `scene-ready` | `scene` |
| `overlay-created` | `overlay`（已提交 SceneOverlay） |
| `overlay-selection-changed` | `previousId: string \| null`、`id: string \| null` |
| `overlay-selected` | `id`；仅作 M1 deprecated compatibility alias |
| `overlay-drag-started` | `interactionId`、`overlayId`、`target: "body" \| "anchor"`、`anchorIndex: number \| null`、`before` |
| `overlay-dragging` | `interactionId`、`overlayId`、`target`、`anchorIndex`、`before`、`candidate`（归一化的未提交 SceneOverlay） |
| `overlay-drag-committed` | 同一事务身份字段、`before`、`overlay`（已提交） |
| `overlay-updated` | `overlay`；保留 M1 committed event，不得用于 progress |
| `overlay-drag-cancelled` | 同一事务身份字段、`before`、`reason` |
| `overlay-style-changed` | `before`、`overlay`（已提交） |
| `overlay-delete-requested` | `overlayId`；只请求，不删除 |
| `overlay-removed` | `id` |
| `host-action-requested` | `actionId`、`overlayId: string \| null` |
| `scene-error` | `issues` |

新建图形未完成时不进入 Scene；完成后的固定顺序为 `overlay-created`，若引擎随后选中它，再发 `overlay-selection-changed`、`overlay-selected`。新 M2 canonical event 总在 deprecated alias 之前。

### 7.3 拖动与样式事件顺序

成功拖动：

```text
overlay-drag-started
overlay-dragging (0..n)
overlay-drag-committed
overlay-updated
```

取消拖动：

```text
overlay-drag-started
overlay-dragging (0..n)
overlay-drag-cancelled
[scene-error，仅 validation-error 时]
```

样式提交：

```text
overlay-style-changed
overlay-updated
```

选择变化必须先更新 Runtime 的 selected state 再发事件；deselect 只发 `overlay-selection-changed` 且 `id: null`，不得保留 M1 当前的陈旧 selected ID。

### 7.4 取消事务

取消 reason 冻结为：

```text
escape | pointer-cancel | window-blur | destroy | validation-error
```

- 开始时保存最后一次 committed overlay；progress 不写入可导出 Scene。
- 取消时先恢复引擎几何和 committed Scene，再发一次 cancelled。
- validation-error 随后发 `scene-error`；其他取消原因不伪造错误。
- `destroy()` 必须在解绑 Adapter/清空事件总线前取消活动事务并发出 cancelled。
- 当前没有 Scene reload 公共 API；M2 不新增含糊的隐式 reload。原文“Scene 重载”精确替换为 `destroy()` 后重新 `create()`：旧 Runtime 以 `destroy` 取消，新 Runtime 独立发 `scene-ready`。

## 8. 删除、host action 与业务边界

### 8.1 唯一删除行为

- 程序化 `removeOverlay(id)` 沿用 M1，直接删除并在成功后发 `overlay-removed`。
- 标准工具栏显式选择 `direct | request`；默认 `direct` 保持 M1 兼容，具体 option 名称留给生产实现。
- `request` 模式点击删除只发 `overlay-delete-requested`，不先改 Scene；宿主完成自己的业务处理后显式调用 `removeOverlay(id)`。

### 8.2 通用 host action

Runtime 提供通用宿主动作入口；`actionId` 是非空 opaque stable string，事件只含 actionId 和 overlayId。标准工具栏可由宿主配置 label 与 actionId，但 Runtime 不注册或解释业务动作；具体方法名留给生产实现。

### 8.3 字段归属

| 图表仓正式字段 | 宿主/根 fixture 字段 |
|---|---|
| Scene schema/version/runtime identity | `structure_replay_v1`、direction、observation start |
| AAPL 的 numeric OHLCV/turnover 投影、ticker、period、timezone | Decimal 原字符串、quality/source/confirmation evidence |
| pane、Y-axis scale、viewport、render | 主指数绑定和 IXIC display-context 决策 |
| generic Overlay type、稳定 ID、数据锚点、styles、opaque metadata | neckline/target kind、候选/确认、price version |
| derived measurement label（不持久化） | breakout/peak/completion/status、input/result/canonical hash |
| generic selection/drag/style/delete/host-action event | structure/replay DTO、审计、数据库 ID、request/result ID |

根 fixture 中 `m2-aapl-neckline-300`、`m2-aapl-target-330` 及价格可以由宿主投影成普通 `horizontalStraightLine` ID/value；Runtime 只把 ID 当 opaque string，不能按其中的 `neckline`/`target` 文本分支。opaque metadata 可以传递宿主关联，但任何 key 都不升级为图表正式语义。

## 9. Scene 恢复验收矩阵

后续实现必须对由根 SHA 派生的同一图表样本证明：

1. linear 创建：两条水平线和 measurement 的 ID、300/330、styles、metadata 正确；读数为 30/10%。
2. 切 logarithmic：像素 Y 改变，图表数据投影 hash 不变，完整 Scene hash只因 scale 改变。
3. logarithmic export -> destroy -> recreate：完整 hash、ID、start/end、读数、styles、metadata 全等。
4. 整体移动：两个 bar index 增加相同整数、两个 value 增加相同绝对值；锚点移动只改一个端点。
5. 12/13 与 14/15 CSS px 边界、anchor/zLevel/Scene 后序优先级，在 DPR 1/2 下相同。
6. `<= 0`、非有限值、越出 bar 范围的交互 commit 原子失败并恢复最后 committed Scene。
7. 再切回 linear：若没有其他提交修改，完整 canonical hash 回到初始值。

## 10. `0.2.0` 版本矩阵

M2 是公开 minor 能力，候选统一为 0.2.0；版本占用与外部门禁仍需发布任务实时复核。

| 对象 | M2 候选 | 精确内部依赖/发布规则 |
|---|---:|---|
| root release coordination | `0.2.0` | tag 候选 `v0.2.0` |
| `@baron1996/kline-scene-schema` | `0.2.0` | 公共 npm |
| `@baron1996/klinecharts-adapter` | `0.2.0` | 精确依赖 Scene `0.2.0`，KLineCharts 保持 `10.0.0` |
| `@baron1996/klinecharts-runtime` | `0.2.0` | 精确依赖 Scene/Adapter `0.2.0` |
| `@baron1996/klinecharts-cli` | `0.2.0` | 精确依赖 Scene `0.2.0`，同步校验 M2 Scene |
| private render runtime | `0.2.0` | 精确依赖 Scene/Runtime `0.2.0`，保持 private、不得发布 |
| Python `baron-klinecharts` | `0.2.0` | 与 Scene `0.2.0` Schema/语义/canonical 同步 |

公开 npm 仍恰好四个包，依赖发布顺序 Scene -> Adapter -> Runtime -> CLI；Python 同版本单独发布。不得覆盖 0.1.x、使用 dist-tag/canary/file/workspace fallback，或发布 private render runtime。

## 11. 根文档 10.2–10.4 闭环断言

| 上一轮修正 | 最终根契约证据 | 结论 |
|---|---|---|
| 唯一图表投影 | 根 §10.1 与 fixture `chart_projection` 的 AAPL/IXIC、symbol、period、timezone、timestamp、两线及量度完全一致 | PASS |
| Scene/Runtime 兼容 | 根 §10.2 冻结 Scene v1、Runtime 0.1/0.2、scale、原子提升、非正拒绝和 `destroy -> create` | PASS |
| Overlay/交互 | 根 §10.3 冻结 `priceMeasurement`、绝对价差/同 bar-index、12/14 CSS px、选择优先级、locked/invisible 与 direct/request | PASS |
| 事件协议 | 根 §10.4 冻结公共 envelope、全部 payload、成功/取消/样式顺序、五种取消 reason、destroy 收敛与业务字段禁入 | PASS |
| 版本矩阵 | 根 §10.2/§12 冻结 Scene version 1、Runtime protocol 0.2.0 与 Scene/Adapter/Runtime/CLI/Python 0.2.0 候选 | PASS |

上述规则在图表层无歧义；它们没有要求修改最终 fixture 字节。方法名、DOM 控件形态和内部类拆分仍属于后续生产实现，不是 Task 1 跨仓数据契约。

## 12. Task 1 后续精确边界

### 可继续

- 总 session 合并三仓最终复核报告，形成 Task 1 总冻结结论；根契约/fixture 已为 `FROZEN`；
- 后续单独授权的图表实现任务按本报告扩展源 Schema、生成 TypeScript/Python、Adapter、Runtime、工具栏和测试；
- 后续实现直接以 fixture 内嵌 `chart_projection` 和最终根 SHA 生成中性 ChartScene 验收输入，并用最小合成负例覆盖非正边界。

### 仍禁止

- 在当前 Task 1 复核中修改任何生产代码、测试、Schema、依赖、版本或生成物；
- 把 confirmation、price version、neckline/target kind、structure/replay/status/hash 变成 Runtime 字段或事件语义；
- 启动 Task 3 实现、浏览器监听、generate、完整 verify、Git 或发布；
- 引入第二图表引擎、业务仓临时图表逻辑或任何 fallback。

综上，最终根契约与 fixture 不存在字节级或图表契约冲突，本仓 Task 1 复核结论为 `READY`。
