# 共享工作树多 Session 协作设计

## 1. 文档目标

本文定义 `baron-klinecharts` 在多个 Codex Session 共享同一工作目录、同一分支时的开发协作机制。目标是让每个 Session 在开始修改前自动获得稳定约束，明确自己可以修改的文件、依赖状态和交接要求，避免覆盖其他 Session 的工作或基于变化中的代码得出错误验证结论。

本文只设计协作治理，不改变产品能力、源码架构、Git 分支或发布流程。

## 2. 已确认环境与问题

当前开发环境具有以下特征：

- 多个 Session 共享同一个工作目录和同一个分支；
- 一个 Session 的文件修改会立即被其他 Session 看见；
- 仓库允许并行开发，但禁止自行创建 worktree 或切分支；
- 未经用户授权不能执行 `git add`、`commit` 或 `push`；
- 当前仓库已有设计文档、实施计划、checkbox 任务和执行报告；
- 当前仓库及其父级目录没有对本仓生效的实体 `AGENTS.md`；
- 普通 Markdown 文件不会自动成为 Codex Session 指令。

因此，单独增加一份“开发说明”不能保证新 Session 主动读取。所有 Session 共写一份进度表也会制造新的并发写入冲突。

## 3. 设计原则

### 3.1 一份稳定规则，多份隔离状态

- 永久协作规则只写在仓库根 `AGENTS.md`；
- 当前活动任务通过固定入口文件定位；
- 全局任务认领与文件边界只由协调 Session 维护；
- 每个开发 Session 只维护自己的交接文件；
- 设计文档和实施计划在开发期间是只读基线。

### 3.2 单文件单写者

任意时刻，一个源码、测试、配置、生成物或协作文档只能有一个明确写入者。共享目录不等于共享文件写权限。

“Session 主要负责某个模块”不构成有效认领。有效认领必须在功能协作台账中列出精确文件或精确目录边界，且不能与其他进行中任务重叠。

### 3.3 依赖满足后才启动

Session 不能根据口头推测或其他 Session 的临时文件判断前置任务已完成。只有协调 Session 把任务状态置为 `ready` 并分配 owner 后，该 Session 才能开始修改。

### 3.4 验证结论分层

- 开发 Session 的验证只签署自己的任务边界；
- 集成验证只在所有相关开发 Session 停止写入后执行；
- 单任务 `complete` 不等于功能整体完成；
- 只有协调 Session 可以宣布阶段或功能完成。

## 4. 文件架构

```text
baron-klinecharts/
  AGENTS.md
  doc/
    开发协作/
      当前任务.md
      共享工作树多Session协作设计.md
    cross-period-drawings/
      同标的跨周期画线设计.md
      同标的跨周期画线实施计划.md
      开发协作台账.md
      协作/
        handoff/
          <assignmentId>.md
        快照/
          <assignmentId>.json
  scripts/
    coordination-snapshot.mjs
```

未来切换功能时，只替换 `当前任务.md` 指向的功能协作台账；根 `AGENTS.md` 不嵌入具体功能任务，也不随每个任务频繁修改。

## 5. 指令与事实优先级

发生冲突时按以下顺序处理：

1. 系统、开发者和用户的当前明确指令；
2. 仓库根 `AGENTS.md`；
3. `doc/开发协作/当前任务.md`；
4. 当前功能的 `开发协作台账.md`；
5. 当前功能的正式设计文档与实施计划；
6. 单个 Session 的交接文件。

协作台账只能分配工作，不能修改正式设计语义。Session 交接文件只能报告事实，不能自行扩大文件边界或宣布依赖已经满足。

## 6. 根 AGENTS.md 契约

根 `AGENTS.md` 是唯一会被新 Codex Session 自动加载的仓库内协作指令载体。新增内容必须是短小、永久且与具体功能无关的规则：

