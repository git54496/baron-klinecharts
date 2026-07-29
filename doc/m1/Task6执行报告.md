# M1 Task 6 执行报告

## 1. 当前状态

状态：**PASS**

完成时间：2026-07-29 21:10（Asia/Shanghai）

Task 6 已完成发布提交、`main` push、受保护 tag、GitHub Release、唯一 build job 和四个
公共 npm 包及 Python 包发布。原 run 的 GitHub Release assets job 失败后，用户明确授权
复用同一 Actions artifact 进行受限恢复；8 个缺失 assets 已补传并完成字节复核。

四个 npm 公共包均已切换至相同 Trusted Publisher，一次性 npm token 和 GitHub
`release` Environment 中的 `NPM_TOKEN` secret 均已删除，发布链不保留 token fallback。

`doc/m1/实施计划.md` 中 Task 6 Step 1–6 均满足；Task 7 未开始。

## 2. Git 与 GitHub Release

- 发布提交：`9fb297c7e2b2032a166e307dde4a98c0871caa28`
- 分支：`main`
- tag：`v0.1.0`
- tag 剥离提交：`9fb297c7e2b2032a166e307dde4a98c0871caa28`
- GitHub Release：https://github.com/git54496/baron-klinecharts/releases/tag/v0.1.0
- Release 发布时间：`2026-07-29T12:41:16Z`
- Release run：https://github.com/git54496/baron-klinecharts/actions/runs/30452635981
- run ID：`30452635981`

## 3. 同一 run 的不可变 artifact

唯一 build job：

- job：`Verify and build immutable artifacts`
- job ID：`90578189556`
- 结论：`success`
- 完成时间：`2026-07-29T12:43:49Z`
- Actions artifact：`release-artifacts`
- artifact ID：`8724209138`
- artifact 大小：`14295688` bytes

从该 Actions artifact 下载后，`SHA256SUMS` 七项逐项校验均为 `OK`：

| 文件 | CI SHA-256 |
|---|---|
| `npm/baron1996-kline-scene-schema-0.1.0.tgz` | `d1d38db24e98ef38eb82dbdcf93c86fc484e4d465267ac16d4ff031b0ce5c9aa` |
| `npm/baron1996-klinecharts-adapter-0.1.0.tgz` | `95d92975a0120409e51b5826013f03293a0e88018f6113dd18e6e48aa67c65d0` |
| `npm/baron1996-klinecharts-runtime-0.1.0.tgz` | `2979cb8bbe0afdfaa71fbc3710ef5fbeb85b2cb4440a1e6ae7e27b51e02e1ee3` |
| `npm/baron1996-klinecharts-cli-0.1.0.tgz` | `f4416c4f2b0f556cd1af8ab7ac4d54628fa41cbb0d2ec81d622debe7d24a7049` |
| `npm/npm-artifacts.json` | `56785b403033327d272fffaac9ef216def9a830ad203948fd741aad13c0049ec` |
| `python/baron_klinecharts-0.1.0-py3-none-any.whl` | `a9284d2e22c6ec268338b2649c1593f98cb52c2c5f84b7c18118801199f5eed9` |
| `python/baron_klinecharts-0.1.0.tar.gz` | `5bfc216bfc46a1a85f1795fb20af56cadeaf2f29ab6e6d10f5af591a64dd90a3` |

四个 CI npm tarball 与 Task 5 最终候选 SHA-256 完全一致。CI Python distribution 是
用户批准 tag 对应提交在该 run 的唯一 build job 中生成的制品，其独立 SHA-256 如上；
下游发布 job 只能复用 artifact ID `8724209138`，不得重新构建或替换内容。

## 4. 已写入 npm registry 的边界

npm job：

- job：`Publish npm packages`
- job ID：`90578811817`
- 结论：`success`
- 完成时间：`2026-07-29T12:46:49Z`

官方 npm registry 的精确版本端点均返回 HTTP `200`，且均带
`https://slsa.dev/provenance/v1` provenance：

