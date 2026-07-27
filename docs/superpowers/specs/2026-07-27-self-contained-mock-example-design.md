# 自包含 Mock 验证页设计

## 1. 目标

为 Baron KLineCharts Scene Platform 提供一个无需真实行情服务、无需注册表发布、
无需用户配置的本地验证入口。开发者运行一条命令即可打开 Vanilla 模板页，使用
固定、可重建的静态行情验证当前 Web Runtime、KLineCharts Adapter 和标准标注
工具栏。

本功能只建设示例和验证资产，不修改 ChartScene 协议、Runtime 行为、CLI 命令、
Python SDK 或发布流程。

## 2. 核心约束

- 不依赖 `fxxking-data` 或任何网络行情源。
- 页面只接收已经生成并提交到仓库的静态 ChartScene JSON。
- Mock 行情必须由固定算法、固定种子和固定时间范围确定性生成。
- 标的明确使用 `MOCK.CN` 和“确定性模拟行情”，不得伪装成真实证券数据。
- 页面必须通过 `@baron1996/klinecharts-runtime` 使用唯一的 KLineCharts 引擎，
  不直接绕过 Adapter 操作原始 KLineCharts 对象。
- 数据、页面或 Runtime 加载失败时显式失败，不使用旧 fixture、默认数据或其他
  场景兜底。

## 3. 结构

### 3.1 Mock 场景生成器

新增 `tools/generate-mock-scene.mjs`：

- 使用版本化的固定种子伪随机算法；
- 从固定结束日期向前构造 250 个工作日；
- 生成满足 `low ≤ open/close ≤ high` 的 OHLC；
- 价格保留两位，成交量和成交额使用确定性整数；
- 生成完整 ChartScene，并交由现有 Scene Schema 与语义校验；
- 支持写入模式和检查模式；
- 使用稳定 JSON 表示，保证重复生成字节完全一致。

生成结果保存为 `examples/vanilla/mock-year.scene.json`。场景 metadata 记录
`source=deterministic-mock`、生成器版本和种子，viewport 锚定最后一根 K 线。

### 3.2 Vanilla 模板页

保留 `examples/vanilla` 作为最小模板：

- 导入 `mock-year.scene.json`；
- 调用 `createKLineSceneRuntime` 创建图表；
- 调用 `createStandardToolbar` 提供标准标注操作；
- 使用页面状态区域显示加载成功或明确错误；
- 页面卸载时销毁 toolbar 和 runtime；
- 不增加 React、Vue、远端请求或业务配置。

根工作区新增本地启动命令，使用 Vite 监听本机地址并自动打开模板页。

## 4. 数据流

```text
固定种子与固定日期
        ↓
Mock 生成器
        ↓
Schema / 语义校验
        ↓
静态 mock-year.scene.json
        ↓
Vanilla 页面
        ↓
Web Runtime → KLineCharts Adapter → KLineCharts 10.0.0
        ↓
标准标注工具栏与场景导出
```

运行时数据流到静态 JSON 为止，不包含行情获取、刷新或缓存。

## 5. 错误处理

- 生成器参数、OHLC 不变量或 Scene 校验失败时以非零状态退出。
- 检查模式发现生成结果与提交文件不一致时失败，并提示运行写入命令。
- 页面找不到挂载节点、场景不合法或 Runtime 初始化失败时显示错误并重新抛出。
- 不捕获后继续、不替换输入、不加载备用场景。

## 6. 验证

- 单元测试验证固定种子生成两次得到相同字节、数据量为 250、时间戳严格递增、
  OHLC 不变量成立。
- 一致性检查验证提交的 `mock-year.scene.json` 与生成器输出逐字节相同。
- 浏览器 Smoke Test 打开 Vanilla 页面，确认 Runtime 就绪、标准工具栏存在，
  导出场景仍包含 250 根 K 线。
- 现有 Node/Python 跨语言测试加载该场景，验证 canonical JSON、场景 SHA-256
  和离线 HTML 逐字节一致。
- PNG 继续使用现有固定平台基线，不为示例重复增加视觉基线。
- 根 `npm run verify` 纳入 Mock 一致性检查和模板页 Smoke Test。

## 7. 非目标

- 不接入真实行情。
- 不实现 Mock 参数编辑器。
- 不实现用户场景管理。
- 不新增撤销/重做。
- 不修改 npm/PyPI 发布配置。
- 不在 `fxxking-data` 仓库创建任何文件或改动。
