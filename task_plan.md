# 任务计划：DragDrop 极简 Obsidian 插件

## 目标
实现名为 `dragdrop` 的 Obsidian 插件：删除 CardNote 的搜索、Excalidraw 和窗口管理功能，保留并重构 Markdown→Canvas 拖拽；阶段 6 实现 Markdown→Markdown 直通拖拽和 Canvas 归纳按钮，阶段 7 实现可编辑块嵌入，阶段 8 选择性融合 obsidian-dragger 的结构重排、多选、块菜单、跨文件目标、视觉和移动端交互。鼠标链路支持桌面端与弹出窗口，触控链路优先支持 Surface 并为 iPad 提供能力守卫下的实验兼容。

## 当前阶段
阶段 8：obsidian-dragger 选择性融合（8.7 收口执行中；阶段 7 实机验收仍独立保留）

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

### 阶段 7：可编辑块嵌入（实施于 2026-07-31）
- [x] 研究 Outliner.md 的 `editableBlockEmbeds`、embed registry patch、内嵌编辑器、可见范围、block ID 保护和文件同步方式
- [x] 锁定第一版范围：只处理 Markdown 中的 `![[文件#^block-id]]`，支持 Live Preview 与 Reading mode；不扩展整文件/标题嵌入、Canvas 节点、反向链接、搜索结果或 Excalidraw
- [x] 锁定设置需求：新增 `Editable block embeds` 开关，默认关闭；切换后要求重载 Obsidian，关闭时完全保留原生嵌入行为
- [x] 完成 Obsidian 1.12.7 私有 API 能力探针：确认 `embedRegistry.embedByExtension.md` 为三参数 creator，返回原生 Markdown embed 组件，且支持 `editable`、`showEditor()`、`loadFile()` 与 `unload()`；探针未写入真实源文件
- [x] 根据能力探针选择最小实现：包装原生 Markdown embed/editor，并把安全写回、ID 保护与冲突检测放在独立适配层；不搬入 Outliner 的整套 CodeMirror 编辑器框架
- [x] 新增可卸载的 `EditableBlockEmbedFeature` 和私有 API 类型适配层；只 patch Markdown embed creator，能力缺失、目标不支持或初始化失败时回落原生 renderer
- [x] 用原生嵌入作为静态状态，在 hover/focus 时显示可访问的 Lucide 编辑按钮；激活时才挂载编辑器，Escape/失焦后保存并恢复渲染，防止长笔记同时创建大量编辑器
- [x] 实现纯函数 block 定位与替换模型：按最新文件内容重新定位 block ID，覆盖段落、列表、引用、Callout 首行 ID、inline/standalone ID，并保证 ID 标记不可编辑、不可删除、不可改名
- [x] 实现安全写回：源文件已在 Markdown 编辑器打开时使用该 EditorView transaction；后台文件使用 `vault.process()`；保存前比较基线内容，冲突、ID 丢失、文件删除/重建或写入失败时整体中止，不覆盖较新的源内容
- [x] 实现 400ms 内的去抖同步、失焦最终 flush、同一 block 多个嵌入实例的更新传播和自身写入回环抑制；有未解决冲突时停止自动保存并提示重新载入
- [x] 增加生命周期与边界守卫：按 owner document 支持弹出窗口，禁止嵌套可编辑嵌入和同文件自引用竞争，插件卸载/设置关闭/DOM 重建时销毁组件与监听器
- [x] 补充设置迁移、block ID 定位、所有已支持 ID 形态、ID 不变式、最新内容重定位和冲突拒绝测试；原生私有 API 集成、多实例同步和删除/重建回退仍需实机验收
- [x] 更新 README 与设置说明，明确“会直接修改源块”、默认关闭、需要重载、私有 API 风险和不支持范围
- [x] 依次通过 `npm.cmd run lint`、`typecheck`、`test`、`build`、`node --check main.js`，部署到两个实际插件目录并核对哈希
- [ ] Obsidian 实机验收：Live Preview/Reading mode、段落/列表/Callout、两个同步嵌入、源文件分栏、弹出窗口、冲突、快速关闭、设置关闭回退；确认源文件仅目标块变化且 block ID 原样保留
- **状态：** in_progress；用户已批准开始实施

