# 0.2.0-rc.2 接口与验证记录

核验日期：2026-10-12。用户提供的安装目录：`E:\deepseek_harness`。
只读检查 `resources/app.asar` 内文件，manifest 版本为 `0.2.0-rc.2`，构建提交为 `04f392c9ddd144fa426da2045178797da6db6c11`。安装文件未修改。

## 正式接口

| 用途 | 安装版本中的接口与来源 |
| --- | --- |
| 插件安装 | `dsh.bundle.patch` 指向 `cordis.patch.yml`，patch 插入包名对应的 Host 行；本版 decoration 模板采用同一结构 |
| 浏览器加载 | `dsh.client.platform=web`、`immediately=true`；`window.__ModuleLoader__.load({id,factory})` 返回命名导出；`dsh-client-modules` |
| 窗口内展示 | layout 的根 `shell.overlay` 列表插槽；`slots.inject` 后 `slots.register` |
| 当前 Agent | `agents.list()`、`roots()`、`isOwnedBy(id, owner)`；`dsh-agent` |
| 生命周期 | `agent/created`、`agent/disposed` 参数 `{agent}`；`agent/status` 参数 `{agent,status}` |
| 会话事实 | `session/event(session,event)`；`turn/end.data={turn,reason}`；`dsh-session`、`dsh-agent-loop` |
| 结束原因 | `completed` 发完成提醒；`error`、`max-tokens`、`blocked` 发问题提醒；`aborted` 且 `reason.kind=user` 发静音停止提醒，其他中止静默 |
| 审批 | 审计事件 `approval/asked.data.id` 和 `approval/decided.data.id`；不拦截或代替批准操作；`dsh-user-approval` |
| 用户提问 | prepend 监听 `user-questions/request(request,next)`，原样返回 `next()` 结果；`dsh-user-questions` |
| 超时提问 | `ASK_TIMED_OUT` 以及 timed `NO_PROVIDER` 后保持提示；`user/message.data.source={kind:'user-question-reply',callId,...}` 清除待处理状态 |
| 待确认恢复 | 可选公开 `sessionProjections.register/stateOf`；自有 `harnessPetApprovals` 只读 fold 和官方 `userQuestions.questions.active`，不新增已废弃的 Session 读历史调用 |
| 同源通信 | `connection.fetch.register({path,methods,requestBody:'buffered',fetch})`；沿用官方连接认证；`dsh-client-connection` |
| 跳转 | `uiWorkspace.openSession(sessionId)`；`dsh-client-ui-workspace` |
| 桌面 CLI | 安装随附 `resources/runtime/cli/bin/dsh.cmd` 允许管理 reserved desktop profile；CLI 文档要求先完全退出桌面端 |

Host 注入 `agents`、`sessions`、`connection`、`workspaceRegistry`；Client 注入 `slots`、`uiWorkspace`、`sessions`。Client manifest 声明 layout 和 workspace 的加载依赖；workspace 本身依赖 sessions。当前会话按官方 workspace 的 `sessions.list.getSnapshot().byId` / `retainedBy.mainView` 读取；Host 官方 `SessionStore.get(id).header.cwd` 提供可信目录。Cordis peer 为 `~4.0.4`；可选 dsh peer 固定 `0.2.0-rc.2`，用于官方兼容性检查。升级 Harness 后需重新核验，不自动授予版本豁免。

## 验证范围

0.8.0 当前 **54 项**自动测试通过。新增项目动作目录解析、无会话拒绝、跨项目能力拒绝、实例/归属变化拒绝、多个端口合并、主视图选择歧义与 A→B→A 选择版本失效，以及真实 Windows 参数解析测试。公开 Host 路由仅允许项目扫描/释放，不再提供旧任意端口检查/结束动作。

Windows `scripts/verify-project-ports.mjs` 验证自有当前项目双端口服务、名称相邻的另一项目、仅在 eval 参数提及项目的服务，以及项目内共享 Node 二进制启动另一项目入口的服务。只识别并结束当前项目入口服务，其他三项仍可访问；重复令牌拒绝。独立审查发现的共享运行时误归属已先复现后修复；PS/Java 不再从应用参数寻找 -File/-jar。扫描不会返回完整命令行，固定 helper 在本机读取入口参数，不读取目标环境变量。

