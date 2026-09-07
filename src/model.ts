import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { TFile } from "obsidian";

export const MODIFIER_CHORDS = [
  "none",
  "primary",
  "shift",
  "alt",
  "primary+shift",
  "primary+alt",
  "shift+alt",
  "primary+shift+alt",
] as const;

export type ModifierChord = (typeof MODIFIER_CHORDS)[number];

export type CanvasDropAction =
  | "inherit"
  | "link-source"
  | "create-note"
  | "none";

export type TouchDropAction = Exclude<CanvasDropAction, "inherit">;

export type MarkdownDropAction =
  | "inherit"
  | "embed-source"
  | "link-source"
  | "move"
  | "none";

export type FolderStrategy = "fixed" | "source" | "canvas";
export type ListParentDisplay = "native-subtree" | "self-only";
export type TitleFilenameMode = "auto" | "prompt";
export type SourceUnitKind =
  | "paragraph"
  | "heading"
  | "list-item"
  | "list-tree"
  | "code"
  | "math"
  | "quote"
  | "callout"
  | "table";

export interface SourceUnit {
  from: number;
  to: number;
  text: string;
  kind: SourceUnitKind;
  heading?: string;
  headingLevel?: number;
  existingBlockId?: string;
  plannedBlockId?: string;
  blockIdInsert?: {
    pos: number;
    text: string;
  };
  listDepth?: number;
  hasListChildren?: boolean;
  anchorFrom?: number;
  anchorTo?: number;
  /**
   * Position used when a block ID is inserted. This is intentionally
   * separate from anchorTo: a list-tree may reference the complete subtree
   * while its ID belongs on the root list item's line.
   */
  blockIdAnchorTo?: number;
  blockIdPlacement?: "inline" | "standalone";
  selfOnlyText?: string;
}

export interface DragSession {
  id: string;
  sourceFile: TFile;
  sourceView: EditorView;
  sourceState: EditorState;
  sourcePath: string;
  units: SourceUnit[];
  previewMarkdown: string;
}

export interface PlannedFileTask {
  unit: SourceUnit;
  suggestedName: string;
  chosenName?: string;
  skipped?: boolean;
}

export function modifierChordFromEvent(
  event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
): ModifierChord {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("primary");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");
  return (parts.length === 0 ? "none" : parts.join("+")) as ModifierChord;
}