```md
## 共享工作树多 Session 协作

1. 本仓库可能存在多个 Session 共享同一工作目录和分支。开始任何文件修改前，必须先读取 `doc/开发协作/当前任务.md`。
2. 当当前任务状态为 `active` 时，必须继续读取其中指定的设计文档、实施计划和开发协作台账。
3. 当前用户或已获授权的 coordinator 必须在消息中显式提供 `featureId + ledgerGeneration + taskId + owner + assignmentId` 授权元组。Session 不能从台账自行挑选或推断身份；未收到完整元组时保持只读并请求分配。coordinator 的初始身份与写入边界必须由用户明确授权，不能自我授予或扩大；同一 coordinator 仅可按控制任务的 ledgerGeneration 有限续接协议推进全局版本。
4. 只有授权元组与协作台账完全一致、任务状态为 `in_progress`，且 Session 已在自己的 handoff 中确认当前 ledgerGeneration，才允许修改该任务 writePaths；不得修改其他任务的文件。
5. 每次开始一批文件写入前，以及收到 coordinator 的暂停或 ledgerGeneration 更新通知后，必须重新核对当前任务和台账。旧 ledgerGeneration 或旧 assignmentId 的授权立即失效。
6. 当前任务、中心台账和实施计划 checkbox 只能由 coordinator 修改；全局 sharedHotspots 只允许 integrationOwner 在 integration 阶段且位于 integrationPaths 时修改。coordinator 接管只能按用户明确授权的恢复协议执行。
7. 发现目标文件不在 writePaths、已被其他 Session 认领或出现无法归属的现有修改时，必须停止写入并向 coordinator 报告，不能覆盖、回退、顺手合并或扩大范围。
8. 每个开发 Session 只能更新自己的 handoff 和 evidence snapshot；完成局部验证后只能申请进入 review，不能自行标记 complete 或宣布整体完成。
9. 未经用户明确授权不得执行 git add、commit、push；不得为了隔离并行任务创建 worktree 或切换分支。
```

根规则不复制任务清单、Session 名称或具体源码路径，避免规则过期后误导未来开发。

## 7. 当前任务入口契约

固定文件 `doc/开发协作/当前任务.md` 只由协调 Session 修改，结构固定为：

```md
# 当前开发任务

- status: active
- pointerGeneration: 1
- featureId: cross-period-drawings
- coordinatorTaskId: coordination-control
- coordinatorOwner: coordination
- coordinatorAssignmentId: coordination-control-a1
- recoveryCoordinatorOwner: integration-verification
- design: doc/cross-period-drawings/同标的跨周期画线设计.md
- implementationPlan: doc/cross-period-drawings/同标的跨周期画线实施计划.md
- ledger: doc/cross-period-drawings/开发协作台账.md
```

约束：

- `status` 只能是 `active` 或 `closed`；
- 同一时刻只有一个 active 协调任务；
- `pointerGeneration` 每次切换 feature、coordinator、design、implementationPlan 或 ledger 路径时递增；它只表示入口路由版本，不随普通任务状态变化；
- `coordinatorTaskId + coordinatorOwner + coordinatorAssignmentId` 与台账的 `coordination-control` assignment 必须完全一致，并且初始值及后续变更均由用户显式授权；
- coordinator 是正常情况下三个中心文件的唯一写入者；`recoveryCoordinatorOwner` 只在用户明确宣布 coordinator 失联并授权接管后获得一次性写权；
- 路径必须是仓库根相对路径并真实存在；
- 该文件不记录动态任务状态，避免成为高频并发写入热点；
- active 期间的无关修改也必须先进入台账或取得用户明确覆盖指令。

任务关闭时保留路径用于追溯，只把 status 改为 `closed`。下一项协调任务启动时再替换内容并增加 pointerGeneration。

## 8. 功能协作台账契约

`doc/cross-period-drawings/开发协作台账.md` 是当前功能的全局执行事实，只能由 `coordinator` 修改。Session 身份不是角色名本身，而是 coordinator 显式下发且与台账一致的完整授权元组：

```text
featureId + ledgerGeneration + taskId + owner + assignmentId
```

Session 不能从 `owner` 名称推断自己已经获得任务，也不能看到 `ready` 任务后自行认领。若用户或 coordinator 的消息没有明确给出完整元组，该 Session 只能执行只读检查。每次重新分配都必须产生新的 `assignmentId`；旧元组随 ledgerGeneration 或 assignmentId 变化立即失效。

### 8.1 顶部身份

```md
# 同标的跨周期画线开发协作台账

- featureId: cross-period-drawings
- ledgerGeneration: 1
- phase: development
- coordinatorTaskId: coordination-control
- coordinatorOwner: coordination
- coordinatorAssignmentId: coordination-control-a1
- integrationTaskId: integration-verification
- integrationOwner: -
- integrationPaths:
  - `package-lock.json`
```

`phase` 只能是：

- `development`：允许已认领开发 Session 修改各自 writePaths；
- `integration`：所有开发 Session 停止写入，只允许 integrationOwner 修改精确列出的 `integrationPaths`；
- `closed`：不允许继续修改本功能文件。