| 包 | 版本 | Registry tarball SHA-256 | 与 Actions artifact |
|---|---:|---|---|
| [`@baron1996/kline-scene-schema`](https://www.npmjs.com/package/@baron1996/kline-scene-schema/v/0.1.0) | `0.1.0` | `d1d38db24e98ef38eb82dbdcf93c86fc484e4d465267ac16d4ff031b0ce5c9aa` | 字节一致 |
| [`@baron1996/klinecharts-adapter`](https://www.npmjs.com/package/@baron1996/klinecharts-adapter/v/0.1.0) | `0.1.0` | `95d92975a0120409e51b5826013f03293a0e88018f6113dd18e6e48aa67c65d0` | 字节一致 |
| [`@baron1996/klinecharts-runtime`](https://www.npmjs.com/package/@baron1996/klinecharts-runtime/v/0.1.0) | `0.1.0` | `2979cb8bbe0afdfaa71fbc3710ef5fbeb85b2cb4440a1e6ae7e27b51e02e1ee3` | 字节一致 |
| [`@baron1996/klinecharts-cli`](https://www.npmjs.com/package/@baron1996/klinecharts-cli/v/0.1.0) | `0.1.0` | `f4416c4f2b0f556cd1af8ab7ac4d54628fa41cbb0d2ec81d622debe7d24a7049` | 字节一致 |

私有 `@baron1996/klinecharts-render-runtime@0.1.0` 端点返回 HTTP `404`，没有发布。

## 5. 已写入 PyPI 的边界

- Python job：`Publish Python distributions`
- job ID：`90578811826`
- 结论：`success`
- 完成时间：`2026-07-29T12:50:45Z`
- PyPI 项目：https://pypi.org/project/baron-klinecharts/0.1.0/

PyPI 官方 JSON 与文件端点返回以下不可变制品，下载后与 Actions artifact 逐字节一致：

| 文件 | PyPI 上传时间 | SHA-256 | 与 Actions artifact |
|---|---|---|---|
| `baron_klinecharts-0.1.0-py3-none-any.whl` | `2026-07-29T12:50:41.208762Z` | `a9284d2e22c6ec268338b2649c1593f98cb52c2c5f84b7c18118801199f5eed9` | 字节一致 |
| `baron_klinecharts-0.1.0.tar.gz` | `2026-07-29T12:50:42.920497Z` | `5bfc216bfc46a1a85f1795fb20af56cadeaf2f29ab6e6d10f5af591a64dd90a3` | 字节一致 |

## 6. GitHub Release assets 失败与受限恢复

- job：`Attach verified distributions to GitHub Release`
- job ID：`90580536198`
- 结论：`failure`
- 完成时间：`2026-07-29T12:50:57Z`
- run 最终结论：`failure`
- 原 job 失败时的 GitHub Release assets：空

该 job 成功下载了 artifact ID `8724209138`，GitHub 记录的 artifact archive digest 为
`sha256:f0e6a1001cebf51efc82b064389346ccbb929fa05d7f915198b30afe6f6e5911`，
随后在执行 `gh release upload "v0.1.0" ...` 时失败：

```text
failed to run git: fatal: not a git repository (or any of the parent directories): .git
```

根因已定位为 `.github/workflows/release.yml` 的 `release-assets` job 没有 checkout
repository，同时 `gh release upload` 没有显式传入 `--repo`，导致 `gh` 在无 `.git`
上下文的 runner 目录中无法解析目标仓库。这不是 build、npm、PyPI、artifact 内容或权限
失败。

按“部分发布或失败时停止”的约束，首次发现失败时没有重跑 workflow、没有手工上传
Release assets，也没有修改受保护 tag。用户随后明确授权受限恢复，执行过程为：

1. 重新下载 run `30452635981` 的 artifact ID `8724209138`；
2. 重新执行七项 `SHA256SUMS`，全部为 `OK`；
3. 重新下载四个 npm tarball 和两个 PyPI distribution，与 artifact 逐字节一致；
4. 确认 `v0.1.0` Release asset 列表为空；
5. 使用 `gh release upload v0.1.0 --repo git54496/baron-klinecharts ...` 补传；
6. 命令未使用 `--clobber`，没有覆盖任何同名 asset；
7. 再次下载 8 个 Release assets，均与 artifact 逐字节一致。

补传时间为 `2026-07-29T12:55:08Z` 至 `2026-07-29T12:55:10Z`。Release：
https://github.com/git54496/baron-klinecharts/releases/tag/v0.1.0

| Release asset | SHA-256 |
|---|---|
| `baron1996-kline-scene-schema-0.1.0.tgz` | `d1d38db24e98ef38eb82dbdcf93c86fc484e4d465267ac16d4ff031b0ce5c9aa` |
| `baron1996-klinecharts-adapter-0.1.0.tgz` | `95d92975a0120409e51b5826013f03293a0e88018f6113dd18e6e48aa67c65d0` |
| `baron1996-klinecharts-runtime-0.1.0.tgz` | `2979cb8bbe0afdfaa71fbc3710ef5fbeb85b2cb4440a1e6ae7e27b51e02e1ee3` |
| `baron1996-klinecharts-cli-0.1.0.tgz` | `f4416c4f2b0f556cd1af8ab7ac4d54628fa41cbb0d2ec81d622debe7d24a7049` |
| `npm-artifacts.json` | `56785b403033327d272fffaac9ef216def9a830ad203948fd741aad13c0049ec` |
| `baron_klinecharts-0.1.0-py3-none-any.whl` | `a9284d2e22c6ec268338b2649c1593f98cb52c2c5f84b7c18118801199f5eed9` |
| `baron_klinecharts-0.1.0.tar.gz` | `5bfc216bfc46a1a85f1795fb20af56cadeaf2f29ab6e6d10f5af591a64dd90a3` |
| `SHA256SUMS` | `5c38121c163e2f3f86cfa560940c06ee14cb04c798b2cd0842411b1738d30136` |

`.github/workflows/release.yml` 已采用最小根因修复：在原 `gh release upload` 命令中加入
`--repo "${{ github.repository }}"`，后续 job 不再依赖 runner 目录中的本地 Git
checkout。没有增加重建、替代上传或其他 fallback。

## 7. npm Trusted Publisher 与 token 收口

四个公共 npm 包的设置页均已逐包只读确认以下绑定：

- Publisher：GitHub Actions；
- Organization or user：`git54496`；
- Repository：`baron-klinecharts`；
- Workflow filename：`release.yml`；
- Environment name：`release`；
- Allowed action：仅 `npm publish`。

逐包确认结果：

| 包 | Owner/Repo | Workflow | Environment | Permission |
|---|---|---|---|---|
| `@baron1996/kline-scene-schema` | `git54496/baron-klinecharts` | `release.yml` | `release` | `npm publish` |
| `@baron1996/klinecharts-adapter` | `git54496/baron-klinecharts` | `release.yml` | `release` | `npm publish` |
| `@baron1996/klinecharts-runtime` | `git54496/baron-klinecharts` | `release.yml` | `release` | `npm publish` |
| `@baron1996/klinecharts-cli` | `git54496/baron-klinecharts` | `release.yml` | `release` | `npm publish` |

收口复核：

- npm 账号 2FA：`Enabled for authorization and publishing`；
- `baron1996` 组织 2FA：enabled 1、disabled 0，enforcement 已启用；
- npm Access Tokens：`Rows 1 to 0 of 0`；
- GitHub `release` Environment secret：列表为空；
- workflow：`id-token: write`，使用 npm `11.5.1`，已删除 `NODE_AUTH_TOKEN` 与
  `secrets.NPM_TOKEN` 引用，不保留 token fallback。

`0.1.0` 是 bootstrap 版本，npm job 使用一次性 token 完成首次发布；本报告不将其虚构为
npm Trusted Publisher 鉴权发布。npm 只允许已存在的包配置 Trusted Publisher，因此下一
版本才可能真实触发 npm OIDC 发布。Task 6 Step 5 对首个 bootstrap 版本的要求是完成
Trusted Publisher 切换并删除一次性 token；当前配置链、权限链和无 token 状态均已验证，
故“下一版本尚未真实 publish”是后续运行证据，不构成本次 Task 6 的设计阻塞。

## 8. Task 6 Step 1–6 判定

| Step | 结论 | 证据 |
|---|---|---|
| Step 1：复核外部配置 | PASS | Environment、审批、tag ruleset、npm/PyPI 认证和发布前未占用均已在外部写入前核验 |
| Step 2：使用已验证 artifact | PASS | tag 源码只构建一次，artifact ID `8724209138`，七项 SHA-256 全部通过 |
| Step 3：按依赖顺序发布 npm | PASS | scene-schema → adapter → runtime → CLI，同一 job 成功 |
| Step 4：发布 Python 与 Release | PASS | PyPI wheel/sdist 与 8 个 Release assets 均和原 artifact 字节一致 |
| Step 5：完成 Trusted Publisher 切换 | PASS | 四包绑定一致，npm token 与 GitHub secret 均为空，workflow 无 token fallback |
| Step 6：处理部分发布 | PASS | 失败后先停止，授权后只复用原 artifact 补传，没有覆盖、重建或改变版本内容 |

Expected 状态已经满足：npm/PyPI/tag/Release 统一为 `0.1.0`，Scene version 保持 `1`，
private Render Runtime 未发布。

## 9. 最终验证

workflow 最小修复后，既有安装契约测试仍断言必须存在 `secrets.NPM_TOKEN`。该断言只适用于
首发 bootstrap 阶段，与 Task 6 完成后的 OIDC-only 设计冲突，因此同步更新
`tests/installation/workflow-contract.test.mjs`：

- 断言不存在 `NODE_AUTH_TOKEN`；
- 断言不存在 `secrets.NPM_TOKEN`；
- 断言 `gh release upload` 显式使用 `${{ github.repository }}`。

验证结果：

| 验证 | 运行时 | 结果 |
|---|---|---|
| `node --test tests/installation/workflow-contract.test.mjs` | Node.js `22.12.0` | 2/2 PASS |
| `npm run verify` | Node.js `22.12.0` | 退出码 0 |
| Python package fresh-install smoke | 根 verify | PASS |
| `npm audit --omit=dev --audit-level=high` | 根 verify | 0 vulnerabilities |

根 verify 覆盖 generate、typecheck、mock、unit、根 browser、三个 package browser suites、
rendering、Python、跨语言、package installation 与 audit。

## 10. 明确未执行范围

- 没有重跑 workflow；
- 没有重建或替换 artifact；
- 没有覆盖或重发四个 npm 版本和两个 PyPI distribution；
- 没有修改 `v0.1.0` tag 或创建新版本、新 Release；
- 没有发布 private Render Runtime；
- 没有执行 Task 7；
- 没有读取、记录或输出任何 secret 值。
