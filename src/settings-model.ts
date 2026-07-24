import type {
  ArrowDirection,
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
  autoLink: boolean;
  arrowTo: ArrowDirection;
  defaultLinkLabel: string;
  canvasBindings: Record<ModifierChord, CanvasDropAction>;
  markdownBindings: Record<ModifierChord, MarkdownDropAction>;
}

export const DEFAULT_SETTINGS: DragDropSettings = {
  defaultFolder: "Atlas/x/Quotes",
  folderStrategy: "fixed",
  nodeWidth: 400,
  initialNodeHeight: 200,
  nodeGap: 40,
  previewWidth: 400,
  touchDropAction: "link-source",
  splitListItems: true,
  listParentDisplay: "native-subtree",
  titleFilenameMode: "auto",
  autoLink: false,
  arrowTo: "end",
  defaultLinkLabel: "",
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
    none: "move",
    primary: "link-source",
    shift: "inherit",
    alt: "inherit",
    "primary+shift": "embed-source",
    "primary+alt": "inherit",
    "shift+alt": "inherit",
    "primary+shift+alt": "inherit",
  },
};

export function mergeSettings(
  loaded: Partial<DragDropSettings> | null | undefined,
): DragDropSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    canvasBindings: {
      ...DEFAULT_SETTINGS.canvasBindings,
      ...loaded?.canvasBindings,
    },
    markdownBindings: {
      ...DEFAULT_SETTINGS.markdownBindings,
      ...loaded?.markdownBindings,
    },
  };
}
