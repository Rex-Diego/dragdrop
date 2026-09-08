import { EditorState, ChangeSet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  Component,
  MarkdownRenderer,
  MarkdownView,
  Notice,
  parseLinktext,
  Menu,
  Platform,
  TFile,
  type App,
  type WorkspaceLeaf,
} from "obsidian";
import {
  resolveCanvasDropAction,
  resolveMarkdownDropAction,
  resolveMarkdownDropActionForContext,
  type MarkdownDropContext,
  type ModifierKeyState,
  type ResolvedMarkdownDropAction,
} from "./action-resolution";
import {
  applyBlockIdInsertions,
  sourceEmbedLink,
  sourceBlockLink,
} from "./block-reference";
import { CanvasAdapter, type CanvasDropTarget, type CanvasItemSpec } from "./canvas-adapter";
import { CanvasTouchNavigation, supportsCanvasNavigation } from "./canvas-touch-navigation";
import { planCanvasReferences, type CanvasReference } from "./canvas-reference";
import { buildHandleRanges, collectSourceUnits, previewMarkdownForUnits } from "./content-segmentation";
import type { HandleRange } from "./content-segmentation";
import { edgeScrollDelta } from "./drag-auto-scroll";
import {
  blockSelectionKey,
  extendBlockSelection,
  toggleBlockSelection,
} from "./block-selection";
import { sourceRangesForHandle } from "./drag-selection";
import { DragCommitGate } from "./drag-commit-gate";
import type { DragStarter } from "./drag-handle-extension";
import { FileService, type NoteSourceReference } from "./file-service";
import { MoveConfirmationModal } from "./move-confirmation-modal";
import { runMarkdownTransaction, type MarkdownMutation } from "./markdown-transaction";
import {
  applyTextChanges,
  chooseMarkdownDropPosition,
  collectMarkdownDropBoundaryPositions,
  boundaryInsertionForBlocks,
  directBlockEmbed,
  insertBlocksAtBoundary,
  mapPositionAfterChanges,
  mapPositionAfterInsertion,
  planMarkdownMoveChanges,
  mapPositionAfterRemovals,
  removeTextRanges,
  requiresMoveConfirmation,
  type TextChange,
} from "./markdown-drop";
import {
  findMoveTargetIssue,
  adjustListBlockIndent,
  renumberOrderedListMarkers,
  resolveListDropIntent,
  structuredMoveBlocks,
  type ListDropIntent,
  type MarkdownDropIssue,
} from "./markdown-structure";
import { captureFoldStarts, restoreFoldStarts } from "./fold-state";
import {
  captureEditorViewSnapshot,
  dispatchEditorChanges,
  documentChanges,
  restoreEditorViewSnapshot,
  preserveEditorOnSync,
} from "./editor-view-state";
import { modifierChordFromEvent, type DragSession, type SourceUnit } from "./model";
import {
  canvasPenButtonForInteraction,
  canvasPenButtonsForButton,
  canvasPenInteractionForEvent,
  findCanvasPenDragControl,
  createCanvasPointerEventInit,
  hasCrossedPointerDragThreshold,
  isCanvasNativeControlElement,
  isCanvasEditingElement,
  isCanvasResizeHandleElement,
  isSurfacePenSideButton,
  matchesPointerDrag,
  shouldStartMobileBlockSelection,
} from "./pointer-drag";
import type { DragDropSettings } from "./settings-model";
import { isCanvasView, type CanvasView } from "./canvas-types";

const SESSION_MIME = "application/x-dragdrop-session";
const MOBILE_SELECTION_DELAY_MS = 200;

interface DragDropHost {
  app: App;
  config: DragDropSettings;
}

interface PointerDrag {
  pointerId: number;
  view: EditorView;
  handle: HandleRange;
  element: HTMLElement;
  surfacePenSideButton: boolean;
  pointerType: string;
  startX: number;
  startY: number;
  active: boolean;
  mobileSelectionMode: boolean;
  mobileSelectionTimer: number | null;
}

interface PointerCaptureElement extends Element {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
}

interface BlockSelectionState {
  editorState: EditorState;
  anchorFrom: number;
  ranges: HandleRange[];
}

interface SelectionPointer {
  pointerId: number;
  view: EditorView;
  handle: HandleRange;
  element: HTMLElement;
  active: boolean;
  toggleSelection: boolean;
  timer: number | null;
}

interface CanvasPenDrag {
  pointerId: number;
  dispatchTarget: Element;
  captureTarget: PointerCaptureElement;
  button: 0 | 1;
  suppressContextMenu: boolean;
  lastEvent: PointerEvent;
  startX: number;
  startY: number;
  moved: boolean;
}

interface CanvasPenInteraction {
  dispatchTarget: Element;
  button: 0 | 1;
  native?: false;
}

interface CanvasPenNativeInteraction {
  dispatchTarget: Element;
  button: 0;
  native: true;
}

type CanvasPenInteractionResult = CanvasPenInteraction | CanvasPenNativeInteraction | "passthrough" | null;

interface CanvasPenContextMenuSuppression {
  ownerDocument: Document;
  expiresAt: number;
}

interface MarkdownPenContextMenuSuppression extends CanvasPenContextMenuSuppression {
  pointerId: number;
  x: number;
  y: number;
}

interface MarkdownDropTarget {
  view: MarkdownView;
  editorView: EditorView;
  file: TFile;
  position: number;
  targetLineText: string;
  targetLineNumber: number;
  listIntent: ListDropIntent | null;
  issue: MarkdownDropIssue | null;
  context: MarkdownDropContext;
  ownerDocument: Document;
}

interface MarkdownFileDropTarget {
  file: TFile;
  ownerDocument: Document;
}

type PointerDropTarget = CanvasDropTarget | MarkdownDropTarget;

function isMarkdownDropTarget(target: PointerDropTarget | null): target is MarkdownDropTarget {
  return target !== null && "editorView" in target;
}

function isDocumentLike(value: unknown): value is Document {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    "defaultView" in value &&
    "body" in value
  );
}

function isNodeLike(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

function isElementNode(value: Node): value is Element {
  return value.nodeType === 1;
}

function documentFromWindowEvent(values: unknown[]): Document | null {
  for (const value of values) {
    if (isDocumentLike(value)) return value;
    if (typeof value !== "object" || value === null) continue;
    if ("doc" in value && isDocumentLike(value.doc)) return value.doc;
    if ("document" in value && isDocumentLike(value.document)) return value.document;
  }
  return null;
}

function createSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function textNodeLink(path: string, subpath: string, alias: string): string {
  const safeAlias = alias.replace(/[|\]]/g, " ").trim();
  return `[[${path}${subpath}|${safeAlias || "Open source block"}]]`;
}

export class DragSessionManager extends Component implements DragStarter {
  private readonly canvasAdapter: CanvasAdapter;
  private readonly commitGate = new DragCommitGate();
  private readonly documentComponents = new Map<Document, Component>();
  private readonly blockSelections = new Map<EditorView, BlockSelectionState>();
  private session: DragSession | null = null;
  private pointerDrag: PointerDrag | null = null;
  private selectionPointer: SelectionPointer | null = null;
  private canvasPenDrag: CanvasPenDrag | null = null;
  private canvasPenNativePointer: {
    pointerId: number;
    ownerDocument: Document;
    dispatchTarget: Element;
    lastEvent: PointerEvent;
  } | null = null;
  private canvasPenPassthroughPointer: { pointerId: number; ownerDocument: Document } | null = null;
  private canvasTouchNavigation: CanvasTouchNavigation | null = null;
  private readonly iosBlockedPointers = new Map<number, Document>();
  private readonly iosSuppressedTouches = new Map<number, Document>();
  private iosClickSuppression: { ownerDocument: Document; clientX: number; clientY: number; expiresAt: number } | null = null;
  private canvasPenContextMenuSuppression: CanvasPenContextMenuSuppression | null = null;
  private markdownPenContextMenuSuppression: MarkdownPenContextMenuSuppression | null = null;
  private readonly syntheticCanvasEvents = new WeakSet<Event>();
  private ghostElement: HTMLElement | null = null;
  private ghostComponent: Component | null = null;
  private pendingGhostSessionId: string | null = null;
  private markdownDropAction: ResolvedMarkdownDropAction | null = null;
  private markdownDropDocument: Document | null = null;
  private markdownDropContext: MarkdownDropContext | null = null;
  private markdownDropSourcePath: string | null = null;
  private markdownDropTargetPath: string | null = null;
  private markdownDropChord: ReturnType<typeof modifierChordFromEvent> | null = null;
  private markdownDropLine: HTMLElement | null = null;
  private autoScrollFrame: number | null = null;
  private autoScrollTarget: MarkdownDropTarget | null = null;
  private autoScrollX = 0;
  private autoScrollY = 0;
  private sourceHighlightElements: HTMLElement[] = [];
  private targetHighlightElements: HTMLElement[] = [];

  constructor(private readonly host: DragDropHost) {
    super();
    this.canvasAdapter = new CanvasAdapter(host.app);
  }

