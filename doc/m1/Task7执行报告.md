# Task 7 执行报告：registry 黑盒与总 session 交付

## 1. 结论

- 状态：`PASS`
- 验收标识：`BK-M1-4`
- 执行范围：`doc/m1/实施计划.md` Task 7 Step 1–4
- 执行基线：`main@ef0b357aa5c452867042802159aead88debea207`
- 执行环境：Node.js `22.12.0`、npm `10.9.0`、Python `3.12.2`
- 统一公共版本：`0.1.0`
- Scene Schema：`@baron1996/kline-scene` version `1`

本轮在全新临时消费者中使用独立 npm cache，从官方 npm registry
精确安装三个公共包。实际安装路径全部位于临时消费者
`node_modules`，没有使用本地 tarball、兄弟仓源码、`file:`、
workspace 或 Git 依赖。随后通过包根 exports 和 Runtime 公共 API，
在真实 Chromium 中完成 fixture 校验、水平线创建、export、
destroy/recreate、字段与 canonical hash 对比、删除及第二次销毁。

registry 黑盒、仓内定向浏览器套件和完整 `npm run verify` 均通过。
`my-cage` 当前边界没有违规引用；其正式包接入按跨仓冻结顺序保留为
`RETAINED_CONSUMER_INTEGRATION_GATE`，留待 `my-cage` Task 4，不影响
本仓 `BK-M1-4`。

## 2. Task 0 差距表闭环

| 能力 | Task 0 差距 | M1 最终证据 | 状态 |
|---|---|---|---|
| 蜡烛图 | 只需 M1 fixture/契约证据 | fixture 含唯一 candle pane、3 根合法日线 OHLCV；Schema、Adapter、Runtime、render baseline 与 registry 浏览器加载均通过 | PASS |
| 水平参考线 | TypeScript/Python 曾接受无意义 `timestamp` | Task 1 已把 `horizontalStraightLine.anchor` 收紧为仅 `{ value }`；registry 浏览器创建值为有限数值，未持久化时间或像素几何 | PASS |
| Stable ID | 需要正式 lifecycle 回归 | `overlay-m1-registry-horizontal` 经 export、destroy/recreate 后保持不变 | PASS |
| Scene round-trip | 需要 M1 字段与 hash 等值证据 | ID/value/styles/metadata 全部等值；第一次与重建后 canonical SHA-256 同为 `fc1d66a87a500534179d8db052b6befc613ce0ef4990b5b25d883c58478cf0d8` | PASS |
| 工具栏 | 需要固化真实 M1 旅程 | Runtime package 10/10、根级浏览器 7/7；水平线创建、选择、导出、删除和触摸路径均通过 | PASS |
| 正式发布 | registry/tag/Release 尚未形成 | Task 6 已发布四个公共 npm 包、Python 包、`v0.1.0` 与 GitHub Release；Task 7 从 registry 独立复核三个运行时包 | PASS |

## 3. Step 1：官方 registry 干净安装

### 3.1 隔离条件

- 临时消费者：`/tmp/baron-task7-registry-consumer.0AQyhQ`
- npm cache：新建的
  `/tmp/baron-task7-registry-consumer.0AQyhQ/npm-cache`
- user config：`--userconfig=/dev/null`
- registry：`https://registry.npmjs.org/`
- npm 网络模式：`prefer-online=true`、`offline=false`
- 三个业务依赖在 `package.json` 中均为精确字符串 `0.1.0`
- 辅助 browser bundle 只额外安装 registry 版本 `vite@7.3.6`
- `package-lock.json` 中没有 `file:`、workspace、Git、`/Users/`、
  `/tmp/`、`/private/tmp/` 或兄弟仓源码路径

安装命令的业务包部分为：

```bash
npm install --userconfig=/dev/null --save-exact \
  @baron1996/kline-scene-schema@0.1.0 \
  @baron1996/klinecharts-adapter@0.1.0 \
  @baron1996/klinecharts-runtime@0.1.0
```

### 3.2 lockfile、registry 与实际安装证据

| 包 | 实际版本 | lockfile resolved | lockfile / registry integrity |
|---|---:|---|---|
| `@baron1996/kline-scene-schema` | `0.1.0` | `https://registry.npmjs.org/@baron1996/kline-scene-schema/-/kline-scene-schema-0.1.0.tgz` | `sha512-Rr4PHSsMryTfLIfs7D5jwihq/S2SePhPGMJjUDjYMjDRJpv1wtAw6TZommTmyjZ0pmUxdZBe7kPK+lT+UBGHKA==` |
| `@baron1996/klinecharts-adapter` | `0.1.0` | `https://registry.npmjs.org/@baron1996/klinecharts-adapter/-/klinecharts-adapter-0.1.0.tgz` | `sha512-R9uq6eKrt45zuAmfbsBQUGBhIljZtWNPmwfNk+mYWFt8b4e+M27z32v570Vpo/6B92krRUuJ19/B/O7BG0uW2Q==` |
| `@baron1996/klinecharts-runtime` | `0.1.0` | `https://registry.npmjs.org/@baron1996/klinecharts-runtime/-/klinecharts-runtime-0.1.0.tgz` | `sha512-Mrsf4/Mum/e/Yo4z0WeaHQEXkjG+g6DhddLJeYqNROl0bHeZMYRGPLu63xYFNaQ0GweKJVbcpXJ0ncAGKlklIQ==` |