`integrationPaths` 是 integrationOwner 的完整写入边界，不能用“集成范围”“相关生成物”等开放表述扩大。它通常等于全局 `sharedHotspots`，若还包含其他路径，也必须逐项精确列出并通过 ledgerGeneration 更新协议生效。

`ledgerGeneration` 是所有运行中授权元组的全局版本。phase、coordinator、全局 sharedHotspots、integrationPaths，或已分配任务的 owner、assignmentId、writePaths 发生变化时必须递增；普通的 `ready/review/complete` 状态记录且不改变任何授权边界时不递增。ledgerGeneration 一旦递增，所有开发与集成 Session 的旧元组立即失效，必须执行暂停确认；coordinator 应批量完成初始分配后再统一启动，避免频繁使并行授权失效。`coordination-control` 不因正常 ledgerGeneration 递增丢失控制权，而是只按 8.6 的有限续接协议获得新版本；它不能利用该例外改变自己的身份或范围。

### 8.2 任务表

```md
## 全局 sharedHotspots

- `package-lock.json`
- `packages/klinecharts/package.json`

| taskId | status | owner | assignmentId | dependsOn | writePaths | requestedHotspots | verificationInputs | verificationOutputs | handoff | evidenceSnapshot | verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coordination-control | in_progress | coordination | coordination-control-a1 | - | `doc/开发协作/当前任务.md`<br>`doc/cross-period-drawings/开发协作台账.md`<br>`doc/cross-period-drawings/同标的跨周期画线实施计划.md` | - | - | - | `doc/cross-period-drawings/协作/handoff/coordination-control-a1.md` | - | - |
| schema-projector | ready | - | - | - | `...` | `...` | `...` | `...` | - | - | `...` |
| integration-verification | blocked | - | - | schema-projector, ... | - | - | `...` | `...` | - | - | `...` |

## 已撤销 assignment

| assignmentId | taskId | reason | userAuthorization |
| --- | --- | --- | --- |
```

字段规则：

- 全局 `sharedHotspots` 是 feature 级唯一集合，等于所有任务 requestedHotspots 的并集，再加上实施计划预先识别的公共配置、生成物和 lockfile；同一路径不能在各任务行中分别定义出不同语义；
- `taskId` 在当前 feature 内唯一且不可重命名；
- `owner` 是稳定 Session 角色名，不使用“Session 1”之类位置编号；任务处于 `blocked` 或 `ready` 时为 `-`，执行 `ready → in_progress` 时才绑定具体 owner；
- `assignmentId` 在每次任务分配时生成且全功能唯一，任务返工、恢复或换 owner 时不得复用；
- `dependsOn` 只能引用表中已有 taskId；
- `writePaths` 必须列出精确文件，或职责单一且不会与其他任务重叠的精确目录；`blocked/ready` 任务在尚未完成边界设计时可为 `-`，进入 `in_progress` 前必须补齐；
- `requestedHotspots` 是任务可能需要、但 development 阶段无权修改的文件，且必须是全局 `sharedHotspots` 的子集；
- `verificationInputs` 是验证命令会读取、并且必须纳入验证快照的额外路径；
- `verificationOutputs` 是验证命令被允许修改的精确路径，必须是 writePaths 的子集；无写入时填 `-`；
- `handoff` 必须指向该次 assignment 唯一可写的交接文件；
- `evidenceSnapshot` 必须指向该次 assignment 唯一可写的验证快照；不执行代码验证的 `coordination-control` 可为 `-`；
- `verification` 记录进入 review 前必须运行的命令，不记录预期之外的验证替代方案。

coordinator 可以在 assignment 创建前建立空 handoff、快照目录和通用模板；具体 handoff 与 evidenceSnapshot 路径在 assignmentId 生成时写入台账。任务进入 `in_progress` 后，这两个文件只由 owner 写入，coordinator 只能读取；Session 退出或被替换后，新 assignment 使用新文件，旧文件保持不可变。

`已撤销 assignment` 是只追加审计区。只有用户按 12.3 或 12.4 明确授权失联撤销/接管后，coordinator 或 recoveryCoordinatorOwner 才能记录；被列入后该 assignmentId 永久失效，不得复用或恢复。

### 8.3 文件边界校验

协调 Session 在把任务置为 `in_progress` 前必须确认：

