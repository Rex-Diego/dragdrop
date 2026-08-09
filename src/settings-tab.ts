import {
  Notice,
  PluginSettingTab,
  Setting,
  type App,
  type Plugin,
  type SettingDefinitionControl,
  type SettingDefinitionGroup,
  type SettingDefinitionItem,
  type SettingDropdownControl,
  type SettingNumberControl,
  type SettingTextControl,
  type SettingToggleControl,
} from "obsidian";
import {
  MODIFIER_CHORDS,
  type CanvasDropAction,
  type MarkdownDropAction,
  type ModifierChord,
  type TouchDropAction,
} from "./model";
import {
  assignedModifierForAction,
  assignModifierToAction,
  UNASSIGNED_MODIFIER,
  type BindingModifier,
  type DragDropSettings,
} from "./settings-model";

interface SettingsHost {
  config: DragDropSettings;
  saveSettings(): Promise<void>;
}

type ScalarSettingKey =
  | "splitListItems"
  | "listParentDisplay"
  | "titleFilenameMode"
  | "folderStrategy"
  | "defaultFolder"
  | "nodeWidth"
  | "initialNodeHeight"
  | "nodeGap"
  | "previewWidth"
  | "handlePosition"
  | "handleVisibility"
  | "touchDropAction"
  | "surfacePenSideButtonDrag"
  | "largeTouchHandles"
  | "canvasSummaryButton"
  | "editableBlockEmbeds"
  | "structuralMarkdownMoves"
  | "multiBlockSelection"
  | "blockTypeMenu"
  | "crossFileFileTargets"
  | "edgeAutoScroll"
  | "autoScrollEdgePx"
  | "autoScrollMaxSpeed"
  | "preserveFoldState"
  | "renumberOrderedLists"
  | "mobileBlockInteractions";

type CanvasBindingAction = Exclude<CanvasDropAction, "inherit">;
type MarkdownBindingAction = Exclude<MarkdownDropAction, "inherit">;
type CanvasActionSettingKey = `canvasAction.${CanvasBindingAction}`;
type MarkdownActionSettingKey = `markdownAction.${MarkdownBindingAction}`;
type SettingKey = ScalarSettingKey | CanvasActionSettingKey | MarkdownActionSettingKey;

type SupportedSettingControl =
  | SettingToggleControl<SettingKey>
  | SettingDropdownControl<SettingKey>
  | SettingTextControl<SettingKey>
  | SettingNumberControl<SettingKey>;

type DragDropSettingDefinition = Omit<SettingDefinitionControl<SettingKey>, "control"> & {
  control: SupportedSettingControl;
};

type DragDropSettingGroup = Omit<SettingDefinitionGroup<SettingKey>, "items" | "type"> & {
  type: "group";
  heading: string;
  items: DragDropSettingDefinition[];
};

const CHORD_LABELS: Record<ModifierChord, string> = {
  none: "No modifier",
  primary: "Ctrl / Command",
  shift: "Shift",
  alt: "Alt or Option",
  "primary+shift": "Ctrl / Command + Shift",
  "primary+alt": "Ctrl / Command + Alt or Option",
  "shift+alt": "Shift + Alt or Option",
  "primary+shift+alt": "Ctrl / Command + Shift + Alt or Option",
};

const MODIFIER_OPTIONS: Record<BindingModifier, string> = {
  [UNASSIGNED_MODIFIER]: "Not assigned",
  ...CHORD_LABELS,
};

const CANVAS_BINDING_ACTIONS: CanvasBindingAction[] = [
  "link-source",
  "create-note",
  "none",
];

const MARKDOWN_BINDING_ACTIONS: MarkdownBindingAction[] = [
  "embed-source",
  "move",
  "none",
];

const CANVAS_ACTION_LABELS: Record<CanvasDropAction, string> = {
  inherit: "Use no-modifier action",
  "link-source": "Link to source block",
  "create-note": "Create note",
  none: "Do nothing",
};

