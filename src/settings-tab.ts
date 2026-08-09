import {
  moment,
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
import { settingsTextForLanguage, type SettingsText } from "./settings-i18n";

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
type SameMarkdownActionSettingKey = `sameMarkdownAction.${MarkdownBindingAction}`;
type SettingKey = ScalarSettingKey | CanvasActionSettingKey | MarkdownActionSettingKey | SameMarkdownActionSettingKey;

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

function modifierOptions(text: SettingsText): Record<BindingModifier, string> {
  return {
    [UNASSIGNED_MODIFIER]: text.modifierUnassigned,
    none: text.modifierNone,
    primary: text.modifierPrimary,
    shift: text.modifierShift,
    alt: text.modifierAlt,
    "primary+shift": text.modifierPrimaryShift,
    "primary+alt": text.modifierPrimaryAlt,
    "shift+alt": text.modifierShiftAlt,
    "primary+shift+alt": text.modifierAll,
  };
}

function canvasActionLabel(action: CanvasBindingAction, text: SettingsText): string {
  switch (action) {
    case "link-source": return text.canvasLinkAction;
    case "create-note": return text.canvasCreateAction;
    case "none": return text.cancelDropAction;
  }
}

function markdownActionLabel(action: MarkdownBindingAction, text: SettingsText): string {
  switch (action) {
    case "embed-source": return text.markdownEmbedAction;
    case "move": return text.markdownMoveAction;
    case "none": return text.cancelDropAction;
  }
}

function canvasActionKey(action: CanvasBindingAction): CanvasActionSettingKey {
  return `canvasAction.${action}`;
}

function markdownActionKey(action: MarkdownBindingAction): MarkdownActionSettingKey {
  return `markdownAction.${action}`;
}

function sameMarkdownActionKey(action: MarkdownBindingAction): SameMarkdownActionSettingKey {
  return `sameMarkdownAction.${action}`;
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

function sameMarkdownActionFromKey(key: string): MarkdownBindingAction | undefined {
  if (!key.startsWith("sameMarkdownAction.")) return undefined;
  const action = key.slice("sameMarkdownAction.".length);
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
    const text = settingsTextForLanguage(moment.locale());
    const modifiers = modifierOptions(text);
    const canvasActionItems: DragDropSettingDefinition[] = CANVAS_BINDING_ACTIONS.map((action) => ({
      name: `${text.canvasScope}: ${canvasActionLabel(action, text)}`,
      desc: text.canvasActionDescription,
      control: {
        type: "dropdown",
        key: canvasActionKey(action),
        options: modifiers,
      },
    }));
    const markdownActionItems: DragDropSettingDefinition[] = MARKDOWN_BINDING_ACTIONS.map((action) => ({
      name: `${text.crossMarkdownScope}: ${markdownActionLabel(action, text)}`,
      desc: text.crossMarkdownActionDescription,
      control: {
        type: "dropdown",
        key: markdownActionKey(action),
        options: modifiers,
      },
    }));
    const sameMarkdownActionItems: DragDropSettingDefinition[] = MARKDOWN_BINDING_ACTIONS.map((action) => ({
      name: `${text.sameMarkdownScope}: ${markdownActionLabel(action, text)}`,
      desc: text.sameMarkdownActionDescription,
      control: {
        type: "dropdown",
        key: sameMarkdownActionKey(action),
        options: modifiers,
      },
    }));

    return [
      {
        type: "group",
        heading: text.headingCoreBehavior,
        items: [
          {
            name: text.folderStrategyName,
            desc: text.folderStrategyDescription,
            control: {
              type: "dropdown",
              key: "folderStrategy",
              options: {
                fixed: text.folderFixed,
                source: text.folderSource,
                canvas: text.folderCanvas,
              },
            },
          },
          ...(this.host.config.folderStrategy === "fixed"
            ? [{
                name: text.fixedFolderName,
                desc: text.fixedFolderDescription,
                control: {
                  type: "text" as const,
                  key: "defaultFolder" as const,
                  placeholder: text.fixedFolderPlaceholder,
                },
              }]
            : []),
          {
            name: text.headingFileNamesName,
            desc: text.headingFileNamesDescription,
            control: {
              type: "dropdown",
              key: "titleFilenameMode",
              options: {
                auto: text.headingFileNamesAuto,
                prompt: text.headingFileNamesPrompt,
              },
            },
          },
          {
            name: text.structuralMovesName,
            desc: text.structuralMovesDescription,
            control: { type: "toggle", key: "structuralMarkdownMoves" },
          },
        ],
      },
      {
        type: "group",
        heading: text.headingSelection,
        items: [
          {
            name: text.splitListItemsName,
            desc: text.splitListItemsDescription,
            control: { type: "toggle", key: "splitListItems" },
          },
          {
            name: text.multiBlockSelectionName,
            desc: text.multiBlockSelectionDescription,
            control: { type: "toggle", key: "multiBlockSelection" },
          },
          ...(this.host.config.splitListItems
            ? [{
                name: text.listParentDisplayName,
                desc: text.listParentDisplayDescription,
                control: {
                  type: "dropdown" as const,
                  key: "listParentDisplay" as const,
                  options: {
                    "native-subtree": text.listParentNative,
                    "self-only": text.listParentSelf,
                  },
                },
              }]
            : []),
        ],
      },
      {
        type: "group",
        heading: text.headingAppearance,
        items: [
          {
            name: text.nodeWidthName,
            desc: text.nodeWidthDescription,
            control: { type: "number", key: "nodeWidth", min: 160, max: 1_200, step: 1 },
          },
          {
            name: text.initialNodeHeightName,
            desc: text.initialNodeHeightDescription,
            control: { type: "number", key: "initialNodeHeight", min: 80, max: 1_200, step: 1 },
          },
          {
            name: text.verticalGapName,
            desc: text.verticalGapDescription,
            control: { type: "number", key: "nodeGap", min: 0, max: 400, step: 1 },
          },
          {
            name: text.previewWidthName,
            desc: text.previewWidthDescription,
            control: { type: "number", key: "previewWidth", min: 200, max: 1_000, step: 1 },
          },
          {
            name: text.handlePositionName,
            desc: text.handlePositionDescription,
            control: {
              type: "dropdown",
              key: "handlePosition",
              options: { left: text.handleLeft, right: text.handleRight },
            },
          },
          {
            name: text.handleVisibilityName,
            desc: text.handleVisibilityDescription,
            control: {
              type: "dropdown",
              key: "handleVisibility",
              options: {
                hover: text.handleVisibilityHover,
                always: text.handleVisibilityAlways,
              },
            },
          },
          {
            name: text.canvasSummaryButtonName,
            desc: text.canvasSummaryButtonDescription,
            control: { type: "toggle", key: "canvasSummaryButton" },
          },
        ],
      },
      {
        type: "group",
        heading: text.headingMobilePen,
        items: [
          {
            name: text.touchDropActionName,
            desc: text.touchDropActionDescription,
            control: {
              type: "dropdown",
              key: "touchDropAction",
              options: {
                "link-source": text.canvasLinkAction,
                "create-note": text.canvasCreateAction,
                none: text.cancelDropAction,
              },
            },
          },
          {
            name: text.surfacePenName,
            desc: text.surfacePenDescription,
            control: { type: "toggle", key: "surfacePenSideButtonDrag" },
          },
          {
            name: text.largerTouchHandlesName,
            desc: text.largerTouchHandlesDescription,
            control: { type: "toggle", key: "largeTouchHandles" },
          },
          {
            name: text.mobileInteractionsName,
            desc: text.mobileInteractionsDescription,
            control: { type: "toggle", key: "mobileBlockInteractions" },
          },
        ],
      },
      {
        type: "group",
        heading: text.headingAdvanced,
        items: [
          {
            name: text.editableEmbedsName,
            desc: text.editableEmbedsDescription,
            control: { type: "toggle", key: "editableBlockEmbeds" },
          },
          {
            name: text.blockMenuName,
            desc: text.blockMenuDescription,
            control: { type: "toggle", key: "blockTypeMenu" },
          },
          {
            name: text.crossFileTargetsName,
            desc: text.crossFileTargetsDescription,
            control: { type: "toggle", key: "crossFileFileTargets" },
          },
          {
            name: text.edgeAutoScrollName,
            desc: text.edgeAutoScrollDescription,
            control: { type: "toggle", key: "edgeAutoScroll" },
          },
          {
            name: text.preserveFoldStateName,
            desc: text.preserveFoldStateDescription,
            control: { type: "toggle", key: "preserveFoldState" },
          },
          {
            name: text.renumberListsName,
            desc: text.renumberListsDescription,
            control: { type: "toggle", key: "renumberOrderedLists" },
          },
          ...(this.host.config.edgeAutoScroll
            ? [
                {
                  name: text.autoScrollEdgeName,
                  desc: text.autoScrollEdgeDescription,
                  control: {
                    type: "number" as const,
                    key: "autoScrollEdgePx" as const,
                    min: 20,
                    max: 200,
                    step: 1,
                  },
                },
                {
                  name: text.autoScrollSpeedName,
                  desc: text.autoScrollSpeedDescription,
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
          ...sameMarkdownActionItems,
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

    const sameMarkdownAction = sameMarkdownActionFromKey(key);
    if (sameMarkdownAction !== undefined) {
      return assignedModifierForAction(this.host.config.sameMarkdownBindings, sameMarkdownAction);
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

    const sameMarkdownAction = sameMarkdownActionFromKey(key);
    if (sameMarkdownAction !== undefined) {
      if (!isBindingModifier(value)) return;
      assignModifierToAction(this.host.config.sameMarkdownBindings, sameMarkdownAction, value);
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
        new Notice(settingsTextForLanguage(moment.locale()).reloadEditableEmbedsNotice);
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
