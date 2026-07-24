# DragDrop 项目执行约定

## 规范项目位置

本项目的唯一真实目录是：

`C:\Users\rex18\project\canvasread-dev\.obsidian\plugins-dev\dragdrop`

不要从迁移前的 Obsidian Vault 插件目录继续开发，也不要在两个目录之间复制或同步源码。

## 恢复与继续任务

当用户说“继续按 plan 执行”“继续计划”或同等含义时，直接执行以下流程，无需让用户重复已经确认的需求：

1. 完整读取根目录的 `task_plan.md`、`findings.md` 和 `progress.md`。
2. 使用 `planning-with-files-zh` 技能，并完整读取 `C:\Users\rex18\.codex\skills\planning-with-files-zh\SKILL.md`。
3. 使用仓库内的 Obsidian 插件开发技能，并完整读取 `references/obsidian-plugin-skill/.agents/skills/obsidian/SKILL.md`；按其中路由读取本次工作需要的 reference 文件。
4. 以 `task_plan.md` 的“当前阶段”和未完成复选框为执行入口，以 `findings.md` 的锁定决策为需求来源，以 `progress.md` 为验证与错误记录。
5. 继续安全且明确的下一项工作，不因会话切换重新进行已经完成的需求访谈或研究。
6. 每完成一个阶段、遇到错误或形成重要决定后，同步更新三个规划文件。

## 当前交接点

- 当前处于阶段 4：测试与验证。
- 第一阶段核心实现已经写入源码；`npm.cmd run typecheck` 与 `npm.cmd run build` 已通过。
- 首轮 `npm.cmd run lint` 结果为 23 errors / 7 warnings。
- 下一步先修复所有 ESLint errors 和 warnings，再补聚焦测试、Obsidian 实机验证和 README。
- 已知 lint 修复入口记录在 `task_plan.md` 和 `findings.md`，不要仅靠本文件的摘要实施。

## 执行约束

- 使用 `npm.cmd`，不要调用被 PowerShell 执行策略阻止的 `npm.ps1`。
- 依次运行与当前改动相关的 `npm.cmd run lint`、`npm.cmd run typecheck` 和 `npm.cmd run build`；修复 warnings，不只修 errors。
- 生产构建若因沙箱无法遍历目录而失败，应按权限规则申请在沙箱外运行，不要改坏 esbuild 路径来规避权限。
- 不运行 `npm audit fix --force`，不使用 `git reset --hard` 或其他破坏用户改动的命令。
- 当前仓库尚未建立首次提交，已有文件可能全部显示为未跟踪；这些文件都是项目资产，必须保留。
- 第一阶段只实现 Markdown → Canvas；Markdown → Markdown 只保留设置与动作结构，除非计划明确进入后续阶段。
- CardNote、Outliner 和其他 reference 目录仅作参考，不直接修改，也不把已删除的搜索、Excalidraw 或笔记管理功能重新引入。
