import {
  Component,
  Notice,
  TFile,
  normalizePath,
  setIcon,
  setTooltip,
  type App,
  type Plugin,
} from "obsidian";
import { FileService } from "./file-service";
import type { CanvasView } from "./canvas-types";
import { isCanvasView } from "./canvas-types";
import {
  buildAtomicNoteContent,
  collectCanvasSummaryItems,
  sortCanvasSelection,
} from "./canvas-summary-model";
import type { DragDropSettings } from "./settings-model";

const CANVAS_MENU_SELECTOR = ".canvas-menu";
const SUMMARY_BUTTON_CLASS = "dragdrop-canvas-summary-button";
const SUMMARY_BUTTON_LABEL = "Create atomic note from canvas selection";

interface CanvasSummaryHost {
  app: App;
  config: DragDropSettings;
  plugin: Plugin;
}

interface DocumentObserver {
  observer: MutationObserver;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentLike(value: unknown): value is Document {
  return (
    isRecord(value) &&
    value.nodeType === 9 &&
    "defaultView" in value &&
    "body" in value
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

export class CanvasSummaryFeature extends Component {
  private readonly observers = new Map<Document, DocumentObserver>();
  private busy = false;

  constructor(private readonly host: CanvasSummaryHost) {
    super();
  }

  onload(): void {
    this.host.plugin.addCommand({
      id: "create-atomic-note",
      name: "Create atomic note from canvas selection",
      checkCallback: (checking) => {
        const view = this.findSelectedCanvasView();
        if (!view) return false;
        if (!checking) void this.createAtomicNote(view);
        return true;
      },
    });

    this.registerDocument(this.host.app.workspace.containerEl.ownerDocument);
    this.host.app.workspace.onLayoutReady(() => {
      this.host.app.workspace.iterateAllLeaves((leaf) => {
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
    for (const { observer } of this.observers.values()) observer.disconnect();
    this.observers.clear();
  }

  refresh(): void {
    for (const ownerDocument of this.observers.keys()) {
      this.injectMenus(ownerDocument);
    }
  }

  private registerDocument(ownerDocument: Document): void {
    if (this.observers.has(ownerDocument)) return;
    const ownerWindow = ownerDocument.defaultView;
    const target = ownerDocument.body ?? ownerDocument.documentElement;
    if (!ownerWindow || !target) return;

    const observer = new ownerWindow.MutationObserver(() => {
      this.injectMenus(ownerDocument);
    });
    observer.observe(target, { childList: true, subtree: true });
    this.observers.set(ownerDocument, { observer });
    this.injectMenus(ownerDocument);
  }

  private unregisterDocument(ownerDocument: Document): void {
    this.observers.get(ownerDocument)?.observer.disconnect();
    this.observers.delete(ownerDocument);
  }

  private injectMenus(ownerDocument: Document): void {
    if (!this.host.config.canvasSummaryButton) {
      for (const button of Array.from(
        ownerDocument.querySelectorAll<HTMLElement>(`.${SUMMARY_BUTTON_CLASS}`),
      )) {
        button.remove();
      }
      return;
    }

    for (const menu of Array.from(
      ownerDocument.querySelectorAll<HTMLElement>(CANVAS_MENU_SELECTOR),
    )) {
      this.injectMenuButton(menu);
    }
  }

  private injectMenuButton(menu: HTMLElement): void {
    if (menu.querySelector(`.${SUMMARY_BUTTON_CLASS}`)) return;

    try {
      const button = menu.createEl("button", {
        cls: ["clickable-icon", SUMMARY_BUTTON_CLASS],
        attr: {
          type: "button",
          "aria-label": SUMMARY_BUTTON_LABEL,
          "data-tooltip-position": "top",
        },
      });
      setIcon(button, "lightbulb");
      setTooltip(button, SUMMARY_BUTTON_LABEL);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.createAtomicNoteFromSelection();
      });
    } catch {
      // The Canvas toolbar is private UI. A failed injection must not affect drag and drop.
    }
  }

  private findSelectedCanvasView(): CanvasView | null {
    const activePath = this.host.app.workspace.getActiveFile()?.path;
    let firstSelected: CanvasView | null = null;
    let activeSelected: CanvasView | null = null;

    this.host.app.workspace.iterateAllLeaves((leaf) => {
      if (!isCanvasView(leaf.view) || leaf.view.canvas.selection.size === 0) return;
      firstSelected ??= leaf.view;
      if (activePath !== undefined && leaf.view.file?.path === activePath) {
        activeSelected = leaf.view;
      }
    });

    return activeSelected ?? firstSelected;
  }

  private async createAtomicNoteFromSelection(): Promise<void> {
    const view = this.findSelectedCanvasView();
    if (!view) {
      new Notice("Select one or more canvas nodes first.");
      return;
    }
    await this.createAtomicNote(view);
  }

  private async createAtomicNote(view: CanvasView): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    try {
      const nodes = sortCanvasSelection(view.canvas.selection);
      const items = collectCanvasSummaryItems(nodes);
      const resolvedFiles = new Map<string, TFile>();
      const resolvedItems = items.filter((item) => {
        if (item.type === "text") return true;
        const abstract = this.host.app.vault.getAbstractFileByPath(
          normalizePath(item.filePath),
        );
        if (!(abstract instanceof TFile)) return false;
        resolvedFiles.set(item.filePath, abstract);
        return true;
      });

      if (resolvedItems.length === 0) {
        new Notice("The selected canvas nodes cannot be turned into a note.");
        return;
      }

      const sourceFile =
        [...resolvedFiles.values()][0] ?? view.file ?? null;
      if (!sourceFile) {
        new Notice("The selected canvas nodes have no source file.");
        return;
      }

      const fileService = new FileService(this.host.app, this.host.config);
      const plan = await fileService.planAtomicNote(sourceFile, view);
      if (!plan) return;

      const content = buildAtomicNoteContent(resolvedItems, (filePath) => {
        const file = resolvedFiles.get(filePath);
        return file
          ? this.host.app.metadataCache.fileToLinktext(file, plan.path, true)
          : filePath;
      });
      const note = await fileService.createAtomicNote(plan, content);
      if (!note || view.canvas.readonly === true || !view.containerEl.isConnected) return;

      const right = Math.max(...nodes.map((node) => node.x + node.width));
      const top = Math.min(...nodes.map((node) => node.y));
      const node = view.canvas.createFileNode({
        file: note,
        pos: { x: right + Math.max(this.host.config.nodeGap, 40), y: top },
        size: {
          width: this.host.config.nodeWidth,
          height: this.host.config.initialNodeHeight,
        },
        save: false,
        focus: false,
      });

      const selectNode = (): void => {
        view.canvas.selection.clear();
        view.canvas.selection.add(node);
      };
      if (view.canvas.updateSelection) view.canvas.updateSelection(selectNode);
      else selectNode();
      await Promise.resolve(view.canvas.requestFrame());
      await Promise.resolve(view.canvas.requestSave());
    } catch (error) {
      console.error("DragDrop could not create an atomic note.", error);
      new Notice("Could not create the atomic note.");
    } finally {
      this.busy = false;
    }
  }
}
