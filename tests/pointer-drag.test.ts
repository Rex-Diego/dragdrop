import { describe, expect, it } from "vitest";
import {
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
});
