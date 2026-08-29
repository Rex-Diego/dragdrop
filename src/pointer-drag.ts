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

export type CanvasPenInteraction = "select" | "pan";

export function canvasPenButtonForInteraction(interaction: CanvasPenInteraction): 0 | 1 {
  return interaction === "pan" ? 1 : 0;
}

export function canvasPenInteractionForEvent(
  event: Pick<PointerEvent, "pointerType" | "buttons">,
): CanvasPenInteraction | null {
  if (event.pointerType !== "pen") return null;
  if (isSurfacePenSideButton(event)) return "select";
  return (event.buttons & 1) !== 0 ? "pan" : null;
}

export function canvasPenButtonsForButton(button: 0 | 1): 1 | 4 {
  return button === 1 ? 4 : 1;
}

export function isPointInsidePointerRect(
  rect: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">,
  clientX: number,
  clientY: number,
): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function createCanvasPointerEventInit(
  source: Pick<
    PointerEvent,
    | "pointerId"
    | "clientX"
    | "clientY"
    | "screenX"
    | "screenY"
    | "ctrlKey"
    | "shiftKey"
    | "altKey"
    | "metaKey"
  >,
  ownerWindow: Window,
  button: number,
  buttons: number,
): PointerEventInit {
  return {
    view: ownerWindow,
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: source.pointerId,
    pointerType: "mouse",
    isPrimary: true,
    button,
    buttons,
    clientX: source.clientX,
    clientY: source.clientY,
    screenX: source.screenX,
    screenY: source.screenY,
    ctrlKey: source.ctrlKey,
    shiftKey: source.shiftKey,
    altKey: source.altKey,
    metaKey: source.metaKey,
  };
}
