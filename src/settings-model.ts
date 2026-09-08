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
import { normalizeEmbedAlias } from "./block-reference";

export const SETTINGS_SCHEMA_VERSION = 4;
export const DEFAULT_CROSS_MARKDOWN_EMBED_ALIAS = "🔗";
export type HandlePosition = "left" | "right";
export type HandleVisibility = "hover" | "always";

export interface DragDropSettings {
  schemaVersion: number;
  defaultFolder: string;
  folderStrategy: FolderStrategy;
  nodeWidth: number;
  initialNodeHeight: number;
  nodeGap: number;
  previewWidth: number;
  handlePosition: HandlePosition;
  handleVisibility: HandleVisibility;
  touchDropAction: TouchDropAction;
  surfacePenSideButtonDrag: boolean;
  iosPencilMapping: boolean;
  largeTouchHandles: boolean;
  canvasSummaryButton: boolean;
  editableBlockEmbeds: boolean;
  structuralMarkdownMoves: boolean;
  multiBlockSelection: boolean;
  blockTypeMenu: boolean;
  crossFileFileTargets: boolean;
  crossMarkdownEmbedAlias: string;
  edgeAutoScroll: boolean;
  autoScrollEdgePx: number;
  autoScrollMaxSpeed: number;
  preserveFoldState: boolean;
  renumberOrderedLists: boolean;
  mobileBlockInteractions: boolean;
  selectionMenuAutoDismissSeconds: number;
  splitListItems: boolean;
  listParentDisplay: ListParentDisplay;
  titleFilenameMode: TitleFilenameMode;
  canvasBindings: Record<ModifierChord, CanvasDropAction>;
  markdownBindings: Record<ModifierChord, MarkdownDropAction>;
  sameMarkdownBindings: Record<ModifierChord, MarkdownDropAction>;
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
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  defaultFolder: "Distill",
  folderStrategy: "fixed",
  nodeWidth: 400,
  initialNodeHeight: 200,
  nodeGap: 40,
  previewWidth: 400,
  handlePosition: "right",
  handleVisibility: "hover",
  touchDropAction: "link-source",
  surfacePenSideButtonDrag: true,
  iosPencilMapping: true,
  largeTouchHandles: true,
  canvasSummaryButton: true,
  editableBlockEmbeds: false,
  structuralMarkdownMoves: true,
  multiBlockSelection: true,
  blockTypeMenu: true,
  crossFileFileTargets: true,
  crossMarkdownEmbedAlias: DEFAULT_CROSS_MARKDOWN_EMBED_ALIAS,
  edgeAutoScroll: true,
  autoScrollEdgePx: 60,
  autoScrollMaxSpeed: 12,
  preserveFoldState: true,
  renumberOrderedLists: false,
  mobileBlockInteractions: false,
  selectionMenuAutoDismissSeconds: 3,
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
  sameMarkdownBindings: {
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

type LegacySettings = Omit<
  Partial<DragDropSettings>,
  "schemaVersion" | "crossMarkdownEmbedAlias"
> & {
  protectedFolders?: unknown;
  schemaVersion?: unknown;
  crossMarkdownEmbedAlias?: unknown;
};

function clampSavedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export function normalizeSelectionMenuAutoDismissSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0) return -1;
  return Math.min(3_600, value);
}

/**
 * Normalize the optional label used by Markdown block links.
 * Unicode, including emoji, is preserved; only wikilink delimiters and line
 * breaks are removed so the saved value cannot produce malformed Markdown.
 */
export function normalizeCrossMarkdownEmbedAlias(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CROSS_MARKDOWN_EMBED_ALIAS;
  return normalizeEmbedAlias(value);
}