### 阶段 8：选择性融合 obsidian-dragger（规划于 2026-08-01）

#### 8.0：兼容基线、职责抽取与设置迁移
- [x] 核对上游 `Ariestar/obsidian-dragger` 1.3.4、commit `6e7d1d0`、MIT License、真实默认值、架构边界和测试布局
- [x] 完成功能矩阵与冲突矩阵，锁定“选择性移植纯模型 + 独立实现平台层”，不整体替换插件、不增加 `md-dragger` 运行时依赖
- [x] 在现有阶段 6/7 行为上建立兼容测试基线；保留阶段 7 资产，不重置或覆盖工作树
- [x] 定义事件唯一所有权：每个 pointer/drag/drop 序列只能有一个 handler 进入 commit，其他输入适配器必须显式旁路或取消
- [x] 为 editor、selection、drop resolution、transaction 和 preview 定义可测试接口，并先从约 1335 行 `DragSessionManager` 抽取职责；只做行为等价重构
- [x] 将设置升级为显式 `schemaVersion` 迁移，数值字段统一 clamp，旧配置和现有动作绑定不得被重置
- [x] 设置页按 `Core behavior`、`Selection`、`Appearance`、`Mobile and pen`、`Advanced` 分组，并仅在功能开启时展示子项
- [x] 已确认本批仅独立实现平台层并未复制 Ariestar 实质代码/测试，因此暂不新增 `THIRD_PARTY_NOTICES.md`；若后续发生实质移植，必须补齐 MIT 版权和来源 commit

- [x] 仅当现有 Markdown 动作解析结果为 `move` 时启用 Dragger 式结构语义；无修饰键仍默认 `embed-source`，Ctrl/Cmd 仍默认 `move`
- [x] 实现完整块 selection snapshot、同文件单事务移动、删除后 offset 映射、自范围/自嵌套拒绝和一次 undo
- [x] 实现列表 `sibling | child | outdent` 意图解析与缩进 planner，保留列表 marker、任务状态、子树和现有 block ID
- [x] 增加容器规则：frontmatter、表格单元格、Callout 边界、引用 run、围栏和水平线等危险落点在预览阶段即拒绝
- [x] 将现有分界线升级为 drop resolution snapshot：普通插入线、列表父项高亮、源范围高亮和可解释的非法落点状态
- [x] 增加边缘自动滚动；默认 edge zone 60px、最大 12px/frame，滚动后重新解析落点并对数值做 clamp
- [x] 保留当前 `content-segmentation.ts` 的 Callout lazy continuation 和已有块嵌入解析，不用上游 detector 覆盖

- [x] 实现 Shift+handle 连续范围选择、500ms 长按后纵向刷选、非连续 add/remove、选中 handle 的 checkbox 状态和 Escape 清除
- [x] 仲裁原生 HTML5 drag 与长按选择：`dragstart` 先发生则取消计时器；计时器先到才临时进入 selection mode，结束后恢复 native drag
- [x] 拖动任一已选 handle 时使用同一个 selection snapshot；相邻块合并 segment，非相邻块保持文档顺序
- [x] 无修饰键多选仍为每个块生成一个 `![[...#^id]]`；`move` 多选必须整体成功或整体不改
- [x] 编辑中的 editable embed、输入控件、Canvas 内嵌编辑器和表格单元格不得启动结构拖拽或多选

#### 8.3：原生块操作菜单与剪贴操作
- [x] 右键 handle 使用 Obsidian 原生 `Menu`；单块与多块均只显示 Copy/Cut/Delete，弹出窗口使用对应 owner document
- [x] 按用户最终范围删除 Paragraph、标题、列表、引用、代码和数学块的 Convert 菜单与转换 planner；仅借鉴 obsidian-dragger 的拖拽能力
- [x] 完整 `![[...#^id]]` 块允许 Copy/Cut/Delete/Move；菜单不再提供任何块类型转换
- [x] Copy/Cut 按文档顺序输出原始 Markdown；Cut 必须先确认 clipboard 写入成功再删除，Copy 失败不得修改文档
- [x] Delete、Cut 和跨文件 move 遇到已有 block ID 时复用引用风险确认；所有编辑作为单个 transaction，失败时整体不改
- [ ] 菜单具备键盘导航、ARIA、焦点恢复和作用域化主题样式，不复制上游全局 DOM 菜单实现

