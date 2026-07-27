# Baron KLineCharts 公共发布设计

## 1. 目标与边界

本方案将已经完成的 KLineCharts 单引擎 ChartScene 平台迁移到独立公开仓库
`git54496/baron-klinecharts`，并建立 npm、PyPI、GitHub Release 三条可验证的公开发布链路。

发布后的平台继续遵守以下产品约束：

- 只支持 KLineCharts，不保留 Lightweight Charts 运行时、依赖或兼容层。
- 场景文件只接受内嵌、已标准化的静态行情数据。
- Web、CLI、Python、独立 HTML 和 PNG 使用同一份 ChartScene 与内嵌渲染运行时。
- 不提供撤销、重做，也不恢复旧工程 API。
- `packages/render-runtime` 只负责生成内嵌资产，不作为公共 npm 包发布。
- 本次不增加 Homebrew 分发；Homebrew 可以在 CLI 形成独立可执行产物后另行设计。

## 2. 仓库与包身份

公开仓库使用干净的 Git 历史，不继承原 `lightweight-charts-pro` 的 3098 个上游提交。
原私有仓库继续作为迁移档案保存。

| 类型 | 名称 | 是否公开发布 |
| --- | --- | --- |
| GitHub | `git54496/baron-klinecharts` | 是 |
| npm | `@baron1996/kline-scene-schema` | 是 |
| npm | `@baron1996/klinecharts-adapter` | 是 |
| npm | `@baron1996/klinecharts-runtime` | 是 |
| npm | `@baron1996/klinecharts-cli` | 是 |
| npm workspace | `@baron1996/klinecharts-render-runtime` | 否，保持 `private` |
| Python | `baron-klinecharts` | 是 |
| CLI 命令 | `baron-kline` | 随 npm CLI 包与 Python 包提供 |

所有公共 npm manifest 都必须声明：

- `repository.url` 精确指向 `https://github.com/git54496/baron-klinecharts.git`；
- `repository.directory` 指向对应 workspace；
- `publishConfig.access` 为 `public`；
- `publishConfig.registry` 为 `https://registry.npmjs.org/`。

Python 项目元数据必须包含同一仓库的 Source、Issues 和 Changelog 地址。

## 3. 版本策略

npm Trusted Publisher 只能配置到已经存在的包，因此采用两阶段发布：

1. `v0.1.0` 是完整可用的引导版本。
   - npm 使用一次性 Granular Access Token 从 GitHub Actions 发布。
   - npm 发布显式启用 public access 和 provenance。
   - PyPI 使用 Pending Trusted Publisher，从首版开始使用 OIDC。
2. `v0.1.0` 成功后，为四个 npm 公共包配置 `release.yml` Trusted Publisher，
   删除一次性 npm token，并把工作流切换为 OIDC。
3. `v1.0.0` 由 GitHub Release 触发，通过 OIDC 发布 npm 和 PyPI。

引导版本不是空壳或占位包，必须通过与正式版相同的验证和安装测试。必要的一次性 token
仅用于解决 npm“包必须先存在”的平台限制，不作为长期凭据或备用发布路径保留。

根 workspace、全部 npm workspace、Python 项目和 Git tag 必须使用同一版本。
工作流在构建前验证 `v<version>` tag 与全部 manifest 一致，任何不一致都立即失败。

## 4. 发布流水线

### 4.1 持续验证

`.github/workflows/verify.yml` 在 pull request 以及 `main` push 上运行：

- Node.js 22.12 的主全栈验证；
- Node.js 24 的 TypeScript 兼容验证；
- Python 3.11、3.12、3.13、3.14 矩阵测试；
- Chromium 浏览器与渲染基线测试；
- npm/Python 独立安装测试；
- 生产依赖审计。

### 4.2 Release 构建

`.github/workflows/release.yml` 只响应已发布的 GitHub Release：