1. writePaths 与所有其他 `in_progress`、`review` 任务没有交集；
2. development 任务的 writePaths 不包含任何全局 sharedHotspots；
3. handoff 路径唯一；
4. 需要验证的任务 evidenceSnapshot 路径唯一；只有不执行代码验证的 coordination-control 可以为 `-`；
5. requestedHotspots 是全局 sharedHotspots 的子集；
6. verificationOutputs 是 writePaths 的子集；
7. integrationPaths 与所有 development writePaths 不重叠，且不包含当前任务、中心台账、实施计划 checkbox、handoff 或 evidenceSnapshot；
8. dependsOn 中的任务全部为 `complete`；
9. 当前工作区中这些路径的已有修改已经明确归属，不存在来源未知的差异。

目录与其子文件视为重叠。例如一个任务拥有 `packages/web-runtime/src/` 时，不能再把其中单个文件分配给另一个任务。

### 8.4 路径规范化与写入判定

所有边界比较都必须先执行相同的确定性规范化：

- 台账路径使用仓库根相对的 POSIX 路径；禁止绝对路径、`~`、环境变量、glob、`.`、`..` 和符号链接；
- 精确文件路径只授权该文件；目录认领必须以 `/` 结尾并授权其所有后代；
- 规范化后路径相同，或任一路径是另一路径的祖先目录，均视为重叠；
- 新文件必须逐项列入 writePaths，或位于明确认领且允许新建文件的目录边界内；
- 移动或重命名必须同时认领来源和目标。由于 `git mv` 会产生 staged 状态，未经用户明确授权不得执行；不能用其他写法绕过该限制；
- formatter、generator、测试或脚本只要可能写入 tracked/untracked 文件，就属于写操作。所有可能输出必须预先属于当前 assignment 的 writePaths 或 integrationPaths；无法确定输出边界时不得运行；
- 生成全局热点或公共生成物的命令只在 integration 阶段由 integrationOwner 执行。

Session 执行任何可能修改文件的命令后，必须立即运行 `git status --short`。若出现边界外新修改，立即停止并报告；不得删除、回退、覆盖或把它补登记为自己的修改。

### 8.5 授权绑定

coordinator 只有完成以下步骤后才能启动一个 assignment：

1. 生成全局唯一的 assignmentId；
2. 在没有活动写入者时，或完成 11.5 暂停确认后，在台账中同时写入 owner、assignmentId、writePaths、handoff 和 evidenceSnapshot；
3. 按规则递增 ledgerGeneration，并把任务从 `ready` 置为 `in_progress`；
4. 通过用户消息或 coordinator 消息向目标 Session 下发完整授权元组；
5. 目标 Session 重新读取当前任务、台账、设计和计划，把授权元组及 acknowledgedGeneration 写入 handoff 后回复确认；
6. 若这次分配使 ledgerGeneration 递增，其他全部活动 Session 也必须取得新元组并确认后才能继续。

缺少任一步，Session 都保持只读。任务换人、返工或恢复时必须更换 assignmentId；旧 Session 即使仍在运行也必须停止写入。

### 8.6 特权角色授权

coordinator 和 integrationOwner 不因角色名而自动获得权限：

- `coordination-control` 是常驻的中心任务。用户必须显式下发它的完整授权元组，且 `当前任务.md`、台账顶部身份和任务行三处必须一致；该 Session 只能写任务行中列出的中心文件。coordinator 不能自行修改自己的 taskId、owner、assignmentId、writePaths 或 recoveryCoordinatorOwner，这些变化必须再次获得用户明确授权；
- `integration-verification` 是普通受控任务。development 阶段保持 `blocked` 且无 owner；进入 integration 前，coordinator 按暂停确认协议为它生成 assignmentId、handoff 和 evidenceSnapshot，将任务置为 `in_progress`，并确保该行 writePaths 与顶部 integrationPaths 完全相等；
- integrationOwner 字段必须等于 `integration-verification` 当前 assignment 的 owner。对应 Session 只有收到完整元组、确认 ledgerGeneration 且 phase 为 `integration` 时，才能写 integrationPaths；
- coordinator 仍可在 integration 阶段写自己的中心 writePaths，但不能写 integrationPaths；integrationOwner 不能写中心文件。

`coordination-control` 的初始授权锚点是用户批准的：

```text
featureId + pointerGeneration + coordinatorTaskId + coordinatorOwner + coordinatorAssignmentId + coordinator writePaths
```

当且仅当这个锚点在更新前后完全不变，coordinator 才能续接新的 ledgerGeneration：

