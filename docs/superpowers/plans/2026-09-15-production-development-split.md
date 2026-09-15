# 3002 正式运行 / 3003 开发实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保持 `http://192.168.71.10:3002` 为稳定日常入口，让源码开发、构建失败和开发重启不影响已发布版本。

**Architecture:** 工作区继续用于开发，发布到独立目录；每个 release 同时保存 editor 和 diary/shared 的源码快照及独立依赖。3002 由一个 Windows 任务启动的 Node 监督进程管理，3003 按需启动；正式数据保持原位置，开发及候选验证使用副本。

**Tech Stack:** 当前 Next.js 15.5.9、React 19、Node.js、Windows PowerShell / Task Scheduler；第一版使用完整 next build + next start 部署。

**Spec:** `D:/markdown_editor/.local/lavish/runtime-reliability.html` 与本计划；细化展示页 `D:/markdown_editor/.local/lavish/production-development-plan.html`。

**Status (2026-09-15):** 工程实现、冻结构建、Windows 任务安装、旧维护移交和首次上线已完成。3002 正式版运行于 `20260915044815469-c97f59c8-4e226000`；3003 已验证后关闭，按需启动。以下保留原始计划清单；实际完成证据见 `docs/runtime-acceptance-2026-09-15.md`。跨设备、重新登录及多日稳定性仍待实际使用验证，不能视为已通过。

## Global Constraints

- 正式入口 `0.0.0.0:3002`；开发入口 `127.0.0.1:3003`；候选验证入口 `127.0.0.1:3004`，占用时明确失败。
- 第一版接受发布时短暂不可用，不承诺零停机；不引入反向代理、多副本、数据库迁移或容器迁移。
- 独立源码、node_modules 和 .next；禁止在活动 release 中执行 npm install、next dev 或 next build。
- 日常数据写入不需要 build；只有功能代码变化需要发布。代码回滚绝不回滚用户之后新写的数据。
- 旧 `NextDevMaintain` 管理的 diary:3001 保持原用途；移除其中 editor:3002 条目，不能只把条目的端口替换为 3003。
- 不把“dev 永不回收模块”当事实，不承诺生产模式杜绝业务内存泄漏；内存、退出码和 HTTP 状态需要记录。
- 正式服务在当前用户登录后自动运行，不依赖 Codex 或终端窗口；未登录、系统睡眠和关机期间的可用性不在第一版承诺内。
- 发布不运行 npm upgrade。先比对 package-lock 与已装版本；若不一致，显式记录并测试差异，不能声称切换仅改变运行模式。
- 备份、环境文件、日志、数据副本与 release 位于仓库外，不得被现有 AutoCommit 的 git add -A 收进版本库。

## 发现的既有维护逻辑

`D:/github/dev-maintain.ps1` 由 `NextDevMaintain` 每两小时执行：

- 以端口识别进程，工作集超过 1500 MB 就强制停止并执行 npm run dev。
- 端口没在监听时只写日志并 continue，不会恢复。
- 只确认 TCP 已监听，不验证页面/API 是否工作。
- 可能删除开发目录 .next，按项目路径匹配进程的停止范围过宽。
- 日志记录 2026-09-14 19:00：1670 MB 触发重启，新 PID 42564；此前存在多次“没在跑”。这些日志证明恢复覆盖有缺口，但不能证明此前每次退出的原因。

移交必须修改该脚本中的 editor 条目，并验证修改后的 WhatIf 只涉及原 diary 服务。不要执行 Force 或 CleanCache 来验证。

## 目录与版本合同

```text
D:/markdown_editor/                          # 继续在这里改代码；3003
D:/diary/shared/                             # 开发中的共享源码
D:/markdown_editor_runtime/
  releases/<releaseId>/
    editor/                                  # 源码、独立 node_modules、.next
    diary/shared/                            # 同版本源码快照，保持 ../diary/shared 布局
    manifest.json                            # 两仓库提交、Node/Next 版本、lock hash、构建结果
  control/                                   # 稳定控制脚本副本；不依赖开发目录
  config/production.env                       # 私有环境配置
  config/development.env                      # 副本路径、禁用外部写副作用
  config/candidate.env                        # 单独候选数据副本
  dev-data/                                  # 可写测试数据；不会自动回灌正式数据
  candidate-data/                             # 发布验证用数据
  backups/<timestamp>/                       # 切换前的数据备份与清单
  logs/                                      # stdout、stderr、监督事件
  state.json                                 # current、previous、desiredState、phase
```