1. 检出 release tag 对应提交。
2. 验证 tag、npm 与 Python 版本完全一致。
3. 使用 Node.js 24 和 npm 11.5.1+ 安装锁定依赖并执行完整 `npm run verify`。
4. 生成四个公共 npm tarball。
5. 生成 Python wheel 和 sdist，并执行元数据与内容检查。
6. 把构建产物上传为不可变的 workflow artifact。
7. 通过受保护的 GitHub `release` Environment 执行注册表发布。
8. 把 npm tarball、wheel、sdist 和 SHA-256 清单附加到 GitHub Release。

构建 job 只需要 `contents: read`。只有发布 job 获得 `id-token: write`；
上传 GitHub Release 资产的 job 单独获得 `contents: write`。

### 4.3 npm 发布顺序

npm 包按依赖拓扑顺序发布：

1. `@baron1996/kline-scene-schema`
2. `@baron1996/klinecharts-adapter`
3. `@baron1996/klinecharts-runtime`
4. `@baron1996/klinecharts-cli`

`@baron1996/klinecharts-render-runtime` 不进入发布目录。发布前检查 tarball 中不存在
workspace link、旧引擎依赖、测试输出或本地绝对路径。

### 4.4 PyPI 发布

Python 发布 job 从构建 artifact 下载 wheel 和 sdist，使用
`pypa/gh-action-pypi-publish` 的 OIDC 模式上传。工作流不接受 PyPI 用户名、密码或 API token。

## 5. 安全与失败行为

- GitHub 仓库保持公开，以生成 npm provenance 并公开对应源码。
- GitHub `release` Environment 配置人工审批，只允许受保护 tag 进入发布 job。
- 引导完成后，npm 包设置为“要求 2FA 并禁止 token”，只接受 Trusted Publisher。
- 发布工作流不支持从任意分支手动输入版本，不自动改版本，也不自动创建 tag。
- 不设计 token fallback；OIDC 配置错误时发布直接失败。
- 不覆盖已经存在的 npm/PyPI 版本。
- 任一验证、打包或完整性检查失败时，在触达注册表之前终止。
- 注册表发生部分发布时保留明确失败状态，由相同 release 的失败 job 使用原 workflow
  artifact 重试，不重新构建或替换已发布文件。

## 6. 测试与验收

发布准备必须通过：

- `npm run verify`；
- 四个公共 npm 包的 `npm pack --dry-run` 与 tarball 内容检查；
- npm tarball 在无 workspace link 的临时工程中安装并运行；
- Python wheel/sdist 构建、检查和全新虚拟环境安装；
- JavaScript/Python 对同一场景的 canonical JSON 与 SHA-256 一致；
- 独立 HTML 在阻断网络时加载、编辑和导出；
- Android 真机触摸创建标注、平移、缩放与严格导出；
- 公共 manifest、lockfile 和发布 tarball 中没有 Lightweight Charts 依赖。

## 7. 需要仓库所有者完成的外部配置

代码和工作流进入公开仓库后，仓库所有者需要：

1. 在 GitHub 创建 `release` Environment，并配置必要的人工审批与 tag 限制。
2. 在 npm 确认 `baron1996` 组织成员权限和账号 2FA。
3. 为 `v0.1.0` 创建短期 Granular Access Token，并保存为 GitHub Environment secret
   `NPM_TOKEN`；首发后立即删除。
4. 在 PyPI 创建 `baron-klinecharts` Pending Trusted Publisher，绑定：
   - Owner：`git54496`
   - Repository：`baron-klinecharts`
   - Workflow：`release.yml`
   - Environment：`release`
5. `v0.1.0` 发布后，为四个 npm 包绑定同样的 GitHub 仓库、工作流和 Environment，
   允许 `npm publish`。
6. npm OIDC 验证成功后删除 token，并把包发布设置改为禁止传统 token。

任何密码、2FA 验证码或发布 token 都不进入源码、日志或对话。
