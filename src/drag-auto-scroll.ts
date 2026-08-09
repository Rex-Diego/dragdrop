export interface EdgeScrollDelta {
  x: number;
  y: number;
}

function edgeSpeed(distance: number, edge: number, maximum: number): number {
  if (distance >= edge) return 0;
  return maximum * (1 - Math.max(0, distance) / edge);
}

export function edgeScrollDelta(
  point: { x: number; y: number },
  viewport: { left: number; top: number; right: number; bottom: number },
  edge: number,
  maximum: number,
): EdgeScrollDelta {
  const safeEdge = Math.max(1, edge);
  const safeMaximum = Math.max(0, maximum);
  const left = edgeSpeed(point.x - viewport.left, safeEdge, safeMaximum);
  const right = edgeSpeed(viewport.right - point.x, safeEdge, safeMaximum);
  const top = edgeSpeed(point.y - viewport.top, safeEdge, safeMaximum);
  const bottom = edgeSpeed(viewport.bottom - point.y, safeEdge, safeMaximum);

  return {
    x: right > 0 ? right : left > 0 ? -left : 0,
    y: bottom > 0 ? bottom : top > 0 ? -top : 0,
  };
}
