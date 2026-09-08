# iPad Pencil 工作流调研

调研日期：2026-09-08。当前仅完成资料和公开 API 核对，未在实体 iPad 上验证。

## 版本与能力证据

- 美国 App Store 查询返回 iOS 公开版 1.13.7，发布日期 2026-08-15，最低 iOS 15.6。官方 changelog 的移动端 1.13.8 只修复 Android；最新移动端预览版为 2026-09-02 的 1.14.0。不能将移动端版本号一概当作 iOS 已上架版本。
- WebKit 支持 Pointer Events，Pencil 可通过 pen 类型接触事件处理；Safari 18.2 还增加预测/合并事件及笔倾角属性。具体事件序列和多指并用仍取决于 iPadOS/WebView，需要设备探针。
- Apple 的双击接口为 SwiftUI onPencilDoubleTap / UIKit UIPencilInteraction；Pro 挤压为 onPencilSqueeze / UIPencilInteractionDelegate，并非标准 DOM 侧键事件。挤压仅适用于 Pencil Pro。
- 当前 obsidian-api/master 的公开声明没有 Pencil、squeeze、doubleTap 或 Canvas 原生交互接口。最新更新日志未宣布相关桥接。Excalidraw 维护者仍将此类厂商原生功能依赖于 Obsidian 宿主公开接口。没有依据承诺普通 JavaScript 插件能直接读取这些原生手势。
- 合成 PointerEvent 可调用 JavaScript 监听器，但 isTrusted 为 false，不会自动获得系统手势权限。桌面 Canvas 的鼠标事件转换成功不代表 iOS 原生分支也成功。

## 建议映射（待用户讨论）

| 场景 | iPad 建议行为 |
| --- | --- |
| Canvas 默认 Pencil 拖动 | 平移，包括误触卡片边角；保持本次 Surface 的防误缩放规则 |
| Surface 侧键对应入口 | 屏幕边缘的操作图标：按住时临时生效；点一下则只武装下一次笔势，完成/取消后自动复位 |
| 操作状态下拖动卡片/边角/空白 | 分别移动卡片、缩放、框选，落笔时锁定动作，不在拖动中切换 |
| 连线 | 保留直接拖动连接点；无悬停设备在选中卡片后显示可触达的连接入口 |
| Markdown 块拖放 | 复用当前抓手、动作绑定和事务；用独立动作菜单选择嵌入、移动或 Canvas 创建笔记，移动仍执行现有 ID/只读/回滚约束 |
| 双指触控 | 保留 Canvas 原生平移/缩放，避免拿双指当侧键；需验证与 Pencil 的取消/竞争关系 |
| 外接键盘 | 保留真实修饰键，作为可选入口，不能成为 Pencil 工作流前提 |

按住屏幕图标和 Pencil 同时输入受掌拒与多指事件影响，因此“点一下，仅下一笔生效”应作为可靠性更高的基础入口。操作图标须显示状态、支持左右手位置、提供取消并在窗口失焦/切页/笔势取消时清理。不要让操作模式意外遗留。

长按后拖动可作为后续可选项，但会增加每次操作的等待，并可能与文本选择、系统上下文菜单和 Scribble 冲突，不建议作为唯一入口。不能依赖悬停，因为并非所有 iPad/Pencil 组合支持。

## Pencil Pro 可选增强

Apple 官方支持把挤压动作配置为运行快捷指令。可探索链路：Pencil Pro 挤压 -> 系统快捷指令“打开 URL” -> 插件 registerObsidianProtocolHandler -> 武装下一次笔势或打开动作菜单。

这是可实现性的推论，尚未实现或实测；它不提供挤压开始/结束的连续状态，也可能带来延迟、系统提示或焦点切换。需要先确认设备支持与用户偏好；URI 仅切换临时模式，不应直接执行删除或搬移。无需为此引入原生 Capacitor 包，因为社区插件不能把原生模块注入已签名的 Obsidian iOS 应用。

## 实施前验收

1. 在目标 iPad 的 Obsidian 中记录版本、Pencil 类型与 pointerdown/move/up/cancel、buttons、capture、笔与手指并用事件；不记录笔记内容。
2. 验证 Canvas iOS 分支接受合成事件，连线、八向缩放、撤销和取消完整；能力不足时保留原生交互。
3. 验证无悬停、Scribble、掌拒、分屏、多指缩放、切页/后台恢复，以及 Markdown 单次提交与安全回滚。
4. 通过后再启用 iPad 映射；Pencil Pro 快捷指令单独做延迟和焦点验收。

## 来源

- [Obsidian 官方更新日志](https://obsidian.md/changelog/)
- [Obsidian 美国 App Store](https://apps.apple.com/us/app/obsidian-connected-notes/id1557175442)
- [Apple App Store 查询](https://itunes.apple.com/lookup?id=1557175442&country=us)
- [Obsidian 当前公开 API](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)
- [WebKit Safari 18.2 Pointer Events](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)
- [Apple Pencil 双击接口](https://developer.apple.com/documentation/applepencil/handling-double-taps-from-apple-pencil)
- [Apple Pencil Pro 挤压接口与快捷指令](https://developer.apple.com/documentation/applepencil/handling-squeezes-from-apple-pencil)
- [Excalidraw Pencil 双击讨论及维护者说明](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/729)
