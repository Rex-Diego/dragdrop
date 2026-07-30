import type {
  CanvasDropAction,
  FolderStrategy,
  ListParentDisplay,
  MarkdownDropAction,
  ModifierChord,
  TouchDropAction,
  TitleFilenameMode,
} from "./model";

export interface DragDropSettings {
  defaultFolder: string;
  folderStrategy: FolderStrategy;
  nodeWidth: number;
  initialNodeHeight: number;
  nodeGap: number;
  previewWidth: number;
  touchDropAction: TouchDropAction;
  splitListItems: boolean;
  listParentDisplay: ListParentDisplay;
  titleFilenameMode: TitleFilenameMode;
  canvasBindings: Record<ModifierChord, CanvasDropAction>;
  markdownBindings: Record<ModifierChord, MarkdownDropAction>;
}

export const DEFAULT_SETTINGS: DragDropSettings = {
  defaultFolder: "Distill",
  folderStrategy: "fixed",
  nodeWidth: 400,
  initialNodeHeight: 200,
  nodeGap: 40,
  previewWidth: 400,
  touchDropAction: "link-source",
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
    canvasBindings: {
      ...DEFAULT_SETTINGS.canvasBindings,
      ...loaded?.canvasBindings,
    },
    markdownBindings,
  };
}
