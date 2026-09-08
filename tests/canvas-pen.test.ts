import { beforeEach, describe, expect, it, vi } from "vitest";
import { Platform, type App } from "obsidian";
import { DragSessionManager } from "../src/drag-session-manager";
import { mergeSettings } from "../src/settings-model";
import { findCanvasPenDragControl } from "../src/pointer-drag";

vi.mock("obsidian", () => ({
  Component: class {}, Modal: class {}, Setting: class {}, Menu: class {},
  MarkdownView: class {}, TFile: class {}, Notice: vi.fn(), MarkdownRenderer: {},
  Platform: { isIosApp: false },
}));

type Adapter = {
  pointerDrag: unknown;
  session: unknown;
  findPointerDropTarget(): unknown;
  commitDrop(): Promise<void>;
  cleanupDrag(): void;
  endPointerDrag(event: PointerEvent): Promise<void>;
  cancelPointerDrag(pointerId: number): void;
  handleCanvasPenPointerDown(event: PointerEvent): void;
  handleCanvasPenPointerMove(event: PointerEvent): void;
  handleCanvasPenPointerUp(event: PointerEvent): void;
  handleCanvasPenPointerCancel(event: PointerEvent): void;
  handleCanvasPenMouseDown(event: MouseEvent): void;
  handleCanvasPenContextMenu(event: MouseEvent): void;
  canvasPenNativePointer: unknown;
  canvasPenDrag: unknown;
  canvasTouchNavigation: unknown;
  cancelCanvasInputs(document: Document): void;
  suppressIosTouchEvent(event: TouchEvent): void;
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
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true),
  };
  const container = { nodeType: 1, ownerDocument, isConnected: true, contains: () => true,
    querySelectorAll: () => [], querySelector: () => container, closest: () => null,
    dispatchEvent: (event: PointerEvent) => {
      Object.defineProperty(event, "target", { value: container });
      received.push(event);
      return true;
    },
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true) };
  const canvas = { nodes: new Map(), panBy: vi.fn(), zoomBy: vi.fn(),
    posFromEvt: (event: MouseEvent) => ({ x: event.clientX / 2, y: event.clientY / 2 }),
    domPosFromEvt: (event: MouseEvent) => ({ x: event.clientX, y: event.clientY }), interactionHitTest: vi.fn() };
  const canvasView = { containerEl: container, getViewType: () => "canvas", canvas };
  const config = mergeSettings(undefined);
  const host = { config, app: { workspace: { iterateAllLeaves: (callback: (leaf: unknown) => void) => callback({ view: canvasView }) } } as unknown as App };
  manager = new DragSessionManager(host) as unknown as Adapter;
  const event = (buttons = 1, pointerId = 7, target: unknown = control) => ({
    pointerType: "pen", pointerId, target, buttons, button: buttons === 2 ? 2 : 0, isPrimary: true,
    clientX: 20, clientY: 30, screenX: 40, screenY: 50,
    ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
  } as unknown as PointerEvent & { preventDefault: ReturnType<typeof vi.fn>; stopImmediatePropagation: ReturnType<typeof vi.fn> });
  return { manager, event, received, control, container, ownerDocument, config, canvas };
}

beforeEach(() => { Platform.isIosApp = false; });

function markdownPenFixture(pointerId = 7) {
  const result = fixture();
  const { manager, control, canvas, ownerDocument } = result;
  manager.pointerDrag = {
    pointerId, pointerType: "pen", element: control, active: true,
    surfacePenSideButton: true, mobileSelectionTimer: null,
  };
  manager.session = { id: "markdown-pen-drop" };
  vi.spyOn(manager, "findPointerDropTarget").mockReturnValue({ canvas, ownerDocument });
  const commit = vi.spyOn(manager, "commitDrop").mockImplementation(async () => {
    await Promise.resolve();
    manager.cleanupDrag();
  });
  return { ...result, commit };
}

