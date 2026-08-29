# DragDrop

Drag Markdown blocks into Obsidian Canvas as source references or generated note cards, into another Markdown note as an embed or move, or turn a Canvas selection into one atomic note.

DragDrop is focused on the Markdown → Canvas and Markdown → Markdown reading workflow. It does not include search views, Excalidraw integration, note management, or automatic preview panes.

## Usage

1. Open a Markdown note and a Canvas, either in the same window or in separate Obsidian popout windows.
2. Hover a supported Markdown block to reveal its drag handle.
3. Drag the handle onto the Canvas.
4. Change the action while dragging with a modifier key:

| Modifier | Default Canvas action |
|---|---|
| None | Link the original source block |
| Ctrl on Windows/Linux or Command on macOS | Create a note that embeds the source block |
| Shift, Alt/Option, or combinations | Inherit the no-modifier action unless reassigned |

Modifier actions are configurable. The action is resolved when the block is dropped, so you can change the modifier during the drag.

When a dragged block is already a standalone embed such as `![[Books/Source#^abc123]]`, a Canvas reference points directly to `Books/Source#^abc123`. DragDrop does not append another block ID to the source note. If several blocks are selected, ordinary blocks and existing embeds are resolved independently; an unresolved embedded target cancels the whole Canvas drop before any source ID is written.

### Markdown to Markdown

1. Open a source Markdown note and a destination Markdown note.
2. Drag a block handle into the destination editor.
3. With no modifier, DragDrop inserts an embed such as `![[Source note#^block-id]]` and only adds a missing block ID to the source. A dragged block that is already a standalone block embed is copied as that exact embed; multiple selected blocks create multiple embeds.
4. Hold Ctrl on Windows/Linux or Command on macOS to move the block. Same-file moves keep the file path and block ID, so they do not ask for reference-risk confirmation. Cross-file moves with an existing ID still ask for confirmation, and read-only editors remain protected.
5. Move drops can use sibling, child, and outdent list intent, show a precise insertion line, highlight the source/target, and auto-scroll near the editor edge. These structural behaviors are controlled by settings and apply only to the Move action.

Same-file Markdown drops and cross-file Markdown drops have separate modifier mappings. Every modifier chord (including no modifier, Ctrl/Command, Shift, Alt/Option, and combinations) can be assigned independently in Settings. The defaults are no modifier = embed and Ctrl/Command = move for both contexts.

Markdown blocks can also be dropped onto a Markdown file in the file tree or an internal Markdown link to append at the end. Cross-file writes use revision checks and roll back an already-written source when the target changes or fails.

Markdown drops align to a destination block boundary. Structural Move can preserve heading/list folds after the transaction, and optional ordered-list renumbering is disabled by default.

### Editable block embeds

The optional **Editable block embeds** setting adds a pencil button to Markdown block embeds such as `![[Source note#^block-id]]`. Activating the button opens the native Markdown embed editor and writes changes back to that exact source block. The `^block-id` marker is protected and cannot be removed, moved, or renamed.

This setting is disabled by default and requires an Obsidian reload after it changes. It only applies to Markdown block embeds in Live Preview and Reading mode; whole-file or heading embeds, Canvas nodes, backlinks, search results, Excalidraw, nested editable embeds, and same-file self-references keep their native behavior. Changes are checked against the latest source block, so a concurrent edit is rejected instead of overwriting newer content.

### Canvas selection to atomic note

Select one or more Canvas nodes and click the lightbulb button in the floating `.canvas-menu` toolbar. The button is controlled by the **Canvas atomic note button** setting. The same action is always available as **Create atomic note from canvas selection** in the command palette if the button is disabled or toolbar injection is unavailable.

The name prompt is required and starts with a neutral placeholder. File nodes become embeds using their existing file path and subpath, text nodes are written as-is, and entries follow visual order from top to bottom and then left to right. The original nodes remain on the Canvas; the newly created note is added as a new file node and selected.

The generated note uses the current folder strategy and contains only the four empty template properties plus the selected content:

```markdown
---
up:
topics:
tags:
rank:
---

![[Source note#^block-id]]
```

### Touch and pen

