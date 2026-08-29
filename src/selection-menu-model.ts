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

export interface SelectionMenuFrameTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
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

/** Convert a selection rect from an embedded document into its menu host viewport. */
export function transformSelectionMenuRect(
  selection: SelectionMenuRect,
  transform: SelectionMenuFrameTransform,
): SelectionMenuRect {
  const scale = Number.isFinite(transform.scale) && transform.scale > 0
    ? transform.scale
    : 1;
  const offsetX = Number.isFinite(transform.offsetX) ? transform.offsetX : 0;
  const offsetY = Number.isFinite(transform.offsetY) ? transform.offsetY : 0;
  return {
    left: selection.left * scale + offsetX,
    top: selection.top * scale + offsetY,
    right: selection.right * scale + offsetX,
    bottom: selection.bottom * scale + offsetY,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