从上述 resolved URL 重新下载远端 tarball 后，按真实字节计算的
SHA-512 与 lockfile/registry SRI 完全相同；SHA-256 为：

| registry tarball | SHA-256 | 与 Task 6 Actions artifact |
|---|---|---|
| `kline-scene-schema-0.1.0.tgz` | `d1d38db24e98ef38eb82dbdcf93c86fc484e4d465267ac16d4ff031b0ce5c9aa` | 字节一致 |
| `klinecharts-adapter-0.1.0.tgz` | `95d92975a0120409e51b5826013f03293a0e88018f6113dd18e6e48aa67c65d0` | 字节一致 |
| `klinecharts-runtime-0.1.0.tgz` | `2979cb8bbe0afdfaa71fbc3710ef5fbeb85b2cb4440a1e6ae7e27b51e02e1ee3` | 字节一致 |

### 3.3 模块解析路径

Node.js `import.meta.resolve()` 的结果均落在临时消费者自身：

```text
@baron1996/kline-scene-schema
  file:///private/tmp/baron-task7-registry-consumer.0AQyhQ/node_modules/@baron1996/kline-scene-schema/dist/index.js
@baron1996/klinecharts-adapter
  file:///private/tmp/baron-task7-registry-consumer.0AQyhQ/node_modules/@baron1996/klinecharts-adapter/dist/index.js
@baron1996/klinecharts-runtime
  file:///private/tmp/baron-task7-registry-consumer.0AQyhQ/node_modules/@baron1996/klinecharts-runtime/dist/index.js
```

包内公开版本常量与物理 `package.json` 均报告 `0.1.0`；Scene 公开常量
报告 version `1`。

## 4. Step 2：真实浏览器 M1 黑盒

### 4.1 输入与公开 API

- 输入 fixture：
  `tests/fixtures/scenes/m1-candle-horizontal-line.json`
- 源文件与临时消费者副本 SHA-256：
  `924c0505d80e814dfe7e6cc5fb47a6145466ffa5db57634b0b6af05d6be74e88`
- fixture canonical Scene SHA-256：
  `0664f38d9bb122800c054c8468516d8c17d7737b03eebdb1b7b1860ea03dec52`
- Vite production bundle：46 modules transformed，构建 PASS
- 浏览器：Playwright CLI 驱动的真实 Chromium，viewport `1280x1000`
- 页面控制台：0 error、0 warning

消费者源码只从三个包的根 exports 导入：

- Scene：`parseChartScene`、`hashCanonicalScene`、版本常量；
- Adapter：`ADAPTER_PACKAGE_VERSION`；
- Runtime：`createKLineSceneRuntime`、版本常量。

旅程只调用 Runtime 公共方法：

`startOverlayDrawing`、`getOverlay`、`exportScene`、`destroy`、
`removeOverlay`。未导入 `packages/*/src`，未获得 KLineCharts engine
实例，公开原型也不存在 `getChart` 或 `getEngine`。

### 4.2 浏览器交互与断言

1. Chromium 打开消费者页面，fixture 经 `parseChartScene` 通过。
2. 点击 `Start horizontal line`，以固定 ID
   `overlay-m1-registry-horizontal` 启动
   `horizontalStraightLine`。
3. 在真实 chart canvas 坐标 `(521, 319)` 单击，收到且仅收到一个
   `overlay-created` 事件。
4. export 后断言：
   - ID：`overlay-m1-registry-horizontal`；
   - value：`101.67084494773519`，且 anchor 唯一字段为 `value`；
   - line style：`rgba(41, 98, 255, 1)` / `1` / `solid`；
   - styles 与 fixture 源水平线完整等值；
   - metadata labels 为 `["m1", "reference-line"]`，
     opaque 为 `{"owner":"fixture-consumer","revision":1}`。
5. 第一次 `destroy()` 后 chart 子节点数为 `0`。
6. 从 JSON export 重建 Runtime，ID/value/styles/metadata 全部等值。
7. 第一次 export 与重建后 export 的 canonical SHA-256 同为
   `fc1d66a87a500534179d8db052b6befc613ce0ef4990b5b25d883c58478cf0d8`。
