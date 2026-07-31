import type {
  CanvasDropAction,
  FolderStrategy,
  ListParentDisplay,
  MarkdownDropAction,
  ModifierChord,
  TouchDropAction,
  TitleFilenameMode,
} from "./model";
import { MODIFIER_CHORDS } from "./model";

export interface DragDropSettings {
  defaultFolder: string;
  folderStrategy: FolderStrategy;
  nodeWidth: number;
  initialNodeHeight: number;
  nodeGap: number;
  previewWidth: number;
  touchDropAction: TouchDropAction;
  surfacePenSideButtonDrag: boolean;
  largeTouchHandles: boolean;
  canvasSummaryButton: boolean;
  splitListItems: boolean;
  listParentDisplay: ListParentDisplay;
  titleFilenameMode: TitleFilenameMode;
  canvasBindings: Record<ModifierChord, CanvasDropAction>;
  markdownBindings: Record<ModifierChord, MarkdownDropAction>;
}

export const UNASSIGNED_MODIFIER = "unassigned" as const;
export type BindingModifier = ModifierChord | typeof UNASSIGNED_MODIFIER;

export function assignedModifierForAction<T extends CanvasDropAction | MarkdownDropAction>(
  bindings: Readonly<Record<ModifierChord, T>>,
  action: Exclude<T, "inherit">,
): BindingModifier {
  return MODIFIER_CHORDS.find((chord) => bindings[chord] === action) ?? UNASSIGNED_MODIFIER;
}

export function assignModifierToAction<T extends CanvasDropAction | MarkdownDropAction>(
  bindings: Record<ModifierChord, T>,
  action: Exclude<T, "inherit">,
  modifier: BindingModifier,
): void {
  for (const chord of MODIFIER_CHORDS) {
    if (bindings[chord] === action) bindings[chord] = "inherit" as T;
  }
  if (modifier === UNASSIGNED_MODIFIER) return;

  bindings[modifier] = action;
  for (const chord of MODIFIER_CHORDS) {
    if (chord !== modifier && bindings[chord] === action) bindings[chord] = "inherit" as T;
  }
}

export const DEFAULT_SETTINGS: DragDropSettings = {
  defaultFolder: "Distill",
  folderStrategy: "fixed",
  nodeWidth: 400,
  initialNodeHeight: 200,
  nodeGap: 40,
  previewWidth: 400,
  touchDropAction: "link-source",
  surfacePenSideButtonDrag: true,
  largeTouchHandles: true,
  canvasSummaryButton: true,
  splitListItems: true,
  listParentDisplay: "native-subtree",
  titleFilenameMode: "auto",
  canvasBindings: {
    none: "link-source",
    primary: "create-note",
    shift: "inherit",
    alt: "inherit",
    "primary+shift": "inherit",
    "primary+alt": "inherit",
    "shift+alt": "inherit",
    "primary+shift+alt": "inherit",
  },
  markdownBindings: {
    none: "embed-source",
    primary: "move",
    shift: "inherit",
    alt: "inherit",
    "primary+shift": "inherit",
    "primary+alt": "inherit",
    "shift+alt": "inherit",
    "primary+shift+alt": "inherit",
  },
};

export function mergeSettings(
  loaded: Partial<DragDropSettings> | null | undefined,
): DragDropSettings {
  const loadedSettings = { ...loaded };
  Reflect.deleteProperty(loadedSettings, "protectedFolders");
  const loadedMarkdownBindings = loaded?.markdownBindings as
    | Record<string, unknown>
    | undefined;
  const markdownBindings = {
    ...DEFAULT_SETTINGS.markdownBindings,
    ...loaded?.markdownBindings,
  };
  const hasLegacyDefaults =
    loadedMarkdownBindings?.none === "move" &&
    loadedMarkdownBindings.primary === "link-source" &&
    loadedMarkdownBindings["primary+shift"] === "embed-source";
  if (hasLegacyDefaults) {
    markdownBindings.none = DEFAULT_SETTINGS.markdownBindings.none;
    markdownBindings.primary = DEFAULT_SETTINGS.markdownBindings.primary;
    markdownBindings["primary+shift"] = DEFAULT_SETTINGS.markdownBindings["primary+shift"];
  }
  for (const chord of Object.keys(markdownBindings) as ModifierChord[]) {
    if ((markdownBindings[chord] as unknown) === "link-source") {
      markdownBindings[chord] = "embed-source";
    }
  }

  return {
    ...DEFAULT_SETTINGS,
    ...loadedSettings,
    surfacePenSideButtonDrag:
      typeof loaded?.surfacePenSideButtonDrag === "boolean"
        ? loaded.surfacePenSideButtonDrag
        : DEFAULT_SETTINGS.surfacePenSideButtonDrag,
    largeTouchHandles:
      typeof loaded?.largeTouchHandles === "boolean"
        ? loaded.largeTouchHandles
        : DEFAULT_SETTINGS.largeTouchHandles,
    canvasSummaryButton:
      typeof loaded?.canvasSummaryButton === "boolean"
        ? loaded.canvasSummaryButton
        : DEFAULT_SETTINGS.canvasSummaryButton,
    canvasBindings: {
      ...DEFAULT_SETTINGS.canvasBindings,
      ...loaded?.canvasBindings,
    },
    markdownBindings,
  };
}