function migrateSettings(loaded: LegacySettings): Partial<DragDropSettings> {
  const {
    protectedFolders,
    crossMarkdownEmbedAlias: savedCrossMarkdownEmbedAlias,
    schemaVersion: savedSchemaVersion,
    ...rest
  } = loaded;

  void savedCrossMarkdownEmbedAlias;

  const version =
    typeof savedSchemaVersion === "number" && Number.isFinite(savedSchemaVersion)
      ? Math.max(0, Math.trunc(savedSchemaVersion))
      : 0;
  if (version < SETTINGS_SCHEMA_VERSION && protectedFolders !== undefined) {
    // These cleanups are intentionally kept in the migration boundary so old
    // data is normalized once without changing the live action semantics.
    // The legacy protected-folder field was removed above for every version.
    return {
      ...rest,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
    };
  }
  return {
    ...rest,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
  };
}

function mergeMarkdownBindings(
  loaded: Record<string, unknown> | undefined,
  legacyLinks: boolean,
  allowAliasLinks = true,
): Record<ModifierChord, MarkdownDropAction> {
  const bindings = {
    ...DEFAULT_SETTINGS.markdownBindings,
    ...loaded,
  };
  for (const chord of Object.keys(bindings) as ModifierChord[]) {
    if ((!allowAliasLinks || legacyLinks) && bindings[chord] === "link-source") {
      bindings[chord] = "embed-source";
    }
  }
  return bindings;
}

