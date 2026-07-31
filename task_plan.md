# 任务计划：DragDrop 极简 Obsidian 插件

## 目标
实现名为 `dragdrop` 的 Obsidian 插件：删除 CardNote 的搜索、Excalidraw 和窗口管理功能，保留并重构 Markdown→Canvas 拖拽；阶段 6 进一步实现 Markdown→Markdown 直通拖拽和 Canvas 归纳为原子笔记按钮。鼠标链路支持桌面端与弹出窗口，触控链路优先支持 Surface 并为 iPad 提供能力守卫下的实验兼容。

## 当前阶段
阶段 6：精简 + Markdown→Markdown + Canvas 归纳按钮

## 各阶段

### 阶段 1：需求与发现
- [x] 对比用户修改版 CardNote 1.1.0 与官方 1.1.0
- [x] 对比 CardNote 1.1.0 至 1.7.0 的功能演进
- [x] 确定删除范围、默认拖放语义和可配置项
- [x] 研究 Outliner.md 的手柄、内容范围与跨编辑器拖放思路
- [x] 将发现记录到 findings.md
- **状态：** complete

### 阶段 2：规划与结构
- [x] 创建无 Svelte、无 Excalidraw 的 Obsidian 插件结构
- [x] 定义设置、动作绑定、拖拽 payload 和 Canvas 私有类型边界
- [x] 定义语法感知的段落/列表/标题/特殊块切分模型
- [x] 记录关键实现决策
- **状态：** complete

### 阶段 3：实现
- [x] 实现 Outliner 风格悬浮拖拽手柄
- [x] 实现普通与多选内容切分、block ID 规划和最小源文件修改
- [x] 实现默认引用原块与 Primary 创建笔记
- [x] 实现纵向多节点、固定宽度和高度自适应
- [x] 实现文件目录策略、冲突重命名、跳过与取消剩余
- [x] 实现主窗口/弹出窗口跨窗口拖放
- [x] 实现设置页和未来 Markdown→Markdown 动作映射结构
- **状态：** complete

### 阶段 4：测试与验证
- [x] 安装依赖并完成 TypeScript 类型检查与生产构建
- [x] 清除 Obsidian ESLint 的全部 errors 与 warnings
- [x] 验证内容切分、动作解析、文件命名和冲突队列
- [x] 检查生成的 manifest、main.js、styles.css
- [ ] 完成 Obsidian 指针拖放、列表、多节点与双向弹出窗口实机验收（Windows 自动化无法触发 Electron 原生 HTML5 dragstart，等待一次实体拖放输入）
- [ ] 修复发现的问题并记录测试结果
- **状态：** in_progress

