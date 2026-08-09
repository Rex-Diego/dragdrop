import { describe, expect, it } from "vitest";
import {
  blockSelectionKey,
  extendBlockSelection,
  isBlockSelectionHandleSelected,
  toggleBlockSelection,
} from "../src/block-selection";
import type { HandleRange } from "../src/content-segmentation";

function handle(from: number, to: number): HandleRange {
  return { from, to, kind: "paragraph" };
}

describe("block selection model", () => {
  it("extends a selection in document order regardless of drag direction", () => {
    const handles = [handle(0, 4), handle(6, 10), handle(12, 18)];

    expect(extendBlockSelection(handles, 12, 0)).toEqual(handles);
    expect(extendBlockSelection(handles, 6, 12)).toEqual(handles.slice(1));
  });

  it("rejects anchors that are not current handles", () => {
    expect(extendBlockSelection([handle(0, 4)], 1, 0)).toEqual([]);
  });

  it("uses stable range keys for handle state", () => {
    const selected = new Set([blockSelectionKey(handle(6, 10))]);

    expect(isBlockSelectionHandleSelected(selected, handle(6, 10))).toBe(true);
    expect(isBlockSelectionHandleSelected(selected, handle(0, 4))).toBe(false);
  });

  it("adds and removes non-contiguous handles", () => {
    const handles = [handle(0, 4), handle(6, 10), handle(12, 18)];

    expect(toggleBlockSelection(handles, [handles[0]], handles[2])).toEqual([
      handles[0],
      handles[2],
    ]);
    expect(toggleBlockSelection(handles, [handles[0], handles[2]], handles[0])).toEqual([
      handles[2],
    ]);
  });
});
