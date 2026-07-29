# M1 Task 4 执行报告

## 1. 执行结论

Task 4“建立 M1 干净消费者契约”已完成，结论为 **PASS**。

本轮使用 Node.js 22.12.0 在临时 npm prefix 中安装以下四个公共 tarball：

- `@baron1996/kline-scene-schema@0.1.0`
- `@baron1996/klinecharts-adapter@0.1.0`
- `@baron1996/klinecharts-runtime@0.1.0`
- `@baron1996/klinecharts-cli@0.1.0`

临时消费者只通过三个包的根 package exports 导入 Schema、Adapter 和 Runtime，并通过 CLI 公共 bin 校验 M1 fixture。真实 Chromium smoke 完成了 Runtime 创建、水平线绘制、export、JSON 序列化、destroy、反序列化和 recreate。

现有公共实现直接满足 Task 4，因此没有修改 Schema、Adapter、Runtime、CLI 或 Render Runtime 生产源码。本轮范围严格停留在 Task 4，没有进入 Task 5。

## 2. 修改文件

本轮实际修改：

- `tests/installation/m1-runtime-consumer.test.mjs`
- `tests/installation/fresh-install.spec.mjs`
- `tests/installation/npm-pack.spec.mjs`
- `packages/web-runtime/README.md`
- `doc/m1/实施计划.md`
- `doc/m1/Task4执行报告.md`

Task 1–3 的 fixture、源码、测试、派生资产和文档改动全部保留，没有恢复、清理或覆盖。

## 3. 测试先行与首次 RED

新增 Task 4 消费者测试后首次运行：

```bash
fnm exec --using=22.12.0 \
  node --test tests/installation/m1-runtime-consumer.test.mjs
```

首次结果为 0/2 PASS，两个失败均为有效契约证据：

1. Runtime README 缺少 `parseChartScene` 和完整的水平线绘制/recreate 最小旅程；
2. 普通 `npm install --no-save --package-lock=false <absolute-tarballs...>` 虽未修改 `package.json`、也未生成根 `package-lock.json`，但 npm 10.9.0 仍生成 `node_modules/.package-lock.json`，其中写入了临时 tarball 的 `file:` 路径。

第二项失败的根因经 npm 10.9.0 Arborist 实现确认：普通 reify 完成后会保存隐藏 lockfile，`--package-lock=false` 不能阻止这次写入。因此没有采用“安装后删除 lockfile”的掩盖方式，而是改为：

```text
temporary prefix
├── bin/baron-kline
└── lib
    ├── package.json
    └── node_modules/<four public packages>
```

安装命令使用 npm 标准的 `--global --prefix <temporary-prefix>`。`prefix` 完全位于测试创建的临时目录，不接触用户或系统全局目录；npm 的 global reify 分支不会生成隐藏 lockfile。tarball 绝对路径只作为本次安装命令参数，不会进入 manifest、lockfile 或 README。

调试期间还校准了两个测试基础设施问题：

- ESM-only exports 必须由临时消费者中的 ESM probe 验证，不能用 CJS `createRequire().resolve()`；
- M1 fixture 必须放在临时消费者的 `public/` 目录，才能进入 Vite browser bundle 的静态输出。

这些调整均只修正消费者测试基础设施，没有修改公共包实现、降低断言或制造源码 RED。

## 4. 四包 tarball 与持久化路径证据

最终安装测试证明：

- 恰好打包并安装四个公共 npm tarball；
- 四个安装目录均不是 symlink，不存在 workspace link；
- 临时消费者 `package.json` 安装前后字节一致；
- 临时 prefix、消费者和 `node_modules` 均没有生成 package lockfile；
- 四个已安装 manifest 的 dependency spec 不含 `file:`、workspace、Git 或本地绝对路径；
- npm tarball 不包含 `src/`、`test/`、`tests/` 或 `package-lock.json`；
- tarball 继续包含构建后 JavaScript、声明文件、README、LICENSE、NOTICE 和第三方许可证；
- Schema tarball 继续包含 `schema/chart-scene.schema.json`。

没有把任何临时绝对 tarball 路径写入仓库 manifest、lockfile、README 或其他正式文件。

## 5. package exports 与 public API 边界

临时消费者 ESM probe 只导入：

```text
@baron1996/kline-scene-schema
@baron1996/klinecharts-adapter
@baron1996/klinecharts-runtime
```

正向断言三个根导出的 package version 均为 `0.1.0`。反向断言：

- `@baron1996/klinecharts-adapter/src/adapter.js` 返回 `ERR_PACKAGE_PATH_NOT_EXPORTED`；
- `@baron1996/klinecharts-runtime/src/runtime.js` 返回 `ERR_PACKAGE_PATH_NOT_EXPORTED`；
- `@baron1996/klinecharts-render-runtime` 返回 `ERR_MODULE_NOT_FOUND`；
- Adapter 公共类原型不暴露 `getChart` 或 `getEngine`；
- recreate 后 Runtime 公共原型同样不暴露 `getChart` 或 `getEngine`；
- 消费者浏览器源码不包含 `packages/*/src`、render-runtime、`file:`、workspace、Git 或本地绝对路径。

