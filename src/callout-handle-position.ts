export type CalloutHandleSide = "left" | "right";

export interface CalloutGutterGeometry {
  lineLeft: number;
  lineRight: number;
  markerLeft: number;
  markerRight: number;
  previousOffset: number;
  gap: number;
}

export function calloutGutterOffset(
  side: CalloutHandleSide,
  geometry: CalloutGutterGeometry,
): number {
  const baseLeft = geometry.markerLeft - geometry.previousOffset;
  const baseRight = geometry.markerRight - geometry.previousOffset;
  return side === "right"
    ? geometry.lineRight + geometry.gap - baseLeft
    : geometry.lineLeft - geometry.gap - baseRight;
}
