import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  Component,
  MarkdownRenderer,
  MarkdownView,
  Notice,
  parseLinktext,
  Menu,
  TFile,
  type App,
  type WorkspaceLeaf,
} from "obsidian";
import {
  resolveCanvasDropAction,
  resolveMarkdownDropAction,
  type ResolvedMarkdownDropAction,
} from "./action-resolution";
import { applyBlockIdInsertions, ensurePlannedReference, sourceSubpath } from "./block-reference";
import { CanvasAdapter, type CanvasDropTarget, type CanvasItemSpec } from "./canvas-adapter";
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
  canConvertMarkdownBlock,
  conversionLabel,
  convertMarkdownBlock,
  MARKDOWN_BLOCK_CONVERSIONS,
  type MarkdownBlockConversion,
} from "./markdown-block-actions";
import {
  applyTextChanges,
  chooseMarkdownDropPosition,
  collectMarkdownDropBoundaryPositions,
  directBlockEmbed,
  insertBlocksAtBoundary,
  mapPositionAfterChanges,
  mapPositionAfterInsertion,
  mapPositionAfterMove,
  mapPositionAfterRemovals,
  removeTextRanges,
  requiresMoveConfirmation,
  type TextChange,
} from "./markdown-drop";
import {
  findMoveTargetIssue,
  adjustListBlockIndent,
  planStructuredMarkdownMove,
  renumberOrderedListMarkers,
  resolveListDropIntent,
  structuredMoveBlocks,
  type ListDropIntent,
  type MarkdownDropIssue,
} from "./markdown-structure";
import { captureFoldStarts, restoreFoldStarts } from "./fold-state";
import type { DragSession, SourceUnit } from "./model";
import {
  canvasPenButtonForInteraction,
  canvasPenButtonsForButton,
  createCanvasPointerEventInit,
  hasCrossedPointerDragThreshold,
  isSurfacePenSideButton,
  matchesPointerDrag,
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
}

interface CanvasPenInteraction {
  dispatchTarget: Element;
  button: 0 | 1;
}

interface CanvasPenContextMenuSuppression {
  ownerDocument: Document;
  expiresAt: number;
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
  ownerDocument: Document;
}

interface MarkdownFileDropTarget {
  file: TFile;
  ownerDocument: Document;
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
  private canvasPenContextMenuSuppression: CanvasPenContextMenuSuppression | null = null;
  private readonly syntheticCanvasEvents = new WeakSet<Event>();
  private ghostElement: HTMLElement | null = null;
  private ghostComponent: Component | null = null;
  private pendingGhostSessionId: string | null = null;
  private markdownDropAction: ResolvedMarkdownDropAction | null = null;
  private markdownDropDocument: Document | null = null;
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
    this.cleanupDrag();
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

    if (units.length === 1) {
      menu.addSeparator();
      for (const conversion of MARKDOWN_BLOCK_CONVERSIONS) {
        const allowed = canConvertMarkdownBlock(units[0], conversion);
        menu.addItem((item) =>
          item
            .setTitle(`Convert to ${conversionLabel(conversion).toLowerCase()}`)
            .setIcon("wand-2")
            .setDisabled(!writable || !allowed)
            .onClick(() => {
              void this.convertBlock(view, units[0], conversion);
            }),
        );
      }
    }

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
    if (this.isStructuralDragBlocked(view, element)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const supportedPointer = event.pointerType === "touch" || event.pointerType === "pen";
    const sideButton = isSurfacePenSideButton(event);
    if (
      !supportedPointer ||
      (sideButton
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
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      mobileSelectionMode: false,
      mobileSelectionTimer: null,
    };
    if (
      this.host.config.mobileBlockInteractions &&
      this.host.config.multiBlockSelection &&
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
    } catch {
      this.clearMobileSelectionTimer(this.pointerDrag);
      this.pointerDrag = null;
    }
  }

  movePointerDrag(event: PointerEvent): void {
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || !matchesPointerDrag(pointerDrag.pointerId, event.pointerId)) return;
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
    this.moveGhostTo(event.clientX + 16, event.clientY + 16);
    this.ghostElement?.toggleClass("dragdrop-ghost-valid", target !== null);
  }

  async endPointerDrag(event: PointerEvent): Promise<void> {
    if (this.finishSelectionPointer(event.pointerId)) {
      event.preventDefault();
      return;
    }
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || !matchesPointerDrag(pointerDrag.pointerId, event.pointerId)) return;
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