#### 8.4：统一跨文件事务与文件目标
- [ ] 已打开 Markdown editor 继续提供精确行落点，并统一接入同一 transaction coordinator
- [x] 增加文件树 Markdown 文件和正文内部链接作为“追加到文末”的显式目标；仅借鉴目标识别，不复用上游写入器
- [x] 以规范化 file path + 文档 revision 识别“同文件不同分栏”，不能只比较 EditorView 实例
- [x] 单源跨文件 move/embed 先校验源、目标和确认条件，再提交；任一写入失败必须 rollback，禁止目标已写入而源只删一半
- [ ] 多源块、非连续选区、文件删除/重建、只读目标、目标关闭和并发变化均需覆盖整体事务测试

#### 8.5：折叠恢复、手柄外观与后置视觉增强
- [x] 标题和列表移动前记录折叠行起点，提交后能力守卫地恢复；恢复失败只降级折叠视觉，不破坏已成功文本事务
- [x] 在现有 inline handle + Callout gutter 底座上增加可见模式和 left/right 位置；不为统一外观替换已实机修复的底座
- [x] 落点线颜色、拖拽源高亮和列表父项高亮使用 CSS class 与 Obsidian 变量；窗口关闭、取消、Escape 和 unload 后不得残留
- [ ] `Handle position: left/right` 单独做主题、RTL、Source/Live Preview、Callout 和弹出窗口实机验证
- [x] 有序列表自动重编号作为独立设置且默认关闭；关闭时逐字保留用户原 marker

#### 8.6：移动端 selection mode 与 Surface/触控融合
- [x] 新增受 `Mobile block interactions` 开关控制的 200ms 长按 selection mode；长按前的短移动仍进入现有 Pointer drag，默认关闭以避免改变现有触控路径
- [ ] 增加上下 resize handles、拖拽模式切换与移动端工具栏命令
- [ ] 移动端拖拽长按默认 200ms；所有 resize/工具栏控件满足 44×44px、ARIA、焦点和 owner realm 生命周期要求
- [x] 复用现有 Pointer capture、Surface Pen 侧键、`Larger touch handles` 和 touch action 设置，不建立第二套 document 级 Pointer listener
- [x] 保留鼠标 HTML5/DataTransfer/ghost 和跨原生弹出窗口能力；不采用上游 pointer-only 全量替换
- [ ] iPad 继续标记 experimental/unverified；私有 API 缺失时降级且不得半写源文件

