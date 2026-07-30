import type { CanvasNode, ObsidianCanvas } from "../src/canvas-types";
import {
  buildAtomicNoteContent,
  collectCanvasSummaryItems,
  sortCanvasSelection,
} from "../src/canvas-summary-model";
import { describe, expect, it } from "vitest";

function node(
  id: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
): CanvasNode {
  return {
    id,
    x,
    y,
    width: 200,
    height: 100,
    canvas: {} as ObsidianCanvas,
    render: () => undefined,
    ...extra,
  };
}

describe("Canvas atomic note planning", () => {
  it("sorts selection by visual y then x instead of Set insertion order", () => {
    const selection = new Set([
      node("right", 300, 200),
      node("top", 600, 100),
      node("left", 100, 200),
    ]);

    expect(sortCanvasSelection(selection).map(({ id }) => id)).toEqual([
      "top",
      "left",
      "right",
    ]);
  });

  it("preserves file subpaths, whole-file embeds, and text node content", () => {
    const items = collectCanvasSummaryItems([
      node("text", 0, 0, { text: "My own judgment." }),
      node("whole-file", 0, 20, {
        file: { path: "Books/Other.md" },
        filePath: "Books/Other.md",
      }),
      node("block", 0, 10, {
        file: { path: "Books/Source.md" },
        filePath: "Books/Source.md",
        subpath: "#^abc123",
      }),
    ]);

    expect(buildAtomicNoteContent(items, (filePath) => filePath.replace(/\.md$/, ""))).toBe(
      "---\nup:\ntopics:\ntags:\nrank:\n---\n\nMy own judgment.\n\n![[Books/Source#^abc123]]\n\n![[Books/Other]]",
    );
  });

  it("stops with no expressible items for an empty or unsupported selection", () => {
    expect(collectCanvasSummaryItems([])).toEqual([]);
    expect(collectCanvasSummaryItems([node("edge", 0, 0)])).toEqual([]);
  });
});