8. `removeOverlay()` 返回 `true`；再次 export 后仅保留 fixture 原水平线
   `overlay-m1-horizontal-reference`。
9. 第二次 `destroy()` 后 chart 子节点数仍为 `0`。

最终页面状态为：

```text
PASS — registry-only M1 journey completed.
```

浏览器全页截图保存在临时证据目录：

```text
/tmp/baron-task7-registry-consumer.0AQyhQ/task7-registry-blackbox.png
SHA-256 9bbcb78766fba3c7baf9d4b3e9f4e2f3f9b6b89c45cddfcc5cf6f236cbea754b
```

截图在完成删除和第二次销毁后采集，因此 chart 容器为空；页面 Evidence
区域保留上述 PASS、版本、fixture、绘制、round-trip、删除与公开 API
断言结果。

## 5. Step 3：`my-cage` 只读边界检查

审计对象：
`/Users/yebingyue/code/baron/cage-project/my-cage`，
读取时为 `main@b39b16aafdca83db2b5214b5b8c27869d13b9e3a`。该仓存在既有未提交
和未跟踪文件，本轮没有修改、暂存或清理任何内容。

| 检查项 | 事实 | 判定 |
|---|---|---|
| `file:` / workspace / Git /本地源码路径 | `web/package.json` 与 `web/package-lock.json` 未命中；没有兄弟仓或绝对源码路径 | PASS |
| 其他图表引擎 | manifest 没有图表依赖，`web/src`/`api/src` 没有其他图表 engine import 或实现 | PASS |
| 复制本仓源码 | `web/src`/`api/src` 未出现 `KLineSceneRuntime`、`KLineChartsSceneAdapter`、`horizontalStraightLine` 或本仓源码路径 | PASS |
| 私有 engine API | 当前业务源码没有 `getChart`、`getEngine` 或 `klinecharts` 直接调用 | PASS |
| 正式包接入 | 三个 `@baron1996` 包在 manifest/lockfile 中均不存在，Runtime 尚未消费 | `RETAINED_CONSUMER_INTEGRATION_GATE` |

跨仓顺序已经校准：`my-cage` Task 4 必须等两个上游 Task 7 通过后才接入
正式包。故“尚未接入”是预期保留门禁，不是本仓 registry 黑盒失败；
边界检查按没有违规依赖、替代引擎、复制源码和私有 API 访问判定 PASS。
本轮没有修改 `my-cage`。

## 6. 仓内验证

### 6.1 Task 7 定向浏览器验证

全部使用 Node.js `22.12.0`：

| 命令 | 结果 |
|---|---|
| `npm run test:browser --workspace @baron1996/klinecharts-adapter` | 10/10 PASS |
| `npm run test:browser --workspace @baron1996/klinecharts-runtime` | 10/10 PASS |
| `npm run test:browser` | 7/7 PASS |

### 6.2 完整 `npm run verify`

完整命令退出码为 `0`。关键结果：

| 阶段 | 结果 |
|---|---|
| generate / typecheck / deterministic mock check | PASS |
| mock tests | 3/3 PASS |
| workspace unit tests | 134/134 PASS |
| 根级 browser | 7/7 PASS |
| Adapter / Runtime / Render Runtime package browser | 10/10、10/10、2/2 PASS |
| rendering baselines | 4/4 PASS |
| Python | 16/16 PASS |
| cross-language | PASS；M1 hash `0664f38d9bb122800c054c8468516d8c17d7737b03eebdb1b7b1860ea03dec52` |
| Node installation/manifest/release tests | 26/26 PASS |
| Python wheel/sdist fresh-install smoke | PASS |
| production npm audit | 0 vulnerabilities |

完整验证的 generate 阶段没有产生 tracked diff。Playwright WebServer 仍只输出
既有 `NO_COLOR` 被 `FORCE_COLOR` 忽略的 warning；测试与页面断言无失败。

## 7. 正式发布事实与 Task 7 registry 事实的区分

### 7.1 Task 6 已建立的发布事实

以下属于 Task 6，不是本轮重新发布：

- 发布提交：
  `9fb297c7e2b2032a166e307dde4a98c0871caa28`
- annotated tag：`v0.1.0`
  （tag object `c922bd45fec54a87a7bfe6caa5fd405bab72d0ea`）
- GitHub Release：
  https://github.com/git54496/baron-klinecharts/releases/tag/v0.1.0
- Release run：
  https://github.com/git54496/baron-klinecharts/actions/runs/30452635981
- Actions artifact ID：`8724209138`
- Release 发布时间：`2026-07-29T12:41:16Z`
- PyPI：
  https://pypi.org/project/baron-klinecharts/0.1.0/

