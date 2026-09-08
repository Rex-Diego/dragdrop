import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { CanvasAdapter, measureCanvasNodeHeight, type CanvasDropTarget } from "../src/canvas-adapter";
import type { CanvasNode } from "../src/canvas-types";

vi.mock("obsidian", () => ({ Notice: vi.fn(), TFile: class { path = "Source.md"; } }));

function canvasFixture() {
  const classes = new Set<string>();
  const preview = {
    clientHeight: 180,
    scrollHeight: 280,
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
  };
  const sizer = { scrollHeight: 280, offsetHeight: 280, getBoundingClientRect: () => ({ height: 560 }) } as HTMLElement;
  const nodes = new Map<string, CanvasNode>();
  const node = {
    id: "new-node", x: 0, y: 0, width: 400, height: 200,
    render: vi.fn(),
    getData: vi.fn(() => ({
      id: "new-node", file: "Source.md", subpath: "#^block",
      styleAttributes: { border: "dashed", shape: "pill" },
      customData: { retained: true },
    })),
    setData: vi.fn(),
    onResizeDblclick: vi.fn(() => { throw new Error("Enhanced Canvas gesture must not be activated"); }),
    resize: vi.fn((size: { height: number }) => { node.height = size.height; }),
    child: { previewMode: { renderer: { previewEl: preview, sizerEl: sizer } } },
    canvas: {
      nodes, readonly: false, config: { minContainerDimension: 50 },
      requestFrame: vi.fn(), requestSave: vi.fn(), nodeInteractionLayer: { render: vi.fn() },
      createTextNode: vi.fn(() => { nodes.set(node.id, node as unknown as CanvasNode); return node; }),
      createFileNode: vi.fn(() => { nodes.set(node.id, node as unknown as CanvasNode); return node; }),
    },
  };
  const ownerDocument = {};
  const target = {
    view: { containerEl: { isConnected: true, ownerDocument } },
    canvas: node.canvas, point: { x: 0, y: 0 }, ownerDocument,
    window: { requestAnimationFrame: (callback: () => void) => { callback(); return 0; } },
  } as unknown as CanvasDropTarget;
  return { node, target, sizer, classes };
}

describe("Canvas node fitting", () => {
  it("uses CSS pixels instead of zoomed bounds and removes the measurement class", () => {
    const { node, sizer, classes } = canvasFixture();
    expect(measureCanvasNodeHeight(node as unknown as CanvasNode, sizer)).toBe(300);
    expect(classes.size).toBe(0);
  });

  it("fits a new node through resize and updates the native interaction layer", async () => {
    const { node, target } = canvasFixture();
    const adapter = new CanvasAdapter({} as App);
    await adapter.createVerticalItems(target, [{ type: "text", text: "Content" }], 400, 200, 40);
    expect(node.onResizeDblclick).not.toHaveBeenCalled();
    expect(node.resize).toHaveBeenCalledWith({ width: 400, height: 300 });
    expect(node.canvas.nodeInteractionLayer.render).toHaveBeenCalledTimes(1);
    expect(node.canvas.requestSave).toHaveBeenCalledTimes(1);
    expect(node.setData).not.toHaveBeenCalled();
  });

  it("does not resize a node deleted while its preview is rendering", async () => {
    const { node, target } = canvasFixture();
    target.window.requestAnimationFrame = (callback) => { node.canvas.nodes.clear(); callback(0); return 0; };
    await new CanvasAdapter({} as App).createVerticalItems(target, [{ type: "text", text: "Content" }], 400, 200, 40);
    expect(node.resize).not.toHaveBeenCalled();
  });

  it.each([true, false])("keeps fixed heights and vertical spacing with hidden borders=%s", async (hideNodeBorder) => {
    const { node, target } = canvasFixture();
    await new CanvasAdapter({} as App).createVerticalItems(target, [
      { type: "text", text: "First" }, { type: "text", text: "Second" },
    ], 400, 200, 40, { autoFitNodeHeight: false, hideNodeBorder });
    expect(node.resize).not.toHaveBeenCalled();
    expect(node.canvas.createTextNode.mock.calls).toEqual([
      [{ text: "First", pos: { x: 0, y: 0 }, size: { width: 400, height: 200 }, save: false, focus: false }],
      [{ text: "Second", pos: { x: 0, y: 240 }, size: { width: 400, height: 200 }, save: false, focus: false }],
    ]);
    expect(node.setData).toHaveBeenCalledTimes(hideNodeBorder ? 2 : 0);
    expect(node.canvas.requestSave).toHaveBeenCalledTimes(1);
  });

  it.each(["text", "file"] as const)("merges invisible borders without losing %s node data or fitting", async (type) => {
    const { node, target } = canvasFixture();
    const item = type === "text"
      ? { type, text: "Content" }
      : { type, file: new TFile(), subpath: "#^block" };
    await new CanvasAdapter({} as App).createVerticalItems(target, [item], 400, 200, 40,
      { autoFitNodeHeight: true, hideNodeBorder: true });
    expect(node.setData).toHaveBeenCalledWith({
      ...node.getData(), styleAttributes: { border: "invisible", shape: "pill" },
    });
    expect(node.resize).toHaveBeenCalledWith({ width: 400, height: 300 });
    expect(node.canvas.requestSave).toHaveBeenCalledTimes(1);
  });

  it("still creates and fits cards without the optional node data API", async () => {
    const { node, target } = canvasFixture();
    (node as unknown as CanvasNode).setData = undefined;
    const created = await new CanvasAdapter({} as App).createVerticalItems(target,
      [{ type: "text", text: "Content" }], 400, 200, 40,
      { autoFitNodeHeight: true, hideNodeBorder: true });
    expect(created).toEqual([node]);
    expect(node.resize).toHaveBeenCalled();
    expect(node.canvas.requestSave).toHaveBeenCalledTimes(1);
  });
});
