import { Component, type App, type WorkspaceLeaf } from "obsidian";
import {
  placeSelectionMenu,
  selectionMenuBehavior,
  type SelectionMenuRect,
} from "./selection-menu-model";
import type { DragDropSettings } from "./settings-model";

const MENU_SELECTOR = ".menu";
const MARKDOWN_VIEW_SELECTOR = ".markdown-source-view, .markdown-preview-view";
const PDF_VIEW_SELECTOR = ".pdf-container, .pdf-viewer-container";
const PDF_TEXT_LAYER_SELECTOR = ".pdf-container .textLayer, .pdf-viewer-container .textLayer";
const SELECTION_MENU_CLASS = "dragdrop-selection-menu";
const PENDING_MENU_TIMEOUT_MS = 250;
type OwnerWindow = Window & { MutationObserver: typeof MutationObserver };

interface SelectionMenuTarget {
  container: Element;
  isPdf: boolean;
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
}

interface DocumentState {
  ownerDocument: Document;
  ownerWindow: OwnerWindow;
  component: Component;
  pending: PendingSelectionMenu | null;
  pendingObserver: MutationObserver | null;
  pendingTimer: number | null;
  active: ActiveSelectionMenu | null;
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

function selectionMenuTargetForElement(target: Element): SelectionMenuTarget | null {
  const pdfTextLayer = target.closest(PDF_TEXT_LAYER_SELECTOR);
  if (pdfTextLayer) {
    return {
      container: pdfTextLayer.closest(PDF_VIEW_SELECTOR) ?? pdfTextLayer,
      isPdf: true,
    };
  }

  const markdownView = target.closest(MARKDOWN_VIEW_SELECTOR);
  if (markdownView) return { container: markdownView, isPdf: false };
  return null;
}

function selectionRectForTarget(
  ownerDocument: Document,
  target: Element,
): SelectionMenuRect | null {
  const selectionTarget = selectionMenuTargetForElement(target);
  if (!selectionTarget) return null;

  const selection = ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  if (selection.toString().trim().length === 0) return null;

  const anchorElement = elementForNode(selection.anchorNode);
  if (!anchorElement || !selectionTarget.container.contains(anchorElement)) return null;
  if (selectionTarget.isPdf) {
    const focusElement = elementForNode(selection.focusNode);
    if (
      !focusElement
      || !selectionTarget.container.contains(focusElement)
      || !anchorElement.closest(PDF_TEXT_LAYER_SELECTOR)
      || !focusElement.closest(PDF_TEXT_LAYER_SELECTOR)
    ) return null;
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
    for (const state of this.documentStates.values()) {
      this.clearPendingMenu(state);
      if (selectionMenuBehavior(this.host.config.selectionMenuAutoDismissSeconds) !== "customize") {
        this.clearActiveMenu(state);
      }
    }
  }

  private registerDocument(ownerDocument: Document): void {
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
    };
    this.documentStates.set(ownerDocument, state);
    this.addChild(component);
    component.registerDomEvent(ownerDocument, "contextmenu", (event) => {
      this.handleContextMenu(state, event);
    }, true);
    component.registerDomEvent(ownerDocument, "pointerup", (event) => {
      this.handlePointerUp(state, event);
    }, true);
  }

  private unregisterDocument(ownerDocument: Document): void {
    const state = this.documentStates.get(ownerDocument);
    if (!state) return;
    this.clearPendingMenu(state);
    this.clearActiveMenu(state);
    state.component.unload();
    this.removeChild(state.component);
    this.documentStates.delete(ownerDocument);
  }

  private handleContextMenu(state: DocumentState, event: MouseEvent): void {
    if (event.defaultPrevented) return;
    const target = elementFromEventTarget(event.target);
    if (!target) return;
    const selectionTarget = selectionMenuTargetForElement(target);
    if (!selectionTarget) return;
    const selectionRect = selectionRectForTarget(state.ownerDocument, target);
    if (!selectionRect) return;

    this.armSelectionMenu(state, selectionRect, event, selectionTarget.isPdf);
  }

  private handlePointerUp(state: DocumentState, event: PointerEvent): void {
    if (event.defaultPrevented) return;
    const target = elementFromEventTarget(event.target);
    if (!target || !target.closest(PDF_TEXT_LAYER_SELECTOR)) return;
    const selectionRect = selectionRectForTarget(state.ownerDocument, target);
    if (!selectionRect) return;

    // PDF++ creates its custom menu asynchronously from pointerup, so arm the
    // observer before its bubbling listener schedules that menu.
    this.armSelectionMenu(state, selectionRect, event, true);
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
      event.stopImmediatePropagation();
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

    const targetRoot = state.ownerDocument.body ?? state.ownerDocument.documentElement;
    if (!targetRoot) return;
    if (!state.pendingObserver) {
      const observer = new state.ownerWindow.MutationObserver(() => {
        this.activatePendingMenu(state);
      });
      state.pendingObserver = observer;
      observer.observe(targetRoot, { childList: true, subtree: true });
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
    };
    active = activeMenu;
    state.active = activeMenu;
    state.component.addChild(component);
    const observerRoot = state.ownerDocument.body ?? state.ownerDocument.documentElement;
    if (!observerRoot) {
      this.clearActiveMenu(state, activeMenu);
      return;
    }
    activeMenu.observer.observe(observerRoot, {
      childList: true,
      subtree: true,
    });
    component.registerDomEvent(menu, "pointerenter", () => {
      this.cancelDismissTimer(state, activeMenu);
    });
    component.registerDomEvent(menu, "pointerleave", () => {
      this.scheduleDismissTimer(state, activeMenu);
    });
    component.registerDomEvent(menu, "focusin", () => {
      this.cancelDismissTimer(state, activeMenu);
    });
    component.registerDomEvent(menu, "focusout", (event) => {
      if (isNodeLike(event.relatedTarget) && menu.contains(event.relatedTarget)) return;
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
    if (state.active !== active || active.dismissSeconds <= 0) return;
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
