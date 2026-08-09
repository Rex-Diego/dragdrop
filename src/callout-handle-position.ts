export type CalloutHandleSide = "left" | "right";

export interface CalloutGutterGeometry {
  contentLeft: number;
  contentRight: number;
  lineStart: number;
  markerLeft: number;
  markerRight: number;
  previousOffset: number;
}

export function calloutGutterOffset(
  side: CalloutHandleSide,
  geometry: CalloutGutterGeometry,
): number {
  const baseLeft = geometry.markerLeft - geometry.previousOffset;
  const baseRight = geometry.markerRight - geometry.previousOffset;
  const target = side === "right"
    ? geometry.contentRight
    : geometry.lineStart ?? geometry.contentLeft;
  return target - (side === "right" ? baseRight : baseLeft);
}
