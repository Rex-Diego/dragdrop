import { Component, type App, type WorkspaceLeaf } from "obsidian";
import {
  placeSelectionMenu,
  selectionMenuBehavior,
  transformSelectionMenuRect,
  type SelectionMenuFrameTransform,
  type SelectionMenuRect,
} from "./selection-menu-model";
import type { DragDropSettings } from "./settings-model";

const MENU_SELECTOR = ".menu";
const MARKDOWN_VIEW_SELECTOR = ".markdown-source-view, .markdown-preview-view";
const PDF_VIEW_SELECTOR = ".pdf-container, .pdf-viewer-container";
const PDF_TEXT_LAYER_SELECTOR = ".pdf-container .textLayer, .pdf-viewer-container .textLayer";
const CANVAS_NODE_CONTENT_SELECTOR = ".canvas-node-content";
const CANVAS_IFRAME_SELECTOR = ".canvas-node-content iframe.embed-iframe";
const CANVAS_IFRAME_ELEMENT_SELECTOR = "iframe.embed-iframe";
const CANVAS_EDITABLE_SELECTOR = `${CANVAS_NODE_CONTENT_SELECTOR} ${MARKDOWN_VIEW_SELECTOR}, ${CANVAS_NODE_CONTENT_SELECTOR} [contenteditable="true"]`;
const SELECTION_MENU_CLASS = "dragdrop-selection-menu";
const PENDING_MENU_TIMEOUT_MS = 250;
type OwnerWindow = Window & { MutationObserver: typeof MutationObserver };

type SelectionMenuTargetKind = "markdown" | "pdf" | "canvas";

interface SelectionMenuTarget {
  container: Element;
  kind: SelectionMenuTargetKind;
}

interface SelectionMenuFeatureHost {
  app: App;
  config: DragDropSettings;
}

interface PendingSelectionMenu {
  knownMenus: Set<HTMLElement>;
  selectionRect: SelectionMenuRect;
  dismissSeconds: number;
  retainAfterActivation: boolean;
}

interface ActiveSelectionMenu {
  menu: HTMLElement;
  component: Component;
  observer: MutationObserver;
  dismissTimer: number | null;
  positionFrame: number | null;
  dismissSeconds: number;
  isHovered: boolean;
  isFocused: boolean;
}

interface EmbeddedFrameState {
  childDocument: Document | null;
  component: Component;
}

interface MenuHostResolution {
  ownerDocument: Document;
  ownerWindow: OwnerWindow;
  transform: SelectionMenuFrameTransform;
}