1. 更新前，coordinator 的完整旧元组和 acknowledgedGeneration 必须有效；
2. coordinator 已完成 11.5 的暂停确认，并且拟议变化不包含锚点中的任何字段；
3. coordinator 在一个受限过渡窗口内只修改中心台账，把 ledgerGeneration 递增一次并完成已声明的业务 assignment/phase 变更；
4. 台账写入后，coordinator 只能立即更新自己 handoff 的 acknowledgedGeneration，形成相同锚点下的新完整元组；完成前不得执行其他中心或源码写入；
5. coordinator 核对新元组与三处身份及 writePaths 一致后，才可向其他 Session 下发新元组并继续流程。

这只是用户既有控制授权的版本续接，不允许变更 coordinator 身份、assignmentId、pointerGeneration、writePaths 或 recoveryCoordinatorOwner。任一锚点字段需要变化，必须停止并由用户下发新的 `coordination-control` 完整授权元组。

## 9. Session 交接文件契约

每个开发 Session 只写自己的交接文件。模板固定为：

```md
# Session 交接：schema-projector

## 身份

- taskId: schema-projector
- owner: schema-projector
- assignmentId: schema-projector-a1
- ledgerGeneration: 1
- acknowledgedGeneration: 1
- startHead: <启动时 HEAD SHA>

## 启动快照

- 启动时已存在的相关修改：
- 已确认 writePaths：
- 禁止修改的 sharedHotspots：

## 实际修改

- 文件：
- 行为变化：

## 验证证据

- 命令：
- 退出码：
- 结果：
- verificationSnapshot: `doc/cross-period-drawings/协作/快照/schema-projector-a1.json`
- verificationLeaseId: <coordinator 下发的唯一值>
- preSnapshotHash: <命令前 manifest SHA-256>
- postSnapshotHash: <命令后 manifest SHA-256>

## 遗留与交接

- 未完成项：
- 阻塞项：
- 建议由 integrationOwner 处理的热点修改：
```

约束：

- Session 开始工作前先创建或确认自己的交接文件；
- 交接文件不能把其他 Session 的修改写成自己的结果；
- 验证必须记录真实命令和退出码；
- 交接文件中的授权元组必须与台账完全一致，且 acknowledgedGeneration 必须等于当前 ledgerGeneration；
- owner 不能编辑其他 Session 的交接文件；
- Session 退出、失联或被替换后，旧交接文件保持原样，新 owner 使用新的唯一 handoff 文件。

### 9.1 验证快照

`scripts/coordination-snapshot.mjs` 提供确定性的内容快照与只读复核。它接收台账中该 assignment 的 `writePaths ∪ verificationInputs`，在生成模式把命令前、命令后两个 manifest 写入 owner 专属的 evidenceSnapshot：

- 展开目录后按仓库相对路径排序；
- 纳入 tracked、untracked、新增和删除文件，删除项记录为 `missing`；
- 对每项记录路径、文件类型、mode 和文件字节的 SHA-256；
- 拒绝符号链接、仓库外路径、无法规范化路径和边界外文件；
- 对排序后的完整 manifest 再计算 SHA-256，分别作为 `preSnapshotHash` 和 `postSnapshotHash`；
- 生成过程本身只能写入当前 assignment 的 evidenceSnapshot。

脚本还必须提供 `--verify <evidenceSnapshot>` 模式：只读取现有快照和当前文件，把重算结果输出到标准输出并以退出码表示是否一致，不能改写 owner 的快照或任何仓库文件。

有效验证必须持有 coordinator 下发的 verification lease：

1. coordinator 规范化该任务的 `writePaths ∪ verificationInputs` 作为 verificationScope，暂停所有 writePaths 与它重叠的其他 assignment，并收到确认；
2. owner 记录唯一 verificationLeaseId，在不做其他写入的情况下立即生成 pre manifest；
3. owner 运行台账列出的验证命令。冻结期间只有该命令可以写 verificationOutputs；出现其他路径变化则证据无效；
4. 命令结束后，在不插入其他写操作的情况下立即生成 post manifest，再记录命令、退出码、preSnapshotHash 和 postSnapshotHash；
5. coordinator 收到交接后才释放其他 assignment。只读验证要求 pre/post hash 完全一致；允许写 verificationOutputs 的命令只允许这组路径在两个 manifest 间变化。

coordinator 在 `review → complete` 前立即使用 `--verify` 重算 post manifest 并比对 hash；不一致则证据失效，任务回到 `in_progress` 或因外部冲突进入 `blocked`。verification lease 释放后到标记 complete 之间若 verificationScope 发生任何变化，也视为证据失效，必须重新获取 lease 并运行验证。

