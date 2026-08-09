import { describe, expect, it } from "vitest";
import { mappedSelectionSnapshot, type EditorViewSnapshot } from "../src/editor-view-state";

describe("editor view state mapping", () => {
  it("maps every selection range and keeps ranges in document order", () => {
    const snapshot: EditorViewSnapshot = {
      selection: [
        { anchor: 12, head: 15 },
        { anchor: 2, head: 4 },
      ],
      scrollTop: 240,
      scrollLeft: 6,
      focused: true,
    };

    const selection = mappedSelectionSnapshot(
      snapshot,
      (position) => position + (position >= 10 ? 20 : 3),
      30,
    );

    expect(selection.ranges.map(({ from, to }) => [from, to])).toEqual([
      [5, 7],
      [30, 30],
    ]);
  });

  it("clamps mapped positions to the new document", () => {
    const snapshot: EditorViewSnapshot = {
      selection: [{ anchor: 4, head: 10 }],
      scrollTop: 0,
      scrollLeft: 0,
      focused: false,
    };
    const selection = mappedSelectionSnapshot(snapshot, (position) => position + 100, 8);

    expect(selection.main.from).toBe(8);
    expect(selection.main.to).toBe(8);
  });

  it("coalesces ranges that overlap after a move mapping", () => {
    const snapshot: EditorViewSnapshot = {
      selection: [
        { anchor: 2, head: 5 },
        { anchor: 10, head: 14 },
      ],
      scrollTop: 0,
      scrollLeft: 0,
      focused: true,
    };

    const selection = mappedSelectionSnapshot(
      snapshot,
      (position) => (position >= 10 ? position - 8 : position),
      20,
    );

    expect(selection.ranges.map(({ from, to }) => [from, to])).toEqual([[2, 6]]);
  });
});
