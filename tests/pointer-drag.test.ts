import { describe, expect, it } from "vitest";
import {
  canvasPenButtonForInteraction,
  canvasPenButtonsForButton,
  createCanvasPointerEventInit,
  hasCrossedPointerDragThreshold,
  isSurfacePenSideButton,
  matchesPointerDrag,
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

  it("uses primary input for nodes and auxiliary input for canvas panning", () => {
    expect(canvasPenButtonForInteraction("node")).toBe(0);
    expect(canvasPenButtonForInteraction("pan")).toBe(1);
    expect(canvasPenButtonsForButton(0)).toBe(1);
    expect(canvasPenButtonsForButton(1)).toBe(4);
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
});