integrationOwner 的快照覆盖本功能全部源码 writePaths、全部 verificationInputs 和 integrationPaths。会修改文件的验证命令只有在其全部输出位于当前写入边界、且命令结束后重新生成快照时，才能成为有效证据。

## 10. 任务状态机

任务状态固定为：

```text
blocked ⇄ ready → in_progress ⇄ review → complete
                     ↓          ↓
                     └─→ blocked
```

允许流转：

- `blocked → ready`：全部依赖和外部条件满足；
- `ready → blocked`：依赖、工作区归属或外部条件在分配前失效；
- `ready → in_progress`：coordinator 已完成文件边界校验并分配 owner；
- `in_progress → review`：owner 完成约定修改、局部验证和交接；
- `review → complete`：coordinator 或 integrationOwner 独立检查修改和验证证据通过；
- `review → in_progress`：审查给出明确返工项；可以仍由原 owner 处理，但必须生成新 assignmentId、handoff 和 evidenceSnapshot，旧验证历史不可覆盖；
- `review → blocked`：审查发现需要外部决策、路径冲突或其他 owner 的修改；
- `in_progress → blocked`：发现外部阻塞或文件边界冲突，owner 已停止写入。

只有 coordinator 修改状态。owner 通过自己的交接文件报告“可进入 review”，不能直接改中心台账。任务进入 `review` 后原 owner 的写权限被冻结；只有 coordinator 把任务恢复为 `in_progress` 并完成 ledgerGeneration 确认后才可继续写入。

`coordination-control` 是状态机的保留控制任务：功能 active 期间始终为 `in_progress`，只在整个功能关闭时与台账一起结束；它不参与业务 dependsOn，也不经过 review。

集成失败时按失败边界处理：

- 问题只涉及 integrationPaths：integrationOwner 在 integration 阶段修复并重新验证；
- 问题需要修改 development 源码：integrationOwner 只记录问题并停止，不能顺手修改源码。coordinator 暂停全部 Session，把 phase 切回 `development`、递增 ledgerGeneration，并创建唯一的新任务 `rework-<原taskId>-<序号>`，为它分配精确 writePaths、新 assignmentId、handoff 和快照；原完成任务不重开、不覆盖历史。返工任务 complete 后，再通过暂停确认协议切回 `integration` 并恢复集成。

## 11. 标准协作流程

### 11.1 启动

1. coordinator 确认正式设计已经批准；
2. coordinator 创建实施计划、当前任务入口、功能台账、Session 交接文件和快照目录；
3. coordinator 划分不重叠 writePaths，把公共文件列入 sharedHotspots；
4. coordinator 检查当前 `git status --short`，把既有修改归属到明确任务；
5. coordinator 将依赖已满足的任务置为 ready；
6. 生成 assignmentId，分配 owner 后置为 in_progress，再向对应 Session 下发完整授权元组。

### 11.2 开发 Session 开始工作

1. 读取根 AGENTS.md；
2. 读取当前任务入口，并确认 status、pointerGeneration，再读取台账的 ledgerGeneration；
3. 读取 design、implementationPlan 和 ledger；
4. 确认完整授权元组、task 状态、owner、assignmentId 和 writePaths 全部匹配；
5. 记录 startHead、相关既有修改和禁止触碰的 sharedHotspots；
6. 在 handoff 写入 acknowledgedGeneration 并向 coordinator 确认；
7. 只在 writePaths 内实施和验证，每批写入前重新确认 ledgerGeneration。

### 11.3 交接与审查

1. owner 完成验证后生成 evidenceSnapshot，并更新自己的 handoff，列出实际修改、真实命令、退出码和 snapshotHash；
2. owner 停止写入并通知 coordinator；
3. coordinator 将任务置为 review；
4. reviewer 只读检查 diff、边界和证据，coordinator 重新计算并比对快照；
5. 通过后 coordinator 标记 complete；不通过则按状态机写明返工项并恢复 in_progress 或置为 blocked。

### 11.4 集成

1. 所有前置任务 complete 后，coordinator 先让所有开发 Session 按 11.5 停止写入；
2. coordinator 在一次 ledgerGeneration 更新中把 phase 改为 integration，为 `integration-verification` 生成 owner、assignmentId、handoff 和 evidenceSnapshot，并令该行 writePaths 与 integrationPaths 完全相等；
3. coordinator 向 integrationOwner 下发完整授权元组，收到 acknowledgedGeneration 后才允许开始；
4. integrationOwner 只能修改台账精确列出的 integrationPaths，并按 verification lease 执行跨模块和完整验证；
5. 若验证要求修改 development 源码，按 `rework-<原taskId>-<序号>` 流程退回 development，不由 integrationOwner 越界处理；
6. 未经用户授权仍不能执行 Git 暂存、提交、推送或发布；
7. 通过后 coordinator 才能关闭功能任务。

