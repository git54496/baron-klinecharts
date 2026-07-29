# M1 Task 5 执行报告

## 1. 执行结论

Task 5“构建发布候选”已完成，结论为 **PASS**。

`BK-M1-3` 当前状态为“发布候选”，版本统一为 `0.1.0`。最终候选位于
`release-candidate-final-artifacts/`，包含恰好四个公共 npm tarball、一个 Python wheel
和一个 Python sdist。`@baron1996/klinecharts-render-runtime` 继续保持 private，没有进入
发布制品集合。

本轮严格停止在 Task 6 前。候选尚未发布到 npm/PyPI，没有 Git tag、GitHub Release、
部署或 registry 写入，不能将本报告中的本地发布候选写成正式发布结果。

## 2. 本轮修改

本轮实际修改：

- `package.json`
- `tests/installation/workspace-manifest.test.mjs`
- `tests/installation/m1-runtime-consumer.test.mjs`
- `doc/m1/实施计划.md`
- `doc/m1/Task5执行报告.md`

新增根脚本 `test:browser:packages`，按 Adapter、Web Runtime、Render Runtime 的顺序运行
三个 package browser suites；根 `verify` 已在根浏览器测试之后、rendering 之前调用该
脚本。

M1 消费者测试增加了显式的只读候选目录入口。未指定该入口时仍按原测试流程临时打包；
指定时直接读取正式脚本生成的 `npm-artifacts.json` 并安装其中四个最终 tarball，不会
在验证过程中重新打包或写入候选目录。

根和各 workspace 的版本与依赖均未变化，因此 `package-lock.json` 无需更新，最终
diff 为空。Task 1–4、用户及并行 coding agent 的既有改动均保留，没有恢复、清理或覆盖。

## 3. Step 1：版本与私有边界

审计结果：

- 根 workspace：`0.1.0`
- 五个 workspace：全部为 `0.1.0`
- Python 包：`0.1.0`
- Runtime HTML 与派生 assets：`0.1.0`
- lockfile 根与 workspace 版本：`0.1.0`
- `@baron1996/klinecharts-render-runtime`：`private: true`
- Render Runtime 没有公共 `publishConfig`
- Node.js：`v22.12.0`
- npm：`10.9.0`

## 4. Step 2–3：生成与完整验证

先为根 `verify` 的 package browser 门禁新增 manifest 回归。首次运行结果为 0/1 PASS：
根 manifest 尚无 `test:browser:packages`，证明门禁缺口真实存在。补充脚本并接入
`verify` 后，该回归变为 1/1 PASS。

正式生成命令：

```bash
fnm exec --using=22.12.0 npm run generate
```

结果：退出码 0。Scene Schema、Python schemas、Render Runtime、Python Runtime、
构建产物和法律文件均完成同步。

最终源码状态上的完整验证命令：

```bash
PATH="<isolated-python>/bin:$PATH" \
BARON_PYTHON="<isolated-python>/bin/python" \
fnm exec --using=22.12.0 npm run verify
```

结果：退出码 0。根命令输出明确包含：

```text
npm run test:browser
→ npm run test:browser:packages
→ npm run test:rendering
```

主要结果：

- 5 个 workspace typecheck：PASS
- Mock：3/3 PASS
- Unit：134/134 PASS
- 根 browser：7/7 PASS
- Adapter package browser：10/10 PASS
- Web Runtime package browser：10/10 PASS
- Render Runtime package browser：2/2 PASS
- package browser 合计：22/22 PASS
- Rendering：4/4 PASS
- Python：16/16 PASS
- TypeScript/Python cross-language：PASS
- M1 fixture SHA-256：
  `0664f38d9bb122800c054c8468516d8c17d7737b03eebdb1b7b1860ea03dec52`
- Installation：26/26 PASS
- Python wheel、sdist 与 fresh-install smoke：PASS
- production dependency audit：0 个漏洞

此外三个 package browser suites 均使用 Node.js 22.12.0 独立执行过一次，结果分别为
10/10、10/10 和 2/2 PASS；最终根 `verify` 又实际执行了相同三组测试。

## 5. Step 4：版本门

命令：

```bash
fnm exec --using=22.12.0 \
  npm run release:check-version -- --tag v0.1.0
```

最终结果：退出码 0，输出版本为 `0.1.0`。该命令只校验预期 tag，没有创建 Git tag。

## 6. Step 5：构建最终候选

正式 npm 构建脚本的默认输出目录在执行前已存在其他并行工作留下的完整文件。安全检查在
任何写入前停止了默认目标，本轮没有覆盖、删除或复用该目录。

随后使用同一既有正式脚本原生支持的 `--output` 参数，从本轮最终源码状态构建：

```bash
fnm exec --using=22.12.0 \
  npm run release:build-npm -- \
  --output release-candidate-final-artifacts/npm
```

结果：退出码 0，正式脚本报告构建 4 个 npm artifacts。

Python 使用现有构建流程生成：

```bash
python -m build --wheel --sdist \
  --outdir release-candidate-final-artifacts/python \
  python/baron-klinecharts
```

结果：退出码 0，生成一个 wheel 和一个 sdist。早先用于校准流程的中间候选已移出工作区，
不会与最终候选混淆。

## 7. 最终候选清单

