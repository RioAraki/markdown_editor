# 日常运行与发布

- 正式版：`http://192.168.71.10:3002`，构建产物运行在 `D:/markdown_editor_runtime/releases/<版本>/editor`。这是完整 Next 生产运行时，支持所有动态 API，不是静态导出。
- 开发版：`http://127.0.0.1:3003`，从 `D:/markdown_editor` 启动，使用数据副本，右下角有环境提示。
- 候选版：发布程序短暂使用本机 3004，验证结束后关闭。

## 常用命令

在 `D:/markdown_editor` 执行：

```powershell
npm run dev
npm run service:status
npm run deploy
npm run rollback
npm run service:stop
npm run service:start
npm run data:backup
```

`dev` 和保留的 `dev:unbounded` 别名都加载开发 profile、限制开发堆并使用 3003。旧别名不再提供绕过隔离的入口。

`deploy` 要求 editor 源码已提交，`D:/diary/shared` 子树无未提交修改。日记的数据变化不妨碍 shared 导出。命令不会自动提交、自动升级依赖或推送到远程；现有 AutoCommit 的提交也不等于发布。

发布程序固定两个仓库的提交，在全新 release 安装锁定依赖，运行测试与生产构建，再用 3004 做副本读写检查。失败不会替换 3002 的旧版。候选通过后由监督器排空请求、停止旧实例、备份数据，再切换并检查期望版本。第一版切换有短暂停机。

发布前应让正在编辑的内容完成自动保存、录音完成上传。意外强制终止不能保证尚未提交的编辑或正在传输的录音已保存；关键落盘写入采用临时文件替换，以保留上一次完整文件。

`rollback` 切回 previous，保留全部最新个人数据。首次发布没有 previous，命令会明确报错。遇到不兼容的数据格式变化时，需要另外设计迁移，不能用普通代码回滚解决。

## 数据与配置

`D:/markdown_editor_runtime/config/*.env` 为私有 JSON 格式环境映射（加载器也支持 dotenv），不会进入 git。profile 在服务端加载，不放入浏览器代码。

- `production.env` 明确指向既有真实数据：`D:/diary/data` 等；录音和标签依然在原 editor 的 `.local/interview-recordings` 与 `config/labels.json`。
- `development.env` 指向 `dev-data`；`candidate.env` 指向 `candidate-data`。副本包括面试配置/题库等同级文件，不能只复制 log 子目录。
- 开发数据不会自动回灌到正式数据。开发/候选的分享按钮只生成副本里的本地令牌，不会发布真实站点；有副作用的仓库同步受 profile 限制。
- `npm run data:init-dev` 只负责首次创建副本，已有副本会拒绝覆盖。要刷新时先停 3003，并将旧副本与旧 profile 另行备份后再初始化。
- `backups/<时间>/manifest.json` 记录源路径、缺失项、文件大小和 SHA-256。不要把仅有 git 的代码副本当成个人数据完整备份。

切换备份期间，本服务已排空请求并停止写入；备份结束会重新核对源文件以发现同时发生的外部修改。它不是跨应用的磁盘快照：其他编辑器若继续写同一批文件，不保证所有应用处于同一个时间点。切换前让其他编辑器完成保存即可；代码部署和回滚本身都不会覆盖这些实时数据。

运行目录初次创建时已限制为当前用户、SYSTEM 和管理员访问。监督器/host 的令牌文件另有限制。不要共享这些配置或令牌。

## 托管与故障排查

Windows 任务 `MarkdownEditor Production` 在当前用户登录时启动；每分钟重复触发补起退出的监督器，运行中忽略重复实例，不设置运行三天后终止的执行时限。任务保持同步运行，关闭 Codex 和普通终端不会主动停止服务。未登录、休眠和关机时不保证可用。

`control/` 是经过验证的稳定控制代码副本。主服务使用 Next `dev:false` 的 Node host，并通过认证的本机控制端点排空请求、关闭应用；监督器不依赖开发目录代码。监督器程序本身的升级需要受控停止并更新 control，普通功能发布不会随意覆盖正在运行的管理程序。

健康检查每 30 秒执行，5 秒超时，启动宽限 120 秒；连续 3 次失败或进程退出触发恢复。重试退避并限频，避免不断重启。主动 `service:stop` 持久化停止意图，计划任务不会反复把应用拉起。

状态命令展示实际进程、版本、最近健康时间和错误；先查它，再看 `logs/`。日志按日和 20 MiB 分段，保留 14 天。内存标注为 Node RSS，不等于 V8 堆或 Windows 私有字节。一次 HTTP 200 不代表已通过多天稳定性观察。

若发布程序意外退出留下 `deploy.lock`，先检查里面的 PID 和开始时间并确认没有发布在运行，再移走该文件，不能直接覆盖。

旧 `NextDevMaintain` 的 editor:3002 条目已在首次迁移时移交；保留 diary:3001 的原维护行为。不要重新让旧脚本管理 3002 或 3003。

## 验证命令

```powershell
npm run test:interview
npm run test:runtime
curl.exe --noproxy "*" http://192.168.71.10:3002/api/health
```

运行测试使用临时目录。不要为了测试接口绕过 profile 或指向正式数据。长期稳定性需结合后续日志、内存趋势与真实使用观察。
