import type { HandleRange } from "./content-segmentation";

export function blockSelectionKey(range: Pick<HandleRange, "from" | "to">): string {
  return `${range.from}:${range.to}`;
}

export function extendBlockSelection(
  handles: readonly HandleRange[],
  anchorFrom: number,
  focusFrom: number,
): HandleRange[] {
  const anchorIndex = handles.findIndex((handle) => handle.from === anchorFrom);
  const focusIndex = handles.findIndex((handle) => handle.from === focusFrom);
  if (anchorIndex < 0 || focusIndex < 0) return [];

  const from = Math.min(anchorIndex, focusIndex);
  const to = Math.max(anchorIndex, focusIndex);
  return handles.slice(from, to + 1);
}

export function isBlockSelectionHandleSelected(
  selected: ReadonlySet<string>,
  range: Pick<HandleRange, "from" | "to">,
): boolean {
  return selected.has(blockSelectionKey(range));
}

export function toggleBlockSelection(
  handles: readonly HandleRange[],
  selected: readonly HandleRange[],
  target: HandleRange,
): HandleRange[] {
  const selectedKeys = new Set(selected.map((range) => blockSelectionKey(range)));
  const targetKey = blockSelectionKey(target);
  if (selectedKeys.has(targetKey)) selectedKeys.delete(targetKey);
  else selectedKeys.add(targetKey);
  return handles.filter((range) => selectedKeys.has(blockSelectionKey(range)));
}