测试 fixture 是唯一复制到临时消费者中的本地数据文件。Vite 只作为仓库测试工具构建该临时消费者，不写入消费者 manifest。

## 6. M1 Runtime 真实浏览器旅程

临时消费者执行：

```text
CLI validate consumer-local M1 fixture
→ parseChartScene
→ create Runtime
→ start horizontalStraightLine drawing
→ Chromium 点击真实 KLineCharts overlay canvas
→ overlay-created
→ export Scene
→ JSON.stringify
→ destroy
→ JSON.parse
→ recreate Runtime
→ export Scene
```

关键断言：

- 新水平线 stable ID 为 `overlay-m1-consumer-horizontal`；
- 初次 export 同时包含原 fixture 水平线和新绘制水平线；
- recreate 后 Overlay ID 顺序与初次 export 一致；
- 新水平线 recreate 前后完整深相等；
- type 为 `horizontalStraightLine`；
- anchor 严格只有有限数值 `value`；
- 第一次 Runtime destroy 后 chart container 子节点为 0。

定向测试最终结果：

```text
2 tests
2 passed
0 failed
```

## 7. README 最小示例

`packages/web-runtime/README.md` 现在展示：

```text
parseChartScene
→ createKLineSceneRuntime
→ startOverlayDrawing('horizontalStraightLine')
→ 等待 overlay-created
→ exportScene
→ JSON.stringify
→ destroy
→ JSON.parse
→ createKLineSceneRuntime
```

示例不发起行情请求，不包含确认、价位、结构、信号或规则语义，也不引用 workspace、源码、`file:`、Git 或本地绝对路径。

## 8. Installation 验证

正式命令：

```bash
fnm exec --using=22.12.0 npm run test:installation
```

结果：退出码 0。

- Node installation：26/26 PASS；
- 新增 README 契约：PASS；
- 新增四包浏览器消费者旅程：PASS；
- 既有 fresh-install：PASS；
- npm pack 内容检查：PASS；
- Python wheel、sdist 和 fresh-install smoke：PASS。

## 9. 完整 `npm run verify` 结果

首次直接使用系统 Python 执行全量 verify 时，流程在 `test:python` 统一报 `ModuleNotFoundError: baron_kline`。对照 Task 2/3 报告和 CI 配置后确认：Python 包采用 src layout，Task 1–3 的正式验证均使用已安装当前仓 editable package 的隔离环境 `/tmp/baron-task1-python.SwK26k`。该环境仍存在，并正确导入当前仓 `python/baron-klinecharts/src/baron_kline/__init__.py`。

先用相同环境定向重跑 Python，16/16 PASS；随后在最终测试、README 和计划状态上执行：

```bash
PATH="/tmp/baron-task1-python.SwK26k/bin:$PATH" \
BARON_PYTHON="/tmp/baron-task1-python.SwK26k/bin/python" \
fnm exec --using=22.12.0 \
npm run verify
```

最终结果：退出码 0。

主要结果：

- 5 个 workspace typecheck：PASS；
- Mock：3/3 PASS；
- Unit：134/134 PASS；
- 根级 browser：7/7 PASS；
- Rendering：4/4 PASS；
- Python：16/16 PASS；
- TypeScript/Python cross-language：PASS；
- M1 fixture SHA-256：`0664f38d9bb122800c054c8468516d8c17d7737b03eebdb1b7b1860ea03dec52`；
- Installation：26/26 PASS；
- Python wheel、sdist 和 fresh-install smoke：PASS；
- production dependency audit：0 个漏洞。

Playwright WebServer 日志只有既有的 `NO_COLOR` 因 `FORCE_COLOR` 被忽略 warning，没有浏览器断言失败。

## 10. 是否修改生产源码及依据

没有修改 Task 4 公共契约所依赖的生产源码：

- `packages/scene-schema/src/**`
- `packages/klinecharts-adapter/src/**`
- `packages/web-runtime/src/**`
- `packages/render-runtime/src/**`
- `packages/cli/src/**`

依据是四包安装、package exports、Runtime 水平线 round-trip 和全部 public API 边界均由现有构建产物直接通过。Task 4 只新增或强化安装测试，并更新公共 README。

## 11. Task 4/Task 5 边界

`doc/m1/实施计划.md` 只勾选 Task 4 Step 1–4。Task 5 Step 1–7 全部保持未勾选。

本轮没有：

- 修改版本 manifest 或 lockfile；
- 把 package browser suites 纳入根 `verify`；
- 执行 release version gate；
- 构建或保留正式发布候选目录；
- 从 registry 安装；
- 发布 npm 或 PyPI；
- 创建 Git tag 或 GitHub Release；
- 部署或修改远端状态。

以上均属于 Task 5 或后续任务，需要另行授权。

## 12. Git 与操作边界

Task 1–3 的未提交改动仍在当前 `main` 工作区中。Task 4 没有创建会话、子智能体、worktree、分支或 fallback。

暂存区保持为空。本轮没有执行：

- `git add`
- `git commit`
- `git push`
- `git tag`

也没有发布、部署或 registry 写入。