| 文件 | 版本 | 大小（bytes） | SHA-256 |
|---|---:|---:|---|
| `npm/baron1996-kline-scene-schema-0.1.0.tgz` | `0.1.0` | 49,214 | `d1d38db24e98ef38eb82dbdcf93c86fc484e4d465267ac16d4ff031b0ce5c9aa` |
| `npm/baron1996-klinecharts-adapter-0.1.0.tgz` | `0.1.0` | 23,491 | `95d92975a0120409e51b5826013f03293a0e88018f6113dd18e6e48aa67c65d0` |
| `npm/baron1996-klinecharts-runtime-0.1.0.tgz` | `0.1.0` | 20,467 | `2979cb8bbe0afdfaa71fbc3710ef5fbeb85b2cb4440a1e6ae7e27b51e02e1ee3` |
| `npm/baron1996-klinecharts-cli-0.1.0.tgz` | `0.1.0` | 4,728,803 | `f4416c4f2b0f556cd1af8ab7ac4d54628fa41cbb0d2ec81d622debe7d24a7049` |
| `python/baron_klinecharts-0.1.0-py3-none-any.whl` | `0.1.0` | 4,742,581 | `87202c5c72be232db23e17ce8ef555d5c84001aa215a738ad3a6129291734f86` |
| `python/baron_klinecharts-0.1.0.tar.gz` | `0.1.0` | 4,729,734 | `8e4c45f92c123d51a94d6ead9981d011029055cd7827b4117eae55fd8e1d7136` |

完整清单位于：

- `release-candidate-final-artifacts/SHA256SUMS`
- `release-candidate-final-artifacts/npm/SHA256SUMS`
- `release-candidate-final-artifacts/npm/npm-artifacts.json`

根清单覆盖四个 npm tarball、npm artifact manifest、wheel 和 sdist，共 7 项；npm 子清单
独立覆盖四个 tarball。两级清单均已逐文件重新计算并校验。

## 8. Step 6：内容、路径、秘密与许可证审计

最终审计结果为 PASS：

- 发布集合恰好包含四个公共 npm 包；
- 发布集合不包含 Render Runtime；
- 六个 distribution artifact 的版本均为 `0.1.0`；
- 四个 npm tarball 的 manifest 均为 public registry 配置；
- 所有 dependency group 均不含 `workspace:`、`file:`、`link:`、Git/URL 或本地绝对依赖；
- npm tarball 不含 `src/`、`test/`、`tests/`、`package-lock.json`、`.git` 或
  `node_modules`；
- 所有制品均不含 `.env`、机器本地绝对路径、凭据/token/私钥特征；
- 所有制品均不含测试运行结果、coverage、Playwright report、截图、视频、trace 或
  recording；
- 四个 npm tarball 均包含 README、LICENSE、NOTICE、第三方许可证、构建后 JavaScript
  和声明文件；
- Python wheel 与 sdist 均包含 LICENSE、NOTICE、第三方许可证、Runtime template 和
  schemas；
- Python sdist 按 source distribution 约定包含测试源码，但不包含任何测试运行结果。

最终完整 `verify` 之后，又使用同一正式 npm 脚本向全新临时目录重新打包；生成的
`npm-artifacts.json` 与 npm `SHA256SUMS` 和最终候选逐字节一致。Python wheel 与 sdist
中的 16 个 `baron_kline` 包文件也分别与最终工作区源码逐字节一致，证明最终候选没有因
验证阶段的 generate/build 变成陈旧制品。

一次性审计器首次执行在比较相对候选路径与绝对工作目录时触发 `ValueError`。复现确认
根因是审计器自身的路径锚点不一致，不是 artifact 断言失败；只修正路径基准后从头执行
完整同一套审计，最终退出码为 0，没有缩减扫描范围。

## 9. Step 7：最终 artifact 干净消费者验证

Node 消费者命令直接指向最终 npm 候选：

```bash
BARON_NPM_RELEASE_CANDIDATE_DIR=release-candidate-final-artifacts/npm \
fnm exec --using=22.12.0 \
  node --test tests/installation/m1-runtime-consumer.test.mjs
```

结果：2/2 PASS。测试没有重新 `npm pack`，而是直接安装最终四个 tarball，并证明：

- 临时 consumer manifest 字节不变且没有 lockfile；
- 四个安装目录均不是 symlink；
- 只通过 package exports 和 CLI 公共 bin；
- 私有源码路径与 Render Runtime 不可导入；
- M1 fixture 校验通过；
- Chromium 完成水平线绘制、stable ID、export、JSON 序列化、destroy 和 recreate；
- recreate 前后水平线数据深相等，anchor 严格为有限数值 `value`。

Python wheel 与 sdist 分别在两个全新的临时虚拟环境中安装。两个环境均断言：

- distribution version 与 `baron_kline.__version__` 均为 `0.1.0`；
- 实际导入路径位于对应虚拟环境，不是仓库源码；
- 已安装包成功生成包含 Scene 的 standalone HTML；
- 已安装包成功生成有效 PNG。

结果：

```text
wheel clean-install import/render smoke PASS
sdist clean-install import/render smoke PASS
```

## 10. Task 边界与剩余门禁

`doc/m1/实施计划.md` 只新增勾选 Task 5 Step 1–7。Task 6、Task 7 及后续步骤全部保持
未勾选。

Task 6 仍需单独授权并重新复核：

- npm/PyPI 目标版本是否仍未被占用；
- GitHub release Environment、审批、组织权限、2FA 和 OIDC/token 配置；
- Git tag、GitHub Release、npm/PyPI publish。

本轮没有执行：

- `git add`
- `git commit`
- `git push`
- `git tag`
- npm/PyPI publish
- GitHub Release
- 部署或远端写入
- registry 写入
- 分支、worktree、子智能体或新会话

最终暂存区为空。当前工作区继续保留 Task 1–5 的未提交改动和最终候选目录。