### 11.5 动态更新与暂停确认

coordinator 不得在受影响 Session 正在写入时直接修改 pointerGeneration、ledgerGeneration、phase、owner、assignmentId 或 writePaths。每次动态更新都执行以下握手：

1. coordinator 发出暂停通知，包含旧 pointerGeneration、旧 ledgerGeneration、受影响 assignmentId 和拟议变化；
2. 每个受影响 Session 停止写入、更新 handoff，并回复 `paused + assignmentId + acknowledgedGeneration`；
3. coordinator 等待全部确认；有 Session 未确认时不得直接更新台账或自行判定失联，必须停止流程并请求用户按 12.3 授权撤销该精确 assignmentId；
4. 全部暂停后，coordinator 按 8.6 的有限续接协议更新台账并递增 ledgerGeneration；若入口路由或其他控制授权锚点字段需要变化，不能有限续接，必须先取得用户的新控制授权；
5. coordinator 完成自身 acknowledgedGeneration 续接后，下发新的完整授权元组；
6. Session 重新读取根规则、当前任务、台账、设计和计划，更新 handoff 的 acknowledgedGeneration，再回复 ready；
7. coordinator 核对确认后恢复对应 `in_progress` 或 integration 工作。

新 ledgerGeneration 会使所有旧授权元组同时失效。本协议既用于首次接入已运行 Session，也用于后续任何动态变更；普通 Markdown 不提供热加载，因此不能省略暂停、重读和确认。

## 12. 冲突与异常处理

### 12.1 发现边界外修改

Session 发现目标文件不属于自己的 writePaths，必须：

1. 不修改该文件；
2. 在自己的 handoff 记录所需修改和原因；
3. 通知 coordinator；
4. 等待 coordinator 调整后重新确认 ledgerGeneration。

不能先修改再补登记。

### 12.2 发现他人同时修改

Session 发现 writePath 在工作期间出现无法归属的新变化，必须立即停止对该文件写入。禁止执行 `git restore`、`git checkout --`、`git reset`、覆盖写入或自行合并。

coordinator 负责识别修改来源。只有在重新划定唯一 owner、更新台账并完成交接后才能继续。

### 12.3 Session 退出或失联

Session 主动退出且已经回复 paused 时，使用普通暂停确认协议恢复。Session 无法回复时，唯一例外流程是：

1. coordinator 暂停其余全部活动 Session，并取得它们的确认；
2. coordinator 向用户报告无法响应的精确 taskId、owner、assignmentId、最后 handoff 和工作区现状；
3. 用户明确确认该 assignment 失联并授权撤销；未经该授权，台账保持原样且所有写入继续暂停；
4. coordinator 执行一次原子台账更新：把旧 assignment 追加到 `已撤销 assignment`，把原任务置为 blocked，清空 owner/assignmentId，并递增 ledgerGeneration。此步骤是对“必须收到全部 paused”的唯一 Session 失联例外；
5. coordinator 保留旧 handoff、evidenceSnapshot 和工作区修改，只读检查现状；
6. 条件满足后将原任务置为 ready，再通过新的 ledgerGeneration、owner、assignmentId、handoff 和 evidenceSnapshot 重新分配；
7. 新 owner 不冒充原 Session 的验证结论，也不通过回退他人文件恢复任务；其余 Session 在取得新授权元组并确认后再恢复。

### 12.4 coordinator 退出或失联

coordinator 不可用时不自动转移中心文件写权。只有用户明确宣布原 coordinator assignment 失联，并向 `当前任务.md` 中的 recoveryCoordinatorOwner 下发新的 `coordination-control` 完整授权元组后，才执行：

1. 所有开发和集成 Session 立即暂停并报告最后 assignmentId；
2. recoveryCoordinator 先以只读方式检查当前任务、台账、handoff、快照和工作区；
3. recoveryCoordinator 把原 coordinator assignment 追加到 `已撤销 assignment`，递增当前任务的 pointerGeneration 和台账的 ledgerGeneration，并让两处 coordinator 身份及 `coordination-control` 任务行与用户下发的新元组一致；
4. 所有未完成任务生成新的 assignmentId 和完整授权元组；旧元组全部失效；
5. 各 Session 重新读取并写入 acknowledgedGeneration，完成暂停确认协议后才恢复工作。

