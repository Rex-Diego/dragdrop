# 发现与决策

## 8.12 用户锁定 iPad 映射

- 手指替代 Surface Pen 笔尖，Apple Pencil 替代侧键；不需要临时操作键、双击或挤压 API。
- Pencil 接触按操作笔处理，Canvas 左键选择/移动/缩放；Markdown 继续使用真实修饰键对应绑定，Canvas 块投放使用普通 Canvas 绑定。不能把 Pencil 强制当作 Primary 搬移。
- 仅 iOS 平台启用，可在设置关闭；桌面与 Android 保留原规则，原生鼠标 HTML5 路径不变。

## 8.11 侧键缩放与 iPad（2026-09-08）

- 用户确认上轮问题已解决，新增规则为缩放须在落笔时按住 Surface Pen 侧键。笔尖命中 resizer 改派 Canvas wrapper 中键平移；连接点排除在 resizer 判定外，继续直接连线。动作在一次笔势中固定，途中按侧键不把平移变为缩放。
- iPad 仅调研，不把当前 pen 类型兼容当作已验收。公开 API 未提供 Pencil 双击/挤压桥接；Apple 原生 API 不能直接由社区插件调用。
- 推荐屏幕临时操作键映射侧键，点按仅下一笔生效作为基础，按住作为设备多指验证后的增强。Pencil Pro 挤压 -> 快捷指令 -> URI 武装下一笔可实验，不能模拟连续按住状态。详见 ipad-pencil-research.md。

## 8.10 设置与 Surface Pen 控件（2026-09-08）

- 只删除同文件别名双链；跨文件普通双链和用户其他绑定保留。同文件旧 link-source 加载为非破坏性的 embed-source，设置写入入口拒绝重新配置该动作。
- 本机安装目录 resources/obsidian.asar 的 app.js 确认：原生 onResizePointerdown 要求 isPrimary、button=0、pointerType=mouse；四边还检查事件目标就是 resizer。旧 pen 原样放行不能满足这些条件。
- onConnectionPointerdown 要求 isPrimary 和 button=0；侧键 buttons=2/3 必须映射为左键。原生 ig 在事件 view 上监听 pointermove/up/cancel，因此适配保留 owner window、pointerId 和完整序列。
- 控件适配不主动 setPointerCapture，不实现连线/缩放写入；Canvas 原生状态机继续负责阈值、落点菜单、保存和取消。控件移除后合成事件发往 owner document，仍可冒泡到窗口监听器。
- 普通输入控件保持完整序列旁路；连接点优先于包含它的 resizer。SVG 连线仅按实际 DOM 命中，不以斜线外接矩形抢占画布空白。
- 当前工具未提供原生 Windows 操作入口；本轮没有实体 Surface 输入通过证据，自动化结果不能标记为实机通过。

## 需求
- 插件 ID 与名称使用 `dragdrop` / `DragDrop`，不与 CardNote 同时启用。
- 仅服务 Obsidian Canvas 白板；不保留 Excalidraw、搜索视图、自动预览分栏。
- 只允许从普通 Markdown 编辑器发起拖拽，不从 Canvas 内嵌编辑器发起。
- 鼠标路径继续支持桌面主窗口与 Obsidian 弹出窗口之间双向拖放；新增触控路径，优先支持 Surface，并尽可能兼容 iPad。
- 默认 Canvas 动作：无修饰键引用原块；Ctrl/Command 创建新笔记；Shift/Alt 不改变默认动作并可由用户重新配置。
- 创建新笔记时源文件不被替换或删除，只在需要时追加 block ID。
- 普通块引用 `#^block-id`；标题继续引用 `#标题`。
- 新笔记内容为首行空行、第二行 `![[源文件#^block-id]]` 或标题引用。
- 普通块默认以 6 位十六进制 block ID 命名；标题默认使用清理后的标题，设置可切换为总是询问。
- 文件冲突逐个处理，支持确认重命名、跳过当前、取消剩余；取消剩余不回滚已完成项。
- 多选和多段内容按源位置排序并生成多个 Canvas 节点，纵向排列。
- 顶层空行是普通内容的唯一常规卡片边界；同一 Markdown 逻辑块内无空行的连续内容只生成一个 block。标题、列表、围栏代码、数学块、表格等显式结构仍按 Markdown 语法形成边界；结构内部空行不切分，列表显式拆项设置继续生效。
- 列表默认拆成独立列表项，设置可切换为整棵列表；列表父项显示策略也需可配置。
- 标题章节只拆当前层级，更低层标题章节不递归打散。
- Canvas 节点固定宽度、高度按渲染内容自适应；默认建议宽 400、初始高 200、间距 40。
- 拖拽预览沿用用户修改版：400px、透明无边框、零内边距、Markdown 渲染。
- 新笔记目录策略在设置页选择固定目录、源文件目录或 Canvas 文件目录。
- 自动连线保留、默认关闭，箭头方向和标签设置保留；没有源 Canvas 节点时静默跳过。
- 所有修饰键映射可配置，同一目标与组合只能对应一个动作。
- 第二阶段 Markdown→Markdown：默认移动；Primary 插入普通块链接；Primary+Shift 插入块嵌入。
- 触控手柄必须可用手指和笔拖动；纯触控没有修饰键时使用独立可配置动作，默认引用原块。

## 研究发现
- 生产构建在沙箱外成功，证明此前 esbuild 入口错误是 Vault 祖先目录访问限制，不是源码或路径配置错误。
- npm `obsidian@1.13.1` 声明精确 peer：`@codemirror/state@6.5.0`、`@codemirror/view@6.38.6`；使用 caret 新版会触发 ERESOLVE，因此项目锁定这两个版本。
- 内容切分审查建议将拖拽范围、结构切分、引用解析、block ID 写入拆成独立模块；Canvas 创建不得进入切分器。
- 标题“只打散当前层”的无重复语义：根标题作为边界不生成卡片；根标题下直接正文按空行切分；每个直接子标题生成 heading 卡片并包含更深子树；空章节才退化为根标题卡片。
- 列表需要 `per-item/whole-tree` 与 `item-only/native-subtree` 两个独立设置。已有 ID 永远复用，展示策略对已有 ID 只能 best-effort。
- 复杂结构的新 block ID 必须放在结构结束后的独立 marker；只有普通段落和 item-only 列表项适合行末 inline ID。
- 多选必须保存 dragstart 的 EditorState 快照，扩展局部选区到完整可引用块，合并重叠、去重并按 offset 排序。
- Canvas 私有 API 审查结论：业务代码应通过单一 Canvas adapter 访问 `createFileNode`、drop 目标、fit height 和 save；运行时守卫必须比 `getViewType()==canvas` 更严格。
- 跨窗口 drop 目标应优先用同一 ownerDocument 的 leaf containment/composedPath，fallback 到 elementFromPoint/rect；不能 fallback 到全局 active Canvas。
- 跨 realm 不能使用全局 `instanceof HTMLElement/MouseEvent`，构造 MouseEvent、ResizeObserver、requestAnimationFrame 必须来自节点所属 window。
- 自动连线在第一阶段普通 Markdown 来源下没有 sourceCanvasNode，应立即 no-op；不应为不可触发功能引入 edge constructor/importData 风险。
- 批量节点应只保存一次；高度自适应失败时保留 initialHeight，不阻止其余节点创建。
- `references/obsidian-plugin-skill/README.md` 是安装与概览文档，真正的技能入口位于 `.agents/skills/obsidian/SKILL.md`；其详细规则按主题位于同目录 `reference/`。
- Obsidian 插件技能要求：资源必须注册清理、弹出窗口使用对应 document/window、设置文本使用 sentence case、图标控件具备 ARIA 与键盘操作、路径经 normalizePath、避免 innerHTML、使用 Obsidian CSS 变量并作用域化样式。
- 用户当前 `../card-note` 是官方 1.1.0 发布产物的定制版；manifest 与官方完全一致。
- 用户修改版相对官方 1.1.0 的关键变化：普通 wiki 链接改为嵌入链接、Excalidraw 插入前去除 `!`、禁用抽取后的全库链接迁移、搜索卡片去边框、拖拽预览改为 400px 透明无边框，并增加了一个未调用的 `resizeNode()`。
- CardNote 1.2–1.7 主要增加搜索增强、手柄显示/隐藏、Canvas 高度自适应、目录策略和自动预览；本插件只吸收手柄修复、高度自适应和目录策略。
- CardNote 搜索视图位于 `references/obsidian-card-note/src/view`，并引入 Svelte 和虚拟列表；可整体删除。
- CardNote 1.7 使用 Canvas 私有 `createFileNode`、`onResizeDblclick` 和渲染观察实现内容高度适应。
- CardNote 跨窗口方案枚举 `workspace.floatingSplit`；PDF Plus 展示了更现代的 `workspace.on('window-open')` 加全部 leaf document 注册方式。
- Outliner.md 使用 CodeMirror Decoration widget 在内容起点渲染 `grip-vertical`，CSS 在行悬浮时显示。
- Outliner.md 将代码块、Callout、数学块和引用块识别为整体，并能用 `foldable()` 获取列表/标题子树。
- Outliner.md 的 Markdown→Markdown 实现带插入线、子/兄弟定位和缩进校正，但 Ctrl/Alt 处理器为空，修饰键动作需自行设计。
- 用户修改版 1.1 的 400px 设置只影响拖拽预览，不影响 Canvas 节点；Canvas 节点宽度需要在新插件中明确设置。
- 普通 Markdown 来源没有 CardNote 所需的源 Canvas node，因此自动连线按原逻辑通常不会触发。
- 当前触控阻塞点明确：grip 只监听 `dragstart`，`DragStarter` 只接受 `DragEvent`，文档只监听 `dragover/drop/dragend`，CanvasAdapter 也只接受 `DragEvent`；Surface/iPad 的触摸输入通常不会提供完整 HTML5 `DataTransfer` 链路。
- Pointer capture 后事件 target 会保持为源 grip，因此触控命中 Canvas 必须使用 `ownerDocument.elementFromPoint(clientX, clientY)` 与 Canvas 容器矩形；现有 CanvasAdapter 已有这两种 fallback，可抽成输入无关接口。
- 当前 runtime 源码未发现 Node/Electron 导入、`fetch` 或 regex lookbehind；`isDesktopOnly: true` 是 iPad 无法加载的直接 manifest 门槛。改为移动端可加载前仍需审查 Canvas 私有能力、窗口事件和高度拟合 fallback。
- 粗指针环境下现有 grip 默认透明且命中区小于 44×44px；移动端必须在 `@media (pointer: coarse)` 下始终显示，并扩大绝对定位命中区而不挤压编辑器文本布局。
- 触控跨 Obsidian 原生窗口不作为承诺：Pointer capture/坐标属于单个 ownerDocument；Surface 同一窗口可完整实现，鼠标路径继续承担跨弹出窗口拖放。
- iPad 当前没有真机，规划只允许标记 `experimental / unverified`；不能以 Windows 触摸测试替代 iOS WebView、Apple Pencil 或移动端 Canvas 私有 API 验收。

## 技术决策
| 决策 | 理由 |
|------|------|
| 拖拽手柄不用 Outliner 原样的 `:has()` CSS；由 widget/编辑器类控制悬浮显示 | 社区扫描器会警告 `:has` 的性能影响 |
| 手柄添加 tabindex、role、aria-label、tooltip 位置及 Enter/Space 支持 | 图标控件必须具备键盘和屏幕阅读器可访问性 |
| 静态视觉全部放入作用域化 styles.css，不在 TypeScript 写静态 style | 主题兼容并满足 no-static-styles-assignment |
| 冲突 modal 打开后聚焦输入框，按钮使用原生 ButtonComponent | 满足焦点管理与键盘操作要求 |
| 增加社区扫描器等价的 ESLint flat config，并修复 warnings | 在开发阶段提前符合发布规范 |
| ESLint 采用 `obsidianmd.configs.recommended` + type-aware project，并主动开启 `prefer-active-doc` | 与社区扫描器一致且覆盖跨窗口规则 |
| ESLint 不忽略 package.json，只忽略 node_modules 和 mjs 构建脚本；发布仓库不能忽略 main.js | 让依赖扫描发现可替换或受限包，同时确保 BRAT 能取得构建产物 |
| 所有 fire-and-forget Promise 显式 `void`，DOM 回调不直接使用 async | 满足 no-floating-promises 与 no-misused-promises |
| 定时器绑定具体 owner window 并使用该 window 的 timer API | 弹出窗口兼容且避免 bare timer 规则 |
| 设置 Dropdown 回调先接收 string 再在内部缩窄 | 兼容 Obsidian 组件的宽泛 callback 类型 |
| 不把 Plugin 实例传给 MarkdownRenderer；每次 ghost 使用短生命周期 Component | 避免渲染资源随插件生命周期泄漏 |
| 所有 window/document 长生命周期监听通过 owning Component 的 registerDomEvent 注册 | 自动清理并避免 activeDocument 焦点漂移 |
| 移除 `builtin-modules` 依赖，改用 `node:module` 的 builtinModules | Obsidian 社区扫描器会标记可替换依赖 |
| 用户路径一律经 normalizePath，文件存在性用 getAbstractFileByPath | 遵守 Vault API 与跨平台路径规范 |
| 源编辑器修改只使用 EditorView/Editor API，后台新建文件使用 Vault API | 保留光标与编辑状态并保证文件操作安全 |
| 重建极简 TypeScript 插件而非修改编译后的 1.1 `main.js` | 可维护、可测试并能安全删除旧 UI 依赖 |
| 使用 CodeMirror StateField + Decoration widget 渲染手柄 | 与 Outliner 交互一致且不依赖 DOM monkey patch |
| 使用语法感知扫描而不是简单 `split("\n\n")` | 防止拆坏 fenced code、Callout、表格等结构 |
| 用 CodeMirror 顶层语法范围补全引用/Callout lazy continuation，不统一事后合并所有 primitive | 保持标题 subpath、列表父子范围及复杂结构 standalone ID 有效，同时落实普通内容的空行边界 |
| 标题手柄拖动不生成根标题卡片，只生成直接正文与直接子标题；空章节例外 | 避免父标题预览与下属卡片重复 |
| 对 code/table/math/callout/quote/whole-list 使用 standalone block ID | 防止破坏 Markdown 结构结束标记 |
| 使用全局拖拽 session + 各窗口 document 捕获事件 | 支持主窗口与弹出窗口跨窗口 drop |
| 动作映射采用 target + modifier chord → action | 支持 Canvas 与未来 Markdown 使用同一组合但不同语义 |
| block ID 先规划，确认任务后批量按倒序写入编辑器 | 降低源文件修改并避免 offset 漂移 |
| Canvas 节点按顺序创建并在渲染后测高 | 保证纵向布局不重叠 |
| Canvas 私有操作集中到 CanvasAdapter，并使用运行时能力检测 | 降低 Obsidian 内部 API 变更影响 |
| drop 异步流程开始前捕获 Canvas view/pos/doc，modal 返回后复查 connected | 防止跨窗口或命名期间目标被关闭 |
| 不读取或迁移 CardNote data.json | 新插件独立，用户偏好直接成为默认值 |
| Pointer 手势状态机与业务 DragSession 分层 | 阈值、pointer capture 和取消属于输入层；block ID、文件任务与 Canvas 创建必须复用现有业务链路 |
| 任何触控 drop 在确认可写 Canvas 和动作后才规划/写入 block ID | 避免 pointercancel、越界或 iPad API 缺失时污染源文件 |
| `manifest.isDesktopOnly=false` 放在移动端静态审计与能力守卫之后 | 允许 iPad 安装，但不能让缺失私有 Canvas API 导致插件加载或编辑器交互失败 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| esbuild 在 workspace sandbox 中无法遍历 Vault 祖先目录解析依赖 | 使用获批的 `npm.cmd run build` unsandboxed；代码与配置本身可正常构建 |
| npm latest CodeMirror 与 Obsidian 精确 peer 冲突 | 固定 state 6.5.0、view 6.38.6、obsidian 1.13.1，不使用 force |
| Outliner 参考样式使用技能明确不推荐的 `:has()` | 只借鉴交互，通过唯一 class 和事件状态实现 |
| 初始构建配置用了技能明确不推荐的 `builtin-modules` | 在继续实现前改为 Node `builtinModules` |
| PowerShell 禁止执行 npm.ps1 | 使用 npm.cmd |
| Canvas API 不在 Obsidian 公共类型中 | 建立最小内部类型声明，运行时守卫所有私有调用 |
| 列表父项原生 embed 可能包含子树 | 提供原生引用和仅父项显示策略，并在实际加载测试中验证 |