export function mergeSettings(
  loaded: LegacySettings | null | undefined,
): DragDropSettings {
  const loadedSettings = migrateSettings(loaded ?? {});
  const loadedMarkdownBindings = loaded?.markdownBindings as
    | Record<string, unknown>
    | undefined;
  const loadedSameMarkdownBindings = loaded?.sameMarkdownBindings as
    | Record<string, unknown>
    | undefined;
  const legacyLinks = typeof loaded?.schemaVersion !== "number" || loaded.schemaVersion < 4;
  const markdownBindings = mergeMarkdownBindings(loadedMarkdownBindings, legacyLinks);
  const sameMarkdownBindings = mergeMarkdownBindings(
    loadedSameMarkdownBindings ?? loadedMarkdownBindings,
    legacyLinks,
    false,
  );
  const hasLegacyDefaults =
    legacyLinks &&
    loadedMarkdownBindings?.none === "move" &&
    loadedMarkdownBindings.primary === "link-source" &&
    loadedMarkdownBindings["primary+shift"] === "embed-source";
  if (hasLegacyDefaults) {
    markdownBindings.none = DEFAULT_SETTINGS.markdownBindings.none;
    markdownBindings.primary = DEFAULT_SETTINGS.markdownBindings.primary;
    markdownBindings["primary+shift"] = DEFAULT_SETTINGS.markdownBindings["primary+shift"];
    if (!loadedSameMarkdownBindings) {
      sameMarkdownBindings.none = DEFAULT_SETTINGS.sameMarkdownBindings.none;
      sameMarkdownBindings.primary = DEFAULT_SETTINGS.sameMarkdownBindings.primary;
      sameMarkdownBindings["primary+shift"] = DEFAULT_SETTINGS.sameMarkdownBindings["primary+shift"];
    }
  }

  return {
    ...DEFAULT_SETTINGS,
    ...loadedSettings,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    nodeWidth: clampSavedInteger(
      loaded?.nodeWidth,
      DEFAULT_SETTINGS.nodeWidth,
      160,
      1_200,
    ),
    initialNodeHeight: clampSavedInteger(
      loaded?.initialNodeHeight,
      DEFAULT_SETTINGS.initialNodeHeight,
      80,
      1_200,
    ),
    nodeGap: clampSavedInteger(loaded?.nodeGap, DEFAULT_SETTINGS.nodeGap, 0, 400),
    previewWidth: clampSavedInteger(
      loaded?.previewWidth,
      DEFAULT_SETTINGS.previewWidth,
      200,
      1_000,
    ),
    handlePosition:
      loaded?.handlePosition === "left" || loaded?.handlePosition === "right"
        ? loaded.handlePosition
        : DEFAULT_SETTINGS.handlePosition,
    handleVisibility:
      loaded?.handleVisibility === "hover" || loaded?.handleVisibility === "always"
        ? loaded.handleVisibility
        : DEFAULT_SETTINGS.handleVisibility,
    surfacePenSideButtonDrag:
      typeof loaded?.surfacePenSideButtonDrag === "boolean"
        ? loaded.surfacePenSideButtonDrag
        : DEFAULT_SETTINGS.surfacePenSideButtonDrag,
    iosPencilMapping:
      typeof loaded?.iosPencilMapping === "boolean"
        ? loaded.iosPencilMapping
        : DEFAULT_SETTINGS.iosPencilMapping,
    largeTouchHandles:
      typeof loaded?.largeTouchHandles === "boolean"
        ? loaded.largeTouchHandles
        : DEFAULT_SETTINGS.largeTouchHandles,
    canvasSummaryButton:
      typeof loaded?.canvasSummaryButton === "boolean"
        ? loaded.canvasSummaryButton
        : DEFAULT_SETTINGS.canvasSummaryButton,
    editableBlockEmbeds:
      typeof loaded?.editableBlockEmbeds === "boolean"
        ? loaded.editableBlockEmbeds
        : DEFAULT_SETTINGS.editableBlockEmbeds,
    structuralMarkdownMoves:
      typeof loaded?.structuralMarkdownMoves === "boolean"
        ? loaded.structuralMarkdownMoves
        : DEFAULT_SETTINGS.structuralMarkdownMoves,
    multiBlockSelection:
      typeof loaded?.multiBlockSelection === "boolean"
        ? loaded.multiBlockSelection
        : DEFAULT_SETTINGS.multiBlockSelection,
    blockTypeMenu:
      typeof loaded?.blockTypeMenu === "boolean"
        ? loaded.blockTypeMenu
        : DEFAULT_SETTINGS.blockTypeMenu,
    crossFileFileTargets:
      typeof loaded?.crossFileFileTargets === "boolean"
        ? loaded.crossFileFileTargets
        : DEFAULT_SETTINGS.crossFileFileTargets,
    crossMarkdownEmbedAlias: normalizeCrossMarkdownEmbedAlias(
      loaded?.crossMarkdownEmbedAlias,
    ),
    edgeAutoScroll:
      typeof loaded?.edgeAutoScroll === "boolean"
        ? loaded.edgeAutoScroll
        : DEFAULT_SETTINGS.edgeAutoScroll,
    autoScrollEdgePx: clampSavedInteger(
      loaded?.autoScrollEdgePx,
      DEFAULT_SETTINGS.autoScrollEdgePx,
      20,
      200,
    ),
    autoScrollMaxSpeed: clampSavedInteger(
      loaded?.autoScrollMaxSpeed,
      DEFAULT_SETTINGS.autoScrollMaxSpeed,
      1,
      30,
    ),
    preserveFoldState:
      typeof loaded?.preserveFoldState === "boolean"
        ? loaded.preserveFoldState
        : DEFAULT_SETTINGS.preserveFoldState,
    renumberOrderedLists:
      typeof loaded?.renumberOrderedLists === "boolean"
        ? loaded.renumberOrderedLists
        : DEFAULT_SETTINGS.renumberOrderedLists,
    mobileBlockInteractions:
      typeof loaded?.mobileBlockInteractions === "boolean"
        ? loaded.mobileBlockInteractions
        : DEFAULT_SETTINGS.mobileBlockInteractions,
    selectionMenuAutoDismissSeconds:
      normalizeSelectionMenuAutoDismissSeconds(loaded?.selectionMenuAutoDismissSeconds)
      ?? DEFAULT_SETTINGS.selectionMenuAutoDismissSeconds,
    canvasBindings: {
      ...DEFAULT_SETTINGS.canvasBindings,
      ...loaded?.canvasBindings,
    },
    markdownBindings,
    sameMarkdownBindings,
  };
}
