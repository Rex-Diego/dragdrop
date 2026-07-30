import type { TFile, TextFileView } from "obsidian";

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: ObsidianCanvas;
  nodeEl?: HTMLElement;
  render(): void;
  resize?(size: CanvasSize): void;
  getData?(): Record<string, unknown>;
  setData?(data: Record<string, unknown>, addHistory?: boolean): void;
  onResizeDblclick?(event: MouseEvent, side: "bottom"): void;
  child?: {
    previewMode?: {
      renderer?: {
        previewEl?: HTMLElement;
        sizerEl?: HTMLElement;
        sections?: unknown[];
      };
    };
  };
}

export interface CanvasFileNode extends CanvasNode {
  file: TFile;
  filePath: string;
  subpath?: string;
}

export interface CanvasTextNode extends CanvasNode {
  text: string;
}

export interface ObsidianCanvas {
  readonly?: boolean;
  nodes: Map<string, CanvasNode>;
  selection: Set<CanvasNode>;
  updateSelection?(callback: () => void): void;
  posFromEvt(event: MouseEvent): CanvasPoint;
  createFileNode(config: {
    file: TFile;
    pos: CanvasPoint;
    subpath?: string;
    size?: CanvasSize;
    save?: boolean;
    focus?: boolean;
  }): CanvasFileNode;
  createTextNode(config: {
    text: string;
    pos: CanvasPoint;
    size?: CanvasSize;
    save?: boolean;
    focus?: boolean;
  }): CanvasTextNode;
  requestFrame(): void | Promise<void>;
  requestSave(): void | Promise<void>;
}

export interface CanvasView extends TextFileView {
  canvas: ObsidianCanvas;
  file: TFile | null;
}

export function isCanvasView(value: unknown): value is CanvasView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<CanvasView> & { getViewType?: () => string };
  const canvas = view.canvas;
  return (
    view.getViewType?.() === "canvas" &&
    canvas !== undefined &&
    typeof canvas === "object"
  );
}
