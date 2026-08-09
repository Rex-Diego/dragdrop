import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { sourceRangesForHandle } from "../src/drag-selection";
import type { HandleRange } from "../src/content-segmentation";

function handle(from: number, to: number): HandleRange {
  return { from, to, kind: "paragraph" };
}

describe("drag source selection", () => {
  it("uses only the handle when the editor has no selected range", () => {
    const state = EditorState.create({ doc: "Alpha\nBravo" });
    const selected = handle(6, 11);

    expect(sourceRangesForHandle(state, selected, [handle(0, 5), selected])).toEqual([
      selected,
    ]);
  });

  it("preserves a multi-range selection and maps cursors to their blocks", () => {
    const state = EditorState.create({
      doc: "Alpha\nBravo\nCharlie",
      extensions: [EditorState.allowMultipleSelections.of(true)],
      selection: EditorSelection.create([
        EditorSelection.range(0, 5),
        EditorSelection.cursor(14),
      ]),
    });
    const first = handle(0, 5);
    const second = handle(6, 11);
    const third = handle(12, 18);

    expect(sourceRangesForHandle(state, first, [first, second, third])).toEqual([
      { from: 0, to: 5 },
      third,
    ]);
  });

  it("falls back to the dragged handle when the selection is elsewhere", () => {
    const state = EditorState.create({
      doc: "Alpha\nBravo",
      selection: { anchor: 6, head: 11 },
    });
    const dragged = handle(0, 5);

    expect(sourceRangesForHandle(state, dragged, [dragged, handle(6, 11)])).toEqual([
      dragged,
    ]);
  });
});