describe("Markdown pen drop context menus", () => {
  it("blocks the menu while the Markdown handle owns the pen", () => {
    const { manager, event, container } = markdownPenFixture();
    const menu = event(2, 7, container);
    manager.handleCanvasPenContextMenu(menu);
    expect(menu.preventDefault).toHaveBeenCalledOnce();
    expect(menu.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it.each(["pen", "legacy"])("blocks the delayed %s menu after the Canvas commit clears the drag", async (kind) => {
    const { manager, event, container, commit } = markdownPenFixture();
    const release = manager.endPointerDrag(event(0));
    const duringCommit = event(2, 7, container);
    manager.handleCanvasPenContextMenu(duringCommit);
    expect(duringCommit.preventDefault).toHaveBeenCalledOnce();
    await release;
    expect(manager.pointerDrag).toBeNull();
    expect(commit).toHaveBeenCalledOnce();
    const delayed = event(2, 7, container);
    if (kind === "legacy") Object.assign(delayed, { pointerType: undefined });
    manager.handleCanvasPenContextMenu(delayed);
    expect(delayed.stopImmediatePropagation).toHaveBeenCalledOnce();
    const next = event(2, 7, container);
    manager.handleCanvasPenContextMenu(next);
    expect(next.preventDefault).not.toHaveBeenCalled();
  });

  it("keeps the delayed guard when capture is lost during an asynchronous drop", async () => {
    const { manager, event, container } = markdownPenFixture();
    const release = manager.endPointerDrag(event(0));
    manager.cancelPointerDrag(7);
    await release;
    const delayed = event(2, 7, container);
    manager.handleCanvasPenContextMenu(delayed);
    expect(delayed.preventDefault).toHaveBeenCalledOnce();
  });

  it("blocks the recorded Windows menu whose pointer ID changes after pen release", async () => {
    const { manager, event, container } = markdownPenFixture(18);
    await manager.endPointerDrag({ ...event(0, 18), button: 2, clientX: 622, clientY: 1033.3333740234375 });
    const delayed = { ...event(2, 1, container), buttons: 0, clientX: 622, clientY: 1033 };
    manager.handleCanvasPenContextMenu(delayed);
    expect(delayed.preventDefault).toHaveBeenCalledOnce();
    expect(delayed.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it("leaves mouse, keyboard, distant pens and other windows alone", async () => {
    const { manager, event, container } = markdownPenFixture();
    await manager.endPointerDrag(event(0));
    const menus = [
      { ...event(2), pointerType: "mouse" },
      { ...event(0), pointerType: undefined, clientX: 0, clientY: 0 },
      { ...event(2, 8), clientX: 500 },
      event(2, 7, { nodeType: 1, ownerDocument: {} }),
      { ...event(2), pointerType: undefined, clientX: 500 },
    ];
    for (const menu of menus) {
      manager.handleCanvasPenContextMenu(menu);
      expect(menu.preventDefault).not.toHaveBeenCalled();
    }
    const actualTail = event(2, 7, container);
    manager.handleCanvasPenContextMenu(actualTail);
    expect(actualTail.preventDefault).toHaveBeenCalledOnce();
  });

  it.each(["new-input", "expired", "window-blur"])("clears the release guard on %s", async (reason) => {
    const { manager, event, ownerDocument } = markdownPenFixture();
    await manager.endPointerDrag(event(0));
    if (reason === "new-input") manager.handleCanvasPenPointerDown({ ...event(2), pointerType: "mouse" });
    if (reason === "window-blur") manager.cancelCanvasInputs(ownerDocument as unknown as Document);
    const clock = reason === "expired" ? vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2_000) : null;
    try {
      const menu = { ...event(2), pointerType: undefined };
      manager.handleCanvasPenContextMenu(menu);
      expect(menu.preventDefault).not.toHaveBeenCalled();
    } finally {
      clock?.mockRestore();
    }
  });

  it("cancels a Markdown pen drag when its owner window loses focus", () => {
    const { manager, event, ownerDocument, commit } = markdownPenFixture();
    manager.cancelCanvasInputs(ownerDocument as unknown as Document);
    expect(manager.pointerDrag).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    const menu = event(2);
    manager.handleCanvasPenContextMenu(menu);
    expect(menu.preventDefault).not.toHaveBeenCalled();
  });
});

describe("iOS finger and Pencil mapping", () => {
  beforeEach(() => { Platform.isIosApp = true; });

  it.each(["top", "right", "bottom", "left", "topright", "bottomright", "bottomleft", "topleft"])("uses Pencil to resize %s without a side button", (direction) => {
    const { manager, event, received, config } = fixture("canvas-node-resizer", direction);
    config.surfacePenSideButtonDrag = false;
    manager.handleCanvasPenPointerDown(event());
    manager.handleCanvasPenPointerMove(event());
    manager.handleCanvasPenPointerUp(event(0));
    expect(received.filter((e) => e.type.startsWith("pointer")).map((e) => [e.type, e.button, e.buttons])).toEqual([
      ["pointerdown", 0, 1], ["pointermove", -1, 1], ["pointerup", 0, 0],
    ]);
  });

  it.each(["top", "right", "bottom", "left", "topright", "bottomright", "bottomleft", "topleft"])("pans instead of resizing under a finger at %s", (direction) => {
    const { manager, event, received, canvas } = fixture("canvas-node-resizer", direction);
    manager.handleCanvasPenPointerDown({ ...event(), pointerType: "touch" });
    manager.handleCanvasPenPointerMove({ ...event(), pointerType: "touch", clientX: 40 });
    manager.handleCanvasPenPointerUp({ ...event(0), pointerType: "touch", clientX: 40 });
    expect(canvas.panBy).toHaveBeenCalledWith(-10, 0);
    expect(canvas.zoomBy).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
    expect(manager.canvasTouchNavigation).toBeNull();
  });

  it("zooms with two fingers and rebases when one lifts", () => {
    const { manager, event, canvas } = fixture();
    const finger = (id: number, x: number, buttons = 1) => ({ ...event(buttons, id), pointerType: "touch", clientX: x, isPrimary: id === 1 });
    manager.handleCanvasPenPointerDown(finger(1, 0));
    manager.handleCanvasPenPointerDown(finger(2, 20));
    manager.handleCanvasPenPointerMove(finger(2, 40));
    expect(canvas.zoomBy).toHaveBeenCalledWith(1, { x: 20, y: 30 });
    manager.handleCanvasPenPointerUp(finger(1, 0, 0));
    manager.handleCanvasPenPointerMove(finger(2, 50));
    expect(canvas.panBy).toHaveBeenLastCalledWith(-5, 0);
    expect(canvas.zoomBy).toHaveBeenCalledTimes(1);
    manager.handleCanvasPenPointerUp(finger(2, 50, 0));
    expect(manager.canvasTouchNavigation).toBeNull();
  });

  it("gives Pencil priority over an existing finger pan and ignores that finger until release", () => {
    const { manager, event, canvas, received } = fixture();
    manager.handleCanvasPenPointerDown({ ...event(1, 1), pointerType: "touch" });
    manager.handleCanvasPenPointerDown(event(1, 2));
    expect(manager.canvasTouchNavigation).toBeNull();
    expect(received[0]).toMatchObject({ type: "pointerdown", pointerId: 2, button: 0 });
    manager.handleCanvasPenPointerUp(event(0, 2));
    const palm = { ...event(1, 1), pointerType: "touch", clientX: 80 };
    manager.handleCanvasPenPointerMove(palm);
    expect(palm.preventDefault).toHaveBeenCalled();
    expect(canvas.panBy).not.toHaveBeenCalled();
    manager.handleCanvasPenPointerUp({ ...palm, buttons: 0 });
  });

  it("keeps a new palm contact from stealing Pencil resize", () => {
    const { manager, event, received, canvas } = fixture();
    manager.handleCanvasPenPointerDown(event(1, 1));
    const palm = { ...event(1, 2), pointerType: "touch" };
    manager.handleCanvasPenPointerDown(palm);
    manager.handleCanvasPenPointerMove({ ...palm, clientX: 200 });
    manager.handleCanvasPenPointerUp({ ...palm, buttons: 0 });
    manager.handleCanvasPenPointerMove(event(1, 1));
    manager.handleCanvasPenPointerUp(event(0, 1));
    expect(palm.preventDefault).toHaveBeenCalled();
    expect(canvas.panBy).not.toHaveBeenCalled();
    expect(received.filter((e) => e.type.startsWith("pointer"))).toHaveLength(3);
  });

  it("restores the prior pen behavior when the iOS setting is off", () => {
    const { manager, event, received, config } = fixture();
    config.iosPencilMapping = false;
    manager.handleCanvasPenPointerDown(event());
    expect(received[0]).toMatchObject({ button: 1, buttons: 4 });
    manager.handleCanvasPenPointerUp(event(0));
  });

  it("leaves fingers native when navigation APIs are unavailable", () => {
    const { manager, event, canvas } = fixture();
    Reflect.deleteProperty(canvas, "zoomBy");
    const down = { ...event(), pointerType: "touch" };
    manager.handleCanvasPenPointerDown(down);
    expect(down.preventDefault).not.toHaveBeenCalled();
    expect(manager.canvasTouchNavigation).toBeNull();
  });

  it("selects on Pencil tap and refreshes controls without hardware hover", () => {
    const { manager, event, received, canvas } = fixture("canvas-node-container");
    manager.handleCanvasPenPointerDown(event());
    manager.handleCanvasPenPointerUp(event(0));
    expect(received.map((e) => e.type)).toEqual(["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
    expect(canvas.interactionHitTest).toHaveBeenCalledOnce();
  });

  it("does not click after a Pencil drag or cancellation", () => {
    const { manager, event, received } = fixture("canvas-node-container");
    manager.handleCanvasPenPointerDown(event());
    manager.handleCanvasPenPointerMove({ ...event(), clientX: 50 });
    manager.handleCanvasPenPointerUp(event(0));
    manager.handleCanvasPenPointerDown(event());
    manager.handleCanvasPenPointerCancel(event(0));
    expect(received.filter((e) => e.type === "click")).toHaveLength(0);
  });

  it.each(["input", "textarea", "button", '[contenteditable="true"]'])("leaves %s editing and controls native", (selector) => {
    const { manager, event, control, received } = fixture();
    control.closest = (query) => query.split(", ").includes(selector) ? control : null;
    for (const pointerType of ["touch", "pen"]) {
      const down = { ...event(), pointerType };
      manager.handleCanvasPenPointerDown(down);
      expect(down.preventDefault).not.toHaveBeenCalled();
      manager.handleCanvasPenPointerUp({ ...down, buttons: 0 });
    }
    expect(received).toHaveLength(0);
  });

  it("suppresses duplicate TouchEvents through touchend after pointer release", () => {
    const { manager, event, control } = fixture();
    manager.handleCanvasPenPointerDown({ ...event(), pointerType: "touch" });
    const touch = (type: string) => ({ type, target: control, changedTouches: [{ identifier: 42 }], preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });
    const start = touch("touchstart");
    manager.suppressIosTouchEvent(start as unknown as TouchEvent);
    expect(start.preventDefault).toHaveBeenCalled();
    manager.handleCanvasPenPointerUp({ ...event(0), pointerType: "touch" });
    const end = touch("touchend");
    manager.suppressIosTouchEvent(end as unknown as TouchEvent);
    expect(end.preventDefault).toHaveBeenCalled();
  });

  it("cleans up finger capture when its document closes", () => {
    const { manager, event, ownerDocument, container } = fixture();
    manager.handleCanvasPenPointerDown({ ...event(), pointerType: "touch" });
    manager.cancelCanvasInputs(ownerDocument as unknown as Document);
    expect(manager.canvasTouchNavigation).toBeNull();
    expect(container.releasePointerCapture).toHaveBeenCalledWith(7);
  });
});

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