  private async convertBlock(
    view: EditorView,
    unit: SourceUnit,
    conversion: MarkdownBlockConversion,
  ): Promise<void> {
    if (!this.isEditorWritable(view) || !canConvertMarkdownBlock(unit, conversion)) return;
    if (view.state.doc.sliceString(unit.from, unit.to) !== unit.text) {
      new Notice("The note changed while the menu was open. Try again.");
      return;
    }
    const converted = convertMarkdownBlock(unit.text, conversion);
    if (converted === null) return;
    if (unit.existingBlockId !== undefined && !converted.includes(`^${unit.existingBlockId}`)) {
      new Notice("Conversion was cancelled because it would lose the block ID.");
      return;
    }
    try {
      view.dispatch({ changes: { from: unit.from, to: unit.to, insert: converted } });
      this.clearBlockSelection(view);
      view.focus();
    } catch (error) {
      console.error("DragDrop could not convert a Markdown block.", error);
      new Notice("Could not convert the Markdown block.");
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
  ): CanvasDropTarget | null {
    return this.canvasAdapter.findDropTargetAt({
      ownerDocument: pointerDrag.element.ownerDocument,
      x: event.clientX,
      y: event.clientY,
    });
  }

  private findMarkdownDropTarget(event: DragEvent): MarkdownDropTarget | null {
    const eventTarget = isNodeLike(event.target) ? event.target : null;
    const ownerDocument = eventTarget?.ownerDocument ?? activeDocument;
    const path = event.composedPath();
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

    const view = candidates.find((candidate) => {
      if (path.includes(candidate.containerEl)) return true;
      return pointElement ? candidate.containerEl.contains(pointElement) : false;
    });
    if (!view || !(view.file instanceof TFile)) return null;

    const editorElement = view.containerEl.querySelector(".cm-editor");
    if (!editorElement) return null;
    const editorView = EditorView.findFromDOM(editorElement as HTMLElement);
    if (!editorView || editorView.dom.ownerDocument !== ownerDocument) return null;

    const position = this.markdownDropPosition(editorView, event);
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

  private markdownDropPosition(editorView: EditorView, event: DragEvent): number {
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
    component.registerDomEvent(document, "keydown", (event) => {
      if (event.key !== "Escape") return;
      this.clearBlockSelectionsInDocument(document);
      this.cancelSelectionPointer();
      if (this.session || this.pointerDrag || this.canvasPenDrag) {
        this.cleanupDrag();
      }
    }, true);
    this.documentComponents.set(document, component);
  }

  private unregisterDocument(document: Document): void {
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

  private handleCanvasPenPointerDown(event: PointerEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    if (!this.host.config.surfacePenSideButtonDrag || !isSurfacePenSideButton(event)) return;
    if (this.canvasPenDrag || this.pointerDrag) return;

    const target = this.elementFromEventTarget(event.target);
    if (!target) return;
    const interaction = this.findCanvasPenInteraction(target);
    if (!interaction || !this.beginCanvasPenDrag(event, interaction)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleCanvasPenPointerMove(event: PointerEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;

    if (!this.canvasPenDrag) {
      if (!this.host.config.surfacePenSideButtonDrag || !isSurfacePenSideButton(event)) return;
      if (this.pointerDrag) return;
      const target = this.elementFromEventTarget(event.target);
      if (!target) return;
      const interaction = this.findCanvasPenInteraction(target);
      if (!interaction || !this.beginCanvasPenDrag(event, interaction)) return;
    }

    const drag = this.canvasPenDrag;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)
    ) return;
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
    const drag = this.canvasPenDrag;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)
    ) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this.dispatchCanvasPointerEvent("pointerup", event, drag.dispatchTarget, 0, drag.button);
    this.canvasPenContextMenuSuppression = {
      ownerDocument: drag.dispatchTarget.ownerDocument,
      expiresAt: Date.now() + 1_000,
    };
    this.clearCanvasPenDrag();
  }

  private handleCanvasPenPointerCancel(event: PointerEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
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
    const drag = this.canvasPenDrag;
    if (!drag || event.button !== 2 || !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleCanvasPenMouseMove(event: MouseEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    const drag = this.canvasPenDrag;
    if (!drag || !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleCanvasPenMouseUp(event: MouseEvent): void {
    if (this.syntheticCanvasEvents.has(event)) return;
    const drag = this.canvasPenDrag;
    if (!drag || !this.isSameEventDocument(event, drag.dispatchTarget.ownerDocument)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleCanvasPenContextMenu(event: MouseEvent): void {
    const dragDocument = this.canvasPenDrag?.dispatchTarget.ownerDocument;
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

  private beginCanvasPenDrag(event: PointerEvent, interaction: CanvasPenInteraction): boolean {
    const captureTarget = this.findPointerCaptureElement(interaction.dispatchTarget);
    if (!captureTarget) return false;

    this.canvasPenDrag = {
      pointerId: event.pointerId,
      dispatchTarget: interaction.dispatchTarget,
      captureTarget,
      button: interaction.button,
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

    if (typeof ownerWindow.PointerEvent === "function") {
      const synthetic = new ownerWindow.PointerEvent(
        type,
        createCanvasPointerEventInit(source, ownerWindow, button, buttons),
      );
      this.syntheticCanvasEvents.add(synthetic);
      target.dispatchEvent(synthetic);
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
      button,
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
    target.dispatchEvent(syntheticMouse);
  }

  private isSameEventDocument(event: Event, ownerDocument: Document): boolean {
    const target = isNodeLike(event.target) ? event.target : null;
    if (target) return target.ownerDocument === ownerDocument;
    return event.currentTarget === ownerDocument;
  }

  private clearCanvasPenDrag(): void {
    const drag = this.canvasPenDrag;
    if (!drag) return;
    try {
      if (drag.captureTarget.hasPointerCapture(drag.pointerId)) {
        drag.captureTarget.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The Canvas document may already be closing.
    }
    this.canvasPenDrag = null;
  }

  private elementFromEventTarget(target: EventTarget | null): Element | null {
    if (!isNodeLike(target)) return null;
    return isElementNode(target) ? target : target.parentElement;
  }

  private findCanvasPenInteraction(element: Element): CanvasPenInteraction | null {
    let result: CanvasPenInteraction | null = null;
    this.host.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (result || !isCanvasView(leaf.view)) return;
      const view = leaf.view;
      if (
        view.containerEl.ownerDocument === element.ownerDocument &&
        view.containerEl.isConnected &&
        view.containerEl.contains(element) &&
        view.canvas.readonly !== true
      ) {
        if (this.isCanvasControl(element)) return;
        const nodeTarget = this.findCanvasNodeTarget(view, element);
        if (nodeTarget) {
          result = {
            dispatchTarget: nodeTarget,
            button: canvasPenButtonForInteraction("node"),
          };
          return;
        }
        const wrapper = this.findCanvasWrapper(view);
        if (wrapper?.contains(element)) {
          result = {
            dispatchTarget: wrapper,
            button: canvasPenButtonForInteraction("pan"),
          };
        }
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
    return element.closest(
      ".canvas-menu, .canvas-card-menu, .canvas-node-resizer, .canvas-node-connection-point, button, input, textarea, select",
    ) !== null;
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
      const action = resolveMarkdownDropAction(event, this.host.config.markdownBindings);
      this.markdownDropAction = action;
      this.markdownDropDocument = markdownTarget.ownerDocument;
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
    const action = resolveMarkdownDropAction(event, this.host.config.markdownBindings);
    this.markdownDropAction = action;
    this.markdownDropDocument = fileTarget.ownerDocument;
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
      const action = this.markdownDropDocument === markdownTarget.ownerDocument
        ? this.markdownDropAction ?? resolveMarkdownDropAction(event, this.host.config.markdownBindings)
        : resolveMarkdownDropAction(event, this.host.config.markdownBindings);
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
    const action = this.markdownDropDocument === fileTarget.ownerDocument
      ? this.markdownDropAction ?? resolveMarkdownDropAction(event, this.host.config.markdownBindings)
      : resolveMarkdownDropAction(event, this.host.config.markdownBindings);
    await this.commitMarkdownFileDrop(session, fileTarget, action);
  }

  private async commitMarkdownDrop(
    session: DragSession,
    target: MarkdownDropTarget,
    action: ReturnType<typeof resolveMarkdownDropAction>,
  ): Promise<void> {
    if (!this.isMarkdownTargetConnected(target)) return;
    if (!this.commitGate.tryClaim(session.id, "markdown")) return;

    try {
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
        if (requiresMoveConfirmation(session.units)) {
          const confirmed = await new MoveConfirmationModal(this.host.app, session.units.filter((unit) => unit.existingBlockId).length).openAndConfirm();
          if (!confirmed || !session.sourceView.state.doc.eq(session.sourceState.doc)) return;
        }
        this.moveMarkdownBlocks(session, target);
        return;
      }

      if (
        session.units.some((unit) => unit.blockIdInsert !== undefined) &&
        !this.isEditorWritable(session.sourceView)
      ) {
        new Notice("The source note is read-only and needs a block ID before it can be embedded.");
        return;
      }
      await this.embedMarkdownBlocks(session, target);
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
      const planned = action === "embed-source"
        ? this.planMarkdownReferences(session.sourceState, session.units)
        : session.units;
      const sourceLink = this.host.app.metadataCache.fileToLinktext(
        session.sourceFile,
        target.file.path,
        true,
      );
      const targetBlocks = planned.map((unit) =>
        action === "move"
          ? unit.text
          : directBlockEmbed(unit.text) ?? `![[${sourceLink}${sourceSubpath(unit)}]]`,
      );
      const targetAfter = insertBlocksAtBoundary(targetBefore, targetBefore.length, targetBlocks);
      const sourceAfter = action === "move"
        ? removeTextRanges(sourceBefore, session.units)
        : applyTextChanges(sourceBefore, this.blockIdChanges(planned));

      if (action === "embed-source" && planned.some((unit) => unit.blockIdInsert !== undefined) && !this.isEditorWritable(session.sourceView)) {
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
      const transaction = await runMarkdownTransaction(
        [sourceMutation, targetMutation],
        {
          apply: async (mutation) => {
            if (mutation.path === session.sourceFile.path) {
              if (!session.sourceView.state.doc.eq(session.sourceState.doc) || session.sourceView.state.doc.toString() !== mutation.before) {
                throw new Error("The source note changed during the Markdown drop.");
              }
              session.sourceView.dispatch({
                changes: { from: 0, to: session.sourceView.state.doc.length, insert: mutation.after },
              });
              return;
            }
            await this.host.app.vault.process(target.file, (current) => {
              if (current !== mutation.before) {
                throw new Error("The file target changed during the Markdown drop.");
              }
              return mutation.after;
            });
          },
          rollback: async (mutation) => {
            if (mutation.path === session.sourceFile.path) {
              if (session.sourceView.state.doc.toString() !== mutation.after) {
                throw new Error("The source note changed before rollback.");
              }
              session.sourceView.dispatch({
                changes: { from: 0, to: session.sourceView.state.doc.length, insert: mutation.before },
              });
              return;
            }
            await this.host.app.vault.process(target.file, (current) => {
              if (current !== mutation.after) {
                throw new Error("The file target changed before rollback.");
              }
              return mutation.before;
            });
          },
        },
      );
      if (!transaction.ok) {
        if (transaction.rollbackFailed) {
          new Notice("The Markdown drop failed and could not fully roll back. Reload the affected notes.");
        }
        throw transaction.error instanceof Error
          ? transaction.error
          : new Error("The Markdown drop transaction failed.");
      }
    } catch (error) {
      console.error("DragDrop could not complete a file-target Markdown drop.", error);
      new Notice("Could not complete the file-target Markdown drop. No content was moved.");
    } finally {
      this.cleanupDrag();
    }
  }

  private isMarkdownTargetConnected(target: MarkdownDropTarget): boolean {
    return (
      target.view.containerEl.isConnected &&
      target.view.containerEl.ownerDocument === target.ownerDocument &&
      target.editorView.dom.isConnected &&
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
  ): Promise<void> {
    const sourceFoldStarts = this.host.config.preserveFoldState
      ? captureFoldStarts(session.sourceView.state)
      : [];
    const targetFoldStarts = this.host.config.preserveFoldState && target.editorView !== session.sourceView
      ? captureFoldStarts(target.editorView.state)
      : [];
    const planned = this.planMarkdownReferences(session.sourceState, session.units);
    const sourceContent = session.sourceState.doc.toString();
    const idChanges = this.blockIdChanges(planned);
    const sourceWithIds = applyTextChanges(sourceContent, idChanges);
    const sameDocument =
      session.sourceView === target.editorView ||
      (target.file.path === session.sourceFile.path &&
        target.editorView.state.doc.eq(session.sourceState.doc));
    const targetContent = target.editorView.state.doc.toString();
    const sourceLink = this.host.app.metadataCache.fileToLinktext(
      session.sourceFile,
      target.file.path,
      true,
    );
    const embeds = planned.map((unit) =>
      directBlockEmbed(unit.text) ?? `![[${sourceLink}${sourceSubpath(unit)}]]`,
    );

    let sourceAfter = sourceWithIds;
    let targetAfter = insertBlocksAtBoundary(targetContent, target.position, embeds);
    if (sameDocument) {
      const mappedPosition = mapPositionAfterChanges(target.position, idChanges);
      targetAfter = insertBlocksAtBoundary(sourceWithIds, mappedPosition, embeds);
      sourceAfter = targetAfter;
    }

    if (sameDocument && session.sourceView !== target.editorView) {
      session.sourceView.dispatch({
        changes: { from: 0, to: session.sourceView.state.doc.length, insert: sourceAfter },
      });
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

    const applied = this.applyMarkdownDocuments(
      session.sourceView,
      target.editorView,
      sourceContent,
      targetContent,
      sourceAfter,
      targetAfter,
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

  private moveMarkdownBlocks(session: DragSession, target: MarkdownDropTarget): void {
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
    const sourceAfter = sameDocument
      ? this.planOrderedListMove(
          sourceContent,
          blocks,
          target.position,
          target.targetLineText,
          listIntent,
        )
      : this.host.config.renumberOrderedLists
        ? renumberOrderedListMarkers(removeTextRanges(sourceContent, blocks))
        : removeTextRanges(sourceContent, blocks);
    const targetAfter = sameDocument
      ? sourceAfter
      : this.host.config.renumberOrderedLists
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

    if (sameDocument && session.sourceView !== target.editorView) {
      session.sourceView.dispatch({
        changes: { from: 0, to: session.sourceView.state.doc.length, insert: sourceAfter },
      });
      restoreFoldStarts(
        session.sourceView,
        sourceFoldStarts.map((start) => mapPositionAfterMove(
          sourceContent,
          plannedBlocks,
          target.position,
          start,
        )),
      );
      return;
    }

    const applied = this.applyMarkdownDocuments(
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
      sourceFoldStarts.map((start) => sameDocument
        ? mapPositionAfterMove(sourceContent, plannedBlocks, target.position, start)
        : mapPositionAfterRemovals(start, sourceContent, blocks)),
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

  private planOrderedListMove(
    content: string,
    blocks: readonly { from: number; to: number; text: string }[],
    targetPosition: number,
    targetLineText: string,
    listIntent: ListDropIntent | null,
  ): string {
    const moved = planStructuredMarkdownMove(
      content,
      blocks,
      targetPosition,
      targetLineText,
      listIntent,
    );
    return this.host.config.renumberOrderedLists
      ? renumberOrderedListMarkers(moved)
      : moved;
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

  private applyMarkdownDocuments(
    sourceView: EditorView,
    targetView: EditorView,
    sourceBefore: string,
    targetBefore: string,
    sourceAfter: string,
    targetAfter: string,
  ): boolean {
    if (sourceView === targetView) {
      if (sourceAfter !== sourceBefore) {
        sourceView.dispatch({
          changes: { from: 0, to: sourceView.state.doc.length, insert: sourceAfter },
        });
      }
      return true;
    }

    const targetChanged = targetAfter !== targetBefore;
    const sourceChanged = sourceAfter !== sourceBefore;
    try {
      if (targetChanged) {
        targetView.dispatch({
          changes: { from: 0, to: targetView.state.doc.length, insert: targetAfter },
        });
      }
      if (sourceChanged) {
        sourceView.dispatch({
          changes: { from: 0, to: sourceView.state.doc.length, insert: sourceAfter },
        });
      }
      return true;
    } catch (error) {
      try {
        if (sourceChanged) {
          sourceView.dispatch({
            changes: { from: 0, to: sourceView.state.doc.length, insert: sourceBefore },
          });
        }
        if (targetChanged) {
          targetView.dispatch({
            changes: { from: 0, to: targetView.state.doc.length, insert: targetBefore },
          });
        }
      } catch (rollbackError) {
        console.error("DragDrop could not roll back a Markdown drop.", rollbackError);
      }
      console.error("DragDrop could not apply a Markdown drop.", error);
      new Notice("Could not complete the Markdown drop. No content was moved.");
      return false;
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

  private planMarkdownReferences(state: EditorState, units: SourceUnit[]): SourceUnit[] {
    const usedIds = new Set<string>();
    const matches = state.doc.toString().matchAll(/\^([A-Za-z0-9-]+)/g);
    for (const match of matches) usedIds.add(match[1]);
    return units.map((unit) =>
      directBlockEmbed(unit.text) ? unit : ensurePlannedReference(state, unit, usedIds),
    );
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
    this.clearMarkdownDropTarget();
    this.clearSourceHighlight();
    this.removeGhost();
    this.session = null;
    this.commitGate.reset();
    this.clearCanvasPenDrag();
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
