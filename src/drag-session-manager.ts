import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  Component,
  MarkdownRenderer,
  MarkdownView,
  Notice,
  TFile,
  type App,
  type WorkspaceLeaf,
} from "obsidian";
import { resolveCanvasDropAction } from "./action-resolution";
import { applyBlockIdInsertions, ensurePlannedReference, sourceSubpath } from "./block-reference";
import { CanvasAdapter, type CanvasDropTarget, type CanvasItemSpec } from "./canvas-adapter";
import { buildHandleRanges, collectSourceUnits, previewMarkdownForUnits } from "./content-segmentation";
import type { HandleRange, SourceRange } from "./content-segmentation";
import type { DragStarter } from "./drag-handle-extension";
import { FileService } from "./file-service";
import type { DragSession, SourceUnit } from "./model";
import { hasCrossedPointerDragThreshold, matchesPointerDrag } from "./pointer-drag";
import type { DragDropSettings } from "./settings-model";

const SESSION_MIME = "application/x-dragdrop-session";

interface DragDropHost {
  app: App;
  config: DragDropSettings;
}

interface PointerDrag {
  pointerId: number;
  view: EditorView;
  handle: HandleRange;
  element: HTMLElement;
  startX: number;
  startY: number;
  active: boolean;
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
  private readonly documentComponents = new Map<Document, Component>();
  private session: DragSession | null = null;
  private pointerDrag: PointerDrag | null = null;
  private ghostElement: HTMLElement | null = null;
  private ghostComponent: Component | null = null;
  private pendingGhostSessionId: string | null = null;

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
    this.documentComponents.clear();
  }

  beginDrag(event: DragEvent, view: EditorView, handle: HandleRange): void {
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
    if (
      !event.isPrimary ||
      (event.pointerType !== "touch" && event.pointerType !== "pen")
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
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      this.pointerDrag = null;
    }
  }

  movePointerDrag(event: PointerEvent): void {
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || !matchesPointerDrag(pointerDrag.pointerId, event.pointerId)) return;
    event.preventDefault();

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
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || !matchesPointerDrag(pointerDrag.pointerId, event.pointerId)) return;
    event.preventDefault();

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
    await this.commitDrop(session, target, this.resolvePointerAction(event));
  }

  cancelPointerDrag(pointerId: number): void {
    if (!this.pointerDrag || !matchesPointerDrag(this.pointerDrag.pointerId, pointerId)) return;
    this.cleanupDrag();
  }

  private startSession(view: EditorView, handle: HandleRange): DragSession | null {
    const sourceFile = this.findMarkdownFile(view);
    if (!sourceFile) return null;

    const ranges = this.sourceRanges(view.state, handle);
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
    this.session = session;
    return session;
  }

  private selectHandle(view: EditorView, handle: HandleRange): void {
    view.dispatch({
      selection: { anchor: handle.from, head: handle.to },
      scrollIntoView: true,
    });
    view.focus();
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

  private resolvePointerAction(event: PointerEvent): ReturnType<typeof resolveCanvasDropAction> {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
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
    component.registerDomEvent(document, "keydown", (event) => {
      if (event.key === "Escape" && (this.session || this.pointerDrag)) this.cleanupDrag();
    }, true);
    this.documentComponents.set(document, component);
  }

  private unregisterDocument(document: Document): void {
    const component = this.documentComponents.get(document);
    if (!component) return;
    component.unload();
    this.removeChild(component);
    this.documentComponents.delete(document);
  }

  private handleDragOver(event: DragEvent): void {
    if (!this.session) return;
    const document = (event.target as Node | null)?.ownerDocument ?? activeDocument;
    if (this.pendingGhostSessionId !== this.session.id) {
      this.ensureGhost(document);
      this.moveGhost(event);
    }
    if (!this.canvasAdapter.findDropTarget(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  private async handleDrop(event: DragEvent): Promise<void> {
    const session = this.session;
    if (!session) return;
    const transferId = event.dataTransfer?.getData(SESSION_MIME);
    if (transferId && transferId !== session.id) return;

    const target = this.canvasAdapter.findDropTarget(event);
    if (!target) {
      this.cleanupDrag();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await this.commitDrop(
      session,
      target,
      resolveCanvasDropAction(event, this.host.config.canvasBindings),
    );
  }

  private async commitDrop(
    session: DragSession,
    target: CanvasDropTarget,
    action: ReturnType<typeof resolveCanvasDropAction>,
  ): Promise<void> {
    try {
      if (action === "none" || !this.canvasAdapter.isTargetConnected(target)) return;
      if (!session.sourceView.state.doc.eq(session.sourceState.doc)) {
        new Notice("The source note changed during the drag. Try again.");
        return;
      }
      const planned = this.planReferences(session.sourceState, session.units);
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
    units: SourceUnit[],
  ): Promise<void> {
    applyBlockIdInsertions(
      session.sourceState,
      (transaction) => session.sourceView.dispatch(transaction),
      units,
    );

    const sourceLink = this.host.app.metadataCache.fileToLinktext(
      session.sourceFile,
      target.view.file?.path ?? "",
      true,
    );
    const items: CanvasItemSpec[] = units.map((unit) => {
      if (
        unit.kind === "list-item" &&
        unit.hasListChildren &&
        this.host.config.listParentDisplay === "self-only"
      ) {
        return {
          type: "text",
          text: textNodeLink(sourceLink, sourceSubpath(unit), unit.selfOnlyText ?? unit.text),
        };
      }
      return { type: "file", file: session.sourceFile, subpath: sourceSubpath(unit) };
    });
    await this.createCanvasItems(target, items);
  }

  private async createNoteCards(
    session: DragSession,
    target: CanvasDropTarget,
    units: SourceUnit[],
  ): Promise<void> {
    const fileService = new FileService(this.host.app, this.host.config);
    const tasks = await fileService.resolveNoteTasks(units, session.sourceFile, target.view);
    if (tasks.length === 0 || !this.canvasAdapter.isTargetConnected(target)) return;

    const acceptedUnits = tasks.map((task) => task.unit);
    applyBlockIdInsertions(
      session.sourceState,
      (transaction) => session.sourceView.dispatch(transaction),
      acceptedUnits,
    );
    const created = await fileService.createNotes(tasks, session.sourceFile);
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

  private planReferences(state: EditorState, units: SourceUnit[]): SourceUnit[] {
    const usedIds = new Set<string>();
    const matches = state.doc.toString().matchAll(/\^([A-Za-z0-9-]+)/g);
    for (const match of matches) usedIds.add(match[1]);
    return units.map((unit) => ensurePlannedReference(state, unit, usedIds));
  }

  private sourceRanges(state: EditorState, handle: HandleRange): SourceRange[] {
    const handles = buildHandleRanges(state);
    if (state.selection.ranges.length === 1 && state.selection.main.empty) return [handle];

    return state.selection.ranges.map((range) => {
      if (!range.empty) return { from: range.from, to: range.to };
      const found = handles.find((candidate) => candidate.from <= range.from && candidate.to >= range.from);
      return found ?? handle;
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
    this.removeGhost();
    this.session = null;
    if (this.pointerDrag) this.releasePointerCapture(this.pointerDrag);
    this.pointerDrag = null;
  }
}