## 项目迁移与会话交接（2026-07-15）
- 项目唯一规范路径为 `C:\Users\rex18\project\canvasread-dev\.obsidian\plugins-dev\dragdrop`。
- 已迁移全部 20 个顶层项目项，包括 `.git`、`node_modules`、源码、构建配置、参考资料和三个规划文件；关键文件完整性检查通过。
- 迁移后 `.git` 一度触发 Git `dubious ownership`，已将 `.git` 所有者修正为 `DESKTOP-SFMME8L\rex18`，Git 可正常读取仓库状态。
- 仓库当前显示 14 个未跟踪项目项，说明现有工作尚未建立首次提交；这不是迁移产生的内容丢失。
- 迁移前目录已清空，但当前 Codex 任务仍以该目录为工作目录，因此 Windows 暂时不允许删除空壳目录；关闭旧任务后可安全删除。
- Codex 任务会分别保存对话记录和记录的工作目录。目前没有可调用的接口将本任务直接重绑定到新目录；应在 Codex 中添加上述新路径为本地项目，并由新任务读取三个规划文件继续。
- 规划文件本身是 UTF-8。Windows PowerShell 读取时应显式使用 `-Encoding UTF8`；未指定编码时出现的乱码仅是终端解码问题，文件内容未损坏。
- 当前代码状态：`npm.cmd run typecheck` 与生产构建已通过；首轮 ESLint 为 23 errors / 7 warnings，下一步应先完成 lint 修复再补测试。
- 已确认的 ESLint 修复入口：将自定义 `Plugin.settings` 重命名为 `config`；修复 Canvas owner-window 事件构造与弃用 API；将 modal 的 `setWarning()` 改为 `setDestructive()`；调整设置页 sentence case；评估并实现 `getSettingDefinitions()`。
- 在规范目录重新运行 `npm.cmd run lint` 后仍精确复现 23 errors / 7 warnings；对应 reference 明确要求修复根因，不使用规则禁用。当前类别为 1 个冗余类型断言、2 个 Canvas document/事件警告、1 个弃用按钮警告，以及设置页的 20 个 `Plugin.settings` 冲突错误、3 个 sentence case 警告和 1 个 declarative settings 警告。
- 阶段 4 测试审查发现两个需要聚焦覆盖的风险：whole-tree 列表分组目前按 primitive 连续性合并，而 scanner 会丢弃空行，可能把空行分隔的两棵列表误合并；同一拖拽批次内两个相同标题只检查 Vault 既有路径，可能同时接受同一路径并在第二次创建时才失败。
- 当前依赖中没有 `@codemirror/lang-markdown`；若要真实验证 `foldable()` 的标题/列表子树行为，测试环境需要 Markdown language extension。临时 esbuild 内联检查连续遇到转义、沙箱祖先目录限制和超时，后续改用正式测试套件，不再重复该临时方案。
- ESLint 已清零。最终修复包括：自定义插件配置统一改名为 `config`；Canvas 使用目标 owner window 的 `MouseEvent`；弃用的 `setWarning()` 通过 `requireApiVersion("1.13.0")` 切换到 `setDestructive()` 并保留旧版 class 回退；设置页同时提供 1.13+ 的非空 `getSettingDefinitions()` 与旧版 `display()`，共享读写逻辑。
- 已安装 `vitest` 与 `@codemirror/lang-markdown`，测试目录纳入 TypeScript project。npm 报告 2 个 low severity vulnerabilities 与 esbuild install-script allow-list 提示；按项目约束不运行 `npm audit fix --force`，后续以 lint/typecheck/test/build 实际验证依赖可用性。
- 聚焦测试现为 4 个文件、27 个用例并全部通过。测试推动修复了两个已确认问题：whole-tree 模式按真实相邻行分组，不再跨空行合并列表；文件规划增加批内名称预留，同名标题和前项重命名占用都会触发后续冲突流程。
- Vitest 首轮默认发现了 `references/` 中其他项目的 spec 并因其自有目录假设/jsdom 依赖失败；通过根目录 `vitest.config.mjs` 将测试范围限定为本项目 `tests/**/*.test.ts`，不修改 reference。
- 实机窗口确认当前运行的 Obsidian 为 1.12.7（vault: `canvasread-dev`），因此本次 UI 验证也会覆盖 declarative settings 之前的 `display()` fallback 路径。
- 用户指定最终可加载发布文件放入项目相对路径 `../plugin`；只复制构建产物和说明，不在该目录继续开发源码。
- `../plugin` 已包含 `manifest.json`、`main.js`、`styles.css`、`README.md`、`LICENSE`、`versions.json`；六个文件均与规范源码目录的 SHA-256 一致。该目录是普通目录，不是 junction/symlink。
- 根目录已新增 `AGENTS.md` 作为自动接续契约：新任务收到“继续按 plan 执行”后，必须加载 `planning-with-files-zh` 与仓库内 Obsidian 技能，读取三个规划文件，并从 `task_plan.md` 的当前阶段继续，不重新询问已锁定需求。

## 阶段 4.5 实施决策（2026-07-20）
- 触控与笔输入采用 Pointer Events 自定义链路，鼠标保留 HTML5 drag，以维持跨弹出窗口桌面拖放。
- Pointer 手势只从 grip 启动，移动距离达到 8px 后才创建 DragSession；轻触选块，取消、失去 pointer capture、错误 pointerId、无效 Canvas 与 `none` 动作都不会写入 block ID。
- `startSession` 与 `commitDrop` 是鼠标和触控的共享业务核心。提交时先验证动作、Canvas 连接状态和源文档快照，再规划引用或写入 block ID。
- Canvas 坐标命中使用 ownerDocument、`elementFromPoint` 和 Canvas 外框回退，因此 Pointer capture 不会把 grip 误判为 drop target。
- 移动端 Canvas 私有能力在命中时检查 `posFromEvt`、file/text 节点创建、requestFrame 和 requestSave；缺失时单次 Notice 后安全退出。iPad 仍为 experimental / unverified。
- `isDesktopOnly=false` 仅表示允许移动端加载，不代表跨窗口触控拖放；触控只承诺同一 Obsidian 窗口。

## 资源
- `references/obsidian-plugin-skill/.agents/skills/obsidian/SKILL.md`
- `references/obsidian-plugin-skill/.agents/skills/obsidian/reference/`
- `references/obsidian-card-note/main.ts`
- `references/obsidian-card-note/src/dragUpdate.ts`
- `references/obsidian-card-note/src/adapters/obsidian/types/canvas.d.ts`
- `references/Outliner.MD/src/components/drag-n-drop/dragDropManager.ts`
- `references/Outliner.MD/src/less/drag-n-drop.less`
- `references/obsidian-pdf-plus/src/lib/index.ts`

## 视觉/浏览器发现
- 使用 Windows 实机窗口确认 Obsidian 1.12.7 正在打开 `canvasread-dev` vault；后续插件加载与拖放验证以该窗口为目标。
- 将同源发布文件安装到 vault 的标准 `.obsidian/plugins/dragdrop` 后重载，Obsidian 1.12.7 的第三方插件列表已识别 `DragDrop 0.1.0`、作者 `rex18` 和 manifest 描述；当前开关保持关闭，尚未执行插件代码。
- 用户确认后已启用 DragDrop；`community-plugins.json` 包含 `dragdrop`。Obsidian 1.12.7 能正确走旧版 `display()` fallback，设置分组、默认值和说明均渲染；Tab 可聚焦下拉控件，焦点框清晰可见。
- 本次恢复后重新枚举到唯一 Obsidian 窗口 `自他内外 - canvasread-dev - Obsidian 1.12.7`。窗口仍停留在 DragDrop 设置页：`Split list items` 已开启，`List parent display` 为 `Native subtree`，固定目录为 `DragDrop QA/Generated`，节点宽度为 400；设置页右上角关闭按钮可用于进入拖放验收。
- 已关闭设置页并返回主工作区；当前中央编辑器显示 `自他内外`，左侧文件树中的 `DragDrop QA` 文件夹可见但折叠。下一步从该文件夹打开 `Source.md` 与 `Target.canvas` 并建立分栏。
- 已通过快速切换器打开 `DragDrop QA/Source.md`。可见测试内容包括长段落、带子项的 `Parent item` 列表、`Sibling item`、`Heading card` 标题及两段正文；窗口标题已变为 `Source - canvasread-dev - Obsidian 1.12.7`，适合作为拖放源基线。
- 当前 Obsidian 界面为中文，本地化命令面板无法用英文 `split right` 命中分栏命令；快速切换器底部明确提示 `Ctrl+Alt+→` 可在右侧新标签页打开，因此后续改用该原生快捷入口建立 Source/Canvas 分栏。
- 对快速切换器发送 `Ctrl+Alt+→` 后界面未变化，说明截图中的提示并非该键盘组合可直接触发的右侧分栏动作，后续改用标签页上下文菜单或鼠标入口。
- Source 标签页上下文菜单已确认存在 `左右分屏`、`上下分屏`、`移动至新窗口` 和 `在新窗口中打开`，可分别用于建立主窗口分栏和后续弹出窗口双向拖放验证；菜单项的 UI Automation 文本索引不稳定，改用已观察到的菜单坐标或键盘导航。
- 对 `左右分屏` 菜单项的坐标点击只产生了悬停高亮，菜单没有立即执行；该原生菜单更适合在高亮后用 `Return` 确认。另一次分离调用因窗口重新激活使菜单先关闭，点击落入编辑器并把光标放到文件顶部空行，未写入文字。
- 组合执行菜单坐标点击与 `Return` 最终建立了左右分栏，但两种激活都生效，意外生成三个并列的 Source 标签组。当前已在最右组打开快速切换器选择 `Target.canvas`；多余中间组可在不影响测试的情况下关闭，后续菜单动作只使用一种激活方式。
- 用户输入中断提示出现后重新同步窗口，当前布局已稳定为左侧两个 `Source` 组、最右侧空白 `Target` Canvas；窗口标题为 `Target - canvasread-dev - Obsidian 1.12.7`。两份 Source 内容一致，Target 画布网格可见且节点数为 0，可以直接进行拖放。
- Accessibility tree 在每个 Source 组中枚举出 8 个 `按钮 Drag Markdown block`，与静态审计的 8 个内容单元一致；点击中间 Source 的段落手柄后 grip 图标可见，长段落被完整选中，Target 仍为空。由此可判 ARIA role/name、手柄存在性与鼠标选块通过。
- 静态审计指出 Enter/Space 会选中块并把焦点返回编辑器，但不会启动拖放；因此 `Tab/ARIA/可见焦点/键盘选块` 可单独验收，不能宣称支持纯键盘完成 Markdown→Canvas。
- 源码与 README 语义一致：README 的正式操作步骤明确是“悬浮手柄并拖到 Canvas”，而 Enter/Space 代码只执行完整范围选择。因此纯键盘拖放不属于当前说明承诺，但交付说明仍应避免把“键盘选块”表述成“键盘可完成拖放”。
- README 的限制章节已明确补充：手柄可键盘聚焦，Enter/Space 选择完整源块，但完成到 Canvas 的拖动当前需要指针设备。
- 并行 QA 审计复现并修复了 `native-subtree` 同 offset 插入缺陷：原逻辑会落成 `- Child item\n^父ID ^子ID`；现在相同位置先应用 child inline ID，再应用 parent standalone marker，正确结果为 `- Child item ^子ID\n^父ID`。新增回归用例后完整 Vitest 为 4 files / 28 tests passed；`self-only` 不受原缺陷影响。
- 两次通过 Windows 自动化 `drag` 从中间 Source 预估 grip 坐标拖到 Target，画布仍显示 0 节点且源段落没有可见 block ID。第二次虽然先触发了段落完整选中，但刷新后的 accessibility 索引未重新解析，可能点到文本而非手柄；也可能是通用鼠标拖动未触发 Electron/HTML5 `dragstart`。在继续重试前需精确解析当前手柄索引/坐标或改由用户完成一次实体拖拽。
- 重新解析三栏布局后的 accessibility tree，第二个 Source 的段落手柄仍精确为 index 143；点击该索引后截图确认手型指针位于约 `(504, 258)` 的 grip 上且段落完整选中。因此前两次失败不是索引漂移或坐标猜错，基本可归因于通用 Windows `drag` 手势没有触发该 Electron draggable 的原生 HTML5 `dragstart`。
- 拖放重试后直接核对磁盘：`Source.md` 仍为 295 bytes、SHA-256 `4BA74614...DBB36`，仅比原基线多一个文件开头空行且没有 block ID；`Target.canvas` 仍为 33 bytes、`nodes/edges` 均空，`Generated/` 无文件。这确认自动化拖放没有触发插件持久化流程。
- 修复后的列表验收基准：`native-subtree` 拖父项会生成父、子两个节点，源文件应为父行不带 ID、子行末 inline 子 ID、下一行独立父 marker；`self-only` 下父/子各自在自身行末拥有 inline ID，父节点为 Canvas text 链接节点、子节点仍为 file 节点。
- 列表修复后的全量验证重新通过：ESLint 0 errors / 0 warnings、TypeScript 通过、Vitest 4 files / 28 tests、沙箱外生产构建通过；最新 `main.js` 为 56,353 bytes，SHA-256 `24D9BA0E...F3F1B1`，`node --check` 通过。
- 已将最新六个发布文件覆盖到 vault 标准 `.obsidian/plugins/dragdrop`，逐项 SHA-256 与规范源码匹配；随后使用 `Ctrl+R` 重载 Obsidian，窗口进入“加载插件中...”阶段，需等待工作区恢复后确认新版加载。
- Obsidian 重载后恢复 Source/Source/Target 三栏，grip 与 `Drag Markdown block` tooltip 正常显示，说明新版插件已加载。使用最新截图 ID 锚定坐标的第三种自动化拖动仍只选中段落、Canvas 保持空白；至此停止重复自动化 drag，实机持久化验收需要用户的一次实体鼠标拖放。
- 用户随后用实体鼠标复现相同行为：grip 命中时光标变成手形，但拖动只形成编辑器文字选区，没有 ghost、block ID 或 Canvas 节点。这排除了 Computer Use 手势限制，根因位于手柄 widget 与 CodeMirror 的鼠标事件/原生 draggable 交互。
- 根因已定位到 `DragHandleWidget.ignoreEvent()`：本项目原先显式返回 `false`，而 CodeMirror 6.38.6 的 `WidgetType` 文档与实现明确说明默认返回 `true`、即编辑器应忽略 widget 内部事件。返回 `false` 会让 EditorView 接管 grip 的 mousedown 并启动文字选区，恰好解释实体复现；DOM 自身的 `dragstart` listener 只有在编辑器不接管时才能正常工作。
- CodeMirror 的 `eventBelongsToEditor()` 会沿事件 target 向上遍历；一旦 widget `ignoreEvent(event)` 返回 true，编辑器事件处理器立即退出。Outliner 的可工作 `DragNDropHandlerWidget` 没有覆盖该方法，因此继承默认 true；本项目显式 false 是与参考实现唯一直接相关的反向差异。
- 当前 Vitest 固定为 Node 环境，现有测试没有导入 `drag-handle-extension` 或 Obsidian DOM；因此这一回归无法由现有套件真实模拟 mousedown→dragstart。核心证据是 CodeMirror 运行时实现、参考插件差异与实体症状闭环，最终判定仍必须以重载后的实体拖动为准。
- `ignoreEvent=true` 修复已构建为 56,352-byte `main.js`；规范源码产物、vault 安装目录和 `../plugin` 三份 SHA-256 均为 `4CCCB5E2...E761D60`。
- 修复后的全量验证由主代理再次通过：ESLint 0 errors / 0 warnings、TypeScript 通过、Vitest 4 files / 28 tests、沙箱外生产构建与 `node --check` 通过；六个发布文件已同时刷新到标准安装目录和 `../plugin`，三方逐项哈希一致。
- 修复版重载前重新观察 Obsidian：布局已变为 Source/Target 两栏，Target 画布上可见一个显示长段落内容的节点。该节点可能来自用户刚才的实体尝试或延迟保存，需先核对 `Source.md` 与 `Target.canvas` 磁盘内容，再重载，不能仅凭用户当时未看到额外效果判定 drop 完全未执行。
- 磁盘核对确认用户实体尝试实际上成功完成默认动作：`Source.md` 的长段落行末新增 `^71cd6a`（22:44:11），`Target.canvas` 保存了 file node，subpath 为 `#^71cd6a`、width 400、height 81、`dynamicHeight=true`（22:45:39）。因此 Canvas 命中、block ID、引用节点、固定宽度和高度拟合链路均通过；缺陷集中在拖动开始时被编辑器选区接管、反馈不清晰。
- 用户补充了关键模式差异：实时预览（用户称 preview mode）可以完成拖放，原始 Source mode 只能形成选区。成功落盘的节点应来自实时预览；`ignoreEvent=true` 修复必须以 Source mode 实体复测为验收目标，同时保持实时预览不回归。
- 2026-07-19 用户提供新的真实失败样本：`> [!PDF|] [[...]] ^2026-05-04-14-03-06` 后紧跟一行无 `>`、中间无空行的正文。当前切分会生成多个 Canvas 卡片、报“未找到 ^2026-05-04-14-03-06”，并给第二行另加新 block ID。期望是整个 lazy-continuation Callout/引用块作为一个原子单元，复用首行已有 ID，第二行保持不变。
- 用户进一步锁定通用规则：以后每个 block 严格以 Markdown 顶层空行为单位划分；没有空行就不得因行内语法类型变化生成第二张卡片。代码围栏/数学块内部空行不作为边界，显式列表拆项设置是例外。
- 2026-07-19 用户实机确认 Callout 分块缺陷已解决，但拖动 ghost 中的 Callout 只有极窄空条、正文未显示；旧的定制 CardNote 1.1 可正确渲染。当前 ghost 在 `beginDrag` 中立即附加并异步 `MarkdownRenderer.render`，需要对照 CardNote 的容器可见时机、根 class 和尺寸策略。
- 当前根因有两层：`scanPrimitives()` 的引用分支只吞连续以 `>` 开头的行，因此把 lazy continuation 正文另建 paragraph；同时 `existingBlockId()` 只检查原子单元最后一行，合并后又会漏掉首行末的已有 ID。
- CodeMirror Markdown 语法树对用户原文给出单个 `Blockquote 0..doc.length`，内部 `Paragraph` 同样跨两行；`foldable()` 从第一行返回到第二行末。这提供了比“下一行非空”更安全的范围判据：引用/Callout 应优先扩展到解析器的 fold range，再做现有 `>` 连续行 fallback。
- 影响面审计确认不能把所有无空行 primitive 统一合并：标题、列表、代码、数学块和表格都有独立引用/ID 放置语义，盲目合并会得到 Obsidian 无法用单一 subpath 表示的范围。当前实现因此采用“普通空行边界 + 显式 Markdown 结构边界”，并由 `Blockquote` syntax span 补全 lazy continuation。
- 并行完整性检查发现用户指定的 `../plugin` 已被其他内容覆盖：当前 manifest 为 `hypergraph` 0.1.0，除 `styles.css` 外均不再与 DragDrop 源码匹配；vault 标准安装目录 `.obsidian/plugins/dragdrop` 仍与源码一致。阶段 5 必须重新刷新 `../plugin` 后再交付。
- 已按用户指定的交付约定重新覆盖 `../plugin`：当前六个文件均为最新 DragDrop，逐项 SHA-256 与规范源码匹配；其中 `main.js` 为 `24D9BA0E...F3F1B1`，README（含指针设备限制说明）为 `3B8143F7...585DC8`。
- QA 基线监测发现 `Source.md` 在打开后由 294 bytes 变为 295 bytes，文件开头新增一个 LF，但尚无 block ID，`Target.canvas` 仍为空；需在拖放前确认并记录这一非预期空行，避免误判为插件的 block ID 修改。
- 未使用浏览器工具；GitHub Release 元数据只用于确认版本演进，已转化为上述事实。