releaseId 由时间戳与 editor/shared 提交短 hash 构成。快照仅来自选定的已提交内容；有未提交源码时停止发布并报告，不自动遗漏，也不自动提交用户修改。共享目录复制时保持目录布局，检查其依赖只落在已快照范围。

state.json 使用同目录临时文件加 rename 更新；只通过单一控制进程修改。发布、停止和回滚通过本地命名管道向监督器提交命令，拒绝并发发布；命名管道访问限当前用户。代码路径不得来自外部 HTTP 参数。

## 文件职责

- `package.json`：dev / dev:unbounded 改到 3003；start 显式 3002；增加本地发布与状态命令。
- `next.config.ts`：纠正内存注释；保留共享目录编译支持；完整独立 release 无需单独改 distDir。
- `lib/serverPaths.ts`：唯一的数据路径解析入口，兼容已有环境变量，显式开发隔离。
- `app/api/health/route.ts`：轻量动态探针，返回 releaseId、mode、uptimeSeconds；no-store，不返回密钥、个人记录或系统路径。
- `scripts/runtime/config.mjs`：环境文件、目录校验、实例模式及 Node 路径检查。
- `scripts/runtime/control.mjs`：dev / deploy / rollback / status / stop 命令入口。
- `scripts/runtime/release.mjs`：源码快照、npm ci、测试、构建、manifest、候选验证。
- `scripts/runtime/supervisor.mjs`：持有子进程、健康探测、退避恢复、部署切换和状态写入。
- `scripts/runtime/install-task.ps1`：安装当前用户任务并设置长期运行属性，拷贝经过验证的控制脚本到 runtime/control。
- `scripts/runtime/backup.mjs`：备份路径清单、验证复制结果与恢复演练；不删除原数据。
- `scripts/runtime/smoke.mjs`：针对副本执行功能验证；正式环境只做已确认无副作用的检查。
- `tests/runtime-paths.test.cjs`、`tests/runtime-supervisor.test.mjs`、`tests/runtime-release.test.mjs`：路径隔离、重启状态机、发布/回滚失败情形。
- `docs/runtime.md`：三个端口、命令、日志位置、故障处理、数据与版本区别。
- 外部修改：`D:/github/dev-maintain.ps1` 仅移除 editor 条目并纠正相关不实注释。

## Task 1: 数据隔离与可识别实例

**Interfaces:** `resolveServerPaths(env, cwd)` 返回绝对路径对象；profile 为 development / candidate / production。production 兼容旧路径；development/candidate 缺少私有 profile 时拒绝启动，不能回退到正式目录。

- [ ] 建立路径合同测试：从任意 cwd 启动时正式路径相同；开发/候选所有写入路径位于各自数据副本范围；显式指向正式路径时启动失败。
- [ ] 实现 serverPaths 并替换所有对应硬编码路径和重复推导。保留已有 DIARY_DATA_PATH、TRAINING_LOG_PATH、INTERVIEW_LOG_PATH、INTERVIEW_RECORDINGS_PATH 等覆盖入口。
- [ ] 标签新增 LABELS_CONFIG_PATH，正式默认仍指向 `D:/markdown_editor/config/labels.json`；录音正式仍指向 `D:/markdown_editor/.local/interview-recordings`。先消除 cwd 依赖，不移动原数据。
- [ ] Steam 导出/图片、归档、share-tokens、训练/面试 plan、inventory/mastery、题库和解题仓库路径全部纳入配置；审计 `D:/diary/shared` 及子进程调用的间接路径。
- [ ] 显式覆盖 LEETCODE_REPO 为副本。开发版默认禁用对外发布、远程写操作与有副作用的同步，给出明确提示；用户数据副本不自动同步回正式目录。
- [ ] 为副本初始化使用单独命令，已有副本不默认覆盖。归档 GET 可能触发 JSON 到 Markdown 迁移，不能把所有 GET 都当只读。
- [ ] 添加 health 动态路由和客户端可识别的开发标记；健康信息中的版本来自 manifest/环境，禁止读源码目录推断当前正式版本。
- [ ] 在测试副本验证保存、刷新、重启、录音读取、标签修改和归档迁移；正式数据文件哈希保持不变。

