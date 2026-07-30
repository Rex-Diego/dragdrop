# 发现与决策

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
| ESLint 不忽略 package.json，只忽略 node_modules、main.js 和 mjs 构建脚本 | 让依赖扫描发现可替换或受限包 |
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
- 新增 `surfacePenSideButtonDrag`，默认开启。只有 Markdown 抓手收到 `pointerType === "pen" && (buttons & 2) !== 0` 时才将 Surface Pen 侧键视为左键拖拽；该输入使用 Canvas 的 no-modifier 动作，不走 Touch drop action。生命周期复用现有 `setPointerCapture()`、`pointerup`、`pointercancel` 路径，不监听或修改桌面普通右键。
- 当前静态验证：`npm.cmd run lint` 0 errors / 0 warnings，`npm.cmd run typecheck` 通过，`npm.cmd run test` 为 9 files / 61 tests 通过；待生产构建、部署和实机验证。