## 阶段 6 锁定决策（2026-07-29）

- 用户明确批准正式进入 Markdown→Markdown 阶段。它是“书摘 Markdown → 原子笔记 Markdown”的主干路径，不再只是设置与动作结构预留；`AGENTS.md` 中原有约束已同步改写。
- 阶段 6 的 Markdown 动作只保留 `inherit`、`embed-source`、`move`、`none`；删除 `link-source`。无修饰键默认 `embed-source`，Primary 默认 `move`，其余默认继承。硬编码解析回退同样必须是 `embed-source`，确保配置损坏时不误删源内容。
- 初始实现曾新增 `protectedFolders: ["Capture"]`，但用户在 2026-07-29 明确撤销该限制；不再按源文件夹或目标文件夹限制搬移。
- 阶段 6 继续保留第一阶段“Markdown → Canvas”语义和阶段 4.5 触控实现；不把阶段 4/4.5 未完成实机验收伪装为本阶段完成。
- 源码审计确认 `CanvasEdgeNode`、`edges`、`addEdge`、`setLabel` 及其数据导入预留没有调用方，已随死的自动连线设置一起删除。
- Markdown 文本规划已独立为无 Obsidian 依赖模块：块搬移先计算完整删除范围，再映射同文件目标 offset，最后一次性生成结果；重叠范围在写入前抛错。
- Markdown 拖放已接入 `handleDragOver`/`handleDrop` 的 Canvas 后备分支：目标按编辑器块边界对齐，嵌入只补必要 block ID，搬移支持跨文件和同编辑器，并在跨文件第二次写入失败时回滚首个编辑器。
- Markdown→Markdown 中间交付已通过 `npm.cmd run lint`（0 errors / 0 warnings）、`npm.cmd run typecheck`、`npm.cmd run test`（6 files / 44 tests）和 `npm.cmd run build`；Canvas 浮动工具栏尚未开始，下一阶段必须单独评估其私有 API。
- 实机复制行为的根因不是当前源码分支：项目新 bundle 已含 Markdown drop resolver，但实际 `.obsidian/plugins/dragdrop/main.js` 和 `plugins-dev/plugin/main.js` 仍是 2026-07-20 的旧 64,006-byte bundle。新 79,767-byte bundle 已部署到两个目录并完成 SHA-256 一致性核对。
- 用户反馈确认：源块本身已经是完整的 `![[...#^blockid]]` 时，Markdown→Markdown 的无修饰键动作必须原样复制该嵌入，不追加新的 block ID，也不改写成指向源文件的另一条嵌入；Ctrl/Command 按动作映射执行搬移。
- 为避免 Electron/Obsidian 在 `drop` 事件中丢失修饰键，Markdown 目标在每次有效 `dragover` 时锁存解析后的动作；`drop` 优先采用同一窗口最近一次有效目标动作，再回退到当前事件解析。Canvas 目标、无效目标、取消、`dragend`、完成提交和卸载都会清除锁存状态。
- 目的地反馈参考 `outliner-md` 的 body 级 `drag-target-line`：本插件新增 `.dragdrop-markdown-drop-line`，使用 CodeMirror 块边界的视口坐标实时定位，目标无效或拖拽结束即移除；未引入右键菜单事件作为替代入口。
- 本轮静态修复后基线为 lint 0 errors / 0 warnings、typecheck 通过、6 files / 47 tests 通过、生产 build 和 `node --check main.js` 通过；最新 `main.js` 与 `styles.css` 已同步到实际插件目录和 `plugins-dev/plugin`，三方哈希一致。下一步先做 Obsidian 实机复测，再继续 Canvas 浮动工具栏。
- 对照仓库内 `references/Outliner.MD/src/components/drag-n-drop/dragDropManager.ts`：Outliner 的全局 `dragover` 固定 `dropEffect = "move"`，`handleDrop` 始终调用 `handleNormalDrop`，`handleCtrlDrop` 与 `handleAltDrop` 均为空；该实现没有受保护目录判断，与用户最终要求的任意文件夹搬移一致。
- 用户随后明确要求取消文件夹限制：删除 `protectedFolders` 设置、UI、合并逻辑和 `protectMoveAction`；Ctrl/Command 在任意文件夹间都执行搬移，只保留 block ID 确认、只读源拒绝和多块整体事务约束。
- 取消限制后的生产 bundle 为 81,470 bytes，已同步到实际插件目录和 `plugins-dev/plugin`；三方 `main.js` 与 `styles.css` SHA-256 一致，bundle 中不再包含 protected Notice 或 move 拦截分支，仅保留旧字段清理。
- 用户补充确认：Markdown→Canvas 遇到完整独立 `![[...#^blockid]]` 时，应把该行视为原始块的引用，不得在源文件追加第二个 block ID；Canvas file node 必须使用双链解析出的目标文件和原始 `#^blockid`。
- 为实现上述语义，Canvas 引用规划先用 Obsidian `parseLinktext()` 拆分 linktext，再用 `metadataCache.getFirstLinkpathDest()` 解析目标文件；所有目标解析成功后才允许规划普通块 ID或写入源文件。空路径 `![[#^id]]` 解析为当前源文件。
- 混合多块拖拽中，普通块继续补充必要 ID，已有块嵌入保持无插入并指向各自目标；创建原子笔记路径也复用该外部引用，避免只修复默认 Canvas 引用路径。
- 用户反馈 Markdown→Markdown 的分界线在标题/列表等大范围内容中只能命中很少位置。根因是落点计算对 `buildHandleRanges()` 使用首个匹配范围；外层可折叠范围覆盖多个子 block 时，子 block 和空行边界被遮蔽。
- 分界线选择改为收集所有 handle range 的起止 offset（包括嵌套范围），为每个 offset 计算实际视口纵坐标，再选择离鼠标最近的边界；仍只在 block 边界插入，不把普通 block 从行中间切开。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*

## Live Preview Callout 抓手（2026-07-29）

- 用户反馈 Live Preview 中 Callout 的 inline 抓手只有在整块被选中后才出现。实机 DOM 确认 Callout 被渲染为独立的 `.cm-embed-block.cm-callout`，inline decoration 仍位于源 `.cm-line`，会被渲染块遮挡或移出可见位置。
- 本轮采用 CodeMirror `gutter()` + `GutterMarker` 为 Callout 渲染抓手；marker 复用原有 `DragStarter` 事件、键盘选择和 `ignoreEvent() === true`，普通段落/列表等继续使用原 inline decoration。选择 gutter 是为了让 Live Preview 的独立渲染块仍有稳定的可见挂点，避免依赖私有 Callout DOM 层级。
- 实机自动化复测在部署后停在图片预览窗口，Computer Use 无法重新激活该窗口；源码、构建产物和三个部署目录已完成静态/哈希验证，仍需用户在 Obsidian 中重载后确认视觉与实际拖动。

## 阶段 6 Canvas 工具栏评估（2026-07-29）

- 已检查 vault 中启用的 Advanced Canvas 6.0.1 bundle。它暴露 `advanced-canvas:selection-changed`、`advanced-canvas:canvas-changed` 等 workspace 事件，也有 `popup-menu-created`，但没有发现 `.canvas-menu` 浮动工具栏的扩展/注册接口。
- `popup-menu-created` 与 Obsidian 的右键菜单链路相关，不能作为用户要求的选中节点后浮动工具栏入口。
- 锁定采用 MutationObserver：为主窗口和 workspace `window-open` 产生的每个 owner document 观察 `.canvas-menu` 的重建，注入一次性图标按钮；observer 在 `onunload` 中逐个 disconnect。命令面板命令作为始终可用的兜底，注入失败只忽略该菜单，不影响拖拽主链路。
- Canvas 归纳按钮只新增原子笔记和一个新的 Canvas file node，不删除或替换选中节点。选区按 `y`、再按 `x` 排序；file node 复用原 file/subpath，text node 保留原文。
- 原子笔记命名必须经过 `FileNameModal`，使用中性初始名并禁用“跳过”路径；Esc/取消只取消本次创建，不会静默跳过命名。
- 排序、节点转换和正文构造已抽到无 Obsidian 运行时依赖的 `canvas-summary-model.ts`，因此可以在现有 Node/Vitest 环境中直接覆盖；生命周期、vault、modal 和 Canvas 私有 API 保留在 `canvas-summary.ts`。

## Live Preview Callout hover 修正（2026-07-30）

- Callout 的 gutter marker 原先为了保证可见性强制 `opacity: 1`，导致它与普通 block 的 hover 反馈不一致。
- 现在默认隐藏图标，并由对应 `.cm-line` 的 hover 同步 `dragdrop-handle-line-hover` class；gutter/抓手 hover 和键盘 focus 仍能显示，粗指针设备维持常显以保留触控可用性。

## Live Preview Callout 实机复测（2026-07-30 继续）

- Obsidian 1.12.7 当前窗口已实际加载最新插件；`.canvas-menu` 中可见 `Create atomic note from canvas selection` 按钮，确认浮动工具栏注入路径已生效。
- 鼠标移到 Canvas 空白处后，Live Preview Callout 抓手保持隐藏；移到 Callout 正文时，抓手没有稳定显示。
- 根因补充：Callout 在 Live Preview 中是独立的 `.cm-embed-block.cm-callout`，与承载源码的 `.cm-line` 为兄弟节点；仅在 gutter marker 创建时给 `.cm-line` 注册 hover 监听，无法覆盖 Callout 渲染块本身。
- 修复方向锁定为 CodeMirror `EditorView.domEventHandlers` 事件委托：同时监听 `.cm-line` 与 `.cm-embed-block.cm-callout`，按对应行的几何位置找到 gutter handle 并切换 hover class；不使用 `:has()`，也不为每次 marker 重建追加长期 DOM 监听器。

## Callout 首行 block ID 修复（2026-07-30）

- 用户确认 PDF Callout 的 block ID 位于首行末尾，例如 `> [!PDF|blue] [[...]] ^2024-07-20-09-41-41`，下一行是没有 `>` 的 lazy continuation。
- `content-segmentation.ts` 的 Callout 分块与 `canvas-reference.ts` 的引用规划已用该精确形状建立回归：最终 `subpath` 必须为 `#^2024-07-20-09-41-41`，且 `blockIdInsert` 未定义，源文件不会追加第二个 ID。
- 拖拽启动时如果编辑器残留一个与当前抓手无关的非空文字选区，之前会优先采用该选区；现在只有当前选区覆盖抓手时才采用多选，否则使用抓手对应的完整块。这保留多块拖拽，同时避免 Callout 首行被旧选区绕开。
- 当前静态验证：`npm.cmd run lint` 0 errors / 0 warnings，`npm.cmd run typecheck` 通过，`npm.cmd run test` 为 8 files / 57 tests 通过；仍需生产构建、部署和 Obsidian 实机复测。

## 设置页与 Surface Pen 侧键（2026-07-30）

