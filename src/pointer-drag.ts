export const TOUCH_DRAG_THRESHOLD = 8;

export function hasCrossedPointerDragThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) >= TOUCH_DRAG_THRESHOLD;
}

export function matchesPointerDrag(activePointerId: number, eventPointerId: number): boolean {
  return activePointerId === eventPointerId;
}

export function isSurfacePenSideButton(
  event: Pick<PointerEvent, "pointerType" | "buttons">,
): boolean {
  return event.pointerType === "pen" && (event.buttons & 2) !== 0;
}