当前范围是会话 cwd，不是所有 Harness 工作区。只覆盖 TCP 监听与可确认的绝对程序/入口路径；相对入口、模块启动、改名运行时及其他无法归属的服务可能不显示。共享运行时必须确认入口属于项目，不能只根据二进制路径归属。正式 Electron 中当前会话切换与服务同步仍需安装验收；本机 OS 验证不等同于桌面集成验收。

自动测试涵盖运行区间并集、空闲停止、跨午夜、休眠和墙钟回拨、重启恢复、参数校验、提醒确认与延后、请求去重、正常/取消/子 Agent 结束、子 Agent 退出保留主会话审批、问答链返回不变、超时后正式回复、文件损坏保护、卸载撤销与持久化。

0.2.0 新增五状态优先级、欢迎 5 分钟边界、前台无操作 10 分钟边界、离开/返回重置、Host 启动时钟与运行统计独立、旧版配置补充默认睡觉阈值及新阈值持久化测试。

0.3.0 新增自定义音频恢复、两类独立保存、无效/过大/超长文件保护、保存失败保留旧音、错误使用完成音、音量、恢复默认和卸载停止播放测试。音频单元测试使用模拟存储与 AudioContext，真实解码及 IndexedDB 另由浏览器验证。

0.4.0 新增健康提醒形态优先级与部分/全部解除后的恢复测试。

0.5.0 新增完成庆祝形态、通知基线与去重、20 秒到期、错误/关闭清除和运行数量增加时退出庆祝测试。轮询间任务替换而运行数量不变时遗留旧形态的问题，已在 0.10.1 修复。

0.6.0 加入失败与手动停止的独立形态，三个结束状态共用 Outcome 控制。当前共 40 项自动测试，新增结束形态优先级、错误/停止替换、历史与到期处理、静音且不消耗音频冷却、Host 多种错误原因分类及内部取消原因静默。正式 `dsh-agent-loop/lib/index.js` 的 `abortedCancelCause` 与结束原因组装确认取消原因写入 `turn/end.reason.reason`；仅 `{kind:'user'}` 识别为主动停止，parent/disposed/hook 不误报。

0.6.1 将设置顶部栏设为 sticky，补偿面板内边距并使用不透明背景。正常视口实测滚动前后 × 的 y=98.67px 不变，scrollTop 从 0 增至 330.67px；390×740 窄屏 y=95.67px 不变、scrollTop=454px。两种布局的关闭按钮均可关闭面板，无水平溢出或顶部内容穿透。现有测试仍为 40 项；不另添加镜像 CSS 的测试。滚动效果见 `docs/preview-sticky-header-v061.png`。

0.7.0 新增右键菜单与独立 Windows TCP 端口检查/结束功能，当前 47 项测试。Host 的同源认证动作仅接收端口或服务器生成的 90 秒单次令牌，不提供任意 PID 结束入口。固定 PowerShell 脚本通过 UTF-16 EncodedCommand 运行，参数使用 JSON 环境变量，不拼接命令、不改变执行策略、不提权、不读取命令行或环境变量。查询当前用户，保护 Host 与祖先、Harness/Codex、系统关键进程及不可确认目标。执行前再次核对 PID、启动时间及端口，并持有 .NET Process 句柄 Kill 同一实例；之后复查端口。

Windows 实测运行 `scripts/verify-windows-ports.mjs`：仅创建自身的临时 Node 服务（端口 59247、PID 54848），识别后结束且端口为空；重复令牌拒绝，脚本自身的监听进程无结束令牌。未结束用户现有服务。此测试验证真实 Windows PowerShell/CIM/.NET 功能，不代表已经在正式 Harness 安装验收。