- 修饰键设置页改为按动作列出下拉框：Canvas 显示 `Link to source block`、`Create note`、`Do nothing`，Markdown 显示 `Insert source embed`、`Move content`、`Do nothing`；每个动作选择一个修饰键，`Not assigned` 表示继承/未绑定。
- 底层 `canvasBindings` / `markdownBindings` 数据结构保持不变，旧配置无需迁移；当两个动作选择同一个组合时，后选择的动作占用该组合，之前的动作自动恢复为 `inherit`。
- 新增 `surfacePenSideButtonDrag`，默认开启。Markdown 抓手收到 `pointerType === "pen" && (buttons & 2) !== 0` 时仍复用原有 Pointer capture 拖拽；Canvas 原生交互也需要同一输入转换，否则 Canvas 会按右键处理。
- 已检查本机 Obsidian 核心 `obsidian.asar`：Canvas 的 Pixi 入口严格要求 `isPrimary=true`、`button=0`、`pointerType="mouse"`，而空白画布的右键路径明确按 `button=2` 处理。由此锁定 Canvas 侧采用捕获阶段事件桥：阻止原始 pen 副按钮事件，向原始 Canvas target 派发完整的左键 PointerEvent 与 MouseEvent 序列，并在释放后的短窗口抑制 contextmenu；普通鼠标右键不满足 `pointerType="pen"`，不会进入该路径。
- Canvas 桥的 Pointer capture、原始 `mousedown/mousemove/mouseup` 拦截、释放后的 contextmenu 抑制和插件卸载清理均已实现。初次补丁的空值收窄与无效类型断言已修复。
- 当前静态验证：`npm.cmd run lint` 0 errors / 0 warnings，`npm.cmd run typecheck` 通过，`npm.cmd run test` 为 9 files / 61 tests 通过；生产构建、`node --check`、两个发布目录部署和六个文件三方 SHA-256 已完成，Surface 实机验证仍待用户重载后执行。

## Surface Pen Canvas 事件桥诊断（2026-07-30）

- 用户实机确认 Markdown 抓手的 Surface Pen 侧键拖拽可用，但 Canvas 卡片和空白区域均无响应；设置 `surfacePenSideButtonDrag` 已开启，规范源码、标准插件目录和 `plugins-dev/plugin` 的 `main.js` 均为 110,563 bytes 且 SHA-256 一致，因此当前问题不是设置或旧 bundle。
- Obsidian 1.12.7 的 Canvas 拖动辅助函数会从初始 PointerEvent 的 `event.view` 注册后续 `pointermove`/`pointerup` 监听；当前 `dispatchCanvasPointerEvent()` 创建合成 PointerEvent/MouseEvent 时没有传 `view`，构造器默认得到 `null`。这会让 Canvas 拖动状态机在按下后无法建立后续监听，是当前首要根因。

## Surface Pen Canvas 事件桥实施（2026-07-30）

- 已在合成 Canvas PointerEvent/MouseEvent 中补齐目标窗口 `view`，并将事件监听提升到对应 owner window 的捕获阶段；Canvas 卡片和空白区域分别路由到 `.canvas-node-container` 与 `.canvas-wrapper`。
- 卡片使用合成左键语义，空白区域使用合成中键语义以进入 Canvas 原生平移路径；Pointer capture、pointerup/pointercancel 配对和释放后的 contextmenu 抑制均在同一 Canvas 文档内处理，普通鼠标右键不受影响。
- 代码验证已完成，但 Canvas 私有交互仍需用户在 Obsidian 中实机确认；不能把系统级 Windows Ink 右键圆圈的消失作为网页层可绝对保证的结果。
- 当前测试只覆盖 `pointerType === "pen" && (buttons & 2) !== 0` 的纯分类判断，没有覆盖合成事件初始化、Canvas 目标路由、capture 和后续事件生命周期。
- 现有桥在 `document` 捕获阶段监听；Canvas/Pixi 还会在 owner document 的捕获阶段监听 pointermove，事件顺序可能使原始笔右键先进入 Canvas。修复应将入口提升到对应 owner window 捕获阶段，并继续使用 `registerDomEvent()` 自动清理。
- 当前原始 target 不保证是 Canvas 交互入口：Canvas 空白左键拖动要求 targetNode 正好是 `.canvas-wrapper`，卡片拖动应稳定落到对应 `.canvas-node-container`。桥接目标需要按“卡片/空白”归一化，不能直接派发到任意深层元素。
- Obsidian Canvas 的原生语义是：卡片区域左键拖动，空白区域左键框选，中键/右键平移。因此本次实机验收将卡片定义为左键移动；空白区域采用原生平移语义，避免把“拖动画布”误实现成框选。普通鼠标右键仍必须保持原样。
- Canvas 相关 DOM 拖动入口未发现 `isTrusted` 前置拒绝；只有在补齐 `view`、目标归一化和 Window 捕获后仍失败，才进入直接调用私有拖动控制器的后备方案。

## Larger touch handles 设置（2026-07-30）

- 将原先固定的 coarse-pointer 44 x 44 抓手改为 `largeTouchHandles` 设置，默认开启以保持既有 Surface 触控行为；关闭后恢复普通尺寸，但触控环境仍保持抓手可见并保留 `touch-action`。
- 开关通过 workspace 主文档和已打开叶子的 owner document body class 生效，设置保存后立即刷新；新打开的 Obsidian 弹出窗口也会同步，不依赖重载。

## Canvas 原子笔记按钮设置（2026-07-30）

- 新增 `canvasSummaryButton` 设置，默认开启；关闭时移除所有已注入的 `.canvas-menu` 浮动按钮，开启时重新扫描并注入现有工具栏。
- 命令面板的 `Create atomic note from canvas selection` 始终保留，作为按钮关闭或私有工具栏注入失败时的稳定兜底入口。
- `CanvasSummaryFeature.refresh()` 由设置保存流程调用，切换无需重载；MutationObserver 继续负责后续 Canvas 工具栏重建。

## 用户新增回归与阶段 8.7 收口决策（2026-08-09，仅规划）

### Callout 抓手的正文对齐

- 当前普通块使用 inline widget，Callout 使用 CodeMirror `GutterMarker`；gutter 的实际最小宽度使其锚定在编辑器外侧，页边距变宽时不会跟随正文内容起点。
- 保留现有 Callout gutter、lazy-continuation 分块和共享拖拽事件，不改成 pointer-only 或全局 DOM 监听。执行时增加按 `EditorView`/owner document 管理的几何适配：以当前可见 Callout 行的内容坐标为锚，给 marker/零宽 overlay 设置可重算的横向偏移，使其与普通 inline handle 在 `handlePosition` left/right 下共用同一正文列。
- 几何刷新必须覆盖 viewport/geometry 变化、编辑器滚动、宽度变化、主题/RTL、嵌套 Live Preview 和弹出窗口；使用 view 的 owner window/document，清理时解除 observer/animation frame。粗指针的 44×44 命中区、hover/focus 可见性和键盘/ARIA 语义保持不变。

### 缺失 block ID 的行末写回

- `ensurePlannedReference()` 当前对未显式指定 inline 的复杂块默认生成 `\n^id`。新的 placement resolver 以“当前逻辑块最后一个非空内容行的行末”为首选插入点，并在写入前只移除该行尾部空白，不另起 marker 行。
- 普通段落、单/多行列表项、引用和 Callout（包括首行带语法、后续无 `>` 的 lazy continuation）默认使用 ` ^id` inline；已有 inline/standalone ID 原样复用，绝不重复追加。Callout 的 ID 归属仍优先使用 opening line/现有逻辑块 ID。
- fenced code、math、table 等 inline 会改变语法或 Obsidian 识别范围的块，以及显式 `blockIdPlacement: "standalone"` 的 native-subtree 列表父项，保留 standalone 作为安全例外；该边界要以测试证明并写入 README，不能静默破坏结构。若后续确认这些语法也要求 inline，再单独调整决策，不在本批猜测。
- 规划和批量倒序插入必须继续保证多块 offset 不漂移；Canvas、Markdown→Markdown、原子笔记和 editable embed 的 block ID 定位都复用同一 placement 结果。

### 同文件与跨文件 Markdown 动作设置

- 新增独立 `sameMarkdownBindings`（八个 `ModifierChord`），保留 `markdownBindings` 作为跨 Markdown/文件目标的兼容存储字段。两组默认均为 `none = embed-source`、`primary = move`，其余为 `inherit`；Canvas 与 touch action 不改变。
- 设置 schema 递增时，旧数据没有 `sameMarkdownBindings` 就深拷贝旧 `markdownBindings`，非法动作/缺失 chord 回退默认值；两组绑定各自执行“一个 chord 只能占一个动作”的冲突清理，不能互相清理。
- 设置页按“Markdown → 同一文件”和“Markdown → 不同文件/文件目标”分别列出 Embed、Move、Do nothing 三个动作的 modifier 下拉框，覆盖无修饰键、Ctrl/Command、Shift、Alt 及全部组合，并明确显示当前默认值。
- 动作解析上下文由规范化源/目标 `TFile.path` 决定，而不是 `EditorView` 实例：同文件分栏走 same-file；不同文件、文件树和内部链接走 cross-file。dragover/drop 缓存必须同时带 context、源/目标 path、owner document 和 modifier chord；目标切换或修饰键改变即重新解析，避免沿用旧动作。

### 同文件 Ctrl/Command Move 的 selection 与视图不变式

- 在同文件 Move（包括用户把 Ctrl/Command 绑定到 Move 的情况）提交前捕获源 `EditorView` 的完整 selection ranges、焦点状态、`scrollDOM.scrollTop/scrollLeft` 和 owner window。该快照也作为异常/rollback 的恢复基线。
- 优先把结构化 move 结果落实为一个精确 CodeMirror changes transaction；若仍需从 planner 结果生成变化，则用 `mapPositionAfterMove()`/`mapPositionAfterRemovals()` 映射每个 anchor/head，dispatch 时显式传入 selection，禁止整篇替换触发默认首行 selection/scroll。
- 提交后在同一 owner window 的 measure/animation frame 中恢复滚动（按新 scroll 范围 clamp）和原焦点；原光标在被移动块内时随块映射到目标位置，块外时只做删除/插入 offset 映射，不强制跳到文首或抢焦点。不同分栏仍只写源 view，不能给目标 view 额外聚焦。
- 任何 preflight 失败、用户取消、事务异常或 rollback 都必须恢复 selection、scroll 和 focus；成功后保留一次 undo 事务。需要覆盖中间位置拖到首/尾、多块/非连续选区、折叠块、同文件双栏和弹出窗口。

### 本轮执行边界

- 本轮只完成只读审查和计划记录，没有修改业务源码、依赖、构建产物或部署目录，也不宣称上述四项已修复。用户明确说“开始执行”后，才按 `task_plan.md` 的 8.7 顺序实施并逐批验证。

## 阶段 8.7 首批实施决策（2026-08-09）

- `sameMarkdownBindings` 已加入设置模型，schema 从 1 升到 2；旧配置缺少新字段时复制旧 `markdownBindings`，两组绑定独立做 modifier 冲突清理。动作解析以 same-file/cross-file context 选择映射，dragover 缓存同时记录 owner document、源/目标路径和 chord 语义。
- 缺失 ID 的 inline placement 统一在行尾空白之前插入 ` ^<id>`，因此正文与 block ID 之间始终只有一个空格；Callout lazy continuation 改为最终逻辑行 inline。代码/数学/表格和显式 standalone 结构仍保留语法安全例外。
- 新增 editor view snapshot，保存 selection ranges、焦点和 `scrollDOM` 横纵滚动；同文件 Move 的整篇事务提交后使用现有 move/removal 映射恢复 selection，并用 CodeMirror `requestMeasure` 恢复滚动，rollback 也恢复快照。
- Callout gutter 保留原有 marker 底座，通过 owner editor 的几何测量和 CSS custom property 平移 marker；使用 WeakMap 抵消上次平移，避免重复 measure 累积偏移。动态样式仅用于视图几何 overlay，颜色/尺寸仍由 `styles.css` 和 Obsidian CSS 变量控制。
- 当前新增纯模型/回归测试覆盖 action migration/context、inline ID 空格与 Callout 末行、selection mapping、Callout gutter offset；定向测试已通过，当前尚未做 Obsidian 实机验收或最终 build/deploy。

## 阶段 7：可编辑块嵌入规划（2026-07-31）

### 用户目标与设置

- 用户要把 Outliner.md 的“在嵌入块中直接编辑，并同步修改原始块”能力加入 DragDrop，并明确要求设置开关控制。
- 设置锁定为 `Editable block embeds` / `editableBlockEmbeds`，默认 `false`。这是会直接写源文件、依赖私有 API 且可能改变大量嵌入交互的高影响能力，不能默认侵入现有工作流。
- 第一版只覆盖 Markdown block embed `![[路径#^block-id]]`。Live Preview 与 Reading mode 支持激活编辑；Source mode 继续显示原始 Markdown。整文件、标题、Canvas file node、backlink、搜索结果、Excalidraw、嵌套 editable embed 与同文件自引用不在范围内。
- 设置切换要求重载 Obsidian。原因不是设置保存困难，而是全局 embed registry patch 和已创建组件的生命周期无法通过公开 API 完整热重建；设置页必须直接写明该要求。

### 实施阶段能力探针（2026-07-31）

- 用户已打开规范 Vault，当前运行窗口确认为 `canvasread-dev / Obsidian 1.12.7`；此前短暂可见的 `Obsidian 1.7.7` 是另一 Vault，未对其进行写入。
- 开发者控制台确认 `app.embedRegistry` 存在，键为 `_` 与 `embedByExtension`；`app.embedRegistry.embedByExtension.md` 是长度为 3 的函数，当前实现形态为 `function(e,t,n){return e.displayMode?new dq(e,t,n):new lJ(e,t,n)}`。
- 当前探针仅读取 registry 和函数元数据，没有调用 creator、修改 registry、修改编辑器或写入 Vault；控制台中已有 Advanced Canvas 的 JSON 解析错误，与本次探针无关，后续不得把它误判为本插件错误。
- 用户重新打开最新版窗口后，按 `list_windows()` 返回的实际进程句柄完成只读复核；窗口标题为 `canvasread-dev - Obsidian 1.12.7`，不是之前误选的旧 Vault/旧版本窗口。
- 临时容器调用 `app.embedRegistry.embedByExtension.md({ app, containerEl }, null, "")` 成功返回原生 Markdown embed 实例。实例构造器名为 `t`，拥有 `editable`、`showEditor()`、`loadFile()`、`unload()`、`file`、`subpath` 和 `containerEl` 等字段/方法；把 `editable` 设为 `true` 后调用 `showEditor()` 会创建内部 `editMode` 与 CodeMirror editor，再调用 `unload()` 可清理。当前 `#^block-id` 的原生容器为 `.internal-embed.markdown-embed.inline-embed.is-loaded`，其 `cmView` 具备 CodeMirror widget 的 `ignoreMutation`、`ignoreEvent`、`isEditable` 等接口。
- 结论：选择“包装原生 Markdown embed/editor”的最小实现路径。探针只证明私有组件可创建、编辑和卸载，不证明其默认保存足够安全；后续仍必须由本插件接管目标 block 的写回、ID 保护和冲突校验，并保留 creator 失败时的原生回退。

### Outliner.md 事实核对