const MARKDOWN_ACTION_LABELS: Record<MarkdownDropAction, string> = {
  inherit: "Use no-modifier action",
  move: "Move content",
  "embed-source": "Insert source embed",
  none: "Do nothing",
};

function canvasActionKey(action: CanvasBindingAction): CanvasActionSettingKey {
  return `canvasAction.${action}`;
}

function markdownActionKey(action: MarkdownBindingAction): MarkdownActionSettingKey {
  return `markdownAction.${action}`;
}

function isModifierChord(value: string): value is ModifierChord {
  return MODIFIER_CHORDS.some((chord) => chord === value);
}

function canvasActionFromKey(key: string): CanvasBindingAction | undefined {
  if (!key.startsWith("canvasAction.")) return undefined;
  const action = key.slice("canvasAction.".length);
  return isCanvasBindingAction(action) ? action : undefined;
}

function markdownActionFromKey(key: string): MarkdownBindingAction | undefined {
  if (!key.startsWith("markdownAction.")) return undefined;
  const action = key.slice("markdownAction.".length);
  return isMarkdownBindingAction(action) ? action : undefined;
}

function isCanvasBindingAction(value: string): value is CanvasBindingAction {
  return CANVAS_BINDING_ACTIONS.some((action) => action === value);
}

function isMarkdownBindingAction(value: string): value is MarkdownBindingAction {
  return MARKDOWN_BINDING_ACTIONS.some((action) => action === value);
}

function isBindingModifier(value: unknown): value is BindingModifier {
  return value === UNASSIGNED_MODIFIER || (typeof value === "string" && isModifierChord(value));
}

function isTouchDropAction(value: unknown): value is TouchDropAction {
  return value === "link-source" || value === "create-note" || value === "none";
}

