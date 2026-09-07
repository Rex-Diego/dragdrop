import { describe, expect, it } from "vitest";
import {
  canvasPenButtonForInteraction,
  canvasPenButtonsForButton,
  canvasPenInteractionForEvent,
  createCanvasPointerEventInit,
  hasCrossedPointerDragThreshold,
  isCanvasNativeControlElement,
  isPointInsidePointerRect,
  isSurfacePenSideButton,
  matchesPointerDrag,
  shouldStartMobileBlockSelection,
  TOUCH_DRAG_THRESHOLD,
} from "../src/pointer-drag";

describe("pointer drag threshold", () => {
  it("does not turn a light tap into a drag", () => {
    expect(hasCrossedPointerDragThreshold(20, 20, 20, 20)).toBe(false);
    expect(hasCrossedPointerDragThreshold(20, 20, 27, 20)).toBe(false);
  });

  it("starts at the configured threshold in any direction", () => {
    expect(TOUCH_DRAG_THRESHOLD).toBe(8);
    expect(hasCrossedPointerDragThreshold(20, 20, 28, 20)).toBe(true);
    expect(hasCrossedPointerDragThreshold(20, 20, 14, 14)).toBe(true);
  });

  it("keeps a drag alive for unrelated pointer events", () => {
    expect(matchesPointerDrag(8, 8)).toBe(true);
    expect(matchesPointerDrag(8, 9)).toBe(false);
  });

  it("recognizes only a pen secondary button as the Surface Pen side button", () => {
    expect(isSurfacePenSideButton({ pointerType: "pen", buttons: 2 })).toBe(true);
    expect(isSurfacePenSideButton({ pointerType: "pen", buttons: 3 })).toBe(true);
    expect(isSurfacePenSideButton({ pointerType: "pen", buttons: 1 })).toBe(false);
    expect(isSurfacePenSideButton({ pointerType: "mouse", buttons: 2 })).toBe(false);
  });

  it("uses primary input for side-button selection and auxiliary input for pen panning", () => {
    expect(canvasPenButtonForInteraction("select")).toBe(0);
    expect(canvasPenButtonForInteraction("pan")).toBe(1);
    expect(canvasPenButtonsForButton(0)).toBe(1);
    expect(canvasPenButtonsForButton(1)).toBe(4);
  });

  it("maps the side button to selection and the pen tip to Canvas panning", () => {
    expect(canvasPenInteractionForEvent({ pointerType: "pen", buttons: 2 })).toBe("select");
    expect(canvasPenInteractionForEvent({ pointerType: "pen", buttons: 3 })).toBe("select");
    expect(canvasPenInteractionForEvent({ pointerType: "pen", buttons: 1 })).toBe("pan");
    expect(canvasPenInteractionForEvent({ pointerType: "pen", buttons: 4 })).toBeNull();
    expect(canvasPenInteractionForEvent({ pointerType: "pen", buttons: 0 })).toBeNull();
    expect(canvasPenInteractionForEvent({ pointerType: "mouse", buttons: 1 })).toBeNull();
  });

  it("keeps the owner window on synthetic Canvas pointer events", () => {
    const ownerWindow = {} as Window;
    const init = createCanvasPointerEventInit(
      {
        pointerId: 7,
        clientX: 10,
        clientY: 20,
        screenX: 30,
        screenY: 40,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      },
      ownerWindow,
      0,
      1,
    );

    expect(init.view).toBe(ownerWindow);
    expect(init.pointerType).toBe("mouse");
    expect(init.isPrimary).toBe(true);
    expect(init.button).toBe(0);
    expect(init.buttons).toBe(1);
  });

  it("does not let the pen enter the optional touch long-press selection mode", () => {
    expect(shouldStartMobileBlockSelection("touch")).toBe(true);
    expect(shouldStartMobileBlockSelection("pen")).toBe(false);
    expect(shouldStartMobileBlockSelection("mouse")).toBe(false);
  });

  it("keeps Canvas resize handles in the native control allowlist", () => {
    const resizeHandle = {
      closest: (selector: string) =>
        selector.includes(".canvas-node-resizer") ? {} as Element : null,
    };
    expect(isCanvasNativeControlElement(resizeHandle)).toBe(true);
  });

  it("recognizes only visible connection and edge hit rectangles", () => {
    const rect = { left: 10, right: 30, top: 20, bottom: 40, width: 20, height: 20 };
    expect(isPointInsidePointerRect(rect, 10, 20)).toBe(true);
    expect(isPointInsidePointerRect(rect, 30, 40)).toBe(true);
    expect(isPointInsidePointerRect(rect, 31, 40)).toBe(false);
    expect(isPointInsidePointerRect({ ...rect, width: 0 }, 20, 30)).toBe(false);
  });
});
