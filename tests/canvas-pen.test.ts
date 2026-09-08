import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { DragSessionManager } from "../src/drag-session-manager";
import { mergeSettings } from "../src/settings-model";
import { findCanvasPenDragControl } from "../src/pointer-drag";

vi.mock("obsidian", () => ({
  Component: class {}, Modal: class {}, Setting: class {}, Menu: class {},
  MarkdownView: class {}, TFile: class {}, Notice: vi.fn(), MarkdownRenderer: {},
}));

type Adapter = {
  handleCanvasPenPointerDown(event: PointerEvent): void;
  handleCanvasPenPointerMove(event: PointerEvent): void;
  handleCanvasPenPointerUp(event: PointerEvent): void;
  handleCanvasPenPointerCancel(event: PointerEvent): void;
  handleCanvasPenMouseDown(event: MouseEvent): void;
  handleCanvasPenContextMenu(event: MouseEvent): void;
  canvasPenNativePointer: unknown;
};

function fixture(controlClass = "canvas-node-resizer", direction = "bottom") {
  class SyntheticEvent extends Event {
    constructor(type: string, init: PointerEventInit) {
      super(type, init);
      for (const [key, value] of Object.entries(init)) {
        if (!["bubbles", "cancelable", "composed"].includes(key)) Object.defineProperty(this, key, { value });
      }
    }
  }
  const received: PointerEvent[] = [];
  let manager: Adapter;
  const ownerWindow = { PointerEvent: SyntheticEvent, MouseEvent: SyntheticEvent,
    getComputedStyle: () => ({ display: "block", visibility: "visible", pointerEvents: "all" }) };
  const ownerDocument = { defaultView: ownerWindow, elementsFromPoint: () => [control] };
  const control = {
    nodeType: 1, ownerDocument, isConnected: true,
    getAttribute: () => direction,
    closest: (selector: string) => selector.split(", ").includes(`.${controlClass}`) ? control : null,
    dispatchEvent: (event: PointerEvent) => {
      Object.defineProperty(event, "target", { value: control });
      if (event.type === "pointerdown") manager.handleCanvasPenPointerDown(event);
      if (event.type === "pointermove") manager.handleCanvasPenPointerMove(event);
      if (event.type === "pointerup") manager.handleCanvasPenPointerUp(event);
      if (event.type === "pointercancel") manager.handleCanvasPenPointerCancel(event);
      received.push(event);
      return true;
    },
    setPointerCapture: vi.fn(),
  };
  const container = { nodeType: 1, ownerDocument, isConnected: true, contains: () => true,
    querySelectorAll: () => [], querySelector: () => container, closest: () => null,
    dispatchEvent: (event: PointerEvent) => {
      Object.defineProperty(event, "target", { value: container });
      received.push(event);
      return true;
    },
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true) };
  const canvasView = { containerEl: container, getViewType: () => "canvas", canvas: { nodes: new Map() } };
  const config = mergeSettings(undefined);
  const host = { config, app: { workspace: { iterateAllLeaves: (callback: (leaf: unknown) => void) => callback({ view: canvasView }) } } as unknown as App };
  manager = new DragSessionManager(host) as unknown as Adapter;
  const event = (buttons = 1, pointerId = 7, target: unknown = control) => ({
    pointerType: "pen", pointerId, target, buttons, button: buttons === 2 ? 2 : 0,
    clientX: 20, clientY: 30, screenX: 40, screenY: 50,
    ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
  } as unknown as PointerEvent & { preventDefault: ReturnType<typeof vi.fn>; stopImmediatePropagation: ReturnType<typeof vi.fn> });
  return { manager, event, received, control, container, ownerDocument, config };
}