On a Surface, touch or pen drag starts from the block handle after moving at least 8 px. A tap on the handle selects the complete block. Touch and pen use the separate **Touch drop action** setting, which defaults to linking the source block; a keyboard modifier at drop time uses the normal Canvas modifier mapping instead.

When **Surface Pen side-button drag** is enabled, pressing the pen's side button on a Markdown handle starts the same captured drag path as a left-button drag and uses the no-modifier Canvas action. On Canvas itself, the side button is translated into a captured left-button sequence so cards and the Canvas surface receive the same input as a left-button selection. A pen tip without the side button is translated into a captured middle-button sequence that pans the whole Canvas, including when the side-button setting is disabled. Canvas connection points and existing edge controls stay on Obsidian's native event path so the pen can create and edit arrows without holding the side button. The check is limited to `pen` events, so ordinary desktop mouse behavior is unchanged.

Touch and pen drops support a Canvas in the same Obsidian window. Mouse dragging continues to support Canvas popout windows. **Larger touch handles** is enabled by default and uses 44 x 44 targets only in coarse-pointer environments; disable it to use standard-size handles. **Mobile block interactions** is disabled by default; when enabled, a 200 ms long press enters handle-brushing selection mode while a short movement still starts a drag. Normal editor scrolling and text selection remain unchanged outside the handle.

### Text selection menu

**Text selection menu timeout** controls the menu shown after selecting text in a Markdown view, a PDF/PDF++ text layer, or an editable Markdown card in Canvas. Set it to `-1` to leave the host's normal menu unchanged, `0` to hide the selection menu, or a positive number (including decimals such as `0.7`) to show a semi-transparent menu away from the selection and close it after that many seconds. Hovering the menu pauses its timer; leaving it starts a fresh timer. This setting does not affect the Copy, Cut, and Delete menu on block handles.

## Source content and generated notes

For Canvas references and Markdown embeds, DragDrop keeps the Markdown source as the single content source:

- It never cuts, replaces, or moves the dragged source content for Canvas drops or embeds.
- It only adds a missing block ID when a block reference requires one.
- For paragraphs, list items, quotes, and Callouts, a generated ID is appended to the last logical line as `正文 ^block-id` (with one separating space). Fenced code, math, tables, and native-subtree boundaries retain their standalone marker form.
- Existing block IDs are reused.
- Heading references use the heading subpath and do not add a block ID.

An explicit Ctrl/Command Markdown drop is the only drag action that removes source content. Same-file moves preserve existing block references without a confirmation dialog. Cross-file moves with an existing ID still ask for confirmation, and every move requires an editable source and destination.

A generated note contains a blank first line followed by a source embed:

```markdown

![[Source note#^block-id]]
```

Non-heading notes use a six-character hexadecimal block ID as the default file name. Heading notes use cleaned heading text by default, or can be configured to ask every time.

## Content segmentation

DragDrop creates cards in source order and places them vertically on the Canvas. It understands:

- Paragraphs and multi-line paragraphs
- Headings and their current outline level
- List items or whole list trees
- Fenced code blocks
- Math blocks
- Block quotes and callouts
- Markdown tables
- Multiple or overlapping editor selections

Top-level blank lines are the normal boundary for ordinary content. Lazy continuation lines remain part of their block quote or callout even when only the opening line starts with `>`. Headings, lists, fenced code, math, tables, quotes, and callouts retain their explicit Markdown structure, and blank lines inside atomic structures do not split a card.

For lists, you can choose:

- Split every list item or keep a whole list tree together.
- Use Obsidian's native subtree reference for parent items or create a linked text card that displays only the parent item.

## File creation and conflicts

Created notes can be stored in:

- A fixed folder (default: `Distill`)
- The source note's folder
- The Canvas file's folder

Missing folders are created automatically. If a name already exists, DragDrop asks you to rename the current note, skip it, or cancel the remaining notes in that drop. Cancelling does not roll back notes already created.

## Canvas layout

Created cards use a fixed width and an initial height, then attempt to fit their rendered content. Multiple cards are placed vertically with a configurable gap.

Defaults:

| Setting | Default |
|---|---|
| Node width | 400 px |
| Initial node height | 200 px |
| Vertical gap | 40 px |
| Drag preview width | 400 px |