## Task 2: 可重复候选构建

**Interfaces:** `prepareRelease({releaseId, editorRef, sharedRef}) -> {releaseDir, manifest}`；失败不触碰 state.current 或 3002。`verifyCandidate({releaseDir, profilePath, port:3004})` 返回明确结果与日志路径。

- [ ] 测试 release 路径限制、已有 release 拒绝覆盖、未提交代码拒绝发布、构建失败不更改 current。
- [ ] 快照 editor 和共享源码到指定相邻目录；排除 .git、.next、node_modules、环境文件、个人数据和所有 .local。release 根保持一致且不晚于构建后再移动，避免编译产物中的路径不一致。
- [ ] 在 release/editor 安装独立依赖，核对锁文件与 Next 实际版本，记录 Node 版本。控制构建并发，一次只构建一个候选。
- [ ] 用候选 profile 在 release/editor 运行现有 test:interview 与新增 runtime 测试，之后执行 npm run build；build 不读取正式写路径。不跳过类型错误来换取上线。
- [ ] 使用下列底层命令在 3004 启动候选。此命令由脚本设置完整 profile 与 cwd 后调用，不能直接在开发目录执行代替发布流程。

```powershell
node node_modules/next/dist/bin/next start -p 3004 -H 127.0.0.1
```

- [ ] 检查 health 的 releaseId、首页与静态资源；在副本上覆盖日记、面试、训练、录音、标签、Steam、归档、发布令牌本地生成；对外发布使用模拟目标，不产生真实外部副作用。
- [ ] 候选验证通过写 manifest verified=true，关闭候选；失败保留诊断并退出，不占用或停止 3002。

## Task 3: Windows 托管和恢复

**Interfaces:** 监督器控制 release 的 Next 进程树；控制请求为 status / stop / deploy(releaseId) / rollback。state desiredState 为 running 或 stopped，phase 为 idle / switching / recovering / failed。

- [ ] 用可退出、可卡住、可返回错误的本地 HTTP 测试进程验证监督行为，而不是直接杀正在使用的 3002。
- [ ] 启动进程前验证 manifest、目录、Node 和端口所有者。通过 PID + 创建时间 + 所属 release 匹配身份，不按端口任意杀进程，不使用字符串匹配杀所有 Node。
- [ ] 每 30 秒探测 health，单次超时 5 秒，启动宽限 120 秒；连续 3 次失败进入恢复。进程退出则直接记录退出码并进入退避。
- [ ] 重试等待 5、15、30、60 秒，上限 5 次/10 分钟；超过后进入 failed 状态并每 5 分钟限频尝试一次。stop 请求置 desiredState=stopped，后续探测不得拉起。恢复成功要连续健康 5 分钟后才清除连续失败计数。
- [ ] 记录时间、原因、PID/创建时间、releaseId、响应延迟和退出码；系统内存指标用工作集/私有字节标注口径。先观察基线，不复用“1500 MB 就杀”作为正式版策略。
- [ ] 日志按日切分，设置单文件 20 MiB 与保留 14 天上限；保留最近失败摘要在 status，不把成功探针逐条刷满日志。
- [ ] 安装任务 `MarkdownEditor Production`，在当前用户登录时启动，附带每分钟重复触发以恢复监督器；MultipleInstances=IgnoreNew，长期执行不设置默认时限，允许错过触发后补跑。任务同步运行监督器，不能启动一个脱离的子进程后立即报告完成。
- [ ] PowerShell 启动包装器使用隐藏窗口；任务使用当前用户登录令牌，不收集密码、不承诺未登录时运行。独立于 Codex 生命周期。
- [ ] Windows 停止语义需要实测，不能把 POSIX SIGTERM 的优雅退出语义套用过来。部署切换前等待用户保存/上传完成；验证停止不会留下孤儿进程或锁端口。意外崩溃的写入安全需通过临时文件+rename及故障测试验证关键写路径，未通过不得宣称无数据丢失。