四个 npm 公共包：

| 包 | npm 链接 | 发布时间 | Task 6 / registry SHA-256 |
|---|---|---|---|
| Scene Schema | https://www.npmjs.com/package/@baron1996/kline-scene-schema/v/0.1.0 | `2026-07-29T12:46:33.633Z` | `d1d38db24e98ef38eb82dbdcf93c86fc484e4d465267ac16d4ff031b0ce5c9aa` |
| Adapter | https://www.npmjs.com/package/@baron1996/klinecharts-adapter/v/0.1.0 | `2026-07-29T12:46:37.900Z` | `95d92975a0120409e51b5826013f03293a0e88018f6113dd18e6e48aa67c65d0` |
| Runtime | https://www.npmjs.com/package/@baron1996/klinecharts-runtime/v/0.1.0 | `2026-07-29T12:46:42.257Z` | `2979cb8bbe0afdfaa71fbc3710ef5fbeb85b2cb4440a1e6ae7e27b51e02e1ee3` |
| CLI | https://www.npmjs.com/package/@baron1996/klinecharts-cli/v/0.1.0 | `2026-07-29T12:46:47.188Z` | `f4416c4f2b0f556cd1af8ab7ac4d54628fa41cbb0d2ec81d622debe7d24a7049` |

Python 发布文件：

| 文件 | PyPI 发布时间 | SHA-256 |
|---|---|---|
| `baron_klinecharts-0.1.0-py3-none-any.whl` | `2026-07-29T12:50:41.208762Z` | `a9284d2e22c6ec268338b2649c1593f98cb52c2c5f84b7c18118801199f5eed9` |
| `baron_klinecharts-0.1.0.tar.gz` | `2026-07-29T12:50:42.920497Z` | `5bfc216bfc46a1a85f1795fb20af56cadeaf2f29ab6e6d10f5af591a64dd90a3` |

Release 的 `npm-artifacts.json` SHA-256 为
`56785b403033327d272fffaac9ef216def9a830ad203948fd741aad13c0049ec`，
`SHA256SUMS` SHA-256 为
`5c38121c163e2f3f86cfa560940c06ee14cb04c798b2cd0842411b1738d30136`。

### 7.2 Task 7 新建立的 registry 黑盒事实

本轮没有复用 Task 5/6 本地候选来冒充 registry 安装，而是：

1. 从新的隔离 cache 发起官方 registry 安装；
2. 由新 lockfile 记录 resolved URL 与 SRI；
3. 由真实安装目录解析三个公开 exports；
4. 再从 resolved URL 下载远端 tarball，独立计算 SHA-512/SHA-256；
5. 证明三个 registry tarball 与 Task 6 Actions artifact 的已记录
   SHA-256 完全一致；
6. 在该 registry 消费者 bundle 中完成真实 Chromium M1 旅程。

这是 Task 7 的新增证据；Task 6 的 tag、Release、npm/PyPI 发布事实没有被
修改或重做。

## 8. 公开 API 与 M1 非目标

Task 7 证明的公共契约：

- Scene fixture parse、canonical bytes/hash；
- Runtime 创建与显式销毁；
- `horizontalStraightLine` 固定 ID 和纯 `anchor.value`；
- styles、metadata、paneId 的 Scene 往返；
- export、JSON serialization、destroy/recreate；
- Overlay 删除；
- 不暴露底层 chart/engine 实例。

继续保持非目标：

- 不实现或承诺 M2/M3 的对数/线性切换、折线图、量度涨幅、全屏控制；
- 不扩展完整样式矩阵；
- 不新增业务确认、结构、规则或交易字段；
- 不将 Runtime 的底层 KLineCharts 实例作为公共 API；
- 不发布 private `@baron1996/klinecharts-render-runtime`。

## 9. 未执行范围与 Git 边界

本轮未执行：

- 修改或重新发布 npm/PyPI `0.1.0`；
- 修改 tag、GitHub Release、Release assets 或 registry 内容；
- 发布 private render-runtime；
- 修改 `my-cage`；
- 使用本地 tarball、兄弟仓源码、`file:`、workspace、Git 或 npm link
  完成 registry 黑盒；
- 创建分支、worktree、子智能体或新会话；
- 提前进入任何 M2/M3 实现。

用户已明确授权仅为 Task 7 必要的计划、报告 Git 提交与 `main` push。
提交时必须排除既有未跟踪目录 `release-candidate-final-artifacts/`，并在
提交前复核 staged scope。

## 10. 最终判定

Task 7 Step 1–4 全部完成，最终清单全部满足。`my-cage` 现有依赖边界
PASS，正式消费者接入保留为 `RETAINED_CONSUMER_INTEGRATION_GATE`。
本仓 `BK-M1-4` 可判定为 PASS。
