export type SelectionMenuBehavior = "native" | "hide" | "customize";

export interface SelectionMenuRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SelectionMenuSize {
  width: number;
  height: number;
}

export interface SelectionMenuViewport {
  width: number;
  height: number;
}

export interface SelectionMenuPlacement {
  left: number;
  top: number;
}

export const SELECTION_MENU_GAP = 24;
const VIEWPORT_PADDING = 8;

export function selectionMenuBehavior(seconds: number): SelectionMenuBehavior {
  if (seconds < 0) return "native";
  return seconds === 0 ? "hide" : "customize";
}

export function placeSelectionMenu(
  selection: SelectionMenuRect,
  menu: SelectionMenuSize,
  viewport: SelectionMenuViewport,
): SelectionMenuPlacement {
  const horizontalRight = selection.right + SELECTION_MENU_GAP;
  const horizontalLeft = selection.left - SELECTION_MENU_GAP - menu.width;
  const verticalBelow = selection.bottom + SELECTION_MENU_GAP;
  const verticalAbove = selection.top - SELECTION_MENU_GAP - menu.height;

  const left = horizontalRight + menu.width <= viewport.width - VIEWPORT_PADDING
    ? horizontalRight
    : horizontalLeft >= VIEWPORT_PADDING
      ? horizontalLeft
      : clamp(horizontalRight, VIEWPORT_PADDING, viewport.width - menu.width - VIEWPORT_PADDING);
  const top = verticalBelow + menu.height <= viewport.height - VIEWPORT_PADDING
    ? verticalBelow
    : verticalAbove >= VIEWPORT_PADDING
      ? verticalAbove
      : clamp(verticalBelow, VIEWPORT_PADDING, viewport.height - menu.height - VIEWPORT_PADDING);

  return { left, top };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