未获得用户明确接管授权时，功能保持 blocked，recoveryCoordinator 也不得修改中心文件。

### 12.5 验证期间源码变化

如果局部或集成验证运行期间，验证范围内文件被其他 Session 修改，本次验证证据立即失效。验证者必须等待写入停止后重新运行完整对应命令，不能沿用先前通过结果。

## 13. 已运行 Session 的一次性接入

根 `AGENTS.md` 对新建或重新初始化的 Codex Session 自动生效，但不承诺对已经运行中的 Session 热加载。首次启用本机制时必须：

1. coordinator 通知所有现有 Session 按 11.5 暂停写入并回复 assignmentId；
2. 记录当前工作区修改，并把每个改动归属到明确 taskId/owner；
3. 按第 16 节的安全顺序创建功能台账、handoff、快照边界、当前任务入口和根 AGENTS.md；
4. 为每个任务生成新的 assignmentId 和完整授权元组；
5. 要求现有 Session 显式重新读取这些文件，或重新启动 Session，并在 handoff 写入 acknowledgedGeneration；
6. coordinator 收到全部 ready 确认后才恢复对应任务；
7. 无法确认已读取规则的 Session 不得继续写入，其任务置为 blocked。

因此，“自动遵守”指新 Session 自动获得根 AGENTS 指令，并被要求读取动态台账；它不表示普通 Markdown 能向运行中的进程主动推送更新，也不提供操作系统级文件锁。

## 14. 验收标准

协作机制完成必须满足：

- 仓库根存在唯一 AGENTS.md，并包含固定的共享工作树协作入口；
- 新 Codex Session 能从 AGENTS.md 定位当前任务和功能台账；
- 当前任务入口的所有路径存在，入口 pointerGeneration 和台账 ledgerGeneration 均符合各自递增规则；
- 同一时刻所有 in_progress/review 任务的 writePaths 两两不重叠；
- sharedHotspots 在 development 阶段没有开发 Session 写入者，integrationOwner 也只能写精确 integrationPaths；
- 每个 in_progress 任务只有一个 owner、唯一 assignmentId、独立 handoff 和独立 evidenceSnapshot；
- coordinator 和 integrationOwner 均有用户或上级 coordinator 下发、可在台账核验的完整授权元组，不能仅凭角色名获得写权；
- owner 不能自行标记 complete；
- 局部验证和集成验证在 verification lease 冻结范围内产生，具有真实命令、退出码、命令前后内容级 SHA-256 快照，并在 complete 前重算 post hash 一致；
- pointerGeneration、ledgerGeneration、phase、owner、assignmentId 或 writePaths 变化均完成暂停、重读和确认；
- coordinator 失联时没有自动抢权，只有用户授权的 recoveryCoordinatorOwner 能按协议接管；
- 普通 Session 失联时没有自动撤销，只有用户针对精确 assignmentId 授权后才能使用暂停确认例外；
- 已运行 Session 完成一次性暂停、归属和重新读取；
- 全流程不依赖 worktree、分支切换或未经授权的 Git 操作。

## 15. 非目标

V1 不实现：

- 操作系统文件锁或后台守护进程；
- 自动抢占任务、自动重分配 owner 或自动合并代码；
- 多个并行 active 功能台账；
- 通过普通 Markdown 向已运行 Session 热推送指令；
- 用 Git commit 充当共享工作树内的实时任务锁；
- 绕过现有设计、验证、Git 或发布授权门禁。

这些能力如果未来确有需要，必须单独设计，不能在本机制中隐式补充。

## 16. 实施顺序

用户复核本文档后，实施计划按以下顺序执行：

1. 创建跨周期画线实施计划、中心协作台账、handoff/快照目录和模板，并按计划实现确定性快照脚本；
2. 新增 `doc/开发协作/当前任务.md`，其引用目标必须已经存在；
3. 最后新增根 AGENTS.md 的永久共享工作树规则，避免自动入口指向尚不存在的文件；
4. 盘点现有脏工作区并完成修改归属；
5. 为每个任务生成 assignmentId 和完整授权元组；
6. 暂停、通知或重新初始化当前 Session，并完成 ledgerGeneration 重读确认；
7. 做认领冲突、边界外写入停止、coordinator 接管和快照失效演练；
8. 通过后再开始跨周期画线并行开发。

任何步骤都不包含 Git 暂存、提交或推送。