function clampInteger(value: unknown, minimum: number, maximum: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export class DragDropSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly host: Plugin & SettingsHost) {
    super(app, host);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.containerEl.addClass("dragdrop-settings");
    return this.getSettingGroups();
  }

  getControlValue(key: string): unknown {
    return this.readControlValue(key);
  }

  setControlValue(key: string, value: unknown): Promise<void> {
    return this.writeControlValue(key, value);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("dragdrop-settings");

    for (const group of this.getSettingGroups()) {
      new Setting(containerEl).setName(group.heading).setHeading();
      for (const definition of group.items) this.addLegacySetting(definition);
    }
  }

  private getSettingGroups(): DragDropSettingGroup[] {
    const canvasActionItems: DragDropSettingDefinition[] = CANVAS_BINDING_ACTIONS.map((action) => ({
      name: `Canvas: ${CANVAS_ACTION_LABELS[action]}`,
      desc: "Choose the modifier used for this action. Selecting a modifier clears it from another action.",
      control: {
        type: "dropdown",
        key: canvasActionKey(action),
        options: MODIFIER_OPTIONS,
      },
    }));
    const markdownActionItems: DragDropSettingDefinition[] = MARKDOWN_BINDING_ACTIONS.map((action) => ({
      name: `Markdown: ${MARKDOWN_ACTION_LABELS[action]}`,
      desc: "Choose the modifier used for this action. Selecting a modifier clears it from another action.",
      control: {
        type: "dropdown",
        key: markdownActionKey(action),
        options: MODIFIER_OPTIONS,
      },
    }));

    return [
      {
        type: "group",
        heading: "Core behavior",
        items: [
          {
            name: "Folder strategy",
            desc: "Choose where notes created by drag and drop are stored.",
            control: {
              type: "dropdown",
              key: "folderStrategy",
              options: {
                fixed: "Fixed folder",
                source: "Source note folder",
                canvas: "Canvas folder",
              },
            },
          },
          ...(this.host.config.folderStrategy === "fixed"
            ? [{
                name: "Fixed folder",
                desc: "Used when the folder strategy is fixed. Missing folders are created automatically.",
                control: {
                  type: "text" as const,
                  key: "defaultFolder" as const,
                  placeholder: "Folder/path",
                },
              }]
            : []),
          {
            name: "Heading file names",
            desc: "Use cleaned heading text automatically or ask every time a heading creates a note.",
            control: {
              type: "dropdown",
              key: "titleFilenameMode",
              options: {
                auto: "Use heading text",
                prompt: "Always ask",
              },
            },
          },
          {
            name: "Structural Markdown moves",
            desc: "Use list-aware sibling, child and outdent behavior when the Markdown action is Move content.",
            control: { type: "toggle", key: "structuralMarkdownMoves" },
          },
        ],
      },
      {
        type: "group",
        heading: "Selection",
        items: [
          {
            name: "Split list items",
            desc: "Create one canvas card for every list item in the dragged range.",
            control: { type: "toggle", key: "splitListItems" },
          },
          {
            name: "Multi-block selection",
            desc: "Allow Shift+handle range selection and desktop long-press brushing before dragging.",
            control: { type: "toggle", key: "multiBlockSelection" },
          },
          ...(this.host.config.splitListItems
            ? [{
                name: "List parent display",
                desc: "Native subtree uses a file node. Self only uses a linked text node when a parent has children.",
                control: {
                  type: "dropdown" as const,
                  key: "listParentDisplay" as const,
                  options: {
                    "native-subtree": "Native subtree",
                    "self-only": "Self only",
                  },
                },
              }]
            : []),
        ],
      },
      {
        type: "group",
        heading: "Appearance",
        items: [
          {
            name: "Node width",
            desc: "Fixed width for created Canvas nodes.",
            control: { type: "number", key: "nodeWidth", min: 160, max: 1_200, step: 1 },
          },
          {
            name: "Initial node height",
            desc: "Height used until rendered content is measured.",
            control: { type: "number", key: "initialNodeHeight", min: 80, max: 1_200, step: 1 },
          },
          {
            name: "Vertical gap",
            desc: "Space between cards created by one drop.",
            control: { type: "number", key: "nodeGap", min: 0, max: 400, step: 1 },
          },
          {
            name: "Drag preview width",
            desc: "Width of the transparent Markdown preview that follows the pointer.",
            control: { type: "number", key: "previewWidth", min: 200, max: 1_000, step: 1 },
          },
          {
            name: "Handle position",
            desc: "Place Markdown block handles on the left or right side of the editor line.",
            control: {
              type: "dropdown",
              key: "handlePosition",
              options: { left: "Left", right: "Right" },
            },
          },
          {
            name: "Handle visibility",
            desc: "Show handles only on hover/focus or keep them visible while editing.",
            control: {
              type: "dropdown",
              key: "handleVisibility",
              options: { hover: "Hover or focus", always: "Always visible" },
            },
          },
          {
            name: "Canvas atomic note button",
            desc: "Show the floating toolbar button for turning the current Canvas selection into an atomic note. The command remains available.",
            control: { type: "toggle", key: "canvasSummaryButton" },
          },
        ],
      },
      {
        type: "group",
        heading: "Mobile and pen",
        items: [
          {
            name: "Touch drop action",
            desc: "Used for finger or pen drops without a keyboard modifier.",
            control: {
              type: "dropdown",
              key: "touchDropAction",
              options: {
                "link-source": "Link to source block",
                "create-note": "Create note",
                none: "Do nothing",
              },
            },
          },
          {
            name: "Surface Pen side-button drag",
            desc: "Treat the Surface Pen side button as a left-button drag on a Markdown handle.",
            control: { type: "toggle", key: "surfacePenSideButtonDrag" },
          },
          {
            name: "Larger touch handles",
            desc: "Use 44 x 44 touch targets for Markdown handles on coarse-pointer devices.",
            control: { type: "toggle", key: "largeTouchHandles" },
          },
          {
            name: "Mobile block interactions",
            desc: "After a 200 ms long press, brush across Markdown handles to select blocks; short movement still starts a drag.",
            control: { type: "toggle", key: "mobileBlockInteractions" },
          },
        ],
      },
      {
        type: "group",
        heading: "Advanced",
        items: [
          {
            name: "Editable block embeds",
            desc: "Allow editing a Markdown block inside ![[file#^block-id]] embeds and write changes back to the original block. Requires an Obsidian reload.",
            control: { type: "toggle", key: "editableBlockEmbeds" },
          },
          {
            name: "Block type menu",
            desc: "Show the Markdown block menu with Copy, Cut, Delete and safe type conversions.",
            control: { type: "toggle", key: "blockTypeMenu" },
          },
          {
            name: "Cross-file file targets",
            desc: "Allow dropping onto Markdown files in the file tree or internal links to append at the end.",
            control: { type: "toggle", key: "crossFileFileTargets" },
          },
          {
            name: "Edge auto-scroll",
            desc: "Scroll the Markdown editor while a drag is held near its edge.",
            control: { type: "toggle", key: "edgeAutoScroll" },
          },
          {
            name: "Preserve fold state",
            desc: "Restore heading and list folds after a structural move when CodeMirror can still fold the destination.",
            control: { type: "toggle", key: "preserveFoldState" },
          },
          {
            name: "Renumber ordered lists after Move",
            desc: "Recalculate contiguous ordered-list markers after a structural move. Off keeps every marker verbatim.",
            control: { type: "toggle", key: "renumberOrderedLists" },
          },
          ...(this.host.config.edgeAutoScroll
            ? [
                {
                  name: "Auto-scroll edge zone",
                  desc: "Distance from the editor edge at which scrolling begins.",
                  control: {
                    type: "number" as const,
                    key: "autoScrollEdgePx" as const,
                    min: 20,
                    max: 200,
                    step: 1,
                  },
                },
                {
                  name: "Auto-scroll maximum speed",
                  desc: "Maximum scroll speed in pixels per animation frame.",
                  control: {
                    type: "number" as const,
                    key: "autoScrollMaxSpeed" as const,
                    min: 1,
                    max: 30,
                    step: 1,
                  },
                },
              ]
            : []),
          ...canvasActionItems,
          ...markdownActionItems,
        ],
      },
    ];
  }

  private addLegacySetting(definition: DragDropSettingDefinition): void {
    const setting = new Setting(this.containerEl).setName(definition.name);
    if (definition.desc !== undefined) setting.setDesc(definition.desc);

    const { control } = definition;
    const currentValue = this.readControlValue(control.key);

    switch (control.type) {
      case "toggle":
        setting.addToggle((toggle) =>
          toggle
            .setValue(typeof currentValue === "boolean" ? currentValue : (control.defaultValue ?? false))
            .onChange((value) => {
              void this.writeControlValue(control.key, value);
            }),
        );
        break;
      case "dropdown":
        setting.addDropdown((dropdown) => {
          for (const [value, label] of Object.entries(control.options)) {
            dropdown.addOption(value, label);
          }
          dropdown
            .setValue(typeof currentValue === "string" ? currentValue : (control.defaultValue ?? ""))
            .onChange((value) => {
              void this.writeControlValue(control.key, value);
            });
        });
        break;
      case "text":
        setting.addText((text) => {
          if (control.placeholder !== undefined) text.setPlaceholder(control.placeholder);
          text
            .setValue(typeof currentValue === "string" ? currentValue : (control.defaultValue ?? ""))
            .onChange((value) => {
              void this.writeControlValue(control.key, value);
            });
        });
        break;
      case "number":
        setting.addText((text) => {
          text.inputEl.type = "number";
          if (control.min !== undefined) text.inputEl.min = control.min.toString();
          if (control.max !== undefined) text.inputEl.max = control.max.toString();
          if (control.step !== undefined) text.inputEl.step = control.step.toString();
          if (control.placeholder !== undefined) text.setPlaceholder(control.placeholder);
          text
            .setValue(typeof currentValue === "number" ? currentValue.toString() : (control.defaultValue ?? 0).toString())
            .onChange((value) => {
              const parsed = Number.parseInt(value, 10);
              if (!Number.isFinite(parsed)) return;
              void this.writeControlValue(control.key, parsed);
            });
        });
        break;
    }
  }

  private readControlValue(key: string): unknown {
    const canvasAction = canvasActionFromKey(key);
    if (canvasAction !== undefined) {
      return assignedModifierForAction(this.host.config.canvasBindings, canvasAction);
    }

    const markdownAction = markdownActionFromKey(key);
    if (markdownAction !== undefined) {
      return assignedModifierForAction(this.host.config.markdownBindings, markdownAction);
    }

    switch (key) {
      case "splitListItems":
        return this.host.config.splitListItems;
      case "listParentDisplay":
        return this.host.config.listParentDisplay;
      case "titleFilenameMode":
        return this.host.config.titleFilenameMode;
      case "folderStrategy":
        return this.host.config.folderStrategy;
      case "defaultFolder":
        return this.host.config.defaultFolder;
      case "nodeWidth":
        return this.host.config.nodeWidth;
      case "initialNodeHeight":
        return this.host.config.initialNodeHeight;
      case "nodeGap":
        return this.host.config.nodeGap;
      case "previewWidth":
        return this.host.config.previewWidth;
      case "handlePosition":
        return this.host.config.handlePosition;
      case "handleVisibility":
        return this.host.config.handleVisibility;
      case "touchDropAction":
        return this.host.config.touchDropAction;
      case "surfacePenSideButtonDrag":
        return this.host.config.surfacePenSideButtonDrag;
      case "largeTouchHandles":
        return this.host.config.largeTouchHandles;
      case "canvasSummaryButton":
        return this.host.config.canvasSummaryButton;
      case "editableBlockEmbeds":
        return this.host.config.editableBlockEmbeds;
      case "structuralMarkdownMoves":
        return this.host.config.structuralMarkdownMoves;
      case "multiBlockSelection":
        return this.host.config.multiBlockSelection;
      case "blockTypeMenu":
        return this.host.config.blockTypeMenu;
      case "crossFileFileTargets":
        return this.host.config.crossFileFileTargets;
      case "edgeAutoScroll":
        return this.host.config.edgeAutoScroll;
      case "autoScrollEdgePx":
        return this.host.config.autoScrollEdgePx;
      case "autoScrollMaxSpeed":
        return this.host.config.autoScrollMaxSpeed;
      case "preserveFoldState":
        return this.host.config.preserveFoldState;
      case "renumberOrderedLists":
        return this.host.config.renumberOrderedLists;
      case "mobileBlockInteractions":
        return this.host.config.mobileBlockInteractions;
      default:
        return undefined;
    }
  }

  private async writeControlValue(key: string, value: unknown): Promise<void> {
    const canvasAction = canvasActionFromKey(key);
    if (canvasAction !== undefined) {
      if (!isBindingModifier(value)) return;
      assignModifierToAction(this.host.config.canvasBindings, canvasAction, value);
      await this.host.saveSettings();
      return;
    }

    const markdownAction = markdownActionFromKey(key);
    if (markdownAction !== undefined) {
      if (!isBindingModifier(value)) return;
      assignModifierToAction(this.host.config.markdownBindings, markdownAction, value);
      await this.host.saveSettings();
      return;
    }

    switch (key) {
      case "splitListItems":
        if (typeof value !== "boolean") return;
        this.host.config.splitListItems = value;
        break;
      case "listParentDisplay":
        if (value !== "native-subtree" && value !== "self-only") return;
        this.host.config.listParentDisplay = value;
        break;
      case "titleFilenameMode":
        if (value !== "auto" && value !== "prompt") return;
        this.host.config.titleFilenameMode = value;
        break;
      case "folderStrategy":
        if (value !== "fixed" && value !== "source" && value !== "canvas") return;
        this.host.config.folderStrategy = value;
        break;
      case "defaultFolder":
        if (typeof value !== "string") return;
        this.host.config.defaultFolder = value;
        break;
      case "nodeWidth": {
        const normalized = clampInteger(value, 160, 1_200);
        if (normalized === undefined) return;
        this.host.config.nodeWidth = normalized;
        break;
      }
      case "initialNodeHeight": {
        const normalized = clampInteger(value, 80, 1_200);
        if (normalized === undefined) return;
        this.host.config.initialNodeHeight = normalized;
        break;
      }
      case "nodeGap": {
        const normalized = clampInteger(value, 0, 400);
        if (normalized === undefined) return;
        this.host.config.nodeGap = normalized;
        break;
      }
      case "previewWidth": {
        const normalized = clampInteger(value, 200, 1_000);
        if (normalized === undefined) return;
        this.host.config.previewWidth = normalized;
        break;
      }
      case "handlePosition":
        if (value !== "left" && value !== "right") return;
        this.host.config.handlePosition = value;
        break;
      case "handleVisibility":
        if (value !== "hover" && value !== "always") return;
        this.host.config.handleVisibility = value;
        break;
      case "touchDropAction":
        if (!isTouchDropAction(value)) return;
        this.host.config.touchDropAction = value;
        break;
      case "surfacePenSideButtonDrag":
        if (typeof value !== "boolean") return;
        this.host.config.surfacePenSideButtonDrag = value;
        break;
      case "largeTouchHandles":
        if (typeof value !== "boolean") return;
        this.host.config.largeTouchHandles = value;
        break;
      case "canvasSummaryButton":
        if (typeof value !== "boolean") return;
        this.host.config.canvasSummaryButton = value;
        break;
      case "editableBlockEmbeds":
        if (typeof value !== "boolean") return;
        this.host.config.editableBlockEmbeds = value;
        await this.host.saveSettings();
        new Notice("Reload Obsidian to apply editable block embeds.");
        return;
      case "structuralMarkdownMoves":
        if (typeof value !== "boolean") return;
        this.host.config.structuralMarkdownMoves = value;
        break;
      case "multiBlockSelection":
        if (typeof value !== "boolean") return;
        this.host.config.multiBlockSelection = value;
        break;
      case "blockTypeMenu":
        if (typeof value !== "boolean") return;
        this.host.config.blockTypeMenu = value;
        break;
      case "crossFileFileTargets":
        if (typeof value !== "boolean") return;
        this.host.config.crossFileFileTargets = value;
        break;
      case "edgeAutoScroll":
        if (typeof value !== "boolean") return;
        this.host.config.edgeAutoScroll = value;
        break;
      case "autoScrollEdgePx": {
        const normalized = clampInteger(value, 20, 200);
        if (normalized === undefined) return;
        this.host.config.autoScrollEdgePx = normalized;
        break;
      }
      case "autoScrollMaxSpeed": {
        const normalized = clampInteger(value, 1, 30);
        if (normalized === undefined) return;
        this.host.config.autoScrollMaxSpeed = normalized;
        break;
      }
      case "preserveFoldState":
        if (typeof value !== "boolean") return;
        this.host.config.preserveFoldState = value;
        break;
      case "renumberOrderedLists":
        if (typeof value !== "boolean") return;
        this.host.config.renumberOrderedLists = value;
        break;
      case "mobileBlockInteractions":
        if (typeof value !== "boolean") return;
        this.host.config.mobileBlockInteractions = value;
        break;
      default:
        return;
    }

    await this.host.saveSettings();
  }
}