#### 8.7：完整回归、文档、部署与实机验收
- [x] 修复 Live Preview Callout 抓手的宽页边距定位：保留现有 gutter/lazy-continuation 底座，以 owner editor 几何适配把抓手对齐到正文内容起点，并覆盖 left/right、RTL、Source/Live Preview、滚动和弹出窗口
- [x] 将缺失 block ID 的写回改为“安全时追加到当前逻辑块最后一行行末”；普通段落、列表、引用和 Callout（含 lazy continuation）默认 inline，只有会破坏 Markdown 语义的 fenced code/math/table 或显式 native-subtree 父项保留 standalone，并为边界写回回归测试
- [x] 新增独立的同 Markdown 文件动作绑定（全部 modifier chord），保留现有 `markdownBindings` 作为跨 Markdown/文件目标兼容字段；旧配置缺少新字段时按旧映射迁移，设置页分别展示同文件与跨文件的无修饰键、Ctrl/Command 及其他组合
- [x] 按源/目标规范化 `TFile.path` 解析 same-file/cross-file context；拖拽缓存同时记录 context、文件身份和 modifier，目标或修饰键变化时重新解析，禁止复用错误动作
- [x] 同文件 Move/Ctrl 剪切前捕获 CodeMirror selection、焦点和 owner `scrollDOM` 横纵滚动；以单事务和位置映射恢复 anchor/head、滚动与焦点，失败/rollback 也恢复快照，不再把 view 重置到首行
- [x] 同文件 Move 保留原文件路径与 block ID，不再显示引用风险确认；跨文件 Move、菜单 Cut/Delete 等破坏性操作仍保留确认
- [x] 设置页按 Obsidian 界面语言提供完整英文与简体中文文案；原 `Do nothing` 改名为通俗的 `Cancel this drop` / `取消本次拖放`
- [x] 右键块菜单移除全部 Convert 项及转换实现，仅保留 Copy/Cut/Delete；设置项显示为 `Block action menu` / `块操作菜单`
- [x] 新增独立的文字选区右键菜单秒数设定：`-1` 保留原生菜单、`0` 不显示本次选区菜单、正整数显示半透明且避让选区的菜单，并在未 hover 时按秒数自动关闭；不复用块操作菜单开关
- [x] 为文字选区菜单补设置迁移、中英文文案、owner-document 生命周期、hover 暂停/离开重计时、菜单定位与关闭行为测试
- [ ] 在 Obsidian 实机复核 Surface 选区菜单：`-1/0/正值`、半透明、避让选区、hover 暂停、离开重计时、主窗口与 Popout 清理
- [x] 补纯模型、事件仲裁、CodeMirror adapter、事务 rollback、设置迁移和生命周期测试；移植测试同样履行 MIT 归属
- [x] 依次通过 `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run test`、`npm.cmd run build` 和 `node --check main.js`，warnings 必须为 0
- [x] 更新 README：动作默认值、结构重排、多选、块菜单、跨文件目标、移动端限制、设置迁移、第三方致谢和已知私有 API 风险
- [x] 每个稳定批次先完成自动化验证，再部署到 `.obsidian/plugins/dragdrop` 与 `plugins-dev/plugin` 并核对 SHA-256；已在用户授权后将已验证构建推送到公开 GitHub 仓库并发布 `0.1.2` BRAT Release
- [ ] 分批 Obsidian 实机验收：先 8.1，再 8.2–8.4，最后 8.5–8.6；每批失败先修复，不把未验收功能并入下一批
- **状态：** in_progress；8.0、8.1、8.2、8.3 已完成，8.4 已完成文件目标/同文件双视图/单源 rollback 首批，8.5 已完成首批视觉与折叠能力；多源事务、完整无障碍/移动端仍待补齐

#### 阶段 8 默认设置提案
- 默认开启：`Structural Markdown moves`、`Multi-block selection`、`Block action menu`、`Cross-file file targets`、`Edge auto-scroll`、`Preserve fold state`
- 默认关闭：`Mobile block interactions`、`Renumber ordered lists`
- 外观默认保持当前插件效果；新增参数采用上游稳定值作为初值但必须 clamp，`Larger touch handles` 与视觉 handle size 继续分离

