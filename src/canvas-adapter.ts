import { Notice, type App, type TFile, type WorkspaceLeaf } from "obsidian";
import type {
  CanvasFileNode,
  CanvasNode,
  CanvasPoint,
  CanvasTextNode,
  CanvasView,
  ObsidianCanvas,
} from "./canvas-types";
import { isCanvasView } from "./canvas-types";
import { DEFAULT_SETTINGS, type DragDropSettings } from "./settings-model";

interface OwnerWindow extends Window {
  readonly MouseEvent: new (type: string, eventInitDict?: MouseEventInit) => MouseEvent;
}

export interface CanvasDropTarget {
  view: CanvasView;
  canvas: ObsidianCanvas;
  point: CanvasPoint;
  ownerDocument: Document;
  window: OwnerWindow;
}

export interface CanvasDropPoint {
  ownerDocument: Document;
  x: number;
  y: number;
  path?: EventTarget[];
}

export type CanvasItemSpec =
  | { type: "file"; file: TFile; subpath?: string }
  | { type: "text"; text: string };

function isNodeLike(value: EventTarget | null): value is Node {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

function pointInside(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function ownerWindow(ownerDocument: Document): OwnerWindow | null {
  return ownerDocument.defaultView;
}

function supportsCanvasDrop(canvas: ObsidianCanvas): boolean {
  const candidate = canvas as unknown as Record<string, unknown>;
  return (
    typeof candidate.posFromEvt === "function" &&
    typeof candidate.createFileNode === "function" &&
    typeof candidate.createTextNode === "function" &&
    typeof candidate.requestFrame === "function" &&
    typeof candidate.requestSave === "function"
  );
}

function nextFrame(window: Window): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export class CanvasAdapter {
  private readonly warnedUnsupportedCanvases = new WeakSet<object>();

  constructor(private readonly app: App) {}

  findDropTarget(event: DragEvent): CanvasDropTarget | null {
    const eventTarget = isNodeLike(event.target) ? event.target : null;
    const ownerDocument = eventTarget?.ownerDocument ?? activeDocument;
    return this.findDropTargetAt({
      ownerDocument,
      x: event.clientX,
      y: event.clientY,
      path: event.composedPath(),
    });
  }

  findDropTargetAt(point: CanvasDropPoint): CanvasDropTarget | null {
    const { ownerDocument, x, y, path = [] } = point;
    const window = ownerWindow(ownerDocument);
    if (!window) return null;

    const candidates: CanvasView[] = [];
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const view = leaf.view;
      if (!isCanvasView(view)) return;
      if (view.containerEl.ownerDocument !== ownerDocument) return;
      if (!view.containerEl.isConnected || view.canvas.readonly === true) return;
      candidates.push(view);
    });

    const direct = candidates.find((view) => {
      if (path.includes(view.containerEl)) return true;
      return false;
    });

    const pointElement = ownerDocument.elementFromPoint(x, y);
    const pointMatch = pointElement
      ? candidates.find((view) => view.containerEl.contains(pointElement))
      : undefined;

    const rectMatch = candidates
      .filter((view) => pointInside(view.containerEl.getBoundingClientRect(), x, y))
      .sort((left, right) => {
        const leftRect = left.containerEl.getBoundingClientRect();
        const rightRect = right.containerEl.getBoundingClientRect();
        return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
      })[0];

    const view = direct ?? pointMatch ?? rectMatch;
    if (!view) return null;
    if (!supportsCanvasDrop(view.canvas)) {
      if (!this.warnedUnsupportedCanvases.has(view.canvas)) {
        this.warnedUnsupportedCanvases.add(view.canvas);
        new Notice("This canvas version does not support dragdrop node creation.");
      }
      return null;
    }

    try {
      return {
        view,
        canvas: view.canvas,
        point: view.canvas.posFromEvt(new window.MouseEvent("mousemove", { clientX: x, clientY: y })),
        ownerDocument,
        window,
      };
    } catch (error) {
      console.error("DragDrop could not resolve the Canvas drop point.", error);
      return null;
    }
  }

  isTargetConnected(target: CanvasDropTarget): boolean {
    return (
      target.view.containerEl.isConnected &&
      target.view.containerEl.ownerDocument === target.ownerDocument &&
      target.canvas.readonly !== true
    );
  }

  async createVerticalItems(
    target: CanvasDropTarget,
    items: CanvasItemSpec[],
    width: number,
    initialHeight: number,
    gap: number,
    options: Pick<DragDropSettings, "autoFitNodeHeight" | "hideNodeBorder"> = DEFAULT_SETTINGS,
  ): Promise<CanvasNode[]> {
    const created: CanvasNode[] = [];
    let y = target.point.y;

    for (const item of items) {
      if (!this.isTargetConnected(target)) break;

      try {
        const node = this.createNode(target, item, { x: target.point.x, y }, width, initialHeight);
        created.push(node);
        if (options.hideNodeBorder) this.hideBorder(node);
        await Promise.resolve(target.canvas.requestFrame());
        const fittedHeight = options.autoFitNodeHeight
          ? await this.fitHeight(node, target.window, initialHeight)
          : this.safeHeight(node.height, initialHeight);
        y += fittedHeight + gap;
      } catch (error) {
        console.error("DragDrop could not create a Canvas node.", error);
      }
    }

    if (created.length > 0 && this.isTargetConnected(target)) {
      await Promise.resolve(target.canvas.requestFrame());
      await Promise.resolve(target.canvas.requestSave());
    }
    return created;
  }

  private hideBorder(node: CanvasNode): void {
    if (!node.getData || !node.setData) return;
    try {
      const data = node.getData();
      const styles = data.styleAttributes;
      node.setData({
        ...data,
        styleAttributes: {
          ...(styles && typeof styles === "object" && !Array.isArray(styles) ? styles : {}),
          border: "invisible",
        },
      });
    } catch (error) {
      console.error("DragDrop could not hide a Canvas node border.", error);
    }
  }

  private createNode(
    target: CanvasDropTarget,
    item: CanvasItemSpec,
    point: CanvasPoint,
    width: number,
    initialHeight: number,
  ): CanvasFileNode | CanvasTextNode {
    const common = {
      pos: point,
      size: { width, height: initialHeight },
      save: false,
      focus: false,
    };

    if (item.type === "file") {
      return target.canvas.createFileNode({
        ...common,
        file: item.file,
        subpath: item.subpath,
      });
    }

    return target.canvas.createTextNode({
      ...common,
      text: item.text,
    });
  }

  private async fitHeight(
    node: CanvasNode,
    window: OwnerWindow,
    fallbackHeight: number,
  ): Promise<number> {
    try {
      node.render();
      const sizer = await this.waitForSizer(node, window);
      if (!sizer) return this.safeHeight(node.height, fallbackHeight);

      await this.waitForStableHeight(sizer, window);
      if (node.canvas.readonly || !node.canvas.nodes.has(node.id) || !node.resize) {
        return this.safeHeight(node.height, fallbackHeight);
      }
      const height = measureCanvasNodeHeight(node, sizer);
      if (height === null) return this.safeHeight(node.height, fallbackHeight);
      // A resize gesture can be patched by other plugins to enable continuous
      // auto-height. Creation needs only a one-time fit through the size API.
      node.resize({ width: node.width, height });
      node.render();
      await Promise.resolve(node.canvas.requestFrame());
      await nextFrame(window);
      node.canvas.nodeInteractionLayer?.render?.();
      return this.safeHeight(node.height, fallbackHeight);
    } catch (error) {
      console.error("DragDrop could not fit a Canvas node to its content.", error);
      return fallbackHeight;
    }
  }

  private async waitForSizer(node: CanvasNode, window: Window): Promise<HTMLElement | null> {
    for (let frame = 0; frame < 30; frame += 1) {
      const sizer = node.child?.previewMode?.renderer?.sizerEl;
      if (sizer) return sizer;
      await nextFrame(window);
    }
    return null;
  }

  private async waitForStableHeight(element: HTMLElement, window: Window): Promise<void> {
    let stableFrames = 0;
    let previous = -1;
    for (let frame = 0; frame < 30 && stableFrames < 3; frame += 1) {
      await nextFrame(window);
      const current = Math.max(element.scrollHeight, element.getBoundingClientRect().height);
      if (Math.abs(current - previous) < 1) stableFrames += 1;
      else stableFrames = 0;
      previous = current;
    }
  }

  private safeHeight(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

export function measureCanvasNodeHeight(node: CanvasNode, sizer: HTMLElement): number | null {
  const preview = node.child?.previewMode?.renderer?.previewEl;
  if (!preview || preview.clientHeight <= 0) return null;
  const chrome = Math.max(0, node.height - preview.clientHeight);
  preview.classList.add("dragdrop-canvas-measure-height");
  try {
    // offset/scroll dimensions are in CSS pixels even when the Canvas is zoomed.
    const contentHeight = Math.max(preview.scrollHeight, sizer.scrollHeight, sizer.offsetHeight);
    return Number.isFinite(contentHeight) && contentHeight > 0
      ? Math.max(node.canvas.config?.minContainerDimension ?? 50, Math.ceil(contentHeight + chrome))
      : null;
  } finally {
    preview.classList.remove("dragdrop-canvas-measure-height");
  }
}