### 阶段 4.5：触控拖放与移动端兼容
- [x] 新增可测试的 Pointer drag 状态机：仅处理 `touch` / `pen`，鼠标继续走原生 HTML5 drag；手柄内移动超过 8px 才启动，轻触保持选块行为，`pointercancel` / `lostpointercapture` 完整清理
- [x] 将拖放会话拆为输入无关的 `start → move → resolve target → commit/cancel` 核心；原生 DragEvent 与 PointerEvent 只做适配，不复制 block 规划、文件创建或 Canvas 节点逻辑
- [x] 将 Canvas 命中重构为 `ownerDocument + clientX/clientY + optional composedPath`，同一接口服务鼠标和触控；Pointer capture 下使用 `elementFromPoint`，不依赖事件 target
- [x] 为触控增加独立动作设置 `Touch drop action`，默认 `Link source`，可选 `Create note` / `Do nothing`；Surface 外接键盘的修饰键仍可在 pointerup 时覆盖该默认值
- [x] 粗指针环境下让 grip 始终可见并提供至少 44×44px 命中区，设置 `touch-action: none` 仅作用于 grip；编辑器其他区域保持原生滚动、选择与缩放
- [x] 复用现有 Markdown ghost，并在手指/笔尖旁偏移显示；进入可写 Canvas 时显示明确有效状态，离开 Canvas 或取消时不修改源文件
- [x] 完成移动端静态审计：无 Node/Electron 运行时依赖、无 regex lookbehind、所有 window/document 来自 owner realm；已将 `manifest.isDesktopOnly` 改为 `false`
- [x] 为 iPad 私有 Canvas API 增加运行时能力守卫；缺少 `posFromEvt` / 节点创建 / 保存能力时给出 Notice 并安全取消，不允许半写源 block ID
- [x] 添加聚焦测试：阈值、轻触、错误 pointerId、触控动作设置迁移；无效 target、取消和 `none` 动作在共享提交路径中均先于 block ID 写入退出
- [ ] Surface 实机验收：手指与 Surface Pen、Source/Live Preview、段落/列表/Callout、多卡片、取消、Canvas 只读、编辑器滚动不回归；鼠标与跨弹出窗口回归必须同时通过
- [ ] iPad 标记为 `experimental / unverified`：完成静态与能力守卫验证，但没有真机前不勾选 iPad 实机验收；README 明确限制触控拖放只支持同一窗口，不承诺跨窗口触控
- [x] 依次运行 `npm.cmd run lint`、`typecheck`、`test`、沙箱外 `build`，刷新标准插件目录和 `../plugin`，三方核对 SHA-256
- **状态：** in_progress

### 阶段 6：精简 + Markdown→Markdown + Canvas 归纳按钮（2026-07-29）
- [x] 完成前置确认：lint、typecheck、test 全部通过，并确认 2026-07-15 实体鼠标 `dragstart` 缺陷已有修复记录
- [x] 记录并同步“正式进入 Markdown→Markdown 阶段”的约定变更
- [x] 删除无行为读取的自动连线配置、类型和 `DragSession.sourceCanvasNode`；审计并清理无调用方的 Canvas edge 预留
- [x] 将 Markdown 动作收敛为 `inherit | embed-source | move | none`，反转默认动作并实现动作解析
- [x] 实现编辑器落点识别、块边界对齐、同文件偏移安全的 Markdown→Markdown 嵌入/搬移
- [x] 实现已有 block ID 确认、只读源拒绝和多块整体事务约束；不按文件夹路径限制 Markdown 搬移
- [x] 补 Markdown→Markdown 单元测试并通过 lint、typecheck、test、build
- [x] 修复已有 `![[...#^blockid]]` 块的原文复制、锁存 Ctrl/Command 搬移动作，并为 Markdown 落点增加 Outliner 风格分界线
- [x] 修复 Markdown 落点分界线被外层标题/列表范围遮蔽的问题，让每个可插入 block 边界都能命中
- [x] 修复 Markdown→Canvas 对已有 `![[...#^blockid]]` 块的引用解析：不追加新 ID，Canvas 节点直接指向嵌入目标
- [x] 修复 Live Preview Callout 抓手不可见：为 Callout 使用 CodeMirror gutter marker，复用原有拖拽事件
- [x] 修复 Callout 首行已有 block ID 在 Canvas 规划中被忽略的问题，并防止无关旧选区覆盖抓手对应的完整块
- [x] 重新构建并部署最新 `main.js` 与 `styles.css` 到实际插件目录和 `plugins-dev/plugin`
- [ ] 完成 Markdown→Markdown 的 Obsidian 实机复测：多嵌入、任意目录 Ctrl 搬移和落点分界线
- [ ] 完成 Live Preview Callout 抓手的 Obsidian 实机复测：未选中时可见、可拖动，Source mode 不回归
- [x] 评估 Advanced Canvas 工具栏扩展点；确认无公开挂点并实现可卸载的 MutationObserver
- [x] 增加 Canvas 浮动工具栏“归纳为原子笔记”按钮、命令面板兜底、选区排序和新节点创建
- [x] 补 Canvas 归纳测试、更新 README，并准备 Obsidian 实机验证步骤
- [x] 将设置页修饰键 UI 改为“按动作选择修饰键”，保留旧 `canvasBindings` / `markdownBindings` 存储并自动处理组合冲突
- [x] 增加 Surface Pen 侧键拖拽开关，使用 `pen + buttons&2` 进入 Markdown 与 Canvas 的 Pointer capture 拖拽链路；Canvas 同时桥接左键 Pointer/Mouse 事件并抑制原始右键事件
- [x] 修复 Surface Pen Canvas 事件桥：补齐合成事件 `view`、Window 捕获和卡片/空白 Canvas 目标路由
- [x] 增加 `Larger touch handles` 设置开关，默认保留 44×44 触控抓手并支持运行时切换
- [x] 增加 Canvas 浮动工具栏原子笔记按钮的设置开关，默认显示并支持运行时切换
- [ ] 完成设置页与 Surface Pen 侧键的 Obsidian 实机验证
- **状态：** in_progress