describe("Canvas pen control event routing", () => {
  it.each(["top", "right", "bottom", "left", "topright", "bottomright", "bottomleft", "topleft"])("forwards %s resize as one primary mouse pointer sequence with side button", (direction) => {
    const { manager, event, received, control, container } = fixture("canvas-node-resizer", direction);
    manager.handleCanvasPenPointerDown(event(2));
    manager.handleCanvasPenPointerMove(event(2, 7, container));
    manager.handleCanvasPenPointerUp(event(0, 7, container));
    const pointers = received.filter((item) => item.type.startsWith("pointer"));
    expect(pointers.map(({ type, button, buttons, pointerType, isPrimary }) => ({ type, button, buttons, pointerType, isPrimary }))).toEqual([
      { type: "pointerdown", button: 0, buttons: 1, pointerType: "mouse", isPrimary: true },
      { type: "pointermove", button: -1, buttons: 1, pointerType: "mouse", isPrimary: true },
      { type: "pointerup", button: 0, buttons: 0, pointerType: "mouse", isPrimary: true },
    ]);
    for (const item of pointers) expect(item.target).toBe(control);
    expect(control.setPointerCapture).not.toHaveBeenCalled();
    expect(manager.canvasPenNativePointer).toBeNull();
  });

  it.each(["top", "right", "bottom", "left", "topright", "bottomright", "bottomleft", "topleft"])("pans when the pen tip lands on the %s resize handle", (direction) => {
    const { manager, event, received, control, container } = fixture("canvas-node-resizer", direction);
    const down = event(1);
    manager.handleCanvasPenPointerDown(down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(received[0]).toMatchObject({ type: "pointerdown", pointerType: "mouse", button: 1, buttons: 4 });
    expect(received[0].target).toBe(container);
    // Pressing the side button mid-pan must not switch to resizing.
    manager.handleCanvasPenPointerMove(event(2, 7, container));
    expect(received.at(-2)).toMatchObject({ type: "pointermove", button: -1, buttons: 4 });
    manager.handleCanvasPenPointerUp(event(0, 7, container));
    expect(received.at(-2)).toMatchObject({ type: "pointerup", button: 1, buttons: 0 });
    expect(control.setPointerCapture).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3])("keeps connection points on the left button for pen buttons=%s", (buttons) => {
    const { manager, event, received } = fixture("canvas-node-connection-point");
    manager.handleCanvasPenPointerDown(event(buttons));
    manager.handleCanvasPenPointerMove(event(buttons));
    manager.handleCanvasPenPointerUp(event(0));
    expect(received[0]).toMatchObject({ button: 0, buttons: 1 });
    expect(received.at(-2)).toMatchObject({ type: "pointerup", button: 0, buttons: 0 });
  });

  it("ignores unrelated pointers and forwards cancellation without a mouse release", () => {
    const { manager, event, received } = fixture();
    manager.handleCanvasPenPointerDown(event(2));
    manager.handleCanvasPenPointerMove(event(1, 8));
    manager.handleCanvasPenPointerUp(event(0, 8));
    expect(received).toHaveLength(2);
    manager.handleCanvasPenPointerCancel(event(0));
    expect(received.at(-1)?.type).toBe("pointercancel");
    expect(manager.canvasPenNativePointer).toBeNull();
  });

  it("does not synthesize a control press when a held pen only moves over it", () => {
    const { manager, event, received } = fixture();
    manager.handleCanvasPenPointerMove(event(2));
    expect(received).toHaveLength(0);
  });

  it("suppresses duplicate compatibility mouse events and the side-button menu", () => {
    const { manager, event } = fixture();
    manager.handleCanvasPenPointerDown(event(2));
    const mouse = event(2);
    manager.handleCanvasPenMouseDown(mouse);
    expect(mouse.stopImmediatePropagation).toHaveBeenCalledOnce();
    manager.handleCanvasPenPointerUp(event(0));
    const menu = event(0);
    manager.handleCanvasPenContextMenu(menu);
    expect(menu.preventDefault).toHaveBeenCalledOnce();
  });

  it.each(["button", "input", "textarea", "select"])("leaves native %s events untouched", (tag) => {
    const { manager, event, control, received } = fixture(tag);
    control.closest = (selector) => selector.split(", ").includes(tag) ? control : null;
    const down = event();
    manager.handleCanvasPenPointerDown(down);
    expect(down.preventDefault).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("leaves ordinary mouse input untouched", () => {
    const { manager, event, received } = fixture();
    const down = { ...event(), pointerType: "mouse" };
    manager.handleCanvasPenPointerDown(down);
    expect(down.preventDefault).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("keeps connection and resize controls available when side-button selection is disabled", () => {
    const { manager, event, received, config } = fixture();
    config.surfacePenSideButtonDrag = false;
    manager.handleCanvasPenPointerDown(event(2));
    expect(received[0]).toMatchObject({ type: "pointerdown", pointerType: "mouse", button: 0 });
  });

  it("delivers move and release to the owner document after Canvas detaches the control", () => {
    const { manager, event, received, control, ownerDocument } = fixture("canvas-node-connection-point");
    const dispatch = vi.fn((value: PointerEvent) => { received.push(value); return true; });
    Object.assign(ownerDocument, { dispatchEvent: dispatch });
    manager.handleCanvasPenPointerDown(event());
    control.isConnected = false;
    manager.handleCanvasPenPointerMove(event());
    manager.handleCanvasPenPointerUp(event(0));
    expect(dispatch).toHaveBeenCalledTimes(4);
    expect(received.at(-2)).toMatchObject({ type: "pointerup", pointerId: 7 });
  });

  it("keeps a pen sequence that starts in an input out of Canvas panning", () => {
    const { manager, event, control, received, container, ownerDocument } = fixture("input");
    control.closest = (selector) => selector.split(", ").includes("input") ? control : null;
    manager.handleCanvasPenPointerDown(event());
    ownerDocument.elementsFromPoint = () => [];
    const move = event(1, 7, container);
    manager.handleCanvasPenPointerMove(move);
    manager.handleCanvasPenPointerUp(event(0, 7, container));
    expect(move.preventDefault).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("does not treat the empty bounding rectangle around an SVG edge as a control", () => {
    const { container, ownerDocument } = fixture();
    ownerDocument.elementsFromPoint = () => [];
    const query = vi.fn(() => []);
    Object.assign(container, { querySelectorAll: query });
    expect(findCanvasPenDragControl(container as unknown as Element, container as unknown as Element, 20, 30)).toBeNull();
    expect(query.mock.calls).toEqual([[".canvas-node-connection-point"], [".canvas-node-resizer"]]);
  });

  it("prefers a connection point to its containing resize handle in coordinate fallback", () => {
    const { container, ownerDocument } = fixture();
    ownerDocument.elementsFromPoint = () => [];
    const rect = { left: 10, right: 30, top: 20, bottom: 40, width: 20, height: 20 };
    const connection = { getBoundingClientRect: () => rect };
    const resize = { getBoundingClientRect: () => rect };
    Object.assign(container, { querySelectorAll: (selector: string) => selector === ".canvas-node-connection-point" ? [connection] : [resize] });
    expect(findCanvasPenDragControl(container as unknown as Element, container as unknown as Element, 20, 30)).toBe(connection);
  });
});
