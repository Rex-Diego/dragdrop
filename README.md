# DragDrop

Drag Markdown blocks into Obsidian Canvas as source references or generated note cards, into another Markdown note as an embed or move, or turn a Canvas selection into one atomic note.

DragDrop is focused on one workflow: Markdown → Canvas. It does not include search views, Excalidraw integration, note management, or automatic preview panes.

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
3. With no modifier, DragDrop inserts an embed such as `![[Source note#^block-id]]` and only adds a missing block ID to the source.
4. Hold Ctrl on Windows/Linux or Command on macOS to move the block. Moving a block with an existing ID and moving from a read-only editor are guarded to prevent accidental loss.

Markdown drops align to a destination block boundary. They do not perform outline indentation, folding, or list restructuring.

### Canvas selection to atomic note

Select one or more Canvas nodes and click the lightbulb button in the floating `.canvas-menu` toolbar. The same action is available as **Create atomic note from canvas selection** in the command palette if toolbar injection is unavailable.

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

When **Surface Pen side-button drag** is enabled, pressing the pen's side button on a Markdown handle starts the same captured drag path as a left-button drag and uses the no-modifier Canvas action. On Canvas itself, the plugin translates the pen side-button pointer and mouse sequence into a captured left-button sequence so cards and the Canvas surface receive the same input as a left-button drag. The check is limited to `pen` events with `buttons & 2`, so ordinary desktop right-click behavior is unchanged.

Touch and pen drops support a Canvas in the same Obsidian window. Mouse dragging continues to support Canvas popout windows. The larger touch handle is enabled only for coarse-pointer environments, so normal editor scrolling and text selection remain unchanged outside the handle.

## Source content and generated notes

For Canvas references and Markdown embeds, DragDrop keeps the Markdown source as the single content source:

- It never cuts, replaces, or moves the dragged source content for Canvas drops or embeds.
- It only adds a missing block ID when a block reference requires one.
- Existing block IDs are reused.
- Heading references use the heading subpath and do not add a block ID.

An explicit Ctrl/Command Markdown drop is the only action that removes source content. It asks before moving blocks with existing IDs and requires an editable source and destination.

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
- Canvas actions, each with its assigned modifier (`Link to source block`, `Create note`, or `Do nothing`)
- Markdown actions, each with its assigned modifier (`Insert source embed`, `Move content`, or `Do nothing`)
- Surface Pen side-button drag
- Canvas selection to atomic note from the floating toolbar or command palette

Canvas and Markdown actions use separate modifier mappings. Choose a modifier from the action row; assigning a modifier to one action clears that modifier from another action in the same group. The default Markdown mapping is no modifier = embed and Ctrl/Command = move.

## Compatibility and limitations

- Surface touch and pen are supported for same-window Canvas drops. iPad compatibility is experimental and unverified because it has not been tested on physical hardware.
- Drag handles are keyboard focusable, and Enter or Space selects the complete source block.
- Touch and pen require the Canvas private APIs used for coordinate lookup and node creation. If those APIs are unavailable, DragDrop cancels the drop before changing the Markdown source.
- The drop target and node creation flow use Obsidian's private Canvas API, so Obsidian updates may require compatibility changes.
- The floating toolbar button uses private `.canvas-menu` DOM observation. If that toolbar changes, the command palette fallback remains available and the rest of the plugin continues to work.
- Surface Pen side-button drag uses Pointer Events and `setPointerCapture()` on Markdown handles and Canvas elements in the current Obsidian window. Disable it in settings if the pen side button should keep its normal context-menu behavior.
- The manifest currently declares Obsidian 1.5.11 as the minimum version. Development uses the Obsidian 1.13.1 type surface; verify older desktop versions before relying on them.
- Markdown → Markdown dragging is supported only between Markdown editors; it does not restructure list indentation or outline hierarchy.
- Canvas height fitting is best effort. If measurement fails, the configured initial height is kept.

## Data changes

Depending on the selected action, DragDrop may:

- Add missing block IDs to the active Markdown editor
- Create folders and Markdown notes in the vault
- Add file or text nodes to the target Canvas
- Move a Markdown block to another editable Markdown note when Ctrl/Command is held and all safety checks pass, regardless of folder

It does not send vault content over the network.

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