  onload(): void {
    this.registerDocument(this.host.app.workspace.containerEl.ownerDocument);

    this.host.app.workspace.onLayoutReady(() => {
      this.host.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
        this.registerDocument(leaf.view.containerEl.ownerDocument);
      });
    });

    this.registerEvent(
      this.host.app.workspace.on("window-open", (...values: unknown[]) => {
        const document = documentFromWindowEvent(values);
        if (document) this.registerDocument(document);
      }),
    );
    this.registerEvent(
      this.host.app.workspace.on("window-close", (...values: unknown[]) => {
        const document = documentFromWindowEvent(values);
        if (document) this.unregisterDocument(document);
      }),
    );
  }

  onunload(): void {
    for (const document of this.documentComponents.keys()) this.cancelCanvasInputs(document);
    this.cleanupDrag();
    this.markdownPenContextMenuSuppression = null;
    this.cancelSelectionPointer();
    this.blockSelections.clear();
    this.documentComponents.clear();
  }

  handleHandlePointerDown(
    event: PointerEvent,
    view: EditorView,
    handle: HandleRange,
    element: HTMLElement,
  ): boolean {
    if (this.ignoreIosCompetingHandlePointer(event, element)) return true;
    this.clearStaleBlockSelection(view);
    if (this.isStructuralDragBlocked(view, element)) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    if (!this.host.config.multiBlockSelection) return false;
    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      const current = this.blockSelections.get(view);
      const anchorFrom = current?.anchorFrom ?? handle.from;
      const ranges = extendBlockSelection(
        buildHandleRanges(view.state),
        anchorFrom,
        handle.from,
      );
      this.setBlockSelection(view, ranges.length > 0 ? ranges : [handle], anchorFrom);
      view.focus();
      return true;
    }

    if (event.pointerType === "mouse" && event.isPrimary) {
      this.scheduleMouseSelection(
        view,
        handle,
        element,
        event.pointerId,
        event.ctrlKey || event.metaKey,
      );
    }
    return false;
  }

  openHandleMenu(
    event: MouseEvent,
    view: EditorView,
    handle: HandleRange,
    _element: HTMLElement,
  ): boolean {
    if (!this.host.config.blockTypeMenu) return false;
    const units = this.unitsForHandle(view, handle);
    if (units.length === 0) return false;

    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu().setParentElement(view.dom.ownerDocument.body);
    menu.onHide(() => view.focus());
    const writable = this.isEditorWritable(view);
    const selectedLabel = units.length === 1 ? "block" : "selected blocks";

    menu.addItem((item) =>
      item
        .setTitle(`Copy ${selectedLabel}`)
        .setIcon("copy")
        .onClick(() => {
          void this.copyBlocks(view, units);
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle(`Cut ${selectedLabel}`)
        .setIcon("scissors")
        .setDisabled(!writable)
        .onClick(() => {
          void this.cutBlocks(view, units);
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle(`Delete ${selectedLabel}`)
        .setIcon("trash-2")
        .setDisabled(!writable)
        .setWarning(true)
        .onClick(() => {
          void this.deleteBlocks(view, units);
        }),
    );

    menu.showAtMouseEvent(event);
    return true;
  }

  beginDrag(event: DragEvent, view: EditorView, handle: HandleRange): void {
    this.cancelSelectionPointer();
    if (
      this.isStructuralDragBlocked(
        view,
        isNodeLike(event.currentTarget) && isElementNode(event.currentTarget)
          ? event.currentTarget
          : null,
      )
    ) {
      event.preventDefault();
      return;
    }
    if (this.pointerDrag) {
      event.preventDefault();
      return;
    }
    const session = this.startSession(view, handle);
    if (!session) return;

    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(SESSION_MIME, session.id);
      event.dataTransfer.setData("text/plain", session.previewMarkdown.slice(0, 2_000));
      this.hideNativeDragImage(event, view.dom.ownerDocument);
    }
    this.deferGhost(view.dom.ownerDocument, session.id, event.clientX, event.clientY);
  }

  beginPointerDrag(
    event: PointerEvent,
    view: EditorView,
    handle: HandleRange,
    element: HTMLElement,
  ): void {
    if (this.ignoreIosCompetingHandlePointer(event, element)) return;
    if (this.isStructuralDragBlocked(view, element)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const supportedPointer = event.pointerType === "touch" || event.pointerType === "pen";
    const iosPencil = this.iosPencilEnabled && event.pointerType === "pen";
    const sideButton = iosPencil || isSurfacePenSideButton(event);
    if (
      !supportedPointer ||
      (!iosPencil && sideButton
        ? !this.host.config.surfacePenSideButtonDrag
        : !event.isPrimary)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.cleanupDrag();
    this.pointerDrag = {
      pointerId: event.pointerId,
      view,
      handle,
      element,
      surfacePenSideButton: sideButton,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      mobileSelectionMode: false,
      mobileSelectionTimer: null,
    };
    if (
      this.host.config.mobileBlockInteractions &&
      this.host.config.multiBlockSelection &&
      shouldStartMobileBlockSelection(event.pointerType) &&
      !sideButton
    ) {
      const ownerWindow = element.ownerDocument.defaultView;
      if (ownerWindow) {
        const pointerDrag = this.pointerDrag;
        pointerDrag.mobileSelectionTimer = ownerWindow.setTimeout(() => {
          if (this.pointerDrag !== pointerDrag || pointerDrag.active) return;
          pointerDrag.mobileSelectionMode = true;
          pointerDrag.mobileSelectionTimer = null;
          this.setBlockSelection(view, [handle], handle.from);
          view.focus();
        }, MOBILE_SELECTION_DELAY_MS);
      }
    }
    try {
      element.setPointerCapture(event.pointerId);
      this.rememberMarkdownPenContextMenu(this.pointerDrag, event);
    } catch {
      this.clearMobileSelectionTimer(this.pointerDrag);
      this.pointerDrag = null;
    }
  }

  movePointerDrag(event: PointerEvent): void {
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || !matchesPointerDrag(pointerDrag.pointerId, event.pointerId)) return;
    this.rememberMarkdownPenContextMenu(pointerDrag, event);
    event.preventDefault();

    if (pointerDrag.mobileSelectionMode) {
      const handle = this.handleAtPoint(pointerDrag.view, event.clientX, event.clientY);
      if (handle) {
        const ranges = extendBlockSelection(
          buildHandleRanges(pointerDrag.view.state),
          pointerDrag.handle.from,
          handle.from,
        );
        if (ranges.length > 0) {
          this.setBlockSelection(pointerDrag.view, ranges, pointerDrag.handle.from);
        }
      }
      return;
    }

    if (!pointerDrag.active) {
      if (
        !hasCrossedPointerDragThreshold(
          pointerDrag.startX,
          pointerDrag.startY,
          event.clientX,
          event.clientY,
        )
      ) {
        return;
      }
      this.clearMobileSelectionTimer(pointerDrag);
      if (!this.startSession(pointerDrag.view, pointerDrag.handle)) {
        this.cancelPointerDrag(event.pointerId);
        return;
      }
      pointerDrag.active = true;
      this.ensureGhost(pointerDrag.element.ownerDocument);
    }

    const target = this.findPointerDropTarget(pointerDrag, event);
    let targetValid = target !== null;
    if (isMarkdownDropTarget(target)) {
      const modifierState = event;
      const action = this.resolveMarkdownActionForTarget(modifierState, target.context);
      this.cacheMarkdownAction(
        action,
        modifierState,
        target.file,
        target.ownerDocument,
        target.context,
      );
      targetValid = action !== "none" && !(action === "move" && target.issue !== null);
      if (targetValid) this.showMarkdownDropLine(target);
      else this.hideMarkdownDropLine();
      this.updateAutoScroll(target, event.clientX, event.clientY, action);
    } else {
      this.clearMarkdownDropTarget();
    }
    this.moveGhostTo(event.clientX + 16, event.clientY + 16);
    this.ghostElement?.toggleClass("dragdrop-ghost-valid", targetValid);
  }

  async endPointerDrag(event: PointerEvent): Promise<void> {
    if (this.finishSelectionPointer(event.pointerId)) {
      event.preventDefault();
      return;
    }
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || !matchesPointerDrag(pointerDrag.pointerId, event.pointerId)) return;
    this.rememberMarkdownPenContextMenu(pointerDrag, event);
    event.preventDefault();

    if (pointerDrag.mobileSelectionMode) {
      this.cleanupDrag();
      return;
    }

    if (!pointerDrag.active) {
      this.selectHandle(pointerDrag.view, pointerDrag.handle);
      this.cleanupDrag();
      return;
    }

    const session = this.session;
    const target = this.findPointerDropTarget(pointerDrag, event);
    if (!session || !target) {
      this.cleanupDrag();
      return;
    }
    if (isMarkdownDropTarget(target)) {
      const modifierState = event;
      await this.commitMarkdownDrop(
        session,
        target,
        this.cachedMarkdownAction(
          modifierState,
          target.file,
          target.ownerDocument,
          target.context,
        ),
      );
      return;
    }

    await this.commitDrop(
      session,
      target,
      this.resolvePointerAction(event, pointerDrag.surfacePenSideButton),
    );
  }

  cancelPointerDrag(pointerId: number): void {
    if (this.finishSelectionPointer(pointerId)) return;
    if (!this.pointerDrag || !matchesPointerDrag(this.pointerDrag.pointerId, pointerId)) return;
    this.cleanupDrag();
  }

  private clearMobileSelectionTimer(pointerDrag: PointerDrag): void {
    if (pointerDrag.mobileSelectionTimer === null) return;
    const ownerWindow = pointerDrag.element.ownerDocument.defaultView;
    ownerWindow?.clearTimeout(pointerDrag.mobileSelectionTimer);
    pointerDrag.mobileSelectionTimer = null;
  }

  private startSession(view: EditorView, handle: HandleRange): DragSession | null {
    const sourceFile = this.findMarkdownFile(view);
    if (!sourceFile) return null;

    const selectedRanges = this.selectedRangesForDrag(view, handle);
    const ranges = selectedRanges ?? sourceRangesForHandle(
      view.state,
      handle,
      buildHandleRanges(view.state),
    );
    const units = collectSourceUnits(
      view.state,
      ranges,
      this.host.config.splitListItems,
      this.host.config.listParentDisplay,
    );
    if (units.length === 0) return null;

    const id = createSessionId();
    const session: DragSession = {
      id,
      sourceFile,
      sourceView: view,
      sourceState: view.state,
      sourcePath: sourceFile.path,
      units,
      previewMarkdown: previewMarkdownForUnits(units),
    };
    this.commitGate.begin(id);
    this.session = session;
    this.renderSourceHighlight(session);
    return session;
  }

  private selectHandle(view: EditorView, handle: HandleRange): void {
    view.dispatch({
      selection: { anchor: handle.from, head: handle.to },
      scrollIntoView: true,
    });
    view.focus();
  }

  private scheduleMouseSelection(
    view: EditorView,
    handle: HandleRange,
    element: HTMLElement,
    pointerId: number,
    toggleSelection: boolean,
  ): void {
    if (!this.host.config.multiBlockSelection) return;
    this.cancelSelectionPointer();
    const ownerWindow = element.ownerDocument.defaultView;
    if (!ownerWindow) return;

    const selectionPointer: SelectionPointer = {
      pointerId,
      view,
      handle,
      element,
      active: false,
      toggleSelection,
      timer: null,
    };
    selectionPointer.timer = ownerWindow.setTimeout(() => {
      if (this.selectionPointer !== selectionPointer) return;
      selectionPointer.timer = null;
      selectionPointer.active = true;
      selectionPointer.element.draggable = false;
      this.setBlockSelection(view, [handle], handle.from);
      view.focus();
    }, 500);
    this.selectionPointer = selectionPointer;
  }

  private handleSelectionPointerMove(event: PointerEvent): void {
    const selectionPointer = this.selectionPointer;
    if (
      !selectionPointer ||
      !selectionPointer.active ||
      selectionPointer.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const handle = this.handleAtPoint(selectionPointer.view, event.clientX, event.clientY);
    if (!handle) return;
    const ranges = extendBlockSelection(
      buildHandleRanges(selectionPointer.view.state),
      selectionPointer.handle.from,
      handle.from,
    );
    if (ranges.length > 0) {
      this.setBlockSelection(selectionPointer.view, ranges, selectionPointer.handle.from);
    }
  }

  private handleAtPoint(view: EditorView, clientX: number, clientY: number): HandleRange | null {
    const element = view.dom.ownerDocument
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>(".dragdrop-handle");
    if (!element || !view.dom.contains(element)) return null;
    const from = Number.parseInt(element.dataset.dragdropHandleFrom ?? "", 10);
    const to = Number.parseInt(element.dataset.dragdropHandleTo ?? "", 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return (
      buildHandleRanges(view.state).find((range) => range.from === from && range.to === to) ?? null
    );
  }

  private finishSelectionPointer(pointerId: number): boolean {
    const selectionPointer = this.selectionPointer;
    if (!selectionPointer || selectionPointer.pointerId !== pointerId) return false;
    if (!selectionPointer.active && selectionPointer.toggleSelection) {
      const handles = buildHandleRanges(selectionPointer.view.state);
      const current = this.blockSelections.get(selectionPointer.view);
      const selected = current?.editorState === selectionPointer.view.state
        ? current.ranges
        : [];
      const ranges = toggleBlockSelection(handles, selected, selectionPointer.handle);
      if (ranges.length === 0) this.clearBlockSelection(selectionPointer.view);
      else this.setBlockSelection(
        selectionPointer.view,
        ranges,
        current?.anchorFrom ?? selectionPointer.handle.from,
      );
    }
    this.clearSelectionPointerTimer(selectionPointer);
    if (selectionPointer.active) selectionPointer.element.draggable = true;
    this.selectionPointer = null;
    return true;
  }

  private cancelSelectionPointer(): void {
    const selectionPointer = this.selectionPointer;
    if (!selectionPointer) return;
    this.clearSelectionPointerTimer(selectionPointer);
    if (selectionPointer.active) selectionPointer.element.draggable = true;
    this.selectionPointer = null;
  }

  private clearSelectionPointerTimer(selectionPointer: SelectionPointer): void {
    if (selectionPointer.timer === null) return;
    const ownerWindow = selectionPointer.element.ownerDocument.defaultView;
    ownerWindow?.clearTimeout(selectionPointer.timer);
    selectionPointer.timer = null;
  }

  private clearStaleBlockSelection(view: EditorView): void {
    const selection = this.blockSelections.get(view);
    if (selection && selection.editorState !== view.state) this.clearBlockSelection(view);
  }

  private setBlockSelection(
    view: EditorView,
    ranges: readonly HandleRange[],
    anchorFrom: number,
  ): void {
    this.blockSelections.set(view, {
      editorState: view.state,
      anchorFrom,
      ranges: [...ranges],
    });
    this.renderBlockSelection(view);
  }

  private clearBlockSelection(view: EditorView): void {
    this.blockSelections.delete(view);
    this.renderBlockSelection(view);
  }

  private clearBlockSelectionsInDocument(document: Document): void {
    for (const view of this.blockSelections.keys()) {
      if (view.dom.ownerDocument === document) this.clearBlockSelection(view);
    }
  }

  private renderBlockSelection(view: EditorView): void {
    const selected = new Set(
      (this.blockSelections.get(view)?.ranges ?? []).map((range) => blockSelectionKey(range)),
    );
    view.dom.querySelectorAll<HTMLElement>(".dragdrop-handle").forEach((element) => {
      const from = Number.parseInt(element.dataset.dragdropHandleFrom ?? "", 10);
      const to = Number.parseInt(element.dataset.dragdropHandleTo ?? "", 10);
      const isSelected = Number.isFinite(from) && Number.isFinite(to)
        ? selected.has(blockSelectionKey({ from, to }))
        : false;
      element.classList.toggle("dragdrop-handle-selected", isSelected);
      element.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }

  private selectedRangesForDrag(view: EditorView, handle: HandleRange): HandleRange[] | null {
    if (!this.host.config.multiBlockSelection) return null;
    this.clearStaleBlockSelection(view);
    const selection = this.blockSelections.get(view);
    if (!selection) return null;
    const selected = new Set(selection.ranges.map((range) => blockSelectionKey(range)));
    if (!selected.has(blockSelectionKey(handle))) return null;
    return selection.ranges;
  }

  private unitsForHandle(view: EditorView, handle: HandleRange): SourceUnit[] {
    const ranges = this.selectedRangesForDrag(view, handle) ?? sourceRangesForHandle(
      view.state,
      handle,
      buildHandleRanges(view.state),
    );
    return collectSourceUnits(
      view.state,
      ranges,
      this.host.config.splitListItems,
      this.host.config.listParentDisplay,
    );
  }

  private async copyBlocks(view: EditorView, units: readonly SourceUnit[]): Promise<boolean> {
    const content = units.map((unit) => unit.text.trimEnd()).join("\n\n");
    const copied = await this.writeClipboard(view, content);
    if (!copied) new Notice("Could not copy the selected Markdown blocks.");
    return copied;
  }

  private async cutBlocks(view: EditorView, units: readonly SourceUnit[]): Promise<void> {
    if (!this.isEditorWritable(view)) {
      new Notice("The note is read-only.");
      return;
    }
    if (requiresMoveConfirmation(units)) {
      const confirmed = await new MoveConfirmationModal(
        this.host.app,
        units.filter((unit) => unit.existingBlockId !== undefined).length,
        "cut",
      ).openAndConfirm();
      if (!confirmed) return;
    }
    if (!(await this.copyBlocks(view, units))) return;
    void this.deleteBlocks(view, units, true);
  }

  private async deleteBlocks(
    view: EditorView,
    units: readonly SourceUnit[],
    skipConfirmation = false,
  ): Promise<void> {
    if (!this.isEditorWritable(view)) {
      new Notice("The note is read-only.");
      return;
    }
    if (!skipConfirmation && requiresMoveConfirmation(units)) {
      const confirmed = await new MoveConfirmationModal(
        this.host.app,
        units.filter((unit) => unit.existingBlockId !== undefined).length,
        "delete",
      ).openAndConfirm();
      if (!confirmed) return;
    }

    const before = view.state.doc.toString();
    if (units.some((unit) => view.state.doc.sliceString(unit.from, unit.to) !== unit.text)) {
      new Notice("The note changed while the menu was open. Try again.");
      return;
    }
    const after = removeTextRanges(before, units);
    if (after === before) return;
    try {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: after } });
      this.clearBlockSelection(view);
      view.focus();
    } catch (error) {
      console.error("DragDrop could not delete Markdown blocks.", error);
      new Notice("Could not delete the selected Markdown blocks.");
    }
  }

  private async writeClipboard(view: EditorView, content: string): Promise<boolean> {
    const ownerDocument = view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    const clipboard = ownerWindow?.navigator.clipboard;
    if (clipboard) {
      try {
        await clipboard.writeText(content);
        return true;
      } catch {
        // Fall through to the owner-document execCommand fallback.
      }
    }

    const helper = ownerDocument.body.createEl("textarea");
    helper.className = "dragdrop-clipboard-helper";
    helper.value = content;
    ownerDocument.body.appendChild(helper);
    helper.focus();
    helper.select();
    let copied = false;
    try {
      const execCommand = Reflect.get(ownerDocument, "execCommand");
      if (typeof execCommand === "function") {
        copied = Reflect.apply(execCommand, ownerDocument, ["copy"]) === true;
      }
    } catch {
      copied = false;
    }
    helper.remove();
    view.focus();
    return copied;
  }

  private isStructuralDragBlocked(view: EditorView, element: Element | null): boolean {
    if (
      element?.closest(
        ".dragdrop-editable-block-embed-active, input, textarea, select, .cm-table-widget",
      )
    ) {
      return true;
    }

    const activeElement = view.dom.ownerDocument.activeElement;
    if (!activeElement || !view.dom.contains(activeElement)) return false;
    if (
      activeElement.closest(
        ".dragdrop-editable-block-embed-active, input, textarea, select, .cm-table-widget",
      )
    ) {
      return true;
    }
    return activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA";
  }

  private findPointerDropTarget(
    pointerDrag: PointerDrag,
    event: PointerEvent,
  ): PointerDropTarget | null {
    const point = {
      ownerDocument: pointerDrag.element.ownerDocument,
      x: event.clientX,
      y: event.clientY,
    };
    const canvasTarget = this.canvasAdapter.findDropTargetAt(point);
    if (canvasTarget) return canvasTarget;
    return this.findMarkdownDropTarget(event);
  }

  private findMarkdownDropTarget(event: DragEvent | PointerEvent): MarkdownDropTarget | null {
    const eventTarget = isNodeLike(event.target) ? event.target : null;
    const ownerDocument = eventTarget?.ownerDocument ?? activeDocument;
    const path = "pointerId" in event ? [] : event.composedPath();
    const pointElement = ownerDocument.elementFromPoint(event.clientX, event.clientY);
    const candidates: MarkdownView[] = [];

    this.host.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      if (!(view.file instanceof TFile)) return;
      if (view.containerEl.ownerDocument !== ownerDocument) return;
      if (!view.containerEl.isConnected) return;
      candidates.push(view);
    });

    const view = candidates.find((candidate) =>
      pointElement !== null && candidate.containerEl.contains(pointElement),
    ) ?? candidates.find((candidate) => path.includes(candidate.containerEl));
    if (!view || !(view.file instanceof TFile)) return null;

    const editorElement = view.containerEl.querySelector(".cm-editor");
    if (!editorElement) return null;
    const editorView = EditorView.findFromDOM(editorElement as HTMLElement);
    if (!editorView || editorView.dom.ownerDocument !== ownerDocument) return null;
    if (!pointElement || !editorView.dom.contains(pointElement)) return null;

    let position = this.markdownDropPosition(editorView, event);
    const rawPosition = editorView.posAtCoords({ x: event.clientX, y: event.clientY }) ?? position;
    const targetLine = editorView.state.doc.lineAt(rawPosition);
    const sourceText = this.session?.units[0]?.text ?? "";
    const sameSourceFile = this.session?.sourceFile.path === view.file.path;
    const listIntent = resolveListDropIntent({
      sourceText,
      targetLineText: targetLine.text,
      pointerColumn: rawPosition - targetLine.from,
      contextLineNumber: targetLine.number,
    });
    const context = sameSourceFile ? "same-file" : "cross-file";
    if (this.host.config.structuralMarkdownMoves && listIntent?.mode === "child" &&
      this.resolveMarkdownActionForTarget(event, context) === "move") {
      // A right-side drop belongs below the target subtree, even when the
      // nearest vertical boundary happens to be above its parent line.
      position = buildHandleRanges(editorView.state).find((range) => range.from === targetLine.from)?.to ?? targetLine.to;
    }

    return {
      view,
      editorView,
      file: view.file,
      position,
      targetLineText: targetLine.text,
      targetLineNumber: targetLine.number,
      listIntent,
      issue: findMoveTargetIssue(
        editorView.state.doc.toString(),
        sameSourceFile ? this.session?.units ?? [] : [],
        position,
      ),
      context,
      ownerDocument,
    };
  }

  private findMarkdownFileDropTarget(event: DragEvent): MarkdownFileDropTarget | null {
    if (!this.host.config.crossFileFileTargets) return null;
    const eventTarget = isNodeLike(event.target) ? event.target : null;
    const ownerDocument = eventTarget?.ownerDocument ?? activeDocument;
    const pointElement = ownerDocument.elementFromPoint(event.clientX, event.clientY);
    const candidates = [
      ...event.composedPath(),
      ...(pointElement ? [pointElement] : []),
      ...(eventTarget ? [eventTarget] : []),
    ];

    for (const candidate of candidates) {
      if (!isNodeLike(candidate) || !isElementNode(candidate)) continue;
      const navFile = candidate.closest<HTMLElement>(".nav-file-title[data-path]");
      const navPath = navFile?.getAttribute("data-path");
      if (navPath) {
        const file = this.host.app.vault.getAbstractFileByPath(navPath);
        if (file instanceof TFile && file.extension === "md") {
          return { file, ownerDocument };
        }
      }

      const internalLink = candidate.closest<HTMLElement>("a.internal-link[data-href], a.internal-link[href]");
      const linkText = internalLink?.getAttribute("data-href") ?? internalLink?.getAttribute("href");
      if (!linkText) continue;
      const parsed = parseLinktext(linkText);
      const file = this.host.app.metadataCache.getFirstLinkpathDest(
        parsed.path,
        this.session?.sourceFile.path ?? "",
      );
      if (file instanceof TFile && file.extension === "md") {
        return { file, ownerDocument };
      }
    }
    return null;
  }

  private markdownDropPosition(editorView: EditorView, event: DragEvent | PointerEvent): number {
    return this.markdownDropPositionAt(editorView, event.clientX, event.clientY);
  }

  private markdownDropPositionAt(editorView: EditorView, clientX: number, clientY: number): number {
    const { doc } = editorView.state;
    if (doc.length === 0) return 0;

    const rawPosition = editorView.posAtCoords({ x: clientX, y: clientY }) ?? doc.length;
    const positions = collectMarkdownDropBoundaryPositions(
      doc.length,
      buildHandleRanges(editorView.state),
    );
    const boundaries = positions.flatMap((position) => {
      const rect = this.markdownDropLineRect(editorView, position);
      return rect ? [{ position, top: rect.top }] : [];
    });
    return chooseMarkdownDropPosition(rawPosition, clientY, boundaries) ?? rawPosition;
  }

  private resolvePointerAction(
    event: PointerEvent,
    surfacePenSideButton: boolean,
  ): ReturnType<typeof resolveCanvasDropAction> {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return resolveCanvasDropAction(event, this.host.config.canvasBindings);
    }
    if (surfacePenSideButton) {
      return resolveCanvasDropAction(event, this.host.config.canvasBindings);
    }
    return this.host.config.touchDropAction;
  }

  private releasePointerCapture(pointerDrag: PointerDrag): void {
    try {
      if (pointerDrag.element.hasPointerCapture(pointerDrag.pointerId)) {
        pointerDrag.element.releasePointerCapture(pointerDrag.pointerId);
      }
    } catch {
      // The owner document may already have closed.
    }
  }

  private registerDocument(document: Document): void {
    if (this.documentComponents.has(document)) return;
    const component = new Component();
    this.addChild(component);
    component.registerDomEvent(document, "dragover", (event) => this.handleDragOver(event), true);
    component.registerDomEvent(document, "drop", (event) => {
      void this.handleDrop(event);
    }, true);
    component.registerDomEvent(document, "dragend", () => this.cleanupDrag(), true);
    const ownerWindow = document.defaultView;
    if (ownerWindow) {
      component.registerDomEvent(ownerWindow, "pointerdown", (event) => {
        this.handleCanvasPenPointerDown(event);
      }, true);
      component.registerDomEvent(ownerWindow, "pointermove", (event) => {
        this.handleSelectionPointerMove(event);
        this.handleCanvasPenPointerMove(event);
      }, true);
      component.registerDomEvent(ownerWindow, "pointerup", (event) => {
        this.finishSelectionPointer(event.pointerId);
        this.handleCanvasPenPointerUp(event);
      }, true);
      component.registerDomEvent(ownerWindow, "pointercancel", (event) => {
        this.finishSelectionPointer(event.pointerId);
        this.handleCanvasPenPointerCancel(event);
      }, true);
      component.registerDomEvent(ownerWindow, "lostpointercapture", (event) => {
        this.handleCanvasPenPointerCancel(event);
      }, true);
      component.registerDomEvent(ownerWindow, "blur", () => this.cancelCanvasInputs(document));
      for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"] as const) {
        component.registerDomEvent(ownerWindow, type, (event) => this.suppressIosTouchEvent(event), { capture: true, passive: false });
      }
      component.registerDomEvent(ownerWindow, "click", (event) => this.suppressIosClick(event), true);
      component.registerDomEvent(ownerWindow, "mousedown", (event) => {
        this.handleCanvasPenMouseDown(event);
      }, true);
      component.registerDomEvent(ownerWindow, "mousemove", (event) => {
        this.handleCanvasPenMouseMove(event);
      }, true);
      component.registerDomEvent(ownerWindow, "mouseup", (event) => {
        this.handleCanvasPenMouseUp(event);
      }, true);
      component.registerDomEvent(ownerWindow, "contextmenu", (event) => {
        this.handleCanvasPenContextMenu(event);
      }, true);
    }
    component.registerDomEvent(document, "visibilitychange", () => {
      if (document.hidden) this.cancelCanvasInputs(document);
    });
    component.registerDomEvent(document, "keydown", (event) => {
      if (event.key !== "Escape") return;
      this.clearBlockSelectionsInDocument(document);
      this.cancelSelectionPointer();
      if (this.session || this.pointerDrag || this.canvasPenDrag || this.canvasPenNativePointer) {
        this.cleanupDrag();
      }
    }, true);
    this.documentComponents.set(document, component);
  }

  private unregisterDocument(document: Document): void {
    this.cancelCanvasInputs(document);
    if (this.canvasPenNativePointer?.ownerDocument === document) this.cleanupDrag();
    this.clearBlockSelectionsInDocument(document);
    if (this.selectionPointer?.view.dom.ownerDocument === document) {
      this.cancelSelectionPointer();
    }
    const component = this.documentComponents.get(document);
    if (!component) return;
    component.unload();
    this.removeChild(component);
    this.documentComponents.delete(document);
  }

  private get iosPencilEnabled(): boolean {
    return Platform.isIosApp && this.host.config.iosPencilMapping;
  }

  private consumePointer(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private ignoreIosCompetingHandlePointer(event: PointerEvent, element: HTMLElement): boolean {
    if (!this.iosPencilEnabled || (event.pointerType !== "pen" && event.pointerType !== "touch")) return false;
    if (!this.pointerDrag && !this.canvasPenDrag && !this.canvasPenNativePointer && !this.canvasTouchNavigation) return false;
    this.iosBlockedPointers.set(event.pointerId, element.ownerDocument);
    this.consumePointer(event);
    return true;
  }

  private cancelTouchNavigation(blockRemaining: boolean): void {
    const navigation = this.canvasTouchNavigation;
    if (!navigation) return;
    this.canvasTouchNavigation = null;
    if (blockRemaining) {
      for (const id of navigation.pointers.keys()) this.iosBlockedPointers.set(id, navigation.target.ownerDocument);
    }
    navigation.clear();
  }

  private handleIosNavigationEvent(event: PointerEvent, end: boolean): boolean {
    const blockedDocument = this.iosBlockedPointers.get(event.pointerId);
    if (blockedDocument && this.isSameEventDocument(event, blockedDocument)) {
      if (end) {
        this.iosBlockedPointers.delete(event.pointerId);
        this.rememberIosClick(event);
      }
      this.consumePointer(event);
      return true;
    }
    const navigation = this.canvasTouchNavigation;
    if (event.pointerType !== "touch" || !navigation?.pointers.has(event.pointerId) ||
      !this.isSameEventDocument(event, navigation.target.ownerDocument)) return false;
    this.consumePointer(event);
    if (end) {
      navigation.remove(event.pointerId);
      this.rememberIosClick(event);
      if (navigation.pointers.size === 0) this.canvasTouchNavigation = null;
    } else if (!navigation.target.isConnected || !this.iosPencilEnabled) {
      this.cancelTouchNavigation(true);
    } else {
      navigation.move(event);
    }
    return true;
  }

  private rememberIosClick(event: PointerEvent): void {
    if (!this.iosPencilEnabled) return;
    const target = this.elementFromEventTarget(event.target);
    if (target) this.iosClickSuppression = {
      ownerDocument: target.ownerDocument, clientX: event.clientX, clientY: event.clientY, expiresAt: Date.now() + 1_000,
    };
  }

  private suppressIosClick(event: MouseEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    if ("pointerType" in event && event.pointerType === "mouse") return;
    const suppression = this.iosClickSuppression;
    if (suppression && suppression.expiresAt >= Date.now() && this.isSameEventDocument(event, suppression.ownerDocument) &&
      Math.hypot(event.clientX - suppression.clientX, event.clientY - suppression.clientY) < 25) this.consumePointer(event);
  }

  private suppressIosTouchEvent(event: TouchEvent): void {
    const target = this.elementFromEventTarget(event.target);
    if (!target) return;
    const doc = target.ownerDocument;
    if (event.type === "touchstart" && this.iosPencilEnabled) {
      const owned = this.canvasTouchNavigation?.target.contains(target) ||
        this.canvasPenDrag?.dispatchTarget.ownerDocument === doc ||
        this.canvasPenNativePointer?.ownerDocument === doc ||
        this.pointerDrag?.element.contains(target) ||
        Array.from(this.iosBlockedPointers.values()).includes(doc);
      if (owned && !isCanvasEditingElement(target)) {
        for (const touch of Array.from(event.changedTouches)) this.iosSuppressedTouches.set(touch.identifier, doc);
      }
    }
    let suppress = false;
    for (const touch of Array.from(event.changedTouches)) {
      if (this.iosSuppressedTouches.get(touch.identifier) !== doc) continue;
      suppress = true;
      if (event.type === "touchend" || event.type === "touchcancel") this.iosSuppressedTouches.delete(touch.identifier);
    }
    if (suppress) this.consumePointer(event);
  }

  private refreshIosPenHover(event: PointerEvent): void {
    const target = this.elementFromEventTarget(event.target);
    if (!target || isCanvasEditingElement(target)) return;
    this.host.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (!isCanvasView(leaf.view) || !leaf.view.containerEl.contains(target)) return;
      const canvas = leaf.view.canvas as typeof leaf.view.canvas & { interactionHitTest?: (event: MouseEvent) => void };
      canvas.interactionHitTest?.(event);
    });
  }

  private cancelCanvasInputs(document: Document): void {
    if (this.canvasTouchNavigation?.target.ownerDocument === document) this.cancelTouchNavigation(false);
    if (this.canvasPenDrag?.dispatchTarget.ownerDocument === document || this.canvasPenNativePointer?.ownerDocument === document ||
      ((this.iosPencilEnabled || this.pointerDrag?.pointerType === "pen") &&
        this.pointerDrag?.element.ownerDocument === document)) this.cleanupDrag();
    for (const [id, doc] of this.iosBlockedPointers) if (doc === document) this.iosBlockedPointers.delete(id);
    for (const [id, doc] of this.iosSuppressedTouches) if (doc === document) this.iosSuppressedTouches.delete(id);
    if (this.iosClickSuppression?.ownerDocument === document) this.iosClickSuppression = null;
    if (this.canvasPenPassthroughPointer?.ownerDocument === document) this.canvasPenPassthroughPointer = null;
    if (this.markdownPenContextMenuSuppression?.ownerDocument === document) this.markdownPenContextMenuSuppression = null;
  }

  private handleCanvasPenPointerDown(event: PointerEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    this.markdownPenContextMenuSuppression = null;
    const iosMapping = this.iosPencilEnabled;
    const interactionType = iosMapping && event.pointerType === "touch"
      ? "pan" : canvasPenInteractionForEvent(event, iosMapping);
    if (!interactionType) return;

    const target = this.elementFromEventTarget(event.target);
    if (!target) return;
    const interaction = this.findCanvasPenInteraction(
      target,
      interactionType,
      event.clientX,
      event.clientY,
    );
    if (iosMapping && event.pointerType === "touch" && interaction) {
      if (this.pointerDrag || this.canvasPenDrag || this.canvasPenNativePointer) {
        this.iosBlockedPointers.set(event.pointerId, target.ownerDocument);
        this.consumePointer(event);
        return;
      }
      const navigation = this.canvasTouchNavigation;
      if (navigation?.target.contains(target)) {
        if (!navigation.add(event)) this.iosBlockedPointers.set(event.pointerId, target.ownerDocument);
        this.consumePointer(event);
        return;
      }
      if (interaction !== "passthrough" && !interaction.native) {
        if (!event.isPrimary) return;
        this.host.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
          if (!isCanvasView(leaf.view) || !leaf.view.containerEl.contains(target)) return;
          if (supportsCanvasNavigation(leaf.view.canvas)) {
            const next = new CanvasTouchNavigation(interaction.dispatchTarget, leaf.view.canvas);
            if (next.add(event)) this.canvasTouchNavigation = next;
          }
        });
        if (this.canvasTouchNavigation) this.consumePointer(event);
        return;
      }
    }
    if (iosMapping && event.pointerType === "pen" && interaction && interaction !== "passthrough") {
      this.cancelTouchNavigation(true);
    }
    if (this.canvasPenDrag || this.canvasPenNativePointer || this.pointerDrag) return;
    if (interaction === "passthrough") {
      this.canvasPenPassthroughPointer = { pointerId: event.pointerId, ownerDocument: target.ownerDocument };
      return;
    }
    if (interaction?.native) {
      this.canvasPenNativePointer = {
        pointerId: event.pointerId,
        ownerDocument: target.ownerDocument,
        dispatchTarget: interaction.dispatchTarget,
        lastEvent: event,
      };
      event.preventDefault();
      event.stopImmediatePropagation();
      this.dispatchCanvasPointerEvent("pointerdown", event, interaction.dispatchTarget, 1, 0);
      return;
    }
    if (interactionType === "select" && !iosMapping && !this.host.config.surfacePenSideButtonDrag) return;
    if (!interaction || !this.beginCanvasPenDrag(event, interaction)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleCanvasPenPointerMove(event: PointerEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    if (this.handleIosNavigationEvent(event, false)) return;
    if (this.isCanvasPenPassthroughPointer(event)) return;
    const nativePointer = this.canvasPenNativePointer;
    if (nativePointer && this.isCanvasPenNativePointer(event)) {
      nativePointer.lastEvent = event;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.dispatchCanvasPointerEvent("pointermove", event, nativePointer.dispatchTarget, 1, -1);
      return;
    }
    if (nativePointer) return;

    if (!this.canvasPenDrag) {
      if (this.iosPencilEnabled) {
        if (event.pointerType === "pen" && event.buttons === 0) this.refreshIosPenHover(event);
        return;
      }
      const interactionType = canvasPenInteractionForEvent(event);
      if (!interactionType || (interactionType === "select" && !this.host.config.surfacePenSideButtonDrag)) return;
      if (this.pointerDrag) return;
      const target = this.elementFromEventTarget(event.target);
      if (!target) return;
      const interaction = this.findCanvasPenInteraction(
        target,
        interactionType,
        event.clientX,
        event.clientY,
      );
      if (interaction === "passthrough" || interaction?.native) return;
      if (!interaction || !this.beginCanvasPenDrag(event, interaction)) return;
    }

    const drag = this.canvasPenDrag;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)
    ) return;
    drag.lastEvent = event;
    drag.moved ||= hasCrossedPointerDragThreshold(drag.startX, drag.startY, event.clientX, event.clientY);
    event.preventDefault();
    event.stopImmediatePropagation();
    this.dispatchCanvasPointerEvent(
      "pointermove",
      event,
      drag.dispatchTarget,
      canvasPenButtonsForButton(drag.button),
      -1,
    );
  }

  private handleCanvasPenPointerUp(event: PointerEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    if (this.handleIosNavigationEvent(event, true)) return;
    if (this.isCanvasPenPassthroughPointer(event)) {
      this.canvasPenPassthroughPointer = null;
      return;
    }
    const nativePointer = this.canvasPenNativePointer;
    if (nativePointer && this.isCanvasPenNativePointer(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.dispatchCanvasPointerEvent("pointerup", event, nativePointer.dispatchTarget, 0, 0);
      this.rememberIosClick(event);
      if (isSurfacePenSideButton(nativePointer.lastEvent)) {
        this.canvasPenContextMenuSuppression = { ownerDocument: nativePointer.ownerDocument, expiresAt: Date.now() + 1_000 };
      }
      this.canvasPenNativePointer = null;
      return;
    }
    const drag = this.canvasPenDrag;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)
    ) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this.dispatchCanvasPointerEvent("pointerup", event, drag.dispatchTarget, 0, drag.button);
    if (this.iosPencilEnabled && event.pointerType === "pen" && drag.button === 0 && !drag.moved) {
      const ownerWindow = drag.dispatchTarget.ownerDocument.defaultView;
      if (ownerWindow) {
        const click = new ownerWindow.MouseEvent("click", createCanvasPointerEventInit(event, ownerWindow, 0, 0));
        this.syntheticCanvasEvents.add(click);
        drag.dispatchTarget.dispatchEvent(click);
        this.refreshIosPenHover(event);
      }
    }
    this.rememberIosClick(event);
    if (drag.suppressContextMenu) {
      this.canvasPenContextMenuSuppression = {
        ownerDocument: drag.dispatchTarget.ownerDocument,
        expiresAt: Date.now() + 1_000,
      };
    }
    this.clearCanvasPenDrag();
  }

  private handleCanvasPenPointerCancel(event: PointerEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    if (this.handleIosNavigationEvent(event, true)) return;
    if (this.isCanvasPenPassthroughPointer(event)) {
      this.canvasPenPassthroughPointer = null;
      return;
    }
    const nativePointer = this.canvasPenNativePointer;
    if (nativePointer && this.isCanvasPenNativePointer(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.dispatchCanvasPointerEvent("pointercancel", event, nativePointer.dispatchTarget, 0, 0);
      this.canvasPenNativePointer = null;
      return;
    }
    const drag = this.canvasPenDrag;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)
    ) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this.dispatchCanvasPointerEvent("pointercancel", event, drag.dispatchTarget, 0, drag.button);
    this.clearCanvasPenDrag();
  }

  private handleCanvasPenMouseDown(event: MouseEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    if (this.canvasTouchNavigation && this.isSameEventDocument(event, this.canvasTouchNavigation.target.ownerDocument)) {
      this.consumePointer(event);
      return;
    }
    if (this.suppressCanvasPenNativeMouse(event)) return;
    const drag = this.canvasPenDrag;
    if (!drag || !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleCanvasPenMouseMove(event: MouseEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    if (this.suppressCanvasPenNativeMouse(event)) return;
    const drag = this.canvasPenDrag;
    if (!drag || !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleCanvasPenMouseUp(event: MouseEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    if (this.suppressCanvasPenNativeMouse(event)) return;
    const drag = this.canvasPenDrag;
    if (!drag || !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleCanvasPenContextMenu(event: MouseEvent): void {
    if (this.suppressMarkdownPenContextMenu(event)) return;
    const dragDocument = this.canvasPenDrag?.dispatchTarget.ownerDocument ?? this.canvasPenNativePointer?.ownerDocument;
    const suppression = this.canvasPenContextMenuSuppression;
    const ownerDocument = dragDocument ?? suppression?.ownerDocument;
    if (
      !ownerDocument ||
      !this.isSameEventDocument(event, ownerDocument) ||
      (suppression && suppression.expiresAt < Date.now())
    ) {
      if (suppression && suppression.expiresAt < Date.now()) {
        this.canvasPenContextMenuSuppression = null;
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!dragDocument) this.canvasPenContextMenuSuppression = null;
  }

  private rememberMarkdownPenContextMenu(drag: PointerDrag, event: PointerEvent): void {
    if (drag.pointerType !== "pen") return;
    this.markdownPenContextMenuSuppression = {
      ownerDocument: drag.element.ownerDocument,
      pointerId: drag.pointerId,
      x: event.clientX,
      y: event.clientY,
      expiresAt: Date.now() + 1_000,
    };
  }

  private suppressMarkdownPenContextMenu(event: MouseEvent): boolean {
    const drag = this.pointerDrag?.pointerType === "pen" ? this.pointerDrag : null;
    const suppression = this.markdownPenContextMenuSuppression;
    const ownerDocument = drag?.element.ownerDocument ?? suppression?.ownerDocument;
    if (!ownerDocument || !this.isSameEventDocument(event, ownerDocument)) return false;
    if (!drag && suppression && suppression.expiresAt < Date.now()) {
      this.markdownPenContextMenuSuppression = null;
      return false;
    }
    const pointerType = "pointerType" in event ? event.pointerType : undefined;
    if (pointerType === "pen") {
      const pointerId = drag?.pointerId ?? suppression?.pointerId;
      // Windows can report contextmenu with pointerId 1 after a pen release
      // that used a different ID. Correlate that event by time and position.
      if ("pointerId" in event && event.pointerId !== pointerId &&
        (!suppression || suppression.expiresAt < Date.now() ||
          Math.hypot(event.clientX - suppression.x, event.clientY - suppression.y) > 24)) return false;
    } else {
      // Older Chromium versions emit MouseEvent for pen context menus.
      if (pointerType || event.button !== 2) return false;
      if (!drag && suppression && Math.hypot(event.clientX - suppression.x, event.clientY - suppression.y) > 24) return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    // Retain the release guard across asynchronous commits and capture cleanup.
    if (!drag) this.markdownPenContextMenuSuppression = null;
    return true;
  }

  private beginCanvasPenDrag(event: PointerEvent, interaction: CanvasPenInteraction): boolean {
    const captureTarget = this.findPointerCaptureElement(interaction.dispatchTarget);
    if (!captureTarget) return false;

    this.canvasPenDrag = {
      pointerId: event.pointerId,
      dispatchTarget: interaction.dispatchTarget,
      captureTarget,
      button: interaction.button,
      suppressContextMenu: isSurfacePenSideButton(event),
      lastEvent: event,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    try {
      captureTarget.setPointerCapture(event.pointerId);
    } catch {
      this.canvasPenDrag = null;
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.dispatchCanvasPointerEvent(
      "pointerdown",
      event,
      interaction.dispatchTarget,
      canvasPenButtonsForButton(interaction.button),
      interaction.button,
    );
    return true;
  }

  private dispatchCanvasPointerEvent(
    type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
    source: PointerEvent,
    target: Element,
    buttons: number,
    button: number,
  ): void {
    const ownerWindow = target.ownerDocument.defaultView;
    if (!ownerWindow) return;
    // Canvas may remove its hover layer when a connection drag starts.
    const dispatchTarget = target.isConnected ? target : target.ownerDocument;

    if (typeof ownerWindow.PointerEvent === "function") {
      const synthetic = new ownerWindow.PointerEvent(
        type,
        createCanvasPointerEventInit(source, ownerWindow, button, buttons),
      );
      this.syntheticCanvasEvents.add(synthetic);
      dispatchTarget.dispatchEvent(synthetic);
    }

    const mouseType = type === "pointerdown"
      ? "mousedown"
      : type === "pointermove"
        ? "mousemove"
        : type === "pointerup"
          ? "mouseup"
          : null;
    if (!mouseType) return;
    const syntheticMouse = new ownerWindow.MouseEvent(mouseType, {
      view: ownerWindow,
      bubbles: true,
      cancelable: true,
      composed: true,
      button: type === "pointermove" ? 0 : button,
      buttons,
      clientX: source.clientX,
      clientY: source.clientY,
      screenX: source.screenX,
      screenY: source.screenY,
      ctrlKey: source.ctrlKey,
      shiftKey: source.shiftKey,
      altKey: source.altKey,
      metaKey: source.metaKey,
    });
    this.syntheticCanvasEvents.add(syntheticMouse);
    dispatchTarget.dispatchEvent(syntheticMouse);
  }

  private isSameEventDocument(event: Event, ownerDocument: Document): boolean {
    const target = isNodeLike(event.target) ? event.target : null;
    if (target) return target.ownerDocument === ownerDocument;
    return event.currentTarget === ownerDocument;
  }

  private clearCanvasPenDrag(): void {
    const drag = this.canvasPenDrag;
    if (!drag) return;
    this.canvasPenDrag = null;
    try {
      if (drag.captureTarget.hasPointerCapture(drag.pointerId)) {
        drag.captureTarget.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The Canvas document may already be closing.
    }
  }

  private elementFromEventTarget(target: EventTarget | null): Element | null {
    if (!isNodeLike(target)) return null;
    return isElementNode(target) ? target : target.parentElement;
  }

  private findCanvasPenInteraction(
    element: Element,
    interactionType: "select" | "pan",
    clientX: number,
    clientY: number,
  ): CanvasPenInteractionResult {
    let result: CanvasPenInteractionResult = null;
    this.host.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (result || !isCanvasView(leaf.view)) return;
      const view = leaf.view;
      if (
        view.containerEl.ownerDocument === element.ownerDocument &&
        view.containerEl.isConnected &&
        view.containerEl.contains(element)
      ) {
        if (this.iosPencilEnabled && isCanvasEditingElement(element)) {
          result = "passthrough";
          return;
        }
        const nativeTarget = findCanvasPenDragControl(view.containerEl, element, clientX, clientY);
        if (nativeTarget) {
          // A pen tip over a resize handle should pan the canvas. Holding the
          // Surface Pen side button switches the same hit target to native
          // Canvas resize via the select interaction.
          if (interactionType !== "select" && (isCanvasResizeHandleElement(nativeTarget) || this.iosPencilEnabled)) {
            const wrapper = this.findCanvasWrapper(view);
            if (!wrapper?.contains(element)) return;
            result = {
              dispatchTarget: wrapper,
              button: canvasPenButtonForInteraction(interactionType),
            };
            return;
          }
          result = { dispatchTarget: nativeTarget, button: 0, native: true };
          return;
        }
        if (this.isCanvasControl(element)) {
          result = "passthrough";
          return;
        }
        const wrapper = this.findCanvasWrapper(view);
        if (!wrapper?.contains(element)) return;
        const nodeTarget = interactionType === "select"
          ? this.findCanvasNodeTarget(view, element)
          : null;
        if (nodeTarget) {
          result = {
            dispatchTarget: nodeTarget,
            button: canvasPenButtonForInteraction(interactionType),
          };
          return;
        }
        result = {
          dispatchTarget: wrapper,
          button: canvasPenButtonForInteraction(interactionType),
        };
      }
    });
    return result;
  }

  private findCanvasNodeTarget(view: CanvasView, element: Element): Element | null {
    const closestContainer = element.closest(".canvas-node-container");
    if (closestContainer && view.containerEl.contains(closestContainer)) return closestContainer;

    for (const node of view.canvas.nodes.values()) {
      const nodeElement = node.nodeEl;
      if (!nodeElement?.contains(element)) continue;
      return nodeElement.querySelector(".canvas-node-container") ?? nodeElement;
    }
    return null;
  }

  private findCanvasWrapper(view: CanvasView): Element | null {
    const candidate = (view.canvas as unknown as { wrapperEl?: unknown }).wrapperEl;
    if (isNodeLike(candidate) && isElementNode(candidate) && view.containerEl.contains(candidate)) {
      return candidate;
    }
    return view.containerEl.querySelector(".canvas-wrapper");
  }

  private isCanvasControl(element: Element): boolean {
    return isCanvasNativeControlElement(element);
  }

  private isCanvasPenNativePointer(event: PointerEvent): boolean {
    const nativePointer = this.canvasPenNativePointer;
    return nativePointer !== null &&
      nativePointer.pointerId === event.pointerId &&
      this.isSameEventDocument(event, nativePointer.ownerDocument);
  }

  private isCanvasPenPassthroughPointer(event: PointerEvent): boolean {
    const pointer = this.canvasPenPassthroughPointer;
    return pointer !== null && pointer.pointerId === event.pointerId && this.isSameEventDocument(event, pointer.ownerDocument);
  }

  private suppressCanvasPenNativeMouse(event: MouseEvent): boolean {
    const pointer = this.canvasPenNativePointer;
    if (!pointer || !this.isSameEventDocument(event, pointer.ownerDocument)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  private findPointerCaptureElement(element: Element): PointerCaptureElement | null {
    let current: Element | null = element;
    while (current) {
      const candidate = current as unknown as Partial<PointerCaptureElement>;
      if (
        typeof candidate.setPointerCapture === "function" &&
        typeof candidate.releasePointerCapture === "function" &&
        typeof candidate.hasPointerCapture === "function"
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  private resolveMarkdownActionForTarget(
    event: ModifierKeyState,
    context: MarkdownDropContext,
  ): ResolvedMarkdownDropAction {
    return resolveMarkdownDropActionForContext(
      event,
      context,
      this.host.config.markdownBindings,
      this.host.config.sameMarkdownBindings,
    );
  }

  private cacheMarkdownAction(
    action: ResolvedMarkdownDropAction,
    event: ModifierKeyState,
    targetFile: TFile,
    ownerDocument: Document,
    context: MarkdownDropContext,
  ): void {
    this.markdownDropAction = action;
    this.markdownDropDocument = ownerDocument;
    this.markdownDropContext = context;
    this.markdownDropSourcePath = this.session?.sourceFile.path ?? null;
    this.markdownDropTargetPath = targetFile.path;
    this.markdownDropChord = modifierChordFromEvent(event);
  }

  private cachedMarkdownAction(
    event: ModifierKeyState,
    targetFile: TFile,
    ownerDocument: Document,
    context: MarkdownDropContext,
  ): ResolvedMarkdownDropAction {
    if (
      this.markdownDropAction &&
      this.markdownDropDocument === ownerDocument &&
      this.markdownDropContext === context &&
      this.markdownDropSourcePath === this.session?.sourceFile.path &&
      this.markdownDropTargetPath === targetFile.path &&
      this.markdownDropChord === modifierChordFromEvent(event)
    ) {
      return this.markdownDropAction;
    }
    return this.resolveMarkdownActionForTarget(event, context);
  }

  private handleDragOver(event: DragEvent): void {
    if (!this.session) return;
    const document = (event.target as Node | null)?.ownerDocument ?? activeDocument;
    if (this.pendingGhostSessionId !== this.session.id) {
      this.ensureGhost(document);
      this.moveGhost(event);
    }
    if (this.canvasAdapter.findDropTarget(event)) {
      this.stopAutoScroll();
      this.clearMarkdownDropTarget();
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      return;
    }

    const markdownTarget = this.findMarkdownDropTarget(event);
    if (markdownTarget) {
      event.preventDefault();
      event.stopPropagation();
      const action = this.resolveMarkdownActionForTarget(event, markdownTarget.context);
      this.cacheMarkdownAction(
        action,
        event,
        markdownTarget.file,
        markdownTarget.ownerDocument,
        markdownTarget.context,
      );
      if (action === "none") {
        this.hideMarkdownDropLine();
      } else {
        this.showMarkdownDropLine(markdownTarget);
      }
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect =
          action === "move" && markdownTarget.issue !== null
            ? "none"
            : action === "move"
              ? "move"
              : action === "none"
                ? "none"
                : "copy";
      }
      this.updateAutoScroll(markdownTarget, event.clientX, event.clientY, action);
      return;
    }

    const fileTarget = this.findMarkdownFileDropTarget(event);
    if (!fileTarget) {
      this.clearMarkdownDropTarget();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.stopAutoScroll();
    this.hideMarkdownDropLine();
    const action = this.resolveMarkdownActionForTarget(event, "cross-file");
    this.cacheMarkdownAction(
      action,
      event,
      fileTarget.file,
      fileTarget.ownerDocument,
      "cross-file",
    );
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect =
        action === "move" ? "move" : action === "none" ? "none" : "copy";
    }
  }

  private async handleDrop(event: DragEvent): Promise<void> {
    const session = this.session;
    if (!session) return;
    const transferId = event.dataTransfer?.getData(SESSION_MIME);
    if (transferId && transferId !== session.id) return;

    const canvasTarget = this.canvasAdapter.findDropTarget(event);
    if (canvasTarget) {
      this.clearMarkdownDropTarget();
      event.preventDefault();
      event.stopPropagation();
      await this.commitDrop(
        session,
        canvasTarget,
        resolveCanvasDropAction(event, this.host.config.canvasBindings),
      );
      return;
    }

    const markdownTarget = this.findMarkdownDropTarget(event);
    if (markdownTarget) {
      event.preventDefault();
      event.stopPropagation();
      const action = this.cachedMarkdownAction(
        event,
        markdownTarget.file,
        markdownTarget.ownerDocument,
        markdownTarget.context,
      );
      await this.commitMarkdownDrop(session, markdownTarget, action);
      return;
    }

    const fileTarget = this.findMarkdownFileDropTarget(event);
    if (!fileTarget) {
      this.cleanupDrag();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const action = this.cachedMarkdownAction(
      event,
      fileTarget.file,
      fileTarget.ownerDocument,
      "cross-file",
    );
    await this.commitMarkdownFileDrop(session, fileTarget, action);
  }

  private async commitMarkdownDrop(
    session: DragSession,
    target: MarkdownDropTarget,
    action: ReturnType<typeof resolveMarkdownDropAction>,
  ): Promise<void> {
    if (!this.isMarkdownTargetConnected(target)) return;
    if (!this.commitGate.tryClaim(session.id, "markdown")) return;
    this.stopAutoScroll();

    try {
      const targetState = target.editorView.state;
      if (action === "none") return;
      if (action === "move" && target.issue !== null) {
        new Notice(this.markdownDropIssueMessage(target.issue));
        return;
      }
      if (!session.sourceView.state.doc.eq(session.sourceState.doc)) {
        new Notice("The source note changed during the drag. Try again.");
        return;
      }
      if (
        target.file.path === session.sourceFile.path &&
        !target.editorView.state.doc.eq(session.sourceState.doc)
      ) {
        new Notice("The other pane changed the source note during the drag. Try again.");
        return;
      }
      if (!this.isEditorWritable(target.editorView)) {
        new Notice("The destination note is read-only.");
        return;
      }

      if (action === "move") {
        if (!this.isEditorWritable(session.sourceView)) {
          new Notice("The source note is read-only or not editable.");
          return;
        }
        if (requiresMoveConfirmation(session.units, target.context)) {
          const confirmed = await new MoveConfirmationModal(this.host.app, session.units.filter((unit) => unit.existingBlockId).length).openAndConfirm();
          if (!confirmed || !session.sourceView.state.doc.eq(session.sourceState.doc)) return;
          if (!this.isMarkdownTargetConnected(target) ||
            !target.editorView.state.doc.eq(targetState.doc) ||
            !this.isEditorWritable(target.editorView) || !this.isEditorWritable(session.sourceView)) {
            new Notice("A note changed or closed while confirming the move. Try again.");
            return;
          }
        }
        await this.moveMarkdownBlocks(session, target);
        return;
      }

      if (
        session.units.some((unit) => unit.blockIdInsert !== undefined) &&
        !this.isEditorWritable(session.sourceView)
      ) {
        new Notice("The source note is read-only and needs a block ID before it can be embedded.");
        return;
      }
      await this.embedMarkdownBlocks(session, target, action === "link-source");
    } catch (error) {
      console.error("DragDrop could not complete a Markdown drop.", error);
      new Notice("Could not complete the Markdown drop. Check the affected notes.");
    } finally {
      this.cleanupDrag();
    }
  }

  private async commitMarkdownFileDrop(
    session: DragSession,
    target: MarkdownFileDropTarget,
    action: ResolvedMarkdownDropAction,
  ): Promise<void> {
    if (!this.commitGate.tryClaim(session.id, "markdown")) return;
    this.stopAutoScroll();

    try {
      if (action === "none") return;
      if (target.file.path === session.sourceFile.path) {
        new Notice("The file target is the same as the source note.");
        return;
      }
      if (!session.sourceView.state.doc.eq(session.sourceState.doc)) {
        new Notice("The source note changed during the drag. Try again.");
        return;
      }
      if (action === "move") {
        if (!this.isEditorWritable(session.sourceView)) {
          new Notice("The source note is read-only or not editable.");
          return;
        }
        if (requiresMoveConfirmation(session.units)) {
          const confirmed = await new MoveConfirmationModal(
            this.host.app,
            session.units.filter((unit) => unit.existingBlockId !== undefined).length,
          ).openAndConfirm();
          if (!confirmed || !session.sourceView.state.doc.eq(session.sourceState.doc)) return;
        }
      }

      const targetBefore = await this.host.app.vault.read(target.file);
      const sourceBefore = session.sourceState.doc.toString();
      const references = action === "move" ? [] : this.markdownReferences(session);
      const planned = action === "move" ? session.units : references.map(({ unit }) => unit);
      const targetBlocks = action === "move" ? planned.map((unit) => unit.text)
        : this.markdownReferenceTexts(references, target.file, action === "link-source");
      const targetAfter = insertBlocksAtBoundary(targetBefore, targetBefore.length, targetBlocks);
      const sourceAfter = action === "move"
        ? removeTextRanges(sourceBefore, session.units)
        : applyTextChanges(sourceBefore, this.blockIdChanges(planned));

      if (action !== "move" && planned.some((unit) => unit.blockIdInsert !== undefined) && !this.isEditorWritable(session.sourceView)) {
        new Notice("The source note is read-only and needs a block ID before it can be embedded.");
        return;
      }

      const sourceMutation: MarkdownMutation = {
        path: session.sourceFile.path,
        before: sourceBefore,
        after: sourceAfter,
      };
      const targetMutation: MarkdownMutation = {
        path: target.file.path,
        before: targetBefore,
        after: targetAfter,
      };
      const sourceSnapshot = captureEditorViewSnapshot(session.sourceView);
      const attempted = new Set<string>();
      const transaction = await runMarkdownTransaction(
        [targetMutation, sourceMutation],
        {
          apply: async (mutation) => {
            if (mutation.path === session.sourceFile.path) {
              if (!this.isEditorWritable(session.sourceView) || session.sourceView.state.doc.toString() !== mutation.before) {
                throw new Error("The source note changed during the Markdown drop.");
              }
              attempted.add(mutation.path);
              dispatchEditorChanges(session.sourceView, documentChanges(mutation.before, mutation.after));
              return;
            }
            await this.host.app.vault.process(target.file, (current) => {
              if (current !== mutation.before) {
                throw new Error("The file target changed during the Markdown drop.");
              }
              attempted.add(mutation.path);
              return mutation.after;
            });
          },
          rollback: async (mutation) => {
            if (!attempted.has(mutation.path)) return;
            if (mutation.path === session.sourceFile.path) {
              if (session.sourceView.state.doc.toString() === mutation.before) return;
              if (!this.isEditorWritable(session.sourceView) || session.sourceView.state.doc.toString() !== mutation.after) {
                throw new Error("The source note changed before rollback.");
              }
              dispatchEditorChanges(session.sourceView, documentChanges(mutation.after, mutation.before));
              restoreEditorViewSnapshot(session.sourceView, sourceSnapshot);
              return;
            }
            await this.host.app.vault.process(target.file, (current) => {
              if (current === mutation.before) return current;
              if (current !== mutation.after) {
                throw new Error("The file target changed before rollback.");
              }
              return mutation.before;
            });
          },
        },
      );
      if (!transaction.ok) {
        console.error("DragDrop file-target transaction failed.", transaction.error);
        new Notice(transaction.rollbackFailed
          ? "The Markdown drop failed and could not fully roll back. Check both notes."
          : "Could not complete the Markdown drop. Applied changes were rolled back.");
      }
    } catch (error) {
      console.error("DragDrop could not complete a file-target Markdown drop.", error);
      new Notice("Could not complete the file-target Markdown drop. Check the affected notes.");
    } finally {
      this.cleanupDrag();
    }
  }

  private isMarkdownTargetConnected(target: MarkdownDropTarget): boolean {
    return (
      target.view.containerEl.isConnected &&
      target.view.containerEl.ownerDocument === target.ownerDocument &&
      target.editorView.dom.isConnected &&
      target.view.file?.path === target.file.path &&
      target.file instanceof TFile
    );
  }

  private isEditorWritable(view: EditorView): boolean {
    return (
      view.dom.isConnected &&
      view.state.facet(EditorState.readOnly) !== true &&
      view.state.facet(EditorView.editable) !== false
    );
  }

  private async embedMarkdownBlocks(
    session: DragSession,
    target: MarkdownDropTarget,
    plainLink = false,
  ): Promise<void> {
    const sourceFoldStarts = this.host.config.preserveFoldState
      ? captureFoldStarts(session.sourceView.state)
      : [];
    const targetFoldStarts = this.host.config.preserveFoldState && target.editorView !== session.sourceView
      ? captureFoldStarts(target.editorView.state)
      : [];
    const references = this.markdownReferences(session);
    const planned = references.map(({ unit }) => unit);
    const sourceContent = session.sourceState.doc.toString();
    const idChanges = this.blockIdChanges(planned);
    const sourceWithIds = applyTextChanges(sourceContent, idChanges);
    const sameDocument =
      session.sourceView === target.editorView ||
      (target.file.path === session.sourceFile.path &&
        target.editorView.state.doc.eq(session.sourceState.doc));
    const targetContent = target.editorView.state.doc.toString();
    const embeds = this.markdownReferenceTexts(references, target.file, plainLink);

    if (sameDocument) {
      const ids = session.sourceState.changes(idChanges);
      const mappedPosition = ids.mapPos(target.position, 1);
      const insertion = boundaryInsertionForBlocks(sourceWithIds, mappedPosition, embeds);
      const changes = ids.compose(ChangeSet.of({
        from: mappedPosition, insert: insertion,
      }, ids.newLength));
      this.applySameDocumentChanges(session.sourceView, target.editorView, changes);
      this.restoreEmbeddedFoldState(
        session.sourceView,
        sourceFoldStarts,
        sourceWithIds,
        idChanges,
        embeds,
        target.position,
      );
      return;
    }

    const applied = await this.applyMarkdownDocuments(
      session.sourceView,
      target.editorView,
      sourceContent,
      targetContent,
      sourceWithIds,
      insertBlocksAtBoundary(targetContent, target.position, embeds),
    );
    if (!applied || !this.host.config.preserveFoldState) return;

    this.restoreEmbeddedFoldState(
      session.sourceView,
      sourceFoldStarts,
      sourceWithIds,
      idChanges,
      sameDocument ? embeds : [],
      sameDocument ? target.position : Number.POSITIVE_INFINITY,
    );
    if (!sameDocument) {
      restoreFoldStarts(target.editorView, this.mapFoldStartsAfterInsertion(
        targetFoldStarts,
        targetContent,
        target.position,
        embeds,
      ));
    }
  }

  private async moveMarkdownBlocks(session: DragSession, target: MarkdownDropTarget): Promise<void> {
    const sourceFoldStarts = this.host.config.preserveFoldState
      ? captureFoldStarts(session.sourceView.state)
      : [];
    const targetFoldStarts = this.host.config.preserveFoldState && target.editorView !== session.sourceView
      ? captureFoldStarts(target.editorView.state)
      : [];
    const sourceContent = session.sourceState.doc.toString();
    const blocks = session.units.map((unit) => ({
      from: unit.from,
      to: unit.to,
      text: unit.text,
    }));
    const sameDocument =
      session.sourceView === target.editorView ||
      (target.file.path === session.sourceFile.path &&
        target.editorView.state.doc.eq(session.sourceState.doc));
    const targetContent = target.editorView.state.doc.toString();
    const listIntent = this.host.config.structuralMarkdownMoves ? target.listIntent : null;
    const plannedBlocks = structuredMoveBlocks(blocks, target.targetLineText, listIntent);
    if (sameDocument) {
      const plan = planMarkdownMoveChanges(sourceContent, plannedBlocks, target.position);
      const renumberChanges = documentChanges(plan.after, this.host.config.renumberOrderedLists
        ? renumberOrderedListMarkers(plan.after)
        : plan.after);
      const changes = plan.changes.compose(renumberChanges);
      const mapPosition = (position: number): number => renumberChanges.mapPos(plan.mapPosition(position));
      this.applySameDocumentChanges(session.sourceView, target.editorView, changes, mapPosition);
      restoreFoldStarts(session.sourceView, sourceFoldStarts.map(mapPosition));
      return;
    }

    const sourceAfter = this.host.config.renumberOrderedLists
        ? renumberOrderedListMarkers(removeTextRanges(sourceContent, blocks))
        : removeTextRanges(sourceContent, blocks);
    const targetAfter = this.host.config.renumberOrderedLists
        ? renumberOrderedListMarkers(insertBlocksAtBoundary(
            targetContent,
            target.position,
            blocks.map((block) =>
              listIntent === null
                ? block.text
                : adjustListBlockIndent(block.text, target.targetLineText, listIntent),
            ),
          ))
        : insertBlocksAtBoundary(
          targetContent,
          target.position,
          blocks.map((block) =>
            listIntent === null
              ? block.text
              : adjustListBlockIndent(block.text, target.targetLineText, listIntent),
          ),
        );

    const applied = await this.applyMarkdownDocuments(
      session.sourceView,
      target.editorView,
      sourceContent,
      targetContent,
      sourceAfter,
      targetAfter,
    );
    if (!applied || !this.host.config.preserveFoldState) return;

    restoreFoldStarts(
      session.sourceView,
      sourceFoldStarts.map((start) => mapPositionAfterRemovals(start, sourceContent, blocks)),
    );
    if (!sameDocument) {
      restoreFoldStarts(
        target.editorView,
        targetFoldStarts.map((start) => start >= target.position
          ? start + (targetAfter.length - targetContent.length)
          : start),
      );
    }
  }

  private restoreEmbeddedFoldState(
    view: EditorView,
    starts: readonly number[],
    sourceContent: string,
    idChanges: readonly TextChange[],
    embeds: readonly string[],
    targetPosition: number,
  ): void {
    if (!this.host.config.preserveFoldState || starts.length === 0) return;
    const mapped = starts.map((start) => {
      const afterIds = mapPositionAfterChanges(start, idChanges);
      return Number.isFinite(targetPosition)
        ? mapPositionAfterInsertion(sourceContent, afterIds, embeds, mapPositionAfterChanges(targetPosition, idChanges))
        : afterIds;
    });
    restoreFoldStarts(view, mapped);
  }

  private mapFoldStartsAfterInsertion(
    starts: readonly number[],
    content: string,
    position: number,
    blocks: readonly string[],
  ): number[] {
    return starts.map((start) => start >= position
      ? start + (insertBlocksAtBoundary(content, position, blocks).length - content.length)
      : start);
  }

  private async applyMarkdownDocuments(
    sourceView: EditorView,
    targetView: EditorView,
    sourceBefore: string,
    targetBefore: string,
    sourceAfter: string,
    targetAfter: string,
  ): Promise<boolean> {
    if (sourceView === targetView) {
      if (sourceAfter !== sourceBefore) {
        dispatchEditorChanges(sourceView, documentChanges(sourceBefore, sourceAfter));
      }
      return true;
    }

    const snapshots = new Map([
      [sourceView, captureEditorViewSnapshot(sourceView)],
      [targetView, captureEditorViewSnapshot(targetView)],
    ]);
    const inverseChanges = new Map<EditorView, ChangeSet>();
    const result = await runMarkdownTransaction([
      { path: "target", before: targetBefore, after: targetAfter },
      { path: "source", before: sourceBefore, after: sourceAfter },
    ], {
      apply: (mutation) => {
        const view = mutation.path === "source" ? sourceView : targetView;
        if (!this.isEditorWritable(view) || view.state.doc.toString() !== mutation.before) {
          throw new Error("A note changed or closed during the Markdown drop.");
        }
        const changes = documentChanges(mutation.before, mutation.after);
        inverseChanges.set(view, changes.invert(view.state.doc));
        dispatchEditorChanges(view, changes);
      },
      rollback: (mutation) => {
        const view = mutation.path === "source" ? sourceView : targetView;
        if (!inverseChanges.has(view) || view.state.doc.toString() === mutation.before) return;
        if (!this.isEditorWritable(view) || view.state.doc.toString() !== mutation.after) {
          throw new Error("A note changed before rollback.");
        }
        const snapshot = snapshots.get(view);
        const inverse = inverseChanges.get(view);
        if (!snapshot || !inverse) throw new Error("Missing rollback snapshot.");
        dispatchEditorChanges(view, inverse);
        restoreEditorViewSnapshot(view, snapshot);
      },
    });
    if (!result.ok) {
      console.error("DragDrop could not apply a Markdown drop.", result.error);
      new Notice(result.rollbackFailed
        ? "The Markdown drop failed and could not fully roll back. Check both notes."
        : "Could not complete the Markdown drop. Applied changes were rolled back.");
    }
    return result.ok;
  }

  private applySameDocumentChanges(
    source: EditorView,
    target: EditorView,
    changes: ChangeSet,
    mapPosition?: (position: number) => number,
  ): void {
    if (!this.isEditorWritable(source) || !this.isEditorWritable(target)) {
      throw new Error("A note is read-only or closed.");
    }
    const cancelSync = source !== target ? preserveEditorOnSync(target, changes, mapPosition) : undefined;
    try {
      dispatchEditorChanges(source, changes, mapPosition);
    } catch (error) {
      cancelSync?.();
      throw error;
    }
  }

  private blockIdChanges(units: readonly SourceUnit[]): TextChange[] {
    return units
      .flatMap((unit) => (unit.blockIdInsert
        ? [{ from: unit.blockIdInsert.pos, to: unit.blockIdInsert.pos, insert: unit.blockIdInsert.text }]
        : []))
      .sort((left, right) =>
        left.from - right.from ||
        Number(left.insert.startsWith("\n")) - Number(right.insert.startsWith("\n")),
      );
  }

  private markdownDropIssueMessage(issue: MarkdownDropIssue): string {
    switch (issue) {
      case "inside-source":
        return "Cannot move a block into its own source range.";
      case "frontmatter":
        return "Cannot move a block into frontmatter.";
      case "table-cell":
        return "Cannot move a block into a table cell.";
      case "fenced-code":
        return "Cannot move a block into a fenced code block.";
      case "quote-run":
        return "Cannot move a block into the middle of a quote or callout.";
      case "horizontal-rule":
        return "Cannot move a block into a horizontal rule.";
    }
  }

  private async commitDrop(
    session: DragSession,
    target: CanvasDropTarget,
    action: ReturnType<typeof resolveCanvasDropAction>,
  ): Promise<void> {
    if (!this.canvasAdapter.isTargetConnected(target)) return;
    if (!this.commitGate.tryClaim(session.id, "canvas")) return;

    try {
      if (action === "none") return;
      if (!session.sourceView.state.doc.eq(session.sourceState.doc)) {
        new Notice("The source note changed during the drag. Try again.");
        return;
      }
      const planned = this.planReferences(session.sourceState, session.units, session.sourceFile);
      if (!planned) {
        new Notice("Could not resolve an embedded block in the dragged content.");
        return;
      }
      if (action === "link-source") {
        await this.linkSourceBlocks(session, target, planned);
      } else if (action === "create-note") {
        await this.createNoteCards(session, target, planned);
      }
    } finally {
      this.cleanupDrag();
    }
  }

  private async linkSourceBlocks(
    session: DragSession,
    target: CanvasDropTarget,
    references: CanvasReference<TFile>[],
  ): Promise<void> {
    applyBlockIdInsertions(
      session.sourceState,
      (transaction) => session.sourceView.dispatch(transaction),
      references.map(({ unit }) => unit),
    );

    const items: CanvasItemSpec[] = references.map(({ unit, file, subpath }) => {
      if (
        unit.kind === "list-item" &&
        unit.hasListChildren &&
        this.host.config.listParentDisplay === "self-only"
      ) {
        const link = this.host.app.metadataCache.fileToLinktext(
          file,
          target.view.file?.path ?? "",
          true,
        );
        return {
          type: "text",
          text: textNodeLink(link, subpath, unit.selfOnlyText ?? unit.text),
        };
      }
      return { type: "file", file, subpath };
    });
    await this.createCanvasItems(target, items);
  }

  private async createNoteCards(
    session: DragSession,
    target: CanvasDropTarget,
    references: CanvasReference<TFile>[],
  ): Promise<void> {
    const fileService = new FileService(this.host.app, this.host.config);
    const units = references.map(({ unit }) => unit);
    const tasks = await fileService.resolveNoteTasks(units, session.sourceFile, target.view);
    if (tasks.length === 0 || !this.canvasAdapter.isTargetConnected(target)) return;

    const acceptedUnits = tasks.map((task) => task.unit);
    const sourceReferences = new Map<SourceUnit, NoteSourceReference>();
    for (const reference of references) {
      if (acceptedUnits.includes(reference.unit)) {
        sourceReferences.set(reference.unit, {
          file: reference.file,
          subpath: reference.subpath,
        });
      }
    }
    applyBlockIdInsertions(
      session.sourceState,
      (transaction) => session.sourceView.dispatch(transaction),
      acceptedUnits,
    );
    const created = await fileService.createNotes(tasks, session.sourceFile, sourceReferences);
    const items: CanvasItemSpec[] = created.map(({ file }) => ({ type: "file", file }));
    await this.createCanvasItems(target, items);
  }

  private async createCanvasItems(
    target: CanvasDropTarget,
    items: CanvasItemSpec[],
  ): Promise<void> {
    if (items.length === 0 || !this.canvasAdapter.isTargetConnected(target)) return;
    await this.canvasAdapter.createVerticalItems(
      target,
      items,
      this.host.config.nodeWidth,
      this.host.config.initialNodeHeight,
      this.host.config.nodeGap,
      {
        autoFitNodeHeight: this.host.config.autoFitNodeHeight,
        hideNodeBorder: this.host.config.hideNodeBorder,
      },
    );
  }

  private planReferences(
    state: EditorState,
    units: SourceUnit[],
    sourceFile: TFile,
  ): CanvasReference<TFile>[] | null {
    return planCanvasReferences(
      state,
      units,
      sourceFile,
      parseLinktext,
      (path, file) => this.host.app.metadataCache.getFirstLinkpathDest(path, file.path),
    );
  }

  private markdownReferences(session: DragSession): CanvasReference<TFile>[] {
    const references = this.planReferences(session.sourceState, session.units, session.sourceFile);
    if (!references) throw new Error("An embedded block's source file could not be resolved.");
    return references;
  }

  private markdownReferenceTexts(references: CanvasReference<TFile>[], target: TFile, plainLink: boolean): string[] {
    return references.map(({ file, subpath, unit }) => {
      const linktext = this.host.app.metadataCache.fileToLinktext(file, target.path, true);
      if (plainLink) return sourceBlockLink(linktext, subpath, this.host.config.crossMarkdownEmbedAlias);
      const original = directBlockEmbed(unit.text);
      const aliasStart = original?.indexOf("|") ?? -1;
      const embed = sourceEmbedLink(linktext, subpath);
      return original && aliasStart >= 0 ? `${embed.slice(0, -2)}${original.slice(aliasStart)}` : embed;
    });
  }

  private findMarkdownFile(view: EditorView): TFile | null {
    let result: TFile | null = null;
    this.host.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (result) return;
      if (!(leaf.view instanceof MarkdownView)) return;
      if (!leaf.view.containerEl.contains(view.dom)) return;
      if (leaf.view.file instanceof TFile) result = leaf.view.file;
    });
    return result;
  }

  private hideNativeDragImage(event: DragEvent, document: Document): void {
    if (!event.dataTransfer) return;
    const empty = createDiv({ cls: "dragdrop-empty-drag-image" });
    if (empty.ownerDocument !== document) document.adoptNode(empty);
    document.body.appendChild(empty);
    event.dataTransfer.setDragImage(empty, 0, 0);
    const window = document.defaultView;
    window?.setTimeout(() => empty.remove(), 0);
  }

  private deferGhost(
    document: Document,
    sessionId: string,
    x: number,
    y: number,
  ): void {
    this.pendingGhostSessionId = sessionId;
    const createGhost = () => {
      if (this.session?.id !== sessionId) return;
      this.pendingGhostSessionId = null;
      this.ensureGhost(document);
      this.moveGhostTo(x, y);
    };
    const ownerWindow = document.defaultView;
    if (ownerWindow) {
      ownerWindow.setTimeout(createGhost, 0);
    } else {
      createGhost();
    }
  }

  private ensureGhost(document: Document): void {
    if (this.ghostElement?.ownerDocument === document) return;
    this.removeGhost();
    const ghost = createDiv({
      cls: "dragdrop-ghost dragdrop-ghost-pending markdown-preview-view markdown-rendered",
    });
    if (ghost.ownerDocument !== document) document.adoptNode(ghost);
    ghost.style.setProperty("--dragdrop-preview-width", `${this.host.config.previewWidth}px`);
    document.body.appendChild(ghost);
    this.ghostElement = ghost;

    const component = new Component();
    this.addChild(component);
    this.ghostComponent = component;
    const session = this.session;
    if (session) {
      void MarkdownRenderer.render(
        this.host.app,
        session.previewMarkdown,
        ghost,
        session.sourcePath,
        component,
      ).then(
        () => {
          if (this.ghostElement !== ghost) return;
          ghost.removeClass("dragdrop-ghost-pending");
          ghost.addClass("dragdrop-ghost-ready");
        },
        () => {
          if (this.ghostElement === ghost) this.removeGhost();
        },
      );
    }
  }

  private moveGhost(event: DragEvent): void {
    this.moveGhostTo(event.clientX, event.clientY);
  }

  private moveGhostTo(x: number, y: number): void {
    if (!this.ghostElement) return;
    this.ghostElement.style.setProperty("--dragdrop-x", `${x}px`);
    this.ghostElement.style.setProperty("--dragdrop-y", `${y}px`);
  }

  private removeGhost(): void {
    if (this.ghostComponent) this.removeChild(this.ghostComponent);
    this.ghostComponent = null;
    this.ghostElement?.remove();
    this.ghostElement = null;
    this.pendingGhostSessionId = null;
  }

  private cleanupDrag(): void {
    this.cancelTouchNavigation(true);
    this.clearMarkdownDropTarget();
    this.clearSourceHighlight();
    this.removeGhost();
    this.session = null;
    this.commitGate.reset();
    const canvasDrag = this.canvasPenDrag;
    if (canvasDrag) this.dispatchCanvasPointerEvent("pointercancel", canvasDrag.lastEvent, canvasDrag.dispatchTarget, 0, canvasDrag.button);
    this.clearCanvasPenDrag();
    const nativePointer = this.canvasPenNativePointer;
    if (nativePointer) {
      this.dispatchCanvasPointerEvent("pointercancel", nativePointer.lastEvent, nativePointer.dispatchTarget, 0, 0);
    }
    this.canvasPenNativePointer = null;
    this.canvasPenPassthroughPointer = null;
    this.canvasPenContextMenuSuppression = null;
    if (this.pointerDrag) {
      this.clearMobileSelectionTimer(this.pointerDrag);
      this.releasePointerCapture(this.pointerDrag);
    }
    this.pointerDrag = null;
  }

  private clearMarkdownDropTarget(): void {
    this.stopAutoScroll();
    this.markdownDropAction = null;
    this.markdownDropDocument = null;
    this.markdownDropContext = null;
    this.markdownDropSourcePath = null;
    this.markdownDropTargetPath = null;
    this.markdownDropChord = null;
    this.hideMarkdownDropLine();
  }

  private updateAutoScroll(
    target: MarkdownDropTarget,
    clientX: number,
    clientY: number,
    action: ResolvedMarkdownDropAction,
  ): void {
    if (!this.host.config.edgeAutoScroll || action === "none") {
      this.stopAutoScroll();
      return;
    }

    const scrollRect = target.editorView.scrollDOM.getBoundingClientRect();
    const delta = edgeScrollDelta(
      { x: clientX, y: clientY },
      {
        left: scrollRect.left,
        top: scrollRect.top,
        right: scrollRect.right,
        bottom: scrollRect.bottom,
      },
      this.host.config.autoScrollEdgePx,
      this.host.config.autoScrollMaxSpeed,
    );
    if (delta.x === 0 && delta.y === 0) {
      this.stopAutoScroll();
      return;
    }

    this.autoScrollTarget = target;
    this.autoScrollX = clientX;
    this.autoScrollY = clientY;
    if (this.autoScrollFrame !== null) return;

    const ownerWindow = target.ownerDocument.defaultView;
    if (!ownerWindow) return;
    this.autoScrollFrame = ownerWindow.requestAnimationFrame(() => {
      this.autoScrollFrame = null;
      this.runAutoScroll();
    });
  }

  private runAutoScroll(): void {
    const target = this.autoScrollTarget;
    if (!target || !this.session || !target.editorView.dom.isConnected) {
      this.stopAutoScroll();
      return;
    }

    const scrollRect = target.editorView.scrollDOM.getBoundingClientRect();
    const delta = edgeScrollDelta(
      { x: this.autoScrollX, y: this.autoScrollY },
      {
        left: scrollRect.left,
        top: scrollRect.top,
        right: scrollRect.right,
        bottom: scrollRect.bottom,
      },
      this.host.config.autoScrollEdgePx,
      this.host.config.autoScrollMaxSpeed,
    );
    if (delta.x === 0 && delta.y === 0) {
      this.stopAutoScroll();
      return;
    }

    target.editorView.scrollDOM.scrollLeft += delta.x;
    target.editorView.scrollDOM.scrollTop += delta.y;
    this.refreshMarkdownDropTarget(target, this.autoScrollX, this.autoScrollY);
    const action = this.markdownDropAction;
    if (action === null) {
      this.stopAutoScroll();
      return;
    }
    if (action === "none") {
      this.hideMarkdownDropLine();
    } else {
      this.showMarkdownDropLine(target);
    }

    this.autoScrollFrame = target.ownerDocument.defaultView?.requestAnimationFrame(() => {
      this.autoScrollFrame = null;
      this.runAutoScroll();
    }) ?? null;
  }

  private refreshMarkdownDropTarget(
    target: MarkdownDropTarget,
    clientX: number,
    clientY: number,
  ): void {
    const position = this.markdownDropPositionAt(target.editorView, clientX, clientY);
    const rawPosition = target.editorView.posAtCoords({ x: clientX, y: clientY }) ?? position;
    const targetLine = target.editorView.state.doc.lineAt(rawPosition);
    const sourceText = this.session?.units[0]?.text ?? "";
    const listIntent = resolveListDropIntent({
      sourceText,
      targetLineText: targetLine.text,
      pointerColumn: rawPosition - targetLine.from,
      contextLineNumber: targetLine.number,
    });
    target.position = position;
    target.targetLineNumber = targetLine.number;
    target.targetLineText = targetLine.text;
    target.listIntent = listIntent;
    target.issue = findMoveTargetIssue(
      target.editorView.state.doc.toString(),
      this.session?.sourceFile.path === target.file.path ? this.session.units : [],
      position,
    );
  }

  private stopAutoScroll(): void {
    if (this.autoScrollFrame !== null) {
      const ownerWindow = this.autoScrollTarget?.ownerDocument.defaultView;
      ownerWindow?.cancelAnimationFrame(this.autoScrollFrame);
    }
    this.autoScrollFrame = null;
    this.autoScrollTarget = null;
    this.autoScrollX = 0;
    this.autoScrollY = 0;
  }

  private showMarkdownDropLine(target: MarkdownDropTarget): void {
    const document = target.ownerDocument;
    if (this.markdownDropLine?.ownerDocument !== document) {
      this.hideMarkdownDropLine();
    }
    if (!this.markdownDropLine) {
      const line = createDiv({ cls: "dragdrop-markdown-drop-line" });
      if (line.ownerDocument !== document) document.adoptNode(line);
      document.body.appendChild(line);
      this.markdownDropLine = line;
    }

    const contentRect = target.editorView.contentDOM.getBoundingClientRect();
    const editorRect = target.editorView.dom.getBoundingClientRect();
    const width = target.editorView.contentDOM.clientWidth || contentRect.width || editorRect.width;
    if (width <= 0) {
      this.hideMarkdownDropLine();
      return;
    }

    const lineRect = this.markdownDropLineRect(target.editorView, target.position);
    if (!lineRect) {
      this.hideMarkdownDropLine();
      return;
    }
    this.markdownDropLine.style.width = `${width}px`;
    this.markdownDropLine.classList.toggle(
      "dragdrop-markdown-drop-line-child",
      target.listIntent?.mode === "child",
    );
    this.markdownDropLine.classList.toggle(
      "dragdrop-markdown-drop-line-outdent",
      target.listIntent?.mode === "outdent",
    );
    this.markdownDropLine.classList.toggle(
      "dragdrop-markdown-drop-line-invalid",
      target.issue !== null,
    );
    this.renderTargetHighlight(target);
    this.markdownDropLine.style.transform = `translate(${contentRect.left}px, ${lineRect.top}px)`;
  }

  private hideMarkdownDropLine(): void {
    this.clearTargetHighlight();
    this.markdownDropLine?.remove();
    this.markdownDropLine = null;
  }

  private renderSourceHighlight(session: DragSession): void {
    this.clearSourceHighlight();
    const view = session.sourceView;
    for (const unit of session.units) {
      const firstLine = view.state.doc.lineAt(unit.from).number;
      const lastLine = view.state.doc.lineAt(Math.min(unit.to, view.state.doc.length)).number;
      for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
        const element = this.editorLineElementAt(view, view.state.doc.line(lineNumber).from);
        if (!element || this.sourceHighlightElements.includes(element)) continue;
        element.classList.add("dragdrop-source-highlight");
        this.sourceHighlightElements.push(element);
      }
    }
  }

  private clearSourceHighlight(): void {
    for (const element of this.sourceHighlightElements) {
      element.classList.remove("dragdrop-source-highlight");
    }
    this.sourceHighlightElements = [];
  }

  private renderTargetHighlight(target: MarkdownDropTarget): void {
    this.clearTargetHighlight();
    const element = this.editorLineElementAt(target.editorView, target.position);
    if (!element) return;
    element.classList.add("dragdrop-target-highlight");
    if (target.issue !== null) element.classList.add("dragdrop-target-highlight-invalid");
    if (target.listIntent?.mode === "child") element.classList.add("dragdrop-target-highlight-child");
    if (target.listIntent?.mode === "outdent") element.classList.add("dragdrop-target-highlight-outdent");
    this.targetHighlightElements.push(element);
  }

  private clearTargetHighlight(): void {
    for (const element of this.targetHighlightElements) {
      element.classList.remove(
        "dragdrop-target-highlight",
        "dragdrop-target-highlight-invalid",
        "dragdrop-target-highlight-child",
        "dragdrop-target-highlight-outdent",
      );
    }
    this.targetHighlightElements = [];
  }

  private editorLineElementAt(view: EditorView, position: number): HTMLElement | null {
    const node = view.domAtPos(Math.max(0, Math.min(position, view.state.doc.length))).node;
    const element = isElementNode(node) ? node : node.parentElement;
    return element?.closest<HTMLElement>(".cm-line") ?? null;
  }

  private markdownDropLineRect(
    editorView: EditorView,
    position: number,
  ): { top: number } | null {
    const { doc } = editorView.state;
    const safePosition = Math.max(0, Math.min(position, doc.length));
    const line = doc.lineAt(safePosition);
    const lineElement = this.markdownLineElement(editorView, line.from);
    const lineRect = lineElement?.getBoundingClientRect();
    const coords = editorView.coordsAtPos(line.from);
    if (!lineRect && !coords) return null;

    return {
      top: safePosition <= line.from
        ? lineRect?.top ?? coords?.top ?? 0
        : lineRect?.bottom ?? coords?.bottom ?? 0,
    };
  }

  private markdownLineElement(editorView: EditorView, position: number): HTMLElement | null {
    const node = editorView.domAtPos(position).node;
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element) return null;
    const line = element.closest(".cm-line");
    return line as HTMLElement | null;
  }
}
