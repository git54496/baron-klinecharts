# Baron KLineCharts Scene Platform

Baron 是基于 **KLineCharts 10.0.0** 的单引擎完整 K 线场景平台。统一的
`ChartScene` 文件可以在 Web、CLI、Python、自包含 HTML 和 PNG 之间流转，
并在固定运行环境中得到可复现的语义与渲染结果。

## 核心约束

- 只支持 KLineCharts 10.0.0，不存在第二图表引擎或运行时降级路径。
- 场景只接受内嵌、已标准化、时间戳严格递增的静态 OHLCV 数据。
- 场景不允许网络数据源、任意回调、可执行字段或自定义引擎对象。
- Web、CLI 与 Python 共享严格 JSON Schema、语义校验、RFC 8785 序列化和
  SHA-256 场景指纹。
- HTML 包含图表 Runtime、工具栏和中文字体，可使用 `file://` 离线打开、
  编辑并导出。
- PNG 只使用 Playwright 1.61.0 对应的固定 Chromium 渲染，没有系统浏览器
  或其他截图方案。
- 不提供撤销/重做，也不保留相关状态栈、UI 或快捷键。

## 工程结构

```text
packages/scene-schema          ChartScene Schema、类型、校验与规范序列化
packages/klinecharts-adapter   ChartScene 与 KLineCharts 的唯一边界
packages/web-runtime           浏览器编辑 Runtime 与标准工具栏
packages/render-runtime        私有的确定性 HTML/PNG 渲染 Runtime
packages/cli                   baron-kline 命令行工具
python/baron-klinecharts       Python 模型、集合、校验、IO 与渲染
tests                          跨语言、浏览器、视觉与安装门禁
```

## Node.js

要求 Node.js `^22.12.0 || ^24.0.0` 和 npm 10.8.2。

安装 Web Runtime：

```bash
npm install @baron1996/klinecharts-runtime
```

安装 CLI：

```bash
npm install --global @baron1996/klinecharts-cli
baron-kline install-browser
```

开发仓库：

```bash
npm ci
npm run generate
npm run verify
```

### 本地自包含验证页

无需行情服务或账号即可运行 Vanilla 验证页：

```bash
npm ci
npm run example:vanilla
```

页面只加载仓库内的 `examples/vanilla/mock-year.scene.json`，不会发起行情请求。
该文件由固定种子、固定算法和固定结束日期生成；有意修改生成规则后运行
`npm run generate:mock` 更新，检查当前文件能否逐字节重建则运行
`npm run check:mock`。

Web Runtime 的最小生命周期：

```ts
import {
  createKLineSceneRuntime,
  createStandardToolbar,
} from '@baron1996/klinecharts-runtime';

const runtime = await createKLineSceneRuntime(container, scene);
const toolbar = createStandardToolbar(toolbarContainer, runtime);

const exportedScene = runtime.exportScene();

toolbar.destroy();
runtime.destroy();
```

CLI 示例：

```bash
baron-kline validate scene.json
baron-kline inspect scene.json --json
baron-kline overlays list scene.json
baron-kline render scene.json --format html --output scene.html
baron-kline render scene.json --format png --output scene.png
baron-kline install-browser
```

所有修改命令都要求独立的 `--output`，禁止原地覆盖输入。已有输出只有在显式
传入 `--force` 时才会被原子替换。

## Python

要求 Python 3.11–3.14。浏览器客户端随包安装，但 Chromium 不会被隐式下载。

```bash
pip install baron-klinecharts==0.1.0
python -m playwright install chromium
```

```python
from baron_kline import load_scene, render_scene_html, render_scene_png

scene = load_scene("scene.json")
scene.overlays.add(overlay)
render_scene_html(scene, "scene.html")
render_scene_png(scene, "scene.png")
```

从列表、CSV 或 DataFrame 构建行情时必须提供显式列映射；SDK 不猜测字段名。

## 可复现边界

场景 JSON 的规范字节和哈希在 Node.js 与 Python 中完全一致。HTML 对同一场景
逐字节一致；PNG 的逐字节一致性适用于同一固定主机、Playwright/Chromium
revision、viewport、DPR、locale、timezone 和嵌入字体组合。跨操作系统输出仍应
通过各平台独立基线验证。

CI 分别使用 `tests/rendering/baselines/github-macos-15` 和
`tests/rendering/baselines/github-ubuntu-24.04` 做严格的逐字节校验；失败时会
上传该固定环境重新渲染的完整 PNG 集合供审阅。未设置 `BARON_PNG_BASELINE`
时使用 `tests/rendering/baselines` 下的本机开发基线。

## 发布

当前仓库版本为 `0.1.0`。GitHub Release tag、全部 npm workspace 和 Python
项目必须使用同一版本。发布流水线先执行完整验证，再构建一次不可变产物，并将
相同 npm tarball、Python wheel 和 sdist 发布到对应注册表及 GitHub Release。

`0.1.0` 是完整可用的 npm 引导版本；引导完成后，npm 与 PyPI 都只通过绑定
`release.yml` 和 GitHub `release` Environment 的 OIDC Trusted Publisher 发布。
发布流程不保留 token 降级路径。

许可证与第三方归属见 [LICENSE](LICENSE)、[NOTICE](NOTICE) 和
[`licenses/`](licenses/)。