interface DocumentState {
  ownerDocument: Document;
  ownerWindow: OwnerWindow;
  component: Component;
  pending: PendingSelectionMenu | null;
  pendingObserver: MutationObserver | null;
  pendingTimer: number | null;
  active: ActiveSelectionMenu | null;
  embeddedObserver: MutationObserver | null;
  embeddedFrames: Map<HTMLIFrameElement, EmbeddedFrameState>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentLike(value: unknown): value is Document {
  return (
    isRecord(value)
    && value.nodeType === 9
    && "defaultView" in value
    && "body" in value
  );
}

function documentFromWindowEvent(values: unknown[]): Document | null {
  for (const value of values) {
    if (isDocumentLike(value)) return value;
    if (!isRecord(value)) continue;
    if (isDocumentLike(value.doc)) return value.doc;
    if (isDocumentLike(value.document)) return value.document;
  }
  return null;
}

function isNodeLike(value: unknown): value is Node {
  return isRecord(value) && typeof value.nodeType === "number";
}

function elementFromEventTarget(target: EventTarget | null): Element | null {
  return isNodeLike(target) && target.nodeType === 1 ? (target as Element) : null;
}

function elementForNode(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

function frameElementForDocument(ownerDocument: Document): Element | null {
  try {
    const frameElement = ownerDocument.defaultView?.frameElement;
    return isNodeLike(frameElement) && frameElement.nodeType === 1
      ? frameElement
      : null;
  } catch {
    // Cross-origin frames can reject access to frameElement.
    return null;
  }
}

function menuHostForDocument(ownerDocument: Document): MenuHostResolution | null {
  const initialWindow = ownerDocument.defaultView as OwnerWindow | null;
  if (!initialWindow) return null;

  let ownerWindow = initialWindow;
  let frameElement = frameElementForDocument(ownerDocument);
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;
  const visitedWindows = new Set<OwnerWindow>();

  while (frameElement && !visitedWindows.has(ownerWindow)) {
    visitedWindows.add(ownerWindow);
    let frameRect: DOMRect;
    try {
      frameRect = frameElement.getBoundingClientRect();
    } catch {
      return null;
    }
    const clientWidth = frameElement.clientWidth;
    const frameScale = clientWidth > 0 && Number.isFinite(frameRect.width / clientWidth)
      ? frameRect.width / clientWidth
      : 1;
    scale *= frameScale;
    offsetX = offsetX * frameScale + frameRect.left;
    offsetY = offsetY * frameScale + frameRect.top;

    const parentWindow = frameElement.ownerDocument.defaultView as OwnerWindow | null;
    if (!parentWindow) return null;
    ownerWindow = parentWindow;
    frameElement = frameElementForDocument(parentWindow.document);
  }

  return {
    ownerDocument: ownerWindow.document,
    ownerWindow,
    transform: { offsetX, offsetY, scale },
  };
}

function isCanvasFrameElement(frameElement: Element | null): boolean {
  return frameElement?.matches(CANVAS_IFRAME_ELEMENT_SELECTOR) === true
    && frameElement.closest(CANVAS_NODE_CONTENT_SELECTOR) !== null;
}

function isCanvasFrameDocument(ownerDocument: Document): boolean {
  return isCanvasFrameElement(frameElementForDocument(ownerDocument));
}

function canvasTargetForElement(
  ownerDocument: Document,
  target: Element,
): SelectionMenuTarget | null {
  if (isCanvasFrameDocument(ownerDocument)) {
    // Context-menu events from an embedded editor can target its body rather
    // than the CodeMirror content element. Fall back to the document body so
    // the active selection is still validated below.
    const markdownView = target.closest(MARKDOWN_VIEW_SELECTOR);
    if (markdownView) return { container: markdownView, kind: "canvas" };

    const editable = target.closest("[contenteditable=\"true\"]");
    if (editable) return { container: editable, kind: "canvas" };
    return ownerDocument.body
      ? { container: ownerDocument.body, kind: "canvas" }
      : null;
  }

  const canvasContent = target.closest(CANVAS_NODE_CONTENT_SELECTOR);
  if (!canvasContent) return null;

  const editable =
    target.closest(CANVAS_EDITABLE_SELECTOR)
    ?? canvasContent.querySelector(`${MARKDOWN_VIEW_SELECTOR}, [contenteditable="true"]`);
  if (!editable || !canvasContent.contains(editable)) return null;
  const markdownView = editable.closest(MARKDOWN_VIEW_SELECTOR);
  return {
    container: markdownView ?? canvasContent,
    kind: "canvas",
  };
}

function selectionMenuTargetForElement(
  ownerDocument: Document,
  target: Element,
): SelectionMenuTarget | null {
  const pdfTextLayer = target.closest(PDF_TEXT_LAYER_SELECTOR);
  if (pdfTextLayer) {
    return {
      container: pdfTextLayer.closest(PDF_VIEW_SELECTOR) ?? pdfTextLayer,
      kind: "pdf",
    };
  }

  const canvasTarget = canvasTargetForElement(ownerDocument, target);
  if (canvasTarget) return canvasTarget;

  const markdownView = target.closest(MARKDOWN_VIEW_SELECTOR);
  if (markdownView) return { container: markdownView, kind: "markdown" };
  return null;
}

function selectionRectForTarget(
  ownerDocument: Document,
  target: Element,
): SelectionMenuRect | null {
  const selectionTarget = selectionMenuTargetForElement(ownerDocument, target);
  if (!selectionTarget) return null;

  const selection = ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  if (selection.toString().trim().length === 0) return null;

  const anchorElement = elementForNode(selection.anchorNode);
  if (!anchorElement || !selectionTarget.container.contains(anchorElement)) return null;
  if (selectionTarget.kind === "pdf") {
    const focusElement = elementForNode(selection.focusNode);
    if (
      !focusElement
      || !selectionTarget.container.contains(focusElement)
      || !anchorElement.closest(PDF_TEXT_LAYER_SELECTOR)
      || !focusElement.closest(PDF_TEXT_LAYER_SELECTOR)
    ) return null;
  }
  if (selectionTarget.kind === "canvas") {
    const focusElement = elementForNode(selection.focusNode);
    if (!focusElement || !selectionTarget.container.contains(focusElement)) return null;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (
    !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.right)
    || !Number.isFinite(rect.bottom)
    || (rect.width <= 0 && rect.height <= 0)
  ) {
    return null;
  }

  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}

export class SelectionMenuFeature extends Component {
  private readonly documentStates = new Map<Document, DocumentState>();
  private readonly directDocuments = new Set<Document>();
  private readonly embeddedParents = new Map<Document, Set<Document>>();
  private readonly unregisteringDocuments = new Set<Document>();

  constructor(private readonly host: SelectionMenuFeatureHost) {
    super();
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
        const ownerDocument = documentFromWindowEvent(values);
        if (ownerDocument) this.registerDocument(ownerDocument);
      }),
    );
    this.registerEvent(
      this.host.app.workspace.on("window-close", (...values: unknown[]) => {
        const ownerDocument = documentFromWindowEvent(values);
        if (ownerDocument) this.unregisterDocument(ownerDocument);
      }),
    );
  }

  onunload(): void {
    for (const ownerDocument of Array.from(this.documentStates.keys())) {
      this.unregisterDocument(ownerDocument);
    }
  }

  refresh(): void {
    const behavior = selectionMenuBehavior(this.host.config.selectionMenuAutoDismissSeconds);
    for (const state of this.documentStates.values()) {
      this.clearPendingMenu(state);
      if (behavior !== "customize") {
        this.clearActiveMenu(state);
        continue;
      }

      const active = state.active;
      if (active) {
        active.dismissSeconds = this.host.config.selectionMenuAutoDismissSeconds;
        this.cancelDismissTimer(state, active);
        this.scheduleDismissTimer(state, active);
      }
    }
  }

  private registerDocument(ownerDocument: Document): void {
    this.directDocuments.add(ownerDocument);
    this.registerDocumentInternal(ownerDocument);
  }

  private registerEmbeddedDocument(ownerDocument: Document): void {
    this.registerDocumentInternal(ownerDocument);
  }

  private registerDocumentInternal(ownerDocument: Document): void {
    if (this.documentStates.has(ownerDocument)) return;
    const ownerWindow = ownerDocument.defaultView as OwnerWindow | null;
    if (!ownerWindow) return;

    const component = new Component();
    const state: DocumentState = {
      ownerDocument,
      ownerWindow,
      component,
      pending: null,
      pendingObserver: null,
      pendingTimer: null,
      active: null,
      embeddedObserver: null,
      embeddedFrames: new Map(),
    };
    this.documentStates.set(ownerDocument, state);
    this.addChild(component);
    component.registerDomEvent(ownerDocument, "contextmenu", (event) => {
      this.handleContextMenu(state, event);
    }, true);
    component.registerDomEvent(ownerDocument, "pointerup", (event) => {
      this.handlePointerUp(state, event);
    }, true);
    this.observeEmbeddedCanvasFrames(state);
  }

  private unregisterDocument(ownerDocument: Document): void {
    this.directDocuments.delete(ownerDocument);
    if (this.unregisteringDocuments.has(ownerDocument)) return;
    const state = this.documentStates.get(ownerDocument);
    if (!state) return;
    this.unregisteringDocuments.add(ownerDocument);
    try {
      for (const parentDocument of Array.from(this.embeddedParents.get(ownerDocument) ?? [])) {
        const parentState = this.documentStates.get(parentDocument);
        if (!parentState) continue;
        for (const [frame, frameState] of Array.from(parentState.embeddedFrames.entries())) {
          if (frameState.childDocument === ownerDocument) {
            this.detachEmbeddedDocument(parentState, frame, ownerDocument);
          }
        }
      }

      for (const [frame, frameState] of Array.from(state.embeddedFrames.entries())) {
        this.detachEmbeddedFrame(state, frame, frameState);
      }
      this.embeddedParents.delete(ownerDocument);
      this.clearPendingMenu(state);
      this.clearActiveMenu(state);
      state.embeddedObserver?.disconnect();
      state.embeddedObserver = null;
      state.component.unload();
      this.removeChild(state.component);
      this.documentStates.delete(ownerDocument);
    } finally {
      this.unregisteringDocuments.delete(ownerDocument);
    }
  }

  private menuContextForSelection(
    sourceState: DocumentState,
    targetKind: SelectionMenuTargetKind,
    selectionRect: SelectionMenuRect,
  ): { state: DocumentState; selectionRect: SelectionMenuRect } {
    if (targetKind !== "canvas") {
      return { state: sourceState, selectionRect };
    }

    const frameElement = frameElementForDocument(sourceState.ownerDocument);
    if (!isCanvasFrameElement(frameElement)) {
      return { state: sourceState, selectionRect };
    }

    const host = menuHostForDocument(sourceState.ownerDocument);
    if (!host) return { state: sourceState, selectionRect };
    let hostState = this.documentStates.get(host.ownerDocument);
    if (!hostState) {
      // Canvas frames are normally discovered from a workspace document. Keep
      // a guarded fallback for a frame that appears before that scan runs.
      this.registerDocument(host.ownerDocument);
      hostState = this.documentStates.get(host.ownerDocument);
    }
    if (!hostState) return { state: sourceState, selectionRect };

    return {
      state: hostState,
      selectionRect: transformSelectionMenuRect(selectionRect, host.transform),
    };
  }

  private handleContextMenu(state: DocumentState, event: MouseEvent): void {
    if (event.defaultPrevented) return;
    const target = elementFromEventTarget(event.target);
    if (!target) return;
    const selectionTarget = selectionMenuTargetForElement(state.ownerDocument, target);
    if (!selectionTarget) return;
    const selectionRect = selectionRectForTarget(state.ownerDocument, target);
    if (!selectionRect) return;

    const context = this.menuContextForSelection(state, selectionTarget.kind, selectionRect);
    this.armSelectionMenu(
      context.state,
      context.selectionRect,
      event,
      selectionTarget.kind === "pdf",
    );
  }

  private handlePointerUp(state: DocumentState, event: PointerEvent): void {
    if (event.defaultPrevented) return;
    const target = elementFromEventTarget(event.target);
    if (!target) return;
    const selectionTarget = selectionMenuTargetForElement(state.ownerDocument, target);
    if (!selectionTarget || selectionTarget.kind !== "pdf") return;
    const selectionRect = selectionRectForTarget(state.ownerDocument, target);
    if (!selectionRect) return;

    // PDF++ creates its custom menu asynchronously from pointerup, so arm the
    // observer before its bubbling listener schedules that menu.
    const context = this.menuContextForSelection(state, selectionTarget.kind, selectionRect);
    this.armSelectionMenu(context.state, context.selectionRect, event, true);
  }

  private observeEmbeddedCanvasFrames(state: DocumentState): void {
    const observer = new state.ownerWindow.MutationObserver(() => {
      this.syncEmbeddedCanvasFrames(state);
    });
    state.embeddedObserver = observer;
    // Observe the Document rather than its current body. Canvas can replace
    // an iframe document body while keeping the same Document object alive.
    observer.observe(state.ownerDocument, { childList: true, subtree: true });
    state.component.register(() => observer.disconnect());
    this.syncEmbeddedCanvasFrames(state);
  }

  private syncEmbeddedCanvasFrames(state: DocumentState): void {
    if (this.documentStates.get(state.ownerDocument) !== state) return;
    const frames = new Set(
      Array.from(state.ownerDocument.querySelectorAll<HTMLIFrameElement>(CANVAS_IFRAME_SELECTOR)),
    );

    for (const [frame, frameState] of Array.from(state.embeddedFrames.entries())) {
      if (!frames.has(frame)) this.detachEmbeddedFrame(state, frame, frameState);
    }

    for (const frame of frames) {
      let frameState = state.embeddedFrames.get(frame);
      if (!frameState) {
        const frameComponent = new Component();
        state.component.addChild(frameComponent);
        frameComponent.registerDomEvent(frame, "load", () => {
          this.syncEmbeddedCanvasFrames(state);
        });
        frameState = { childDocument: null, component: frameComponent };
        state.embeddedFrames.set(frame, frameState);
      }

      const childDocument = this.contentDocumentForFrame(frame);
      if (childDocument === frameState.childDocument) continue;
      if (frameState.childDocument) {
        this.detachEmbeddedDocument(state, frame, frameState.childDocument);
      }
      if (childDocument) {
        frameState.childDocument = childDocument;
        this.addEmbeddedParent(childDocument, state.ownerDocument);
        this.registerEmbeddedDocument(childDocument);
      }
    }
  }

  private contentDocumentForFrame(frame: HTMLIFrameElement): Document | null {
    try {
      const childDocument = frame.contentDocument;
      return childDocument && isDocumentLike(childDocument) && childDocument.defaultView
        ? childDocument
        : null;
    } catch {
      // A frame can be unavailable while it is navigating or cross-origin.
      return null;
    }
  }

  private addEmbeddedParent(childDocument: Document, parentDocument: Document): void {
    let parents = this.embeddedParents.get(childDocument);
    if (!parents) {
      parents = new Set<Document>();
      this.embeddedParents.set(childDocument, parents);
    }
    parents.add(parentDocument);
  }

  private removeEmbeddedParent(childDocument: Document, parentDocument: Document): void {
    const parents = this.embeddedParents.get(childDocument);
    if (!parents) return;
    parents.delete(parentDocument);
    if (parents.size > 0) return;
    this.embeddedParents.delete(childDocument);
    if (!this.directDocuments.has(childDocument)) this.unregisterDocument(childDocument);
  }

  private detachEmbeddedDocument(
    state: DocumentState,
    frame: HTMLIFrameElement,
    childDocument: Document,
  ): void {
    const frameState = state.embeddedFrames.get(frame);
    if (!frameState || frameState.childDocument !== childDocument) return;
    frameState.childDocument = null;
    this.removeEmbeddedParent(childDocument, state.ownerDocument);
  }

  private detachEmbeddedFrame(
    state: DocumentState,
    frame: HTMLIFrameElement,
    frameState: EmbeddedFrameState,
  ): void {
    if (frameState.childDocument) {
      this.detachEmbeddedDocument(state, frame, frameState.childDocument);
    }
    state.component.removeChild(frameState.component);
    state.embeddedFrames.delete(frame);
  }

  private armSelectionMenu(
    state: DocumentState,
    selectionRect: SelectionMenuRect,
    event: MouseEvent,
    retainAfterActivation: boolean,
  ): void {
    const behavior = selectionMenuBehavior(this.host.config.selectionMenuAutoDismissSeconds);
    if (behavior === "native") return;
    if (behavior === "hide") {
      event.preventDefault();
      // Cancel Obsidian's native menu without starving other integrations
      // that observe the same context-menu gesture (including system bridges).
      this.clearPendingMenu(state);
      this.clearActiveMenu(state, undefined, true);
      return;
    }

    this.clearActiveMenu(state, undefined, true);
    const knownMenus = new Set(
      Array.from(state.ownerDocument.querySelectorAll<HTMLElement>(MENU_SELECTOR)),
    );
    if (state.pending) {
      for (const menu of knownMenus) state.pending.knownMenus.add(menu);
      state.pending.selectionRect = selectionRect;
      state.pending.dismissSeconds = this.host.config.selectionMenuAutoDismissSeconds;
      state.pending.retainAfterActivation ||= retainAfterActivation;
    } else {
      state.pending = {
        knownMenus,
        selectionRect,
        dismissSeconds: this.host.config.selectionMenuAutoDismissSeconds,
        retainAfterActivation,
      };
    }

    if (!state.pendingObserver) {
      const observer = new state.ownerWindow.MutationObserver(() => {
        this.activatePendingMenu(state);
      });
      state.pendingObserver = observer;
      const observerRoot = state.ownerDocument.documentElement ?? state.ownerDocument.body;
      if (!observerRoot) return;
      observer.observe(observerRoot, { childList: true, subtree: true });
    }
    if (state.pendingTimer !== null) state.ownerWindow.clearTimeout(state.pendingTimer);
    state.pendingTimer = state.ownerWindow.setTimeout(() => {
      this.clearPendingMenu(state);
    }, PENDING_MENU_TIMEOUT_MS);
  }

  private activatePendingMenu(state: DocumentState): void {
    const pending = state.pending;
    if (!pending) return;
    const menu = Array.from(state.ownerDocument.querySelectorAll<HTMLElement>(MENU_SELECTOR))
      .reverse()
      .find((candidate) => !pending.knownMenus.has(candidate));
    if (!menu) return;

    pending.knownMenus.add(menu);
    if (!pending.retainAfterActivation) this.clearPendingMenu(state);
    this.clearActiveMenu(state, undefined, true);
    menu.classList.add(SELECTION_MENU_CLASS);
    const component = new Component();
    let active: ActiveSelectionMenu | null = null;
    const observer = new state.ownerWindow.MutationObserver(() => {
      if (active !== null && !menu.isConnected) this.clearActiveMenu(state, active);
    });
    const activeMenu: ActiveSelectionMenu = {
      menu,
      component,
      observer,
      dismissTimer: null,
      positionFrame: null,
      dismissSeconds: pending.dismissSeconds,
      isHovered: false,
      isFocused: false,
    };
    active = activeMenu;
    state.active = activeMenu;
    state.component.addChild(component);
    const observerRoot = state.ownerDocument.documentElement ?? state.ownerDocument.body;
    if (!observerRoot) {
      this.clearActiveMenu(state, activeMenu);
      return;
    }
    activeMenu.observer.observe(observerRoot, {
      childList: true,
      subtree: true,
    });
    component.registerDomEvent(menu, "pointerenter", () => {
      activeMenu.isHovered = true;
      this.cancelDismissTimer(state, activeMenu);
    });
    component.registerDomEvent(menu, "pointerleave", () => {
      activeMenu.isHovered = false;
      this.scheduleDismissTimer(state, activeMenu);
    });
    component.registerDomEvent(menu, "focusin", () => {
      activeMenu.isFocused = true;
      this.cancelDismissTimer(state, activeMenu);
    });
    component.registerDomEvent(menu, "focusout", (event) => {
      if (isNodeLike(event.relatedTarget) && menu.contains(event.relatedTarget)) return;
      activeMenu.isFocused = false;
      this.scheduleDismissTimer(state, activeMenu);
    });
    this.positionMenu(state, activeMenu, pending.selectionRect);
    this.scheduleDismissTimer(state, activeMenu);
  }

  private positionMenu(
    state: DocumentState,
    active: ActiveSelectionMenu,
    selectionRect: SelectionMenuRect,
  ): void {
    active.positionFrame = state.ownerWindow.requestAnimationFrame(() => {
      active.positionFrame = null;
      if (state.active !== active || !active.menu.isConnected) return;
      const menuRect = active.menu.getBoundingClientRect();
      if (menuRect.width <= 0 || menuRect.height <= 0) return;
      const placement = placeSelectionMenu(
        selectionRect,
        { width: menuRect.width, height: menuRect.height },
        { width: state.ownerWindow.innerWidth, height: state.ownerWindow.innerHeight },
      );
      active.menu.style.setProperty("left", `${placement.left}px`);
      active.menu.style.setProperty("top", `${placement.top}px`);
    });
  }

  private scheduleDismissTimer(state: DocumentState, active: ActiveSelectionMenu): void {
    if (
      state.active !== active
      || active.dismissSeconds <= 0
      || active.isHovered
      || active.isFocused
    ) return;
    this.cancelDismissTimer(state, active);
    active.dismissTimer = state.ownerWindow.setTimeout(() => {
      if (state.active !== active) return;
      this.clearActiveMenu(state, active, true);
    }, active.dismissSeconds * 1_000);
  }

  private cancelDismissTimer(state: DocumentState, active: ActiveSelectionMenu): void {
    if (active.dismissTimer === null) return;
    state.ownerWindow.clearTimeout(active.dismissTimer);
    active.dismissTimer = null;
  }

  private clearPendingMenu(state: DocumentState): void {
    if (state.pendingTimer !== null) {
      state.ownerWindow.clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
    }
    state.pendingObserver?.disconnect();
    state.pendingObserver = null;
    state.pending = null;
  }

  private clearActiveMenu(
    state: DocumentState,
    expected?: ActiveSelectionMenu,
    removeMenu = false,
  ): void {
    const active = state.active;
    if (!active || (expected !== undefined && active !== expected)) return;
    state.active = null;
    this.cancelDismissTimer(state, active);
    if (active.positionFrame !== null) {
      state.ownerWindow.cancelAnimationFrame(active.positionFrame);
      active.positionFrame = null;
    }
    active.observer.disconnect();
    active.menu.classList.remove(SELECTION_MENU_CLASS);
    active.component.unload();
    state.component.removeChild(active.component);
    if (removeMenu && active.menu.isConnected) active.menu.remove();
  }
}