- Outliner 的 `editableBlockEmbeds` 默认开启，插件 onload 时才执行 `patchEmbedView()`；设置页在切换后显示 Reload，因此它同样没有承诺热切换。
- 它用 `monkey-around` patch `app.embedRegistry.embedByExtension.md`，只在 `showInline` 上替换 Markdown embed，并用 `has-embedded-editor` 避免同一容器重复创建。
- `EmbeddedEditor` 读取整篇文件，创建一个基于 Obsidian 私有 Markdown editor 原型的完整 CodeMirror 编辑器，再通过 decoration 隐藏目标 range 外的内容。外部文件变化通过 metadata cache 事件回填编辑器。
- 它的保存路径以约 400ms debounce 调用 `vault.modify(file, fullDocumentText)`。这个整篇快照覆盖策略不能照搬：源文件同时在普通编辑器、另一个嵌入或 weread 重建链路中变化时，会覆盖较新的内容。
- 它通过 block ID decoration 与 transaction filter 限制删除 ID，并在新版中补过重复实例、loadFile 兼容和卸载问题；这些变更说明生命周期、ID 不变式和私有 embed 协议是主要风险区。
- Outliner.MD 当前许可证为 FSL-1.1-Apache-2.0。本项目仅把它作为行为与 API 研究材料，后续代码和 CSS必须独立实现。

### 独立实现方案

- 先做无写入能力探针：以临时容器调用当前 Obsidian 1.12.7 的 Markdown embed creator，确认 creator 参数、返回组件、`loadFile`/`unload`、`editable`/`showEditor`、subpath 可见范围和 owner realm 行为。
- 优先路径是包装原生 embed/editor，因为它最可能保留 Obsidian 的 Live Preview、快捷键、主题和插件兼容性；若原生 widget 无法把保存收口到目标 block，改用只承载单个 block 的最小 CodeMirror 6 编辑器。无论哪条路径都不引入 Outliner 的完整 EditorBuilder/Factory/Strategy/extension 系统。
- `EditableBlockEmbedFeature` 负责可逆 registry patch、能力守卫和原生回退；私有类型集中在单独 adapter，禁止在业务模块散布 `any`。
- 默认状态继续使用 Obsidian 原生 embed renderer。hover 或键盘 focus 时出现 Lucide `pencil` 图标，按钮有 tooltip、ARIA label、Enter/Space 支持和 `:focus-visible`；只有激活的单个 embed 才创建编辑器，Escape 或失焦后 flush 并恢复渲染。
- block 编辑模型必须包含完整目标 block 和原 ID。ID 可用 decoration 隐藏/替换显示，但 transaction filter 和最终保存校验都必须拒绝删除、移动或改名；特别覆盖 inline ID、standalone ID、列表 ID、引用/Callout 首行 ID及 lazy continuation。
- 写回前从“最新”源内容重新按 block ID 定位。若源文件已有普通 Markdown EditorView，使用该 view 的 transaction 保留内存内容与 undo；否则用 `vault.process()` 原子处理后台文件。禁止 `vault.modify()` 写回打开时的整篇快照。
- 每个编辑实例保存 `lastSyncedBlock`。当前源 block 与基线不一致时视为并发冲突：不写入、不自动合并、不覆盖，保留用户输入并提示重新载入。文件 rename 可跟随 TFile；delete、weread 删除重建、ID 消失和只读/写入错误必须进入禁用状态。
- 成功写入后通过 vault/metadata 事件刷新同一 block 的其他实例；自身写入用 revision/fingerprint 抑制回环。多个实例同时编辑时，先成功者更新源，后提交者因基线不匹配被拒绝。
- 不增加文件夹限制。开关开启后可以修改任何目标块，包括 `Capture/`；README 与设置描述必须明确“直接修改原始块”，由用户决定是否在档案笔记中使用。

### 阶段 7 实施复核（2026-07-31）

- 最后一组生命周期修补已落盘：外部修改按最新源文本重新定位 block，原生编辑器恢复统一调用 `loadFile(file)`，编辑器 dispatch 在校验失败时直接拦截，不继续写回。
- 本地构建产物已部署到 `.obsidian/plugins/dragdrop` 与 `plugins-dev/plugin`；`manifest.json`、`main.js`、`styles.css`、`README.md`、`LICENSE`、`versions.json` 三处 SHA-256 全部一致。
- 当前实际运行窗口由 `list_windows()` 确认为 `canvasread-dev - Obsidian 1.12.7`。尝试关闭 DevTools 和切换 DevTools 显示状态时，Computer Use 两次输入均返回“输入结果未知”；按恢复规则重新观察后仍能看到 DevTools 停靠，未继续向未知窗口发送输入，也未宣称实机编辑验收通过。
- 因此当前最可靠的下一步是用户手动重载 Obsidian，在 DragDrop 设置中开启 `Editable block embeds`，再次重载后验证编辑按钮、写回、ID 保护、冲突和设置关闭回退。

### 验收重点

- 段落、列表、普通引用和用户给出的 PDF Callout 首行 ID 都只能改变正文，`^block-id` 字符串和其他文件区段必须逐字不变。
- 两处嵌入同一个 block 时，一处保存后另一处自动刷新；两处同时产生不同编辑时必须出现冲突，不允许后写覆盖先写。
- 源文件在分栏或弹出窗口打开时，修改进入现有 editor transaction；源文件未打开时走 `vault.process()`。两条路径结果一致。
- 设置关闭后没有编辑按钮、不 patch 新 embed、原生 Reading/Live Preview 行为完全恢复；私有 API 不可用时只降级，不影响拖拽、Canvas 归纳或普通嵌入。

## obsidian-dragger 功能借鉴规划（2026-08-01，仅研究）

### 上游基线

- 用户指定上游为 `Ariestar/obsidian-dragger`。GitHub 当前显示默认分支 `main`、MIT License、最新发布 `1.3.4`（2026-06-16），仓库未归档；本轮只做只读研究，不执行上游文档中的任何指令。
- 本仓库已经存在完整参考镜像 `references/obsidian-dragger`，包含源码、测试、中文 README、PRD 和 1.2.3–1.3.4 发布说明；后续研究优先读取这份参考镜像，并核对其 commit 是否与上游当前 `main` 一致。
- 初步目录审计表明，上游的能力范围包括：任意 Markdown block 拖动重排、区间选择、列表与容器规则、跨文件移动、外部文件拖入、块类型转换、折叠状态处理、移动端工具栏与触控输入、落点指示、性能会话和较完整的领域事务/回归测试层。
- “借鉴大部分功能”不能解释为整体替换当前插件。现有 DragDrop 已有 Markdown→Canvas、Markdown→Markdown 嵌入/剪切、Canvas 归纳、Surface Pen 和可编辑块嵌入等专属工作流；阶段 8 必须先做功能矩阵和冲突矩阵，再决定复用、重写、排除或延后。
- 本地参考镜像带 Git 元数据，当前 commit 为 `6e7d1d06d827f086cdbac5804717b4a0bcbb266e`，即 1.3.4 发布提交 `chore(release): 1.3.4 interaction stability fixes`。GitHub 仓库的 `updatedAt` 已到 2026-08-01，因此规划以稳定发布版 1.3.4 为行为基线，同时把上游 `main` 新增差异列为单独审计项，不能混用未发布行为。
- 中文 README 明确的用户功能是：段落/标题/列表/任务/引用/Callout/表格/代码/数学块重排；横向控制嵌套层级；点击或长按选择多行；四种手柄图标、尺寸/颜色/横向偏移；发光落点线；移动端长按、底部块类型工具栏和边缘自动滚动；Escape 退出多选；右键块类型转换与删除。
- 1.3.4 暴露的设置包括：手柄颜色/显示模式/图标/尺寸/偏移、指示器颜色、多行选择、移动端文本长按、跨文件拖拽、拖拽源视觉样式、源高亮和列表落点高亮。`src/plugin/settings-types.ts` 的真实默认值是跨文件拖拽开启、移动端文本长按开启；README 的“默认关闭”说明已过时，规划与测试均以源码默认值为准。
- 上游还发布 MIT 的平台无关 `md-dragger` core，稳定入口分为 `domain`、`drag`、`markdown`。阶段 8 需要比较“直接依赖 npm core”“移植其纯领域模型”“仅参考行为独立实现”三条路径，禁止直接把其 Obsidian/CodeMirror 平台层整体嵌入当前插件。

### 发布演进与架构边界

- `git ls-remote` 确认上游 `main` 当前仍是 `6e7d1d0`，与本地参考镜像一致；GitHub `updatedAt` 的变化不是新的源码 commit。因此阶段 8 可以直接以本地 1.3.4 源码作为当前上游基线。
- 1.2.3–1.2.6 依次解决移动端长按、文档末尾插入、跨文件移动、Gutter 手柄、多块删除、范围选择、列表 marker 与折叠状态保存，并逐步把热点路径拆成领域/平台模块。
- 1.2.7 是决定性架构变化：上游删除原生 HTML5 drag/DataTransfer/ghost，所有桌面与移动端拖拽统一走 Pointer routing。当前 DragDrop 的鼠标 HTML5 路径承担跨原生弹出窗口拖拽，不能为了追随上游而直接删除；阶段 8 必须保留“双窗口鼠标链路”作为回归硬约束。
- 1.2.8 增加桌面 Escape 退出多选、选中 handle 的 checkbox 外观、移动端 selection 模式下临时关闭 `contenteditable`、插件控制的边缘自动滚动，以及块类型菜单中的删除操作。
- 1.3.0 把整体架构定型为 `domain`（纯 Markdown/命令）、`drag`（pipeline 生命周期）、`platform`（CodeMirror/Obsidian 输入、预览、transaction）；同时完善折叠块、跨文件目标和块类型转换。该分层思想值得借鉴，但当前插件不应在一个阶段内整体重写已有 Canvas/Markdown 双目标管线。
- 1.3.2 把设置页拆成 Appearance/Behavior Tab，加入移动端拖拽长按时长、桌面范围选择长按时长、自动滚动边缘距离和最大速度；发布说明称跨文件拖拽默认开启，而中文 README 表格称默认关闭，后续以 `DEFAULT_SETTINGS` 源码为唯一事实来源。
- 1.3.4 主要是多选短按/长按仲裁、滑动刷选、渲染块垂直边界、空行导致选中手柄消失、移动端拖拽模式和自动滚动设置生效等稳定性修复。这些历史回归应直接转化为阶段 8 验收用例，而不是只移植最终 UI。

### 源码规模与审查策略

- 上游测试与源码同置于 `src/**/*.spec.ts`，没有独立 `tests/` 目录。核心纯领域模块规模可控，但 `pipeline-adapter.ts`（约 1100 行）、`drop-target-resolver.ts` / `list-drop-target-resolver.ts`（各约 480 行）以及范围选择测试（约 3300 行）高度耦合平台细节，不能作为首批整文件移植对象。
- 阶段 8 的审查顺序锁定为：先读纯领域 transaction/rules/mutation 与 pipeline reducer，再读 CodeMirror drop resolver、输入适配和 Obsidian 文件事务；对超大 platform 文件按职责和调用链分段，不以文件大小驱动整体照搬。

### Headless core 与 pipeline

- `md-dragger` 的公开 npm exports 确实只暴露 `domain`、`drag`、`markdown` 三个无平台入口，`sideEffects=false`；架构测试强制 domain 不导入 Obsidian/CodeMirror，drag 不出现 DOM、事件、坐标或 transaction applier。这一层可以作为设计参考或依赖候选，但不能证明其 Obsidian platform 层可直接复用。
- 上游 pipeline 是纯状态机：`idle → holding → ready_to_drag → selecting/dragging → idle`，输入只发送语义事件，输出只发 `selection_changed`、`drag_over`、`command_ready`、`terminal` 与生命周期事件。它通过 `guardDeps` 处理 editor/window 失效，并在短按取消时恢复先前被保留的多选。
- 当前 DragDrop 已有跨窗口 HTML5、Pointer、Canvas 和 Markdown 两类落点，若直接把所有入口改接上游 pipeline，回归面过大。阶段 8 应先借鉴“单一语义状态机 + 平台输出执行”的边界，把新加入的文档内重排、多选和块菜单放入独立协调器；现有 Markdown→Canvas 与跨弹窗路径先作为适配器接入或保持旁路，等行为基线稳定后再决定是否统一。

### 领域事务与现有语义冲突

- 上游 `move-blocks` 先把不连续多选归一化为多个 segment，保存原文 payload，再一次规划插入与所有删除；同文档会校验自交叠，跨文档使用 `insert-only`，后续由平台层完成源删除。事务还输出“恢复折叠状态”和“有序列表重编号”effect。这一设计适合借鉴为阶段 8 的结构重排事务核心。
- 上游多选不是任意字符选区，而是 `BlockSelection` 的若干完整行范围；相邻块合并为 segment，非相邻块保留顺序并在插入时用换行连接。Delete、Copy、Cut 和 Move 应共用同一 selection snapshot，避免菜单与拖拽各自重新解析范围。
- 与当前插件存在明确手势冲突：当前 Markdown→Markdown 已锁定“无修饰键嵌入、Ctrl/Cmd 搬移”，而 Dragger 默认无修饰键结构移动。锁定不改变阶段 6 默认值，也不新增优先级 handler：所有 Markdown 落点仍先由现有 action binding 唯一解析；只有解析结果为 `move` 时才启用结构重排、列表 child/sibling/outdent 和事务删除。用户若想获得 Dragger 原版无修饰键重排，可在现有“按动作选择修饰键”设置中把 `Move content` 绑定为 `No modifiers`，冲突处理会自动重新分配 `Insert source embed`。
- 上游 ordered-list 重编号从同缩进/同 quote depth 的连续区域重新从 1 编号。该行为可能改写用户手工编号，阶段 8 不应无条件照搬；建议第一版做独立设置，默认关闭，先只保证被移动文本的 marker 原样保留。

### Markdown 规则、列表层级与转换

- 上游列表横向拖动不是单纯加减空格：drop target 先产出 `sibling | child | outdent` 与目标 indent width，mutation 再按目标列表样本调整所有子行缩进，并阻止把列表嵌入自身。这一“意图解析与文本变换分离”的模型值得融合。
- 上游 container policy 会拒绝把非列表塞进列表内部、非引用塞进引用 run、落在 Callout 结尾、表格前或水平线前等危险位置。规则目标正确，但当前表是硬编码拒绝矩阵，阶段 8 需要用当前插件已有内容切分语义做回归后再采用，不能把所有拒绝直接复制为用户不可理解的“无效落点”。
- 上游 block detector 会排除 YAML frontmatter，识别标题章节、列表子树、代码/数学围栏、表格、引用和 Callout，并带 per-document cache；但它对 Callout 容器只沿连续 `>` 深度扫描，不能覆盖本项目已修复的“首行 Callout + 无 `>` lazy continuation”样本。阶段 8 必须复用或抽取当前 `content-segmentation.ts` 的 Callout 边界，不得用上游 detector 覆盖现有语义。
- 块类型转换的纯 planner 可覆盖 Paragraph、H1–H6、无序/有序/任务列表、Quote、Code、Math，并能拆/换 fenced block。该能力适合较早落地，但实施时必须新增 block ID 不变式：转换前后现有 inline/standalone/Callout 首行 ID 逐字保留；无法安全表达的 Callout、表格、水平线应禁用对应转换项，而不是尝试猜测。
- Copy/Cut/Delete/Convert 必须应用单个 CodeMirror transaction，天然进入 Obsidian undo；Delete 和 Cut 不新增二次确认，但菜单需明确名称，且多选时作用于整个 snapshot。任何无法规划为完整 transaction 的操作整体拒绝。

### 当前 DragDrop 的承载边界

- 当前 `DragSessionManager` 已约 1335 行，同时负责 HTML5、Pointer、Surface Pen Canvas 桥、Canvas/Markdown 命中、动作解析、事务、ghost、落点线和清理。直接把 Dragger 的多选、自动滚动、横向层级与菜单继续塞进该类，会使两套状态互相覆盖且难以验证。
- 阶段 8 的第一个代码批次必须是有行为等价测试保护的职责抽取：保留现有 manager 作为跨窗口/跨目标 orchestration，把“同文档结构拖动 session”“块选择 snapshot”“drop preview”“Markdown transaction planner”拆为独立组件。该抽取不得改变阶段 6/7 行为，也不得先做全量 rewrite。
- 当前项目只有 10 个测试文件，主要覆盖纯模型；上游对 input/pipeline/drop resolver 有大量交互契约测试。阶段 8 应先建立可测试的 editor adapter 接口与事件仲裁测试，再添加 UI 功能，否则现有 1335 行管理器中的事件竞争无法靠实机一次性排查。