## Task 4: 旧维护移交、首次切换与回滚

**Interfaces:** `deploy(releaseId)` 只接受 verified 候选；current/previous 只在新服务 3002 的 health 返回期望 releaseId 后提交。失败恢复 oldCurrent。

- [ ] 验证切换事务：候选失败不触碰旧服务；新进程起不来可恢复旧版本；控制进程中途退出后能从 phase 恢复；不存在两个 3002 管理者。
- [ ] 备份正式数据及配置，排除运行中写入导致不一致的窗口：切换前等待保存完成，在短暂停写窗口完成最终备份。包含所有实际数据源与录音，不只备份 git 跟踪文件；做一次副本恢复核验。
- [ ] 修改 `D:/github/dev-maintain.ps1` 移除 editor 项；用 WhatIf 确认不再管理 3002，保留 diary:3001 行为，排除旧任务正在运行的交接竞态。不要把 3003 纳入旧脚本的路径匹配停止逻辑。
- [ ] 候选已通过后进入发布窗口：保存当前受控版本状态，停止已识别的旧 editor 进程树，启动新版本到 3002；实际停机时间测量后报告，不提前承诺秒数。
- [ ] 首次迁移尚无上一份生产 release：记录当前 dev 的启动配置和工作目录，以便生产启动失败时恢复原 dev 作为迁移回退。完成首次成功发布后才有正式版本间回滚。
- [ ] 在 3002 验证 releaseId、mode=production、静态资源和无副作用接口；实际从另一台局域网设备验证。不要用本机 curl 冒充跨设备实测。
- [ ] 失败恢复之前服务并保留完整日志；成功后提交 state.current、state.previous。回滚只切代码与配套配置，绝不覆盖最新数据。
- [ ] 保留 current、previous 和最近三个成功版本；不自动清理活动版本。下一次数据格式不兼容时，需要独立迁移方案，不能盲目代码回滚。

## Task 5: 日常入口与验收

拟议的使用命令（脚本实施后才可运行）：

```powershell
npm run dev
npm run deploy
npm run service:status
npm run rollback
npm run service:stop
```

对应职责：dev 加载开发副本并启动 3003；deploy 快照/测试/构建/候选验证/切换；status 读取稳定监督器而非扫描任意端口；rollback 恢复 previous；stop 写入停止意图。

- [ ] package.json 的 start 显式 `next start -p 3002 -H 0.0.0.0`；dev 与 dev:unbounded 都经 profile 入口启动在 3003，防止另一个入口绕过数据隔离。
- [ ] 文档说明：日记内容立即保存，源码修改先只影响开发版；只在功能验证完成后发布，git 自动提交不等于发布。
- [ ] 验收：改开发组件、重启 3003、故意让候选 build 失败均不影响旧 3002；发布后版本正确，回滚后版本正确且数据仍在。
- [ ] 验收：关闭终端/Codex 后继续可用，重新登录后自动启动；测试监督器意外退出的恢复；主动 stop 不被任务触发反复拉起应用。
- [ ] 连续观测至少 48–72 小时作为初验，继续覆盖原先“数天后”故障周期；记录可用率、重启次数、响应延迟与内存基线。未执行期间不得宣称长期稳定已验证。

## Sources

- 本机 `D:/github/dev-maintain.ps1`、`dev-maintain.log`、计划任务配置、项目源代码。
- [Next.js 15 CLI](https://nextjs.org/docs/15/app/api-reference/cli/next)
- [Next.js 15 自托管](https://nextjs.org/docs/15/app/guides/self-hosting)
- [Windows 任务执行时限、恢复与重复实例设置](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset?view=windowsserver2025-ps)