浏览器预览端口管理使用独立模拟进程：5173 为可结束样例，4320 为受保护宿主样例，不结束电脑真实进程。已验证右键菜单、方向键与 Esc、端口输入焦点、取消确认焦点恢复、Tab 循环、过期令牌反馈、重新检查后成功及端口释放、受保护目标无结束按钮、勿扰切换、收起后右键展开。独立审查指出确认窗口焦点问题，已修复并复核通过。截图见 `docs/preview-context-menu-v070.png`、`docs/preview-port-inspection-v070.png`、`docs/preview-port-confirm-v070.png`。

真实 Cordis 4.0.4 测试验证服务注入、插件加载、事件监听、问答 waterfall 和卸载。VM 测试加载最终客户端 factory，检查 overlay 注册及样式撤销。

浏览器交互预览复用最终客户端和 Host 适配代码，事件由独立模拟器产生。人工操作验证打开面板、并发运行、待确认气泡、正常结束、两小时到期、确认后重置、收起/恢复和拖动。浏览器能解锁 AudioContext；工具无法确认人耳实际听到的音量。

新动画为透明 4 列 × 5 行素材，每状态四帧。预览验证五种形态切换、四帧 CSS 播放、拖动唤醒、后台暂停、减少动画静止与睡觉阈值修改。预览使用模拟前台状态及时间快进，正式 Electron 的焦点/可见性仍待实机确认。

0.4.0 另加入透明 4 列 × 2 行提醒素材：第 0 行为新 P1 等待确认，第 1 行为 P2 喝水休息。其他形态沿用旧素材。浏览器验证两小时到期显示健康形态、等待确认优先、确认处理后回到健康形态、只确认喝水仍显示休息提醒、两项确认后恢复吃 tokens。两种 sheet 的缩放/行定位均与实际 CSS 一致，四帧动画正常。独立审查无阻塞问题。

0.5.0 完成素材为透明 2×2 四帧，含“最强”字样和眨眼。独立浏览器预览触发正常完成，确认使用 200%×200% sheet 及完成帧动画，宠物下方脚注 DOM 数量为 0。插件减少动画时完成形态停在首帧，关闭提醒恢复原状态，错误不会显示庆祝。审查发现系统减少动画选择器优先级不足，已修复媒体查询规则。实际截图保存为 `docs/preview-complete-v5.png`。

0.6.0 新增透明四列两行 endings sheet：第 0 行失败 P1，第 1 行停止 P2。浏览器分别模拟真实 running→idle 结束，确认失败 row=0、停止 row=100%，400%×200% 背景及四帧动画。减少动画时停止形态保持 animation=none、row=100%，关闭提醒恢复当前空闲；脚注继续缺失。审查发现失败 sprite 与面板错误文字共用 hp-error 类，已将文字样式限定为 `.hp-panel .hp-error`，浏览器确认 sprite 无背景底色、padding 或 margin。截图为 `docs/preview-error-v6.png` 和 `docs/preview-cancel-v6.png`。审查复核两项 P2 已解决。官方 Electron 音频仍待实机确认。

0.3.0 预览使用真实一秒 PCM WAV，验证完成音、确认音分别导入，文件名及成功反馈，页面重载后恢复两份副本，两种试听及无效 WAV 拒绝后保留旧音，分别恢复默认只影响对应声音。“宠物状态”区已从面板移除。音频仅由文件选择器读取，IndexedDB 保存本地二进制副本；不会通过 Host 路由上传音频。

官方 main 只读检查确认 UI origin 为固定 `dsh-app://app`，该自定义 scheme 声明 standard、secure。音频持久化不会依赖后台 Host 的随机端口。官方 Electron 中的 IndexedDB 与完整退出/重启恢复仍需实机验收。

本次 0.8.0 未在官方 Electron 窗口内完成验收。尚待实机验证：包安装启用、Host/Client 服务同步、最小化后台音频、官方窗口缩放和音频设备。模拟预览不能作为这些项目已通过的证据。

独立代码审查确认当前未标记 Agent scope 的插件监听器会被 `scopeTarget` 全局接纳；无须添加 global 标记。审查发现的 Host 重启后通知编号与旧关闭状态冲突已修复：新 generation 同时清空旧气泡和已关闭编号。