### Platform 层可借鉴与不可照搬部分

- 精确落点视觉由 `DropResolution` 同时携带 indicator line、line rect 和可选目标高亮，按 animation frame 渲染；这比当前仅一条分界线更适合列表 child/sibling/outdent 反馈。当前实现使用全局 `activeDocument/window` 和静态 instance 集合，阶段 8 必须改为每个 editor owner document 的组件生命周期，不能直接复制。
- 边缘自动滚动算法很小：根据指针进入上下 edge zone 的深度线性计算速度。可作为独立纯函数早期融合，并在滚动后强制重新解析落点；设置保留 edge zone 与 max speed 两项，数值必须 clamp。
- 上游“拖到文件树文件或内部链接”会把所选块追加到目标文件末尾，是值得融合的跨文件入口；但其实现先写目标再删源、没有 rollback/并发基线，也把所有目标都追加到末尾。当前插件已经有跨文件失败回滚和整体事务约束，阶段 8 只能复用目标识别，不复用写入器。
- 跨文件目标建议分两类：开放编辑器仍支持精确行落点；文件树/内部链接作为“追加到文末”的显式目标并高亮。两类最终都走同一个 move transaction coordinator，禁止各自删除源内容。
- 折叠状态只需支持标题与列表：移动前记录块内已折叠行的相对 offset，提交后恢复。上游通过私有 DOM class + `editor.exec('toggleFold')` 实现，适合作为晚期增强并带能力守卫；失败只丢失折叠状态，不能回滚已经成功的文本移动。

### 精确落点与列表横向意图

- 上游落点解析先排除表格单元格，再处理 rendered embed 上下半区，最后按视觉行中点算垂直边界；随后依次执行 container rule、list intent、自范围校验和几何预览。该顺序应保留为阶段 8 的 resolver pipeline，避免“先画线、drop 时才发现无效”的反馈跳变。
- 列表横向意图以指针 `clientX` 相对 marker/content 起点计算，并把目标缩进限制在“前一项最多深一层、后一项最多浅一层”的合法区间；child 目标还高亮父项整棵子树。这个行为比简单按水平位移阈值可靠，计划作为 8.1 的核心验收。
- Resolver 对同 editor 与 cross editor 显式区分，自范围/自身嵌套校验只在同 editor 生效。当前插件还需再区分“同文档不同 editor view”，因为同一文件可分栏打开；document identity 应用规范化 file path + transaction version，而不能只比 EditorView 实例。
- 阶段 8 的落点反馈至少包含：普通 insertion line、列表父项高亮、非法位置隐藏/拒绝原因；不移植上游整套性能 telemetry UI，但保留 resolver cache 和可在测试中注入的计数器，以防长文档 pointermove 每帧全量扫描。
- 上游现有 resolver 测试已经覆盖普通落点、容器拒绝、列表上方、表格单元格、自范围、跨 editor、无几何锚点、文末空行、重复命中 cache 和 HR rendered-line 命中。阶段 8 可将这些转成兼容测试基线，并额外补当前项目特有的 Callout lazy continuation、同文件双分栏、已有 block embed 与 Markdown→Canvas 竞争。

### 多选与输入仲裁

- 上游多选实际包含三套交互：桌面 handle 长按进入范围选择/刷选、已选 handle 再拖整组；移动端长按进入 selection mode，并用上下 resize handle 调整范围；Escape 清除桌面选择。其 3000+ 行交互测试说明这是独立子系统，不应与基础重排同批交付。
- 当前鼠标必须保留原生 HTML5 drag 才能跨 Obsidian 弹出窗口，因此不能照搬上游“所有鼠标也改 Pointer”的做法。推荐仲裁：handle pointerdown 只启动 500ms 多选计时器且不 preventDefault；原生 `dragstart` 一旦发生立即取消计时器并进入现有 HTML5 路径；计时器先到则临时禁用该 handle 的 native drag，进入范围选择，结束后恢复。Shift+点击作为无等待的桌面多选入口。
- 触控/笔继续走现有 Pointer capture 路径。阶段 8 移动端 selection mode 必须后置，并复用现有 Surface Pen、`Larger touch handles` 与 touch action 设置；不能再建立第二套 document 级 pointer listener。
- 上游 input guard 会在移动 selection/drag 时临时把 `.cm-content` 设为 `contenteditable=false` 并抑制滚动/焦点。该做法可能打断阶段 7 的可编辑块嵌入；本项目必须在 editable embed 编辑状态、输入控件、Canvas 内嵌编辑器和表格单元格中拒绝启动结构拖拽，且只在真正 gesture active 时抑制滚动。
- 第一版桌面多选范围建议覆盖：Shift+handle 连续范围、长按后纵向刷选、点击已选 handle 取消、拖已选 handle 移动全部、Escape 清除。非连续 add/remove 可以保留，但移动端 resize handles、长长按追加与底部工具栏放到 8.6。

### 块菜单、设置与移动入口

- 上游块菜单提供 Paragraph、Heading、List、Quote、Code、Math，以及 Copy/Cut/Delete；移动端另注册“修改块类型”“选择多个块”“切换拖拽模式”三个命令。功能范围适合借鉴，但其自制悬浮子菜单使用全局状态、手工 document listener、全局 `window` 和 DOM 查询，生命周期/弹出窗口/键盘可访问性不符合本项目标准，必须重新实现。
- 桌面入口计划为“右键 handle 打开原生 Obsidian Menu”；移动端通过命令与 view action 进入，不拦截普通正文长按菜单。菜单对多选显示“Copy/Cut/Delete selected blocks”，对单块显示块类型转换；不在编辑中的 editable embed、Canvas 内嵌编辑器或表格单元格中出现。
- 上游把 20 多个选项全部公开；用户此前已反馈本插件设置页混乱，所以“借鉴大部分功能”不等于复制全部设置行。设置页应按 `Core behavior`、`Selection`、`Appearance`、`Mobile and pen`、`Advanced` 分组，先给功能开关，再仅在启用时显示相关细项。
- 建议新增阶段 8 总开关 `Structural Markdown moves`（默认开启；仅增强已解析为 `move` 的动作，不改变修饰键默认值）以及子开关：`Multi-block selection`、`Block type menu`、`Cross-file file targets`、`Edge auto-scroll`、`Preserve fold state`、`Mobile block interactions`。外观项只保留 handle visibility/icon/size/offset 与 indicator color；源高亮和列表目标高亮作为两个开关，避免引入更多近义选项。
- 上游 schema migration + numeric clamp 值得直接借鉴其模式。当前 `mergeSettings` 应在 8.0 升级为显式 `schemaVersion` 迁移，但只迁移本项目字段，不把上游默认值或字段名原样灌入。数值设置统一 clamp，旧用户配置不被重置。
- 上游 Cut 的安全顺序是“clipboard 写入成功后才删除”，这一点应保留；但要使用目标 window 的 clipboard capability/fallback，不能依赖全局 `navigator`。Copy/Cut 对多选按视觉/文档顺序输出原始 Markdown，块之间保持一个换行，不自动改写为引用。
- 本项目需额外执行 block ID 安全策略：同文件 `reorder` 保留文件路径和 ID，不弹确认；跨文件 move、Cut、Delete 若包含已有 block ID，必须复用确认对话框明确提示引用风险；Convert 必须保持 ID 原样，否则拒绝。完整 `![[...#^id]]` 块默认只允许 Copy/Cut/Delete，不提供类型转换。

### 手柄与视觉融合策略

- 上游把所有手柄统一放入 CodeMirror gutter，并用 controller 根据指针纵坐标解析当前 block；当前插件普通块使用 inline widget、Callout 使用 gutter marker，且该混合方案已经过用户多轮实机修复。阶段 8 不应为了外观统一替换手柄渲染底座。
- 外观功能应建立在当前 handle DOM 上：图标、尺寸、横向偏移、hover/always/hidden、颜色和落点线颜色用统一 CSS 变量；Callout gutter 与普通 inline handle 共用同一设置。`Larger touch handles` 继续只控制命中区，不与视觉 handle size 混为一项。
- `Handle position: left/right` 会改变 gutter/inline 布局并影响主题、RTL 和 Callout，放在 8.5 单独实机验证；第一批不作为基础重排阻塞项。拖拽源高亮按首/中/尾行加 class，rendered embed 单独加 class，避免文字 selection；离开 drag/selection、editor unload、窗口关闭时必须完整清理。
- 上游大量视觉代码仍依赖 `activeDocument`。本项目所有 handle、菜单、overlay、indicator 与 CSS class 应绑定 `view.dom.ownerDocument` / `ownerWindow`，并覆盖主窗口与弹出窗口同时存在的场景。

### 复用路径决策

- 三条路径比较后的推荐是“选择性移植纯模型 + 平台层独立实现”，不把 `md-dragger` 加为运行时依赖。直接依赖的优点是更新方便，但其 detector/transaction 默认语义无法覆盖本项目 Callout lazy continuation、块引用解析、动作绑定和跨窗口 HTML5；为覆盖这些差异仍需大量 wrapper 或 fork，升级风险反而更高。
- 也不采用“只看行为完全重写所有算法”：selection range、list intent、transaction/effect 等纯模型已有大量 MIT 测试，逐个重新发明会增加无价值风险。实施时只移植实际需要的纯函数/类型，并按当前命名与语义改造；平台 input、DOM、菜单、文件写入和 Obsidian adapter 全部独立实现。
- 上游许可证是 MIT，Copyright 2026 Ariestar。若移植实质代码或测试，新增 `THIRD_PARTY_NOTICES.md`（或同等 notices 文件）保留 Ariestar MIT 版权与来源 commit `6e7d1d0`，派生文件顶部注明 adapted from；本项目自己的 MIT LICENSE 保持不替换。README 增加 acknowledgements。
- 不把整个 `references/obsidian-dragger` 打进 bundle，也不修改 reference。阶段 8 每批只移植已在功能矩阵中批准的最小模块，并用当前 TypeScript/CodeMirror 固定版本重新测试。

### 阶段 8 功能矩阵

| 上游能力 | 当前状态 | 阶段 8 决策 | 批次 |
|---|---|---|---|
| 段落/标题/列表/任务/引用/Callout/表格/代码/数学块手柄 | 当前已有，Callout 与 lazy continuation 已定制修复 | 保留当前 detector/handle 底座，补统一 block selection adapter | 8.0–8.1 |
| 同文档块重排 | 现有 `move` 能搬移文本，但没有完整结构语义 | 融合到现有 `move` 动作，不改默认修饰键 | 8.1 |
| 列表 child/sibling/outdent 横向拖动 | 未实现 | 融合 list intent + indent planner，保留 marker 与子树 | 8.1 |
| 精确落点线、目标高亮、非法落点反馈 | 已有普通分界线，缺列表意图/高亮 | 升级为 resolver snapshot；普通嵌入与 move 共用命中，只有 move 计算结构意图 | 8.1 |
| 边缘自动滚动 | 未实现 | 融合，设置可关，滚动后重算落点 | 8.1 |
| 桌面连续/不连续多块选择、刷选、checkbox handle、Escape | 仅支持编辑器原生选区形成多块 source | 融合独立 block selection mode；不改普通文字选择 | 8.2 |
| 拖动已选范围 | 现有 session 能承载多个 SourceUnit | 接入统一 selection snapshot；无修饰键仍多嵌入，move 动作整体搬移 | 8.2 |
| 右键块类型菜单 | 未实现 | 融合原生 Menu，单块转换、多块 Copy/Cut/Delete | 8.3 |
| Paragraph/H1–H6/List/Task/Quote/Code/Math 转换 | 未实现 | 选择性移植纯 planner，加 block ID 不变式与禁用项 | 8.3 |
| Copy/Cut/Delete block(s) | 未实现菜单入口 | 融合；Cut 先复制成功再删，ID 风险确认，单 transaction | 8.3 |
| 跨已打开编辑器精确移动 | 已实现 Markdown drop 与 rollback | 保留并改接统一 transaction coordinator；补同文件双 view identity | 8.4 |
| 拖到文件树文件/内部链接并追加文末 | 未实现 | 融合目标识别；写入仍用本项目原子/回滚路径 | 8.4 |
| 跨原生弹出窗口鼠标拖拽 | 已实现且是硬约束 | 完整保留 HTML5/DataTransfer/ghost，不采用 pointer-only | 全阶段回归 |
| 折叠标题/列表移动后保持折叠 | 未实现 | 延后融合，私有 API 失败只降级视觉 | 8.5 |
| 手柄 icon/size/color/offset/visibility/left-right | 仅大触控抓手开关、固定 grip/位置 | 融合前五项；left/right 单独实机验证 | 8.5 |
| 拖拽源高亮、列表父项高亮、视觉样式 | 部分 ghost/有效态，无完整行高亮 | 融合 class-based 视觉；样式选项保持精简 | 8.1/8.5 |
| 自动重编号有序列表 | 未实现 | 延后且默认关闭，避免改写手工编号 | 8.5 |
| 移动端文本长按、drag mode、resize handles、工具栏命令 | 当前有 touch/pen grip Pointer 路径，无完整 selection mode | 后置融合并默认受 `Mobile block interactions` 开关控制 | 8.6 |
| Surface Pen 侧键与大触控抓手 | 当前独有且已设置化 | 保留，阶段 8 输入层必须复用而非覆盖 | 全阶段回归 |
| 已有 `![[...#^id]]` 视作原始块引用 | 当前独有且已修复 | 保留；允许选择/复制/搬移，不允许类型转换 | 全阶段回归 |
| 可编辑块嵌入 | 阶段 7 已实现待实机验收 | 编辑状态排除结构拖拽；非编辑状态保持原生块行为 | 8.0/全阶段回归 |
| Pointer-only 架构、删除 ghost/DataTransfer | 与当前跨窗口硬约束冲突 | 明确排除 | — |
| 直接依赖完整 `md-dragger` / 整体 platform 移植 | 语义和生命周期不兼容 | 明确排除 | — |
| 性能 telemetry UI、演示站、本地化全套 | 非用户核心需求 | 不引入 UI；只保留内部 cache/counter 测试钩子 | — |
| 非 Markdown 文件目标、搜索、Excalidraw、笔记管理 | 超出 DragDrop 边界 | 明确排除 | — |

### 阶段 8.0 首批实施决策（2026-08-07）

- 事件提交所有权落在现有两个提交入口之前：`DragCommitGate` 以 session ID 为边界，只允许 Canvas 或 Markdown 其中一个 owner claim；重复 `drop`、不同适配器或竞态调用不会再次进入写入逻辑。清理拖拽时释放 claim，新 session 开始时重新建立边界。
- 选区解析从 `DragSessionManager` 抽为纯 `sourceRangesForHandle` adapter，保留原有规则：没有非空编辑器选区时只拖当前手柄；选区命中手柄时保留多 range，并把光标 range 映射回所在 block；选区位于其他 block 时回退当前手柄。
- `DragDropSettings` 新增 `schemaVersion`，旧数据缺失版本按 0 迁移到当前版本；历史 `protectedFolders` 在迁移边界统一丢弃；`nodeWidth`、`initialNodeHeight`、`nodeGap`、`previewWidth` 读取时按现有设置页范围 clamp，动作绑定和其他有效用户值保留。
- 设置页改为 `Core behavior`、`Selection`、`Appearance`、`Mobile and pen`、`Advanced` 五组。固定文件夹输入仅在固定策略下显示，列表父项显示仅在拆分列表项开启时显示；Canvas/Markdown 修饰键仍按“动作选择修饰键”排列，并保留原有存储结构。
- 本批没有复制 Ariestar 的实质源码或测试，只参考其纯模型边界和行为；因此暂不新增 `THIRD_PARTY_NOTICES.md`，上游 MIT 归属决策仍对后续实质移植有效。

