# DragDrop 0.1.11

- 新增“Canvas 卡片高度自适应”开关，默认开启；关闭后，新拖入卡片保持设置的初始高度。
- 新增“隐藏新 Canvas 卡片边框”开关，默认关闭；开启后使用 Advanced Canvas 的 `styleAttributes.border = "invisible"`，保留其他节点样式。需要启用 Advanced Canvas 的节点样式功能。
- 修复 Surface Pen 从 Markdown 拖入 Canvas 后残留原生右键菜单的问题，兼容 Windows 抬笔后菜单事件指针 ID 变化，保留正常鼠标右键操作。

两个外观开关只影响后续拖入的卡片，不修改已有卡片。

验证：lint 零错误/警告、类型检查、243 项自动化测试和生产构建通过。用户已在 canvasread-dev 实机确认两个开关及 Surface Pen 菜单修复正常。