## Settings

The settings tab includes:

- List splitting and parent display
- Heading file-name behavior
- Touch drop action for finger and pen input
- Note folder strategy and fixed folder
- Canvas node width, initial height, and gap
- Drag preview width
- Canvas actions, each with its assigned modifier (`Insert a link to the original block`, `Create a note from the block`, or `Cancel this drop`)
- Markdown actions, each with its assigned modifier (`Insert an embed of the original block`, `Move the block here`, or `Cancel this drop`)
- Structural Markdown moves, desktop multi-block selection, block menus, cross-file file targets, edge auto-scroll, fold preservation, and optional ordered-list renumbering
- Handle position (left/right) and visibility (hover/focus or always visible)
- Surface Pen side-button drag
- Mobile block interactions (disabled by default; long-press selection mode)
- Text selection menu timeout for Markdown, PDF/PDF++, and editable Canvas cards (`-1` keeps the normal menu, `0` hides it, and a positive value, including decimals, closes it after that many unhovered seconds)
- Canvas selection to atomic note from the floating toolbar or command palette
- Editable block embeds (disabled by default; requires an Obsidian reload)

The settings tab follows the Obsidian interface language and currently includes complete English and Simplified Chinese text. Right-clicking a block handle offers Copy, Cut, and Delete; block-type conversion actions are intentionally not included.

Canvas actions and Markdown actions use separate modifier mappings. Markdown mappings are shown separately for same-file and cross-file/file-target drops. Choose a modifier from the action row; assigning a modifier to one action clears that modifier from another action in the same group. The default Markdown mapping is no modifier = embed and Ctrl/Command = move.

## Compatibility and limitations

- Surface touch and pen are supported for same-window Canvas drops. iPad compatibility is experimental and unverified because it has not been tested on physical hardware.
- Drag handles are keyboard focusable, and Enter or Space selects the complete source block.
- Touch and pen require the Canvas private APIs used for coordinate lookup and node creation. If those APIs are unavailable, DragDrop cancels the drop before changing the Markdown source.
- The drop target and node creation flow use Obsidian's private Canvas API, so Obsidian updates may require compatibility changes.
- The floating toolbar button uses private `.canvas-menu` DOM observation. If that toolbar changes, the command palette fallback remains available and the rest of the plugin continues to work.
- Editable block embeds use the private Markdown embed registry and native widget editor. If the private API is unavailable, the original embed renderer remains in place.
- Surface Pen side-button drag uses Pointer Events and `setPointerCapture()` on Markdown handles and Canvas elements in the current Obsidian window. Disable it in settings if the pen side button should keep its normal context-menu behavior.
- The manifest currently declares Obsidian 1.5.11 as the minimum version. Development uses the Obsidian 1.13.1 type surface; verify older desktop versions before relying on them.
- Markdown → Markdown supports precise editor boundaries, list-aware Move intent, file-tree/internal-link append targets, and guarded cross-file rollback. File targets append at EOF rather than selecting an interior line.
- Canvas height fitting is best effort. If measurement fails, the configured initial height is kept.

## Data changes

Depending on the selected action, DragDrop may:

- Add missing block IDs to the active Markdown editor
- Create folders and Markdown notes in the vault
- Add file or text nodes to the target Canvas
- Move a Markdown block to another editable Markdown note when Ctrl/Command is held and all safety checks pass, regardless of folder
- When **Editable block embeds** is enabled, directly modify the selected source block after the user presses the embed pencil button

It does not send vault content over the network.

## Installation

Install the beta build with the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin:

1. In BRAT, choose **Add Beta plugin**.
2. Enter `https://github.com/Rex-Diego/dragdrop`.
3. Enable DragDrop in Obsidian's Community plugins settings after BRAT installs it.

Each GitHub Release includes `manifest.json`, `main.js`, and `styles.css`. BRAT downloads those release artifacts; the repository must remain public.

## Development

Use the Windows command shim to avoid PowerShell execution-policy issues:

```powershell
npm.cmd install
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

A production build writes `main.js`. Release artifacts are:

- `manifest.json`
- `main.js`
- `styles.css`