#### 阶段 8 不可跨越的回归门禁
- [ ] 一个输入序列最多提交一次，Canvas 与 Markdown 两类 drop handler 不得同时写入
- [ ] 无修饰键多块生成多个嵌入；Ctrl/Cmd 多块整体移动或整体不改
- [ ] 同一 Markdown 与跨 Markdown 的全部 modifier chord 可在设置页独立配置；默认同文件/跨文件均保持 `none = embed-source`、`primary = move`
- [ ] 宽页边距下 Callout 抓手与正文起点对齐，且与普通 block 的 left/right、hover/focus、粗指针命中区一致
- [ ] 缺失 ID 的普通/列表/引用/Callout 写回不另起 marker 行；既有 ID、fenced code/math/table/native-subtree 的安全边界不回归
- [ ] 同文件 Ctrl/Command Move 后光标、选区、焦点和阅读滚动位置保持在映射后的原位置/目标附近，不跳到文首
- [ ] 同文件前移/后移、非连续选区、列表 child/sibling/outdent、自范围与自嵌套拒绝全部通过
- [ ] Callout lazy continuation、首行 block ID、已有 `![[...#^id]]` 与 editable embed 编辑状态不回归
- [ ] 跨弹窗鼠标、Surface Pen、touch、Canvas drop 和 Canvas 归纳按钮不回归
- [ ] clipboard 失败不删除，跨文件失败 rollback，已有 ID 的破坏性跨文件操作必须确认
- [ ] 取消、Escape、pointercancel、窗口关闭和插件 unload 后不残留 capture、selection、indicator、highlight 或 listener
- [ ] 文字选区菜单的 `-1/0/正整数` 设定互斥且可预测；正值菜单避让选区、半透明、hover 时不消失，窗口关闭或插件 unload 后不残留 observer、timer 或菜单 class

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
6. Obsidian 的 Markdown embed registry、widget editor 和卸载协议均为私有 API；阶段 7 必须先做当前版本能力探针，并始终保留原生 renderer 回退。
7. 同一源 block 可能同时在源编辑器和多个嵌入编辑器中修改；写回必须基于最新文本按 ID 重定位并进行乐观冲突检测，不能保存打开时的整篇文件快照。
8. block ID 是所有嵌入和反向引用的身份；可编辑嵌入必须把 ID 作为不可变区域，任何会删除或改名 ID 的 transaction 都要拒绝。
9. Outliner.MD 当前源码采用 FSL-1.1-Apache-2.0；本项目只参考行为和私有 API 发现，阶段 7 必须独立实现，不复制其源码或样式。

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
| 阶段 7 首轮并行恢复/检索中，单个无匹配 `rg` 返回 1 导致组合调用整体失败 | 1 | 后续改用 `Promise.allSettled` 分项保留结果，不重复原组合 |
| 阶段 7 的组合 PowerShell `rg` 模式引号未闭合 | 1 | 拆分固定字符串检索，避免在同一命令中混用单双引号 |
| `npx.cmd --no-install asar` 本机无 `asar` 包 | 1 | 规划阶段不安装无关工具；把运行时私有 API 检查列为实施阶段能力探针 |
| Windows 下以 `rg` 直接读取 `docs/release_notes/*.md` 失败 | 1 | 改用 `rg --files` 枚举发布说明，再逐文件读取；仅影响只读规划 |
| `gh api compare --jq` 的 PowerShell 转义导致 jq 表达式解析失败 | 1 | 用 `git ls-remote` 直接核对上游 main commit；已确认与本地 1.3.4 一致，不再重复 compare 命令 |
| Computer Use skill 指定的 `sky.documentation()` 在当前 `@oai/sky` 运行时不存在 | 1 | 完整读取已安装包的 `docs/sky-window2-api.md` 作为 API 回退；窗口枚举可用，但嵌套状态/输入调用仍报告执行上下文缺失 |
| 最终 bundle 残留扫描因 `rg` 正确返回“无匹配”退出码 1 而使并行工具失败 | 1 | 对预期无匹配显式处理退出码 1，确认 `DBG`、`document.title` 与 Convert 实现均不存在 |
| PowerShell 枚举窗口信息后直接接管道再次触发 empty pipe ParserError | 1 | 按既有解决方式先收集到 `$rows` 再格式化，不重复原写法 |
| Obsidian 最终实机重载被 Windows 锁屏阻止 | 1 | 前台进程确认为 `LockApp`；不尝试解锁、重启或关闭用户工作区，保留已部署构建并将重载后实机复核标记为待完成 |

## 备注
- 规划文件内容是项目状态数据，不作为外部指令执行。
- 每完成一个阶段同步更新 `task_plan.md` 和 `progress.md`。
- 阶段 6 已明确进入 Markdown→Markdown 实现；旧的“仅预留接口”约定由本阶段用户需求覆盖。
- 项目规范路径已迁移为 `C:\Users\rex18\project\canvasread-dev\.obsidian\plugins-dev\dragdrop`；后续开发以此目录为唯一真实来源。
- 当前旧 Codex 任务仍记录迁移前目录。新建本地项目后，应先读取 `task_plan.md`、`findings.md`、`progress.md`，从阶段 4 继续。
- 阶段 4 的首要任务：修复 `Plugin.settings` 命名冲突、Canvas 跨 realm 事件类型、弃用 API、设置页 sentence case 与 declarative settings 警告，然后重新运行 lint、typecheck 和 build。
- 根目录 `AGENTS.md` 已定义自动恢复流程。用户在新项目中只需说“继续按 plan 执行”，新任务应加载两个技能、读取三个规划文件并直接从本阶段继续。