## 行为边界

- 运行结束代表该主 Agent 当前轮次停止运行，不代表项目验收完成或独立 shell 后台进程退出。
- 所有注册 Agent 的 running 区间参与计时；子 Agent 完成不独立响铃。普通提问由官方服务限制为主 Agent。
- 两种健康提醒按累计 Agent 运行时间触发，并分别确认。未确认的到期提醒保留，不循环响铃。
- 初次连接建立通知基线，不补播历史消息；轮询通常约 1 秒，后台调度可能增加延迟。当前气泡展示一条提醒，多个待确认请求按次处理。
- 无独立桌面窗口、系统通知、遥测、模型调用或自动批准。只在应用自己的窗口内渲染。端口结束操作只在用户确认明确目标后执行。
- 停用时撤销路由、监听、定时器与样式，卸载后保留用户统计。位置保存在该窗口 origin 的 localStorage。

0.8.0 浏览器验证：打开即扫描、取消/Esc、项目切换与返回、确认释放刷新为零服务，以及 390×740 窄窗口无水平溢出、滚动确认时顶部关闭按钮仍可见。模拟释放成功截图为 `docs/preview-project-released-v080.png`，扫描列表为 `docs/preview-project-scan-v080.png`。预览完全使用模拟进程。

0.9.0 新增“打开当前工作区文件夹”。官方 WorkspaceRegistry.list() 的实体 sessionIds/path 核对当前会话目录，无关联注册项时回退 Session.header.cwd。固定 Windows helper 用 ProcessStartInfo.UseShellExecute 打开经过存在性、目录类型和 realpath 检查的目录，通过环境变量传参，不使用目录构造命令。57 项自动测试通过；真实 Windows 已成功执行打开 E:\大肥鱼插件 的调起请求，未在官方 Electron 内完成本次版本验收。预览模拟反馈、工作区切换、收起形态和窄窗口菜单另行验证。
0.9.0 浏览器检查已通过：菜单第一项直接打开模拟当前目录，切换为 other-project 后反馈正确，收起图标同样支持；390×740 无水平溢出。新增入口截图：`docs/preview-open-workspace-v090.png`。

0.10.0 新增端口清理 cleanup 和打开文件夹 folder，两行四列透明素材 assets/pet-tools-v10.png（1774×887 RGBA），生成过程使用内置 imagegen，提示词 assets/PROMPT-v10.md。59 项自动测试通过。新增工具优先级、文件夹调起等待、成功后十秒、失败/切换清除、清理恢复测试；不改变 Host Agent 状态、计时或通知。浏览器确认清理为 row=0、打开文件夹为 row=100%，均为 400%×200% sheet 和 hp-frames 动画；关闭面板恢复空闲，文件夹展示期结束恢复；减少动画的 folder 首帧 row=100%、x=0、animation=none；测试后已恢复原设置和宠物位置。常驻脚注 DOM 仍为零。截图 docs/preview-cleanup-pose-v010.png、docs/preview-folder-pose-v010.png。本次正式 Electron 安装验收仍待进行。

0.10.1 修复运行数量不变时旧结束形态残留、停用后延迟 POST、启用前待确认恢复和 timed NO_PROVIDER 提前清除。新增投影同步故障边界，异常时保留等待并继续计时；完整 66 项测试通过。独立复审核验固定版本真实投影 registry；浏览器连续任务、提醒优先级、睡觉及后台暂停检查通过。详细记录见 docs/runtime-audit-v0101.md；本次正式 Electron 验收待进行。

0.10.2 修复新客户端与旧 Host 混用时的 Windows 误报与文件夹菜单静默禁用。Host 返回版本/API 元数据，工具调用前核验能力，重新加载后恢复自动扫描。68 项测试通过，真实 Windows 打开目录及当前开发项目只读扫描成功；正式 Harness 插件重载尚待用户完成。定位与限制见 docs/runtime-tools-v0102.md。
