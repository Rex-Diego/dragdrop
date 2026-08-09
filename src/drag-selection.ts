import type { EditorState } from "@codemirror/state";
import type { HandleRange, SourceRange } from "./content-segmentation";

export function sourceRangesForHandle(
  state: EditorState,
  handle: HandleRange,
  handles: readonly HandleRange[],
): SourceRange[] {
  const nonEmptyRanges = state.selection.ranges.filter((range) => !range.empty);
  const handleIsSelected = nonEmptyRanges.some(
    (range) => range.from <= handle.to && range.to >= handle.from,
  );
  if (nonEmptyRanges.length === 0 || !handleIsSelected) return [handle];

  return state.selection.ranges.map((range) => {
    if (!range.empty) return { from: range.from, to: range.to };
    const found = handles.find(
      (candidate) => candidate.from <= range.from && candidate.to >= range.from,
    );
    return found ?? handle;
  });
}