### 阶段 8.1 首批实施决策（2026-08-07）

- 结构语义只挂在现有 Markdown `move` 提交入口；`embed-source` 仍只生成嵌入，不会因为目标是列表而改写源内容。新增 `structuralMarkdownMoves` 默认开启，用于关闭列表结构增强而不改变 Move 动作本身。
- 列表意图以拖拽指针在目标行的列位置解析：目标 marker 左侧为 `outdent`（有可退一级时），marker 文本区域为 `sibling`，目标内容区域为 `child`。planner 只调整共同缩进，保留原 marker、任务复选框、子树文本和 block ID。
- `findMoveTargetIssue` 在提交前拒绝源范围、自嵌套，以及 frontmatter、表格行、围栏代码、引用 run、水平线的危险内部位置；当前 Callout lazy continuation 仍沿用现有 segmentation，复杂容器边界和可视化高亮留在 8.1 下一批，不让上游 detector 覆盖当前实现。
- 自动滚动采用独立纯函数计算 edge delta，绑定目标 editor 的 owner window `requestAnimationFrame`；每帧滚动后重新计算 raw position、block boundary、列表意图和非法状态，取消/清理时释放 frame。
- 8.1 收口时保留现有 Callout gutter 与普通 inline handle 底座；拖拽期间直接给当前 editor 的 `.cm-line` 加 source/target class，并让分界线按普通、child、outdent、invalid 状态着色，结束时统一移除，避免引入第二套 CodeMirror decoration 状态机。

### 阶段 8.2 首批实施决策（2026-08-07）

- 桌面 block selection 由 `block-selection.ts` 负责纯 range/key/toggle 规则；`DragSessionManager` 只保存每个 `EditorView` 的 editorState snapshot、anchor 和视觉顺序 ranges。拖拽时只有被选中的 handle 才复用整组选区，未选中的 handle 保持单块行为。
- Shift+handle 立即扩展连续选区；Ctrl/Cmd+handle 在 500ms 原生拖拽等待期间执行非连续 toggle，若 `dragstart` 先发生则取消 toggle 并进入现有剪贴/嵌入动作。长按计时器先到时临时把该 handle 的 `draggable` 关闭，pointermove 在 owner window 上刷选，pointerup 恢复 native drag。
- 选中状态使用现有 handle DOM 的 `aria-pressed`、`dragdrop-handle-selected` class，不替换 CodeMirror gutter/inline 底座；Escape、pointercancel、窗口关闭和 unload 清理 selection pointer，选区本身可保留到用户再次 Escape 或文档变化。

### 阶段 8.3 首批实施决策（2026-08-07）

- 块菜单使用公开的 Obsidian `Menu` / `showAtMouseEvent` / `onHide`，挂到抓手的 owner document；不复制上游全局 DOM 菜单。菜单通过 `blockTypeMenu` 开关控制。
- 转换 planner 只接受能逐字保留 ID 的单块；完整 `![[...#^id]]`、Callout、表格和复杂列表树不提供转换，但仍可 Copy/Cut/Delete/Move。代码/数学 wrapper 会先去除再重建，ID token 重新附在结果末尾。
- Copy/Cut 的文本按文档顺序以原始 Markdown 拼接；clipboard 先尝试 owner window 的 `navigator.clipboard`，再使用 owner document 的隐藏 textarea + `execCommand` fallback；Cut 只有 copy 成功后才调用单 transaction 删除。
- file target 的 destructive move 复用现有 block ID confirmation；菜单 Delete/Cut 使用同一 modal 的 action 文案，所有修改前检查菜单打开期间文档是否改变。

### 阶段 8.4 首批实施决策（2026-08-07）

- 文件树目标识别 `.nav-file-title[data-path]`，正文目标识别 `a.internal-link[data-href|href]`，只接受 Markdown `TFile`；由 `crossFileFileTargets` 默认开启控制。
- 文件目标统一解释为追加到文末：embed 追加每个源块的嵌入，move 追加原始块并从源 editor 删除。写入顺序为先在源 editor 提交、再对目标文件使用 `vault.process` revision guard；目标写入失败时只在源仍等于 sourceAfter 时回滚源 transaction，目标文件变更则拒绝覆盖。
- 本批不把 file target 当作已打开 editor 的 drop target；编辑器仍优先提供精确行落点。相同 source/target path 拒绝，避免把文件树目标误当作同文件双视图 transaction。

### 阶段 8.4/8.5 继续实施决策（2026-08-07）

- 同文件双栏不能把 `EditorView` 实例当作文件身份。Markdown drop 先比较 `TFile.path`，再比较拖拽开始时的 CodeMirror document revision；两个 view 内容一致时只提交源 view，目标 view 依赖 Obsidian 同文件同步，避免一次拖拽产生两次写入。
- 文件树/正文内部链接目标与已打开 editor 目标保持优先级分离：editor 仍支持精确行分界线，文件目标只表达“追加到文末”。file target 的 source editor dispatch 与 `vault.process` 写入由 `runMarkdownTransaction` 统一编排；每个 mutation 在 apply 时再次做 revision guard，失败时反向 rollback 已完成 mutation。
- 当前阶段只承诺单源跨文件事务。桌面非连续多选仍可以来自同一源文件并按一个 mutation 提交；真正多源文件事务需要独立的 source registry 和全量 preflight，留在 8.4 后续批次，不能把单源实现误标成多源完成。
- 折叠恢复采用 CodeMirror 的公开语言层能力 `foldedRanges`/`foldable`/`foldEffect`，只记录折叠行起点，恢复时重新询问目标语法树。私有折叠字段或恢复失败只影响视觉折叠，不影响已经成功的文本事务。
- 手柄视觉只加在现有 inline + Callout gutter 底座之上：`handlePosition` 控制左右布局，`handleVisibility` 控制 hover/focus 与 always；`Larger touch handles` 仍只扩大粗指针命中区，避免把视觉尺寸与触控命中区混成一项。
- 有序列表重编号默认关闭，开启后只应用于 Move 的最终文本，并跳过围栏代码；关闭时 planner 不改 marker，保持当前用户文档逐字不变。
- 本批没有复制 Ariestar 的实质代码或测试，不新增 `THIRD_PARTY_NOTICES.md`。继续实质移植上游实现时，必须在同一批加入 MIT 归属、来源 commit 和派生文件说明。

### 阶段 8.6 首批实施决策（2026-08-07）

- 移动端长按选择必须与现有 Pointer drag 共享同一 `PointerDrag` 状态，而不是再挂一套 document-level listener：pointerdown 先 capture，200ms 内跨过 8px 阈值就直接启动拖拽；计时器先到则切换为 selection mode，后续 pointermove 只刷选 handle，pointerup 清理状态并保留选区。
- `mobileBlockInteractions` 默认关闭，原因是用户已有 Surface/触控路径，必须先保证旧行为不变；开启后仍复用 `multiBlockSelection`、`Larger touch handles`、Surface Pen 开关和原有 cleanup。resize handles 与移动工具栏另批实现，不能在设置说明中声称已经提供。

### 阶段 8.7 收口决策（2026-08-09）

- Callout 抓手继续复用现有 gutter/lazy-continuation 渲染链，仅在 owner editor 的测量阶段计算水平偏移；偏移计算以未变换的 marker 几何为基准，重复测量不会累积。
- Obsidian inline block ID 的规范写回格式锁定为 `正文 ^<id>`：插入点位于逻辑末行尾随空白之前，保证正文和 ID 之间恰好一个空格；代码、数学、表格和 native-subtree 的 standalone 例外不变。
- 同文件动作映射与跨文件映射独立保存；拖拽期间修饰键改变时必须重新解析，不能复用先前 chord 的缓存动作。
- 同文件 Move 的视图快照包括每个 selection range、焦点以及 owner `scrollDOM` 的横纵滚动；映射后若 selection 重叠则合并为合法的 CodeMirror selection。
- 自动化验证和三方发布文件哈希已通过；Obsidian 实机行为仍是未完成验收项，不因构建通过而标记完成。

### 阶段 8.7 最终体验收口（2026-08-10）

- Callout 抓手上一版未生效的直接根因是把 `coordsAtPos()` 放在 CodeMirror `requestMeasure.write` 阶段，运行时抛出 `Reading the editor layout`。最终实现将几何读取与 CSS offset 写入严格拆到 read/write 两阶段，并按普通抓手相对正文的实际左右边缘计算；临时实机诊断中 Callout 左边缘约为 x=336、抓手约为 x=317，确认已从页面最左侧移到正文旁。诊断标题代码已从源码删除，最终 bundle 也已验证不含 `DBG` 或 `document.title`。
- 设置页本地化以 `moment.locale()` 识别 Obsidian 当前语言，原因是 manifest 仍支持 1.5.11，而 `getLanguage()` 需要更高版本。当前完整覆盖英文与简体中文；中文地区代码统一使用简体中文，其他语言回退清晰英文。
- 原 `Do nothing` 容易让用户误解为永久禁用或无反馈，最终显示名锁定为 `Cancel this drop` / `取消本次拖放`，含义是本次 drop 被取消且不修改源或目标。
- 同文件 Move 不改变文件路径或 block ID，因此已有 ID 不再触发引用风险确认；跨文件 Move、菜单 Cut/Delete 等真正可能破坏引用的动作继续确认。
- 用户最终明确只借鉴 obsidian-dragger 的拖拽能力，不需要右键 Convert。所有转换菜单、planner 和测试均已删除；原生块菜单只保留 Copy/Cut/Delete。内部 `blockTypeMenu` 字段仅作为已有 `data.json` 的 schema 兼容键，用户可见名称改为 `Block action menu` / `块操作菜单`。
- 最终质量基线为 ESLint 0 warning、TypeScript 通过、20 个测试文件 / 112 个用例通过、production build 与 `node --check main.js` 通过。六个发布文件在源码、`.obsidian/plugins/dragdrop` 和 `plugins-dev/plugin` 三处 SHA-256 一致；`data.json` 与 `graph-worker.js` 未被覆盖。
- 最终实机重载时 Windows 会话处于锁屏状态，前台进程明确为 `LockApp`。未尝试解锁、重启 Obsidian 或关闭用户工作区；当前旧窗口标题仍是中间诊断 bundle 的遗留状态，不能据此判断最终 bundle 仍含诊断代码，解锁后需重载主工作区再做最终视觉与交互验收。

### 文字选区菜单收口决策（2026-08-16）

- Surface/PDF 文字选区的长右键菜单与块抓手右键的 Copy/Cut/Delete 菜单是两条独立交互，不能复用 `blockTypeMenu` / `Block action menu` 设置。
- 新增单一数值设定 `selectionMenuAutoDismissSeconds`：`-1` 完全不接管，保留 Obsidian 原生行为；`0` 阻止本次有非空文字选区的菜单显示；正数秒数（包括小数）显示菜单，并在鼠标未悬停该菜单时于指定秒数后关闭。悬停取消计时，离开后重新完整计时。
- 处理 Markdown 编辑器和 PDF/PDF++ text layer 中的非空文字选区，在每个 owner document 的捕获阶段监听 `contextmenu`；PDF++ 还需要在 `pointerup` 捕获阶段预先建立观察器，因为它会在 pointerup 后异步创建 `.menu`。不处理手柄、Canvas、设置页或其他插件的菜单。主窗口与 Popout 各自登记，所有 listener、MutationObserver 和 timer 由所属 `Component` 生命周期清理。
- 正值模式只标记本次由选区触发的 Obsidian 菜单，使用作用域化 class 调整半透明显示；定位以 Selection range 的 viewport rect 和 owner window 尺寸计算，优先避开选区下方/右侧，空间不足时回退上方/左侧。关闭仅关闭已标记的这一实例，绝不影响其他菜单。
- 设置模型 schema 从 2 升到 3；默认 3 秒。设置页使用明确中文/英文说明，不使用 Toggle。后续修正保留正数小数秒数（如 `0.7`），超出最大值 clamp 到 `3600`，任意负数统一为 `-1`。

### 文字选区菜单实施结果（2026-08-16）

- 新增纯 `selection-menu-model.ts`：把秒数解析为 native/hide/customize 三种状态，并按 24px 间隔计算选区右下、左下、右上或左上避让位置，最后 clamp 到 owner window viewport。
- `SelectionMenuFeature` 是独立 child `Component`。正值时接管 Markdown 文字选区 `contextmenu` 和 PDF/PDF++ text layer 选区的 `pointerup`/异步 `.menu`；它不会修改块抓手菜单、Canvas 菜单、设置页或普通未选中文字的右键菜单。
- 被匹配的菜单获得唯一 `dragdrop-selection-menu` class，以 scoped CSS 应用半透明背景与 blur。计时器由 owner window 创建；pointer/focus 进入取消计时，离开重新完整计时，到期只移除该菜单 DOM 实例。每个 pending/active observer、animation frame、timer 和 child component 都在菜单关闭、window-close 或 plugin unload 时清理。
- 自动化覆盖 schema 3、`-1/0/正数（含小数）`、数值 clamp、英文/中文文案和四象限/超界定位。最终 lint、typecheck、21 files / 117 tests、production build、`node --check main.js` 均通过；实机仍需确认 Obsidian 当前版本实际使用的 selection-menu `.menu` DOM。

### 文字选区菜单小数秒数修正（2026-08-16）

- 用户要求 `0.7` 秒可用。`selectionMenuAutoDismissSeconds` 不再经过整数化：旧设置加载、设置页输入解析和写回均保留有限正小数；设置页改为 `step=0.1`。
- `-1` 继续表示不接管原生菜单，`0` 继续表示不显示选区菜单；任意负数保存时统一规范为 `-1`，避免出现语义相同但配置值不同的状态。
- 计时器已有 `seconds * 1000` 路径，因此 `0.7` 会传入 `700` 毫秒，无需改变菜单生命周期或 owner-window 清理逻辑。

### PDF/PDF++ 文字选区菜单修正（2026-08-29）

- 用户反馈 PDF++ 选区菜单会在每次摘录后残留并堆积。根因是 PDF++ 在 text layer 的 `pointerup` 后约 80ms 才调用 `showContextMenu`，不一定经过普通 `contextmenu` 事件。
- `SelectionMenuFeature` 现在优先识别 `.pdf-container`、`.pdf-viewer-container` 下的 `.textLayer`，在 `pointerup` 捕获阶段预先观察 owner document 的新 `.menu`，再复用现有半透明、避让定位、hover/focus 暂停和秒数自动关闭逻辑。
- PDF 连续快速选区会保留短暂 pending observer，并在接管新菜单前移除上一实例，避免右键菜单不断残留。`-1` 保留 PDF++/Obsidian 原生行为，`0` 阻止该次选区菜单，正数（含 `0.7`）按设置秒数关闭。
- 已完成 lint、typecheck、117 个测试、production build 和 `node --check main.js`；仍需在实际 Obsidian/PDF++ 窗口复核不同版本的 text layer 与弹出窗口行为。

### Surface Pen Canvas 操控映射（2026-08-29）

