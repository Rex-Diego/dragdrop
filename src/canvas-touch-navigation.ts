import type { ObsidianCanvas } from "./canvas-types";

interface NavigationCanvas extends ObsidianCanvas {
  panBy(x: number, y: number): void;
  zoomBy(delta: number, center: { x: number; y: number }): void;
  domPosFromEvt(event: MouseEvent): { x: number; y: number };
}

export function supportsCanvasNavigation(canvas: ObsidianCanvas): canvas is NavigationCanvas {
  const candidate = canvas as Partial<NavigationCanvas>;
  return typeof candidate.panBy === "function" && typeof candidate.zoomBy === "function" &&
    typeof candidate.posFromEvt === "function" && typeof candidate.domPosFromEvt === "function";
}

/** Owns finger navigation only; Canvas retains its viewport math and limits. */
export class CanvasTouchNavigation {
  readonly pointers = new Map<number, PointerEvent>();

  constructor(readonly target: Element, private readonly canvas: NavigationCanvas) {}

  add(event: PointerEvent): boolean {
    try {
      this.target.setPointerCapture(event.pointerId);
    } catch {
      return false;
    }
    this.pointers.set(event.pointerId, event);
    return true;
  }

  move(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    const before = this.sample();
    this.pointers.set(event.pointerId, event);
    const after = this.sample();
    const oldPosition = this.canvas.posFromEvt(before.center);
    const newPosition = this.canvas.posFromEvt(after.center);
    this.canvas.panBy(oldPosition.x - newPosition.x, oldPosition.y - newPosition.y);
    if (before.distance > 0 && after.distance > 0) {
      this.canvas.zoomBy(Math.log2(after.distance / before.distance), this.canvas.domPosFromEvt(after.center));
    }
  }

  remove(pointerId: number): void {
    // Forget before releasing: lostpointercapture can fire synchronously.
    this.pointers.delete(pointerId);
    try {
      if (this.target.hasPointerCapture(pointerId)) this.target.releasePointerCapture(pointerId);
    } catch {
      // The Canvas document may have closed.
    }
  }

  clear(): void {
    for (const pointerId of this.pointers.keys()) this.remove(pointerId);
  }

  private sample(): { center: MouseEvent; distance: number } {
    const [first, second] = Array.from(this.pointers.values());
    // Coordinate-only inputs to Canvas's existing conversion methods.
    const center = {
      clientX: second ? (first.clientX + second.clientX) / 2 : first.clientX,
      clientY: second ? (first.clientY + second.clientY) / 2 : first.clientY,
    } as MouseEvent;
    return { center, distance: second ? Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) : 0 };
  }
}
