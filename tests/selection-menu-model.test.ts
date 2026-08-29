import { describe, expect, it } from "vitest";
import {
  SELECTION_MENU_GAP,
  placeSelectionMenu,
  selectionMenuBehavior,
  transformSelectionMenuRect,
} from "../src/selection-menu-model";

describe("selection menu behavior", () => {
  it("keeps native behavior, hides, or customizes according to the timeout", () => {
    expect(selectionMenuBehavior(-1)).toBe("native");
    expect(selectionMenuBehavior(0)).toBe("hide");
    expect(selectionMenuBehavior(0.7)).toBe("customize");
    expect(selectionMenuBehavior(3)).toBe("customize");
  });

  it("places the menu below and to the right when there is room", () => {
    expect(placeSelectionMenu(
      { left: 100, top: 80, right: 200, bottom: 110 },
      { width: 160, height: 120 },
      { width: 600, height: 500 },
    )).toEqual({ left: 200 + SELECTION_MENU_GAP, top: 110 + SELECTION_MENU_GAP });
  });

  it("uses the opposite side before clamping the menu into the viewport", () => {
    expect(placeSelectionMenu(
      { left: 450, top: 350, right: 490, bottom: 380 },
      { width: 120, height: 90 },
      { width: 600, height: 500 },
    )).toEqual({ left: 450 - SELECTION_MENU_GAP - 120, top: 350 - SELECTION_MENU_GAP - 90 });
  });

  it("keeps oversized menus inside the viewport padding", () => {
    expect(placeSelectionMenu(
      { left: 10, top: 10, right: 20, bottom: 20 },
      { width: 700, height: 600 },
      { width: 500, height: 400 },
    )).toEqual({ left: 8, top: 8 });
  });

  it("maps Canvas iframe selection coordinates into the menu host viewport", () => {
    expect(transformSelectionMenuRect(
      { left: 10, top: 20, right: 110, bottom: 60 },
      { offsetX: 300, offsetY: 40, scale: 1.5 },
    )).toEqual({ left: 315, top: 70, right: 465, bottom: 130 });
  });

  it("uses finite identity defaults for an unavailable frame transform", () => {
    expect(transformSelectionMenuRect(
      { left: 10, top: 20, right: 110, bottom: 60 },
      { offsetX: Number.NaN, offsetY: Number.POSITIVE_INFINITY, scale: 0 },
    )).toEqual({ left: 10, top: 20, right: 110, bottom: 60 });
  });
});