- 现有 Canvas 桥接只在 `pen + buttons&2` 时介入，并按落点把卡片转为左键、空白 Canvas 转为中键；因此侧键在空白处会平移，而无侧键笔尖不会进入 Canvas 兼容桥接。
- 本轮锁定用户要求的输入语义：Canvas 中无侧键笔尖始终桥接为中键平移，按住侧键始终桥接为左键选择；侧键命中卡片时派发到卡片容器，命中空白时派发到 Canvas wrapper，以保持原生左键选择/框选。
- 该改动只调整 Canvas 的 `PointerEvent -> synthetic PointerEvent/MouseEvent` 输入适配；Markdown 抓手侧键拖拽、鼠标 HTML5/DataTransfer、跨弹窗和已有 Canvas drop/写入路径不变。
- 侧键设置只门控破坏原生右键语义的侧键接管；无侧键笔尖的 Canvas 平移不受该开关影响。

### 0.1.4 发布（2026-08-29）

- 用户授权后，发布代码以 commit `387edb0` 推送至 `codex/stage-8-dragger-integration`，GitHub tag `0.1.4` 直接指向该提交。
- 正式 Release 为 `https://github.com/Rex-Diego/dragdrop/releases/tag/0.1.4`，不是 draft 或 prerelease，包含 `main.js`、`manifest.json` 和 `styles.css`；三个 GitHub SHA-256 digest 与本地构建逐项一致。

### 0.1.2 发布（2026-08-16）

- 用户授权后，发布代码以 commit `6790d52` 推送至 `codex/stage-8-dragger-integration`，GitHub tag `0.1.2` 指向该提交，正式 Release 为 `https://github.com/Rex-Diego/dragdrop/releases/tag/0.1.2`。
- Release 不是 draft 或 prerelease，包含 `main.js`、`manifest.json` 和 `styles.css`。GitHub 返回的 SHA-256 digest 与本地构建资产逐项一致。
- 默认 Git/gh 网络路径因本地 `127.0.0.1` 代理不可用而失败；仅在单次 Git/GitHub CLI 进程中清除代理变量后直连成功，没有修改系统或全局 Git 代理配置。

### Canvas 卡片文字选区菜单（2026-08-29）

- Canvas Markdown 卡片编辑器使用 `.canvas-node-content iframe.embed-iframe.is-controlled`，选区事件发生在 iframe 自己的 owner document，主窗口捕获监听无法直接收到。
- Obsidian 1.13.7 的 `Menu.showAtMouseEvent` 会通过 iframe frame geometry 将坐标换算到外层窗口，并把 `.menu`/背景节点追加到外层窗口 `body`；因此 Canvas 适配必须把选区 rect 转换到菜单宿主 document，再在宿主状态上观察和清理菜单。
- 不能仅在 iframe 文档观察 `.menu` 或使用 iframe viewport 尺寸定位，否则菜单既不会被接管，也会出现偏移。来源 iframe 卸载、重载、Popout 关闭和插件 unload 仍需解除父子文档关联及所有 observer/timer。
- Obsidian 编辑器的 context-menu 事件在部分 Canvas 卡片路径上可能以 iframe `body` 为 target；Canvas 子文档适配因此以 body 作为安全容器兜底，再用 Selection anchor/focus containment 校验，避免因 target 不在 `.markdown-source-view` 而漏掉菜单。
- 设置刷新时需同步已有 active menu 的 timeout；hover/focus 分别记录状态，只有两者都离开后才重新开始倒计时。

### 0.1.5 发布（2026-08-29）

- 用户授权后，Canvas 卡片文字选区菜单功能以 commit `f2f2510` 推送至 `codex/stage-8-dragger-integration`，tag `0.1.5` 指向该提交。
- 正式 GitHub Release 为 `https://github.com/Rex-Diego/dragdrop/releases/tag/0.1.5`，不是 draft 或 prerelease；`main.js`、`manifest.json`、`styles.css` 三个附件均为 uploaded，GitHub digest 与本地构建一致。

### Surface Pen Canvas 连线控件回归（2026-08-29）

- Surface Pen 笔尖默认平移的全局桥接不能覆盖 Canvas 连接点和已有连线；否则连接点会被误转成中键平移，边箭头也无法收到原生操作事件。
- 保护逻辑同时使用事件目标选择器和按坐标的可见几何命中。几何检查不包含全屏 `.canvas-edges` SVG 容器，只包含 `.canvas-node-connection-point`、边/交互路径和路径标签，从而保留普通区域的中键平移。
- 侧键选择映射保持不变；连接点/连线在有无侧键时都优先保留给 Obsidian 原生 Canvas 控件。

### 0.1.6 发布（2026-08-29）

- 用户授权后，Surface Pen Canvas 连线控件回归修复以 commit `60bcdef` 推送至 `codex/stage-8-dragger-integration`，tag `0.1.6` 指向该提交。
- 正式 GitHub Release 为 `https://github.com/Rex-Diego/dragdrop/releases/tag/0.1.6`，不是 draft 或 prerelease；`main.js`、`manifest.json`、`styles.css` 三个附件均为 uploaded，GitHub digest 与本地构建一致。

## 阶段 8.8 真实使用回归（2026-09-07）

- 用户明确任务列表的 block ID 必须内联在根任务本行末尾：`- [ ] 任务 ^block-id`。整棵层级列表只给最父节点追加 ID，不能另起 marker 行，也不能落到最后一个子节点。
- 不同 Markdown 之间需要新增带别名的块嵌入动作，别名设置允许 emoji 或普通文本；目标文本采用 Obsidian 原生嵌入语法 `![[文件#^block-id|别名]]`。
- 设置说明需要从内部术语改为可直接理解的实际行为说明；涉及块嵌入时直接展示 `![[...]]` 语法，避免只写抽象名称。
- Surface Pen 当前无法在同一 Markdown 内完成 block 拖动；修复必须复用现有 Pointer capture/单一提交所有权，不建立第二套 document 级输入系统，并保留 Canvas 连接点与边路径的原生放行。
- 同文件 Move 当前有两类文档/视图回归：目标前后被额外插入空行，以及提交后 viewport 向后跳约半页。文本事务必须保持非目标空白逐字不变；视图恢复应以映射后的目标/原选区为锚，而不是仅盲写旧 scrollTop。
- 任务列表横向语义由用户锁定：拖到目标左侧时不作为其子任务；拖到目标右侧时成为子任务，来源任务的全部后代一起右移。现有 `sibling | child | outdent` resolver/planner 可复用，但必须用真实坐标和子树用例验证。
- Canvas 卡片下边沿偶发显示抓手光标、不能纵向 resize，reload 后恢复，说明可能是插件 body class、覆盖层或 pointer/session cleanup 初始化时序问题；修复不能扩大到覆盖 Obsidian 原生 resize handle。
- 本轮开始时发现一组未完成 PDF→Canvas 改动；用户随后明确放弃该 idea，并授权回退/覆盖。该组源码、设置 schema 和规划条目不再属于项目范围，后续不得保留或发布。
- 首轮源码定位确认任务列表 ID 的直接根因在 `content-segmentation.ts`：`combineListRun()` 对整棵列表固定 `blockIdPlacement: "standalone"`，`groupLists()` 对 `native-subtree` 且有子项的父项也固定 standalone，同时把 `anchorTo` 延伸到子树末尾。修复必须拆开“引用范围覆盖子树”和“ID 锚定根列表项行末”两个概念，不能仅修改插入字符串。
- 同文件空行回归的直接风险点在 `markdown-drop.ts`：`removalRanges()` 主动吞掉来源块后一到两个换行，若没有则向前吞换行；`boundaryInsertion()` 又强制按双换行补齐目标两侧。结构 Move 因而不是“移动原始 Markdown 片段”，而是“删除后重新格式化分隔符”，会在紧凑任务列表中凭空增减空行。
- 视图跳动的现有实现只保存绝对 `scrollTop/scrollLeft`，事务后通过 `requestMeasure.write` 原样回写旧像素值；文本在 viewport 之前移动时，旧绝对值不再对应原视觉锚。修复需要记录一个可映射的文档位置与其 viewport 像素偏移，事务后按新坐标恢复相对锚；光标在移动块内时还应随块映射到目标位置。
- 跨 Markdown 当前已有唯一的 `embed-source` 动作，目标文本在 `DragSessionManager` 中直接拼接 `![[sourceLink#^id]]`。别名最小兼容路径是在该动作的 cross-file 输出层追加可配置 `|alias`，无需新增第四种破坏旧 modifier 映射的动作；同文件嵌入是否使用别名应保持独立、默认不受影响。
- 当前会话的 UI 控制运行时未暴露任何原生 Windows app surface，只有内置浏览器；`cua.getApp` 也不可用。因此无法在本轮直接读取 Obsidian Canvas 的首次加载 DOM/cursor 状态。Canvas 下边沿修复必须以原生 `.canvas-node-resizer` 的坐标放行、指针所有权与 cleanup 回归为依据，并明确保留实体 Obsidian 验收。
- Surface Pointer 命中 Markdown 后不能直接复用原事件的无修饰键状态：既有设置把同文件 `none` 绑定为 `embed-source`，而用户要求侧键完成结构移动。锁定规则为：Surface Pen 侧键、同文件、且没有真实键盘修饰键时，将其解释为 Primary chord；若用户按了 Ctrl/Command/Shift/Alt，则真实修饰键优先，最终动作仍由可配置的同文件绑定决定。
- 本机 Obsidian 核心包的原生 CSS 明确把 `.canvas-node-resizer[data-resize='bottom']` 设为 `cursor: ns-resize`；核心 `nodeInteractionLayer.render()` 又以当前节点 `x/y/width/height` 布置共享 hover/resize 层。用户描述“自动创建后下边沿是小手、reload 后恢复”因此更符合插件自动改高后共享交互层尺寸滞后，而不是应该覆盖原生 cursor。修复在 `CanvasAdapter.fitHeight()` 最终尺寸确定后显式执行 `node.render()`、`canvas.requestFrame()` 与可用时的 `nodeInteractionLayer.render()`，不添加覆盖 Obsidian resize cursor 的 CSS。
- 列表 ID 修复通过新增 `blockIdAnchorTo` 把“引用覆盖整棵子树的 `anchorTo`”与“ID 属于根列表项本行末尾”解耦；这样 `#^id` 仍解析整棵层级列表，但写回固定为 `- [ ] 父任务 ^id`。
- 同文件 Move 的分隔符规划改为复用来源/目标原有换行 run，不再统一格式化为双换行；`mapPositionAfterMove()` 使用同一插入算法。滚动恢复同时保存顶端文档锚点和像素偏移，并随事务映射锚点，避免源块位于 viewport 之前时旧绝对 scrollTop 造成半页跳动。
- 跨文件嵌入沿用唯一的 `embed-source` 动作，只在 cross-file 输出层追加经清理的可配置别名；默认 `🔗`，空字符串保留无别名语法。这样不改动 `none = embed-source / primary = move` 的既有绑定与迁移边界。

### 阶段 8.8 实机反证与 8.9 纠错入口（2026-09-07）

- 8.9 接手已直接读取安装目录配置：`sameMarkdownBindings.none=move`、`primary=embed-source`；跨文件仍为 `none=embed-source`、`primary=move`，其余六种组合均 inherit。笔侧键强制模拟 Primary 是设置失效的确定根因，应删除输入层的动作覆盖。
- Pointer capture 的 composedPath 仍属于源抓手；目前 Markdown resolver 优先匹配该路径，跨分栏可能误选源 view。Pointer 落点应仅按当前 owner document 坐标命中。
- 同文件 Move 当前仍整篇替换，再单独恢复 selection/focus/scroll；8.8 顶端锚点还跟随移动块跳到新位置。修复要生成精确删除/插入 changes，并在同一事务携带原生滚动快照，保留原视口而不跟随移走的源块。

- 用户实机确认 8.8 未解决关键问题：同一 Markdown 的无修饰键动作设置没有生效，实际仍插入嵌入；新 Canvas 卡片下边沿仍为抓手状态，必须 reload 后才可 resize；同文件拖动后仍高速跳到陌生位置。
- 用户对“别名”的目标是普通双链 `[[文件#^block-id|别名]]`，不是块嵌入 `![[文件#^block-id|别名]]`。8.8 将其实现为带别名的块嵌入是明确需求误读，必须去掉 `!` 并同步设置文案与测试。
- 自动化测试、构建通过和三方哈希一致只证明源码与产物一致，不能覆盖上述真实 Obsidian 行为。8.8 的 `code_complete_ui_validation_pending` 结论已撤回，相关功能重新进入根因诊断。
- 同文件动作问题必须先读取实际标准插件目录 `data.json`，再追踪 schema 迁移、设置页保存、source/target path context、dragover/drop 动作缓存与最终 commit；不能继续仅用默认值测试推断用户当前配置。
- 视图跳转问题说明 8.8 的自定义 `lineBlockAtHeight(scrollTop + 8)` 顶端锚点模型可能使用了错误坐标系，或额外的 selection/focus dispatch 触发了 CodeMirror 自动滚动。优先改用 CodeMirror 自身可映射的 `scrollSnapshot()` effect，或在同一 transaction 中携带等价滚动语义。
- Canvas 问题说明仅在 fit height 后调用 `node.render()`、`requestFrame()` 与 `nodeInteractionLayer.render()` 不足。reload 后恢复的特征仍指向首次创建/自动 fit 的交互层 target 或 `onResizeDblclick` 生命周期，需要从调用顺序和核心对象状态重新定位，而不是增加 CSS cursor 覆盖。
- 用户明确要求不再使用 Luna worker；本轮纠错由主代理独立完成，并对 8.8 相对 `60bcdef` 的全部业务差异逐项审查。

### 8.9 实施证据

- 别名动作采用独立 `link-source`；`embed-source` 恢复无别名原生嵌入。schema 4 保留新链接绑定，旧 schema 的历史 link-source 仍按旧语义迁移。原实际配置不覆写。
- Move 使用精确删除/插入 ChangeSet；同一事务内映射选区与原生 scrollSnapshot。视口按普通文档变化映射，选区按被移动块映射，且不调用 focus。另一分栏仅等待 Obsidian 同步后恢复视图，不二次写入内容。
- 跨文件目标先写、源后写；编辑器 transaction filter 在 dispatch 前校验完整结果，拒绝局部变更，避免失败事务漏回滚。确认弹窗后重新检查目标内容、文件身份及可写性。
- 实际启用的是 Enhanced Canvas 1.0.29，Advanced Canvas 未启用。Enhanced Canvas 包装 onResizeDblclick(bottom) 设置内存 autoHeightEnabled；创建时调用该手势会引发持久副作用。已改为一次性测高 + node.resize + 原生交互层刷新；仍需真实新卡片验证。
- 回归额外发现末尾块移动仅消耗最多两个换行，现改为完整换行 run；多块移动分别计算位置及缩进偏移。右侧 child 意图固定放到目标子树之后，防止最近边界位于父项之前。
- 最终格式保护还包括保留文件尾部换行与连续选中块之间各自的原间距；列表续行首行已有 ID 必须优先识别，防止重复补 ID 或借用子项 ID。旧跨文件默认迁移不会覆盖显式保存的同文件绑定。
- 已有嵌入复制保留原别名并按目标笔记重算路径；新增普通双链使用用户设置别名，默认不占用原有修饰键，需在设置里给“插入别名双链”分配按键。
- 事务协调器将尝试写入也纳入回滚。如果恢复源失败，则停止继续撤销目标副本，避免源和目标同时丢失；错误提示会明确要求核对两份笔记。
- 本轮 Computer Use 已可访问真实 Windows Obsidian 窗口，修正此前“只有浏览器 surface”的环境结论。但 Ctrl+R 被自动审批拒绝，尚无本轮真实拖动/视口/底边缩放通过证据；不能把 163 项自动测试当作实机通过。
- 最终六文件三方部署哈希一致，标准插件目录配置与交付目录 graph-worker.js 均保留；安装目录内容已更新，但需获准重载后才会进入运行中的开发库。
- `0.1.7` 已发布为正式 GitHub Release，附件 digest 与本地 `manifest.json`、`main.js`、`styles.css` 一致；tag 指向发布提交 `5a6b052`，发布记录随后单独提交。