### 阶段 5：交付
- [x] 更新 README 或使用说明
- [ ] 检查规划文件、源码和构建产物完整性
- [ ] 向用户说明默认行为、设置项和已知限制
- **状态：** pending

## 关键问题
1. Canvas 私有 API 在当前 Obsidian 版本中的类型与运行时行为需通过构建和实际加载验证。
2. 原生列表块引用是否携带子树需在 Obsidian 中验证；设置将保留原生/仅父项两种策略。
3. CardNote 式自动连线在普通 Markdown 来源下通常没有源 Canvas 节点，因此应安全跳过并为未来来源扩展保留接口。
4. Pointer capture 会让 pointermove/up 的 target 始终指向源 grip；触控 Canvas 命中必须依赖当前文档的 `elementFromPoint` 与几何范围，不能复用 DragEvent target 判定。
5. iPad 无真机可验证，且 Canvas 为私有 API；只能先做到可加载、静态移动端兼容与运行时安全守卫，最终兼容性必须保留为未验证状态。

## 已做决策
| 决策 | 理由 |
|------|------|
| 第一阶段只实现 Markdown→Canvas，阶段 6 再进入 Markdown→Markdown | 遵循“先减后增”；本阶段由用户明确批准进入主干直通工作流 |
| 仅支持 Obsidian Canvas，不支持 Excalidraw | 用户明确要求 |
| 鼠标链路完整支持桌面端与跨弹出窗口；移动端以同窗口 Pointer 拖放实验兼容 | 保留既有桌面工作流，同时响应 Surface/iPad 触控需求与平台窗口边界 |
| 触控采用 Pointer Events 自定义路径，鼠标继续使用原生 HTML5 drag | Surface/iPad WebView 不可靠地产生 `dragstart/DataTransfer`，同时避免回归已通过的鼠标跨窗口链路 |
| 触控在专用 grip 内以 8px 移动阈值启动，不要求长按 | grip 已明确表达拖动意图；阈值可区分轻触，并避免 iOS 长按菜单与额外延迟 |
| 触控默认动作独立可配，默认引用原块 | 纯触控没有 Ctrl/Command；仍需可访问 `Create note`，同时保持当前无修饰键默认语义 |
| Surface 作为本阶段触控验收设备，iPad 仅做实验兼容并明确未实测 | 用户当前可提供 Surface，手边没有 iPad；不虚报移动端验证结果 |
| 触控只承诺同一窗口拖放，鼠标继续支持弹出窗口间拖放 | 浏览器/系统的 Pointer capture 不能可靠跨原生窗口边界 |
| 默认无修饰键引用原块，Primary 创建新笔记 | 用户指定的核心快捷行为 |
| 新笔记首行留空，第二行只有源块嵌入 | 保持源文件为唯一内容来源 |
| 源文件只允许补充缺失 block ID | 禁止替换、剪切或插入新笔记链接 |
| 多卡片按源顺序纵向排列 | 用户指定 |
| 普通弹窗删除，仅冲突/可选标题命名时出现 | 降低拖拽摩擦 |
| 修饰键以 drop 时状态解析，并按平台映射 Primary | 支持拖动中改变意图及 macOS |
| 采用 Outliner 风格 grip 手柄和悬浮显示 | 用户指定参考方案 |
| 不自动迁移全库旧链接 | 内容不搬移，无迁移需求 |
| 顶层空行是普通内容的唯一常规卡片边界；同一 Markdown 逻辑块内的无空行连续内容保持为一个 block | 与段落分隔直觉一致，并正确覆盖 Callout/引用 lazy continuation |
| 标题、列表、围栏代码、数学块、表格等显式结构保留 Markdown 语法边界；结构内部空行不切分 | 避免生成 Obsidian 无法用单一 subpath 正确引用的混合卡片；显式列表拆项设置继续生效 |
| 拖动预览的 Callout 必须等 MarkdownRenderer 完成并使用与旧 CardNote 等价的预览容器语义 | 防止异步初始空容器在 drag 阶段只显示为窄条 |
| 最终发布文件复制到相对路径 `../plugin` | 用户希望在当前 Obsidian 库中直接加载测试；源码仍只在规范 dragdrop 目录维护 |
| Markdown→Markdown 无修饰键默认 `embed-source`，Primary 默认 `move` | 默认动作优先非破坏性；搬移仅作为明确修饰键动作，不按源/目标文件夹限制 |
| `link-source` 从 Markdown 动作中删除 | 本工作流只需要嵌入和搬移，纯链接没有独立位置 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| PowerShell 执行 `npm.ps1` 被执行策略阻止 | 1 | 后续统一使用 `npm.cmd` |
| 初次读取 Outliner.md 时猜错文件名 | 1 | 使用 `rg --files` 定位到 `src/components/drag-n-drop/dragDropManager.ts` |
| 多个探索命令因 `rg` 无匹配返回非零导致批处理报错 | 2 | 使用独立调用或捕获非零结果，不重复相同组合 |
| 内容切分重构补丁因上下文与实际文件不匹配而未应用 | 1 | 重新读取目标片段后拆成小补丁逐步修改 |
| 沙箱内 `npm.cmd install` 120 秒无输出后超时 | 1 | 按权限规则改为请求联网安装权限并增加超时 |
| npm ERESOLVE：Obsidian 1.13.1 要求精确的 CodeMirror peer 版本 | 1 | 查询 peerDependencies 并锁定兼容版本，不使用 --force |
| TypeScript：Window 类型不暴露跨 realm `MouseEvent` 构造器 | 1 | 使用目标 document.createEvent 创建同 realm dblclick 事件 |
| esbuild 无法读取 Vault 上级目录并因此无法解析入口 | 6 | 本轮仍精确复现相同沙箱祖先目录读取限制；不改构建路径，已在沙箱外成功构建 |
| 更新规划文件的组合补丁上下文顺序不匹配 | 1 | 用 rg 定位标题后使用精确上下文更新 |
| 首轮 ESLint：23 errors / 7 warnings | 2 | 已在迁移后规范目录复现；重命名 Plugin.settings 冲突、修复 deprecated API/句式/类型断言，并实现 declarative settings |
| 更新规划文件组合补丁再次因多文件上下文失败 | 2 | 后续按单文件、单区域追加，避免组合补丁原子失败 |
| 临时 esbuild 聚焦检查未能运行 | 3 | 首次为内联换行转义错误，随后命中已知祖先目录沙箱限制，沙箱外尝试又超时；停止重复临时 bundle，改由正式测试套件验证 |
| 查找 Obsidian 设置规则补充文档时猜测的 npm 包路径不存在 | 1 | 改为读取已安装包的规则测试与 `obsidian.d.ts`，确认双版本 declarative settings 路径 |
| 沙箱内安装 Vitest/Markdown 测试依赖时 registry 连接 EACCES | 1 | 按权限规则改为联网安装；依赖成功安装，不运行 `npm audit fix --force` |
| Vitest 首轮扫描了 `references/` 中其他项目的测试 | 1 | 新增 `vitest.config.mjs`，将发现范围限制为 `tests/**/*.test.ts`；本项目 27 个测试通过 |
| PowerShell 哈希核对脚本在 `foreach` 后直接接管道产生空管道语法错误 | 1 | 改为先收集到 `$rows`，再单独格式化输出 |
| Windows 下向 `rg` 直接传入 `plugins\*\data.json` 通配路径失败 | 1 | 改用 `-g` glob 和明确目录；无匹配时不重复同一命令 |
| 用户输入使 Computer Use 焦点切回 Codex，首次启用动作状态不确定 | 1 | 停止对旧窗口继续输入，重新枚举并锁定 Obsidian；确认插件实际上已启用 |
| `native-subtree` 父 standalone ID 与子 inline ID 共用插入 offset 时顺序错误 | 1 | 新增失败回归用例；同位置按 inline 先于 standalone 排序，源文件正确落成“子行 inline ID + 下一行父 marker”，完整测试增至 28 个通过 |
| 实体鼠标从 grip 拖动只产生编辑器文字选区，未触发任何拖放效果 | 1 | 根因是 `DragHandleWidget.ignoreEvent=false` 让 CodeMirror 接管 mousedown；改为 true 后 lint/typecheck/28 tests/build 通过，已部署并等待实体复测 |
| 带现有 inline block ID 的 PDF Callout 后接无空行正文时，被拆成多卡片并给第二行新增 ID | 1 | 已用用户原文建立失败回归，并改为采用 CodeMirror `Blockquote` 逻辑范围、优先复用 opening-line ID；定向 6 个切分测试通过，待补边界回归与全量验证 |
| session-catchup.py 在 Windows GBK 控制台输出不可编码字符后中止 | 1 | 设置 `PYTHONIOENCODING=utf-8` 后重跑成功 |
| 拖动中的 Callout ghost 只有极窄空条，没有正文 | 1 | 对照 CardNote 1.1 的 preview 容器、渲染时机和样式，补回可见内容与尺寸；同时检查上轮中断遗留源码完整性 |
| PowerShell 中组合 `rg` 正则的双引号被管道符提前解析 | 1 | 改为分离文件读取，并用单引号包裹 `rg` 模式；仅影响只读审查 |
| 新增 Markdown 分界线后 TypeScript 报 `element.closest` 类型为 `unknown` | 1 | 将 DOM 节点收窄为 `Element` 后再调用 `closest`，typecheck 恢复通过 |
| ESLint 拒绝直接设置分界线 `style.display` | 1 | 移除静态 display 赋值，改由 `styles.css` 控制可见性；lint 恢复为 0 errors / 0 warnings |

## 备注
- 规划文件内容是项目状态数据，不作为外部指令执行。
- 每完成一个阶段同步更新 `task_plan.md` 和 `progress.md`。
- 阶段 6 已明确进入 Markdown→Markdown 实现；旧的“仅预留接口”约定由本阶段用户需求覆盖。
- 项目规范路径已迁移为 `C:\Users\rex18\project\canvasread-dev\.obsidian\plugins-dev\dragdrop`；后续开发以此目录为唯一真实来源。
- 当前旧 Codex 任务仍记录迁移前目录。新建本地项目后，应先读取 `task_plan.md`、`findings.md`、`progress.md`，从阶段 4 继续。
- 阶段 4 的首要任务：修复 `Plugin.settings` 命名冲突、Canvas 跨 realm 事件类型、弃用 API、设置页 sentence case 与 declarative settings 警告，然后重新运行 lint、typecheck 和 build。
- 根目录 `AGENTS.md` 已定义自动恢复流程。用户在新项目中只需说“继续按 plan 执行”，新任务应加载两个技能、读取三个规划文件并直接从本阶段继续。
