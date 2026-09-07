import { describe, expect, it } from "vitest";
import {
  chooseMarkdownDropPosition,
  collectMarkdownDropBoundaryPositions,
  directBlockEmbed,
  directBlockEmbedLinktext,
  insertBlocksAtBoundary,
  mapPositionAfterInsertion,
  mapPositionAfterMove,
  planMarkdownMove,
  planMarkdownMoveChanges,
  requiresMoveConfirmation,
} from "../src/markdown-drop";
import type { SourceUnit } from "../src/model";

function block(from: number, to: number, text: string, existingBlockId?: string): SourceUnit {
  return {
    from,
    to,
    text,
    kind: "paragraph",
    existingBlockId,
  };
}

describe("Markdown drop planning", () => {
  it.each(["\n", "\n\n"])("preserves terminal newlines %j when moving in either direction", (end) => {
    const content = `Alpha\n\nBravo\n\nCharlie${end}`;
    expect(planMarkdownMove(content, [{ from: 7, to: 12, text: "Bravo" }], content.length))
      .toBe(`Alpha\n\nCharlie\n\nBravo${end}`);
    expect(planMarkdownMove(content, [{ from: 14, to: 21, text: "Charlie" }], 0))
      .toBe(`Charlie\n\nAlpha\n\nBravo${end}`);
  });

  it("preserves different gaps inside a contiguous multi-block selection", () => {
    const content = "Intro\n\n- A\n- B\n\n- C\n\nEnd";
    const blocks = ["- A", "- B", "- C"].map((text) => ({ from: content.indexOf(text), to: content.indexOf(text) + text.length, text }));
    const plan = planMarkdownMoveChanges(content, blocks, content.length);
    expect(plan.after).toBe("Intro\n\nEnd\n\n- A\n- B\n\n- C");
    expect(plan.mapPosition(content.indexOf("B"))).toBe(plan.after.indexOf("B"));
    expect(plan.mapPosition(content.indexOf("C"))).toBe(plan.after.indexOf("C"));
  });
  it("maps each selected block to its own new position including indent changes", () => {
    const content = "- A\n- B\n- C\n- D";
    const plan = planMarkdownMoveChanges(content, [
      { from: 8, to: 11, text: "  - C" },
      { from: 0, to: 3, text: "  - A" },
    ], content.length);
    expect(plan.after).toBe("- B\n- D\n  - A\n  - C");
    expect(plan.mapPosition(2)).toBe(plan.after.indexOf("A"));
    expect(plan.mapPosition(10)).toBe(plan.after.indexOf("C"));
  });

  it.each(["\n", "\n\n", "\n\n\n"])("moves the last block to the start with separator %j", (separator) => {
    const content = ["Alpha", "Bravo", "Charlie"].join(separator);
    const from = content.indexOf("Charlie");
    expect(planMarkdownMove(content, [{ from, to: content.length, text: "Charlie" }], 0))
      .toBe(["Charlie", "Alpha", "Bravo"].join(separator));
  });
  it("exposes every nested block boundary instead of only the outer range", () => {
    expect(
      collectMarkdownDropBoundaryPositions(40, [
        { from: 0, to: 40 },
        { from: 8, to: 14 },
        { from: 22, to: 28 },
      ]),
    ).toEqual([0, 8, 14, 22, 28, 40]);
  });

  it("chooses the closest visible boundary and uses document position to break ties", () => {
    const boundaries = [
      { position: 0, top: 10 },
      { position: 10, top: 30 },
      { position: 20, top: 50 },
    ];
    expect(chooseMarkdownDropPosition(12, 44, boundaries)).toBe(20);
    expect(chooseMarkdownDropPosition(18, 40, boundaries)).toBe(20);
  });

  it("keeps an existing block embed unchanged when it is copied", () => {
    expect(directBlockEmbed("  ![[Book#^existing|short name]]  ")).toBe(
      "![[Book#^existing|short name]]",
    );
    expect(directBlockEmbed("A paragraph with ![[Book#^existing]]")).toBeNull();
    expect(directBlockEmbedLinktext("![[Book#^existing|short name]]")).toBe(
      "Book#^existing",
    );
  });

  it("moves a block within the same file using the original offset safely", () => {
    const content = "Alpha\n\nBravo\n\nCharlie";
    const from = content.indexOf("Bravo");
    const to = from + "Bravo".length;

    expect(
      planMarkdownMove(content, [{ from, to, text: "Bravo" }], content.length),
    ).toBe("Alpha\n\nCharlie\n\nBravo");
    expect(content).toBe("Alpha\n\nBravo\n\nCharlie");
  });

  it("preserves a single line break when moving a block in a compact file", () => {
    const content = "Alpha\nBravo\nCharlie";
    const from = content.indexOf("Bravo");
    const to = from + "Bravo".length;

    expect(
      planMarkdownMove(content, [{ from, to, text: "Bravo" }], content.length),
    ).toBe("Alpha\nCharlie\nBravo");
  });

  it("keeps the destination gap when moving a block to a line boundary", () => {
    const content = "Bravo\nAlpha\n\nCharlie";
    const from = 0;
    const to = "Bravo".length;
    const target = content.indexOf("Charlie");

    expect(
      planMarkdownMove(content, [{ from, to, text: "Bravo" }], target),
    ).toBe("Alpha\n\nBravo\n\nCharlie");
  });

  it("maps fold anchors with a moved block and an insertion boundary", () => {
    const content = "Alpha\n\nBravo\n\nCharlie";
    const from = content.indexOf("Bravo");
    const to = from + "Bravo".length;
    const moved = [{ from, to, text: "Bravo" }];

    expect(mapPositionAfterMove(content, moved, content.length, from)).toBe(
      "Alpha\n\nCharlie\n\n".length,
    );
    expect(
      mapPositionAfterMove(content, moved, content.length, content.indexOf("Charlie")),
    ).toBe("Alpha\n\n".length);
    expect(mapPositionAfterInsertion("Alpha\n\nCharlie", 14, ["![[Bravo#^id]]"], 14)).toBe(
      14 + "\n\n![[Bravo#^id]]".length,
    );
  });

  it("maps positions using the same compact insertion used by the move", () => {
    const content = "Alpha\nBravo\nCharlie";
    const from = content.indexOf("Bravo");
    const to = from + "Bravo".length;

    expect(mapPositionAfterMove(content, [{ from, to, text: "Bravo" }], content.length, from)).toBe(
      "Alpha\nCharlie\n".length,
    );
    expect(
      mapPositionAfterMove(content, [{ from, to, text: "Bravo" }], content.length, content.indexOf("Charlie")),
    ).toBe("Alpha\n".length);
  });

  it("keeps multiple blocks together and rejects overlapping ranges before changing content", () => {
    const content = "Alpha\n\nBravo\n\nCharlie\n\nDelta";
    const bravoFrom = content.indexOf("Bravo");
    const charlieFrom = content.indexOf("Charlie");

    expect(
      planMarkdownMove(
        content,
        [
          { from: bravoFrom, to: bravoFrom + 5, text: "Bravo" },
          { from: charlieFrom, to: charlieFrom + 7, text: "Charlie" },
        ],
        content.length,
      ),
    ).toBe("Alpha\n\nDelta\n\nBravo\n\nCharlie");

    expect(() =>
      planMarkdownMove(
        content,
        [
          { from: bravoFrom, to: charlieFrom, text: "Bravo\n\nCharlie" },
          { from: charlieFrom - 1, to: charlieFrom + 7, text: "Charlie" },
        ],
        0,
      ),
    ).toThrow("overlap");
    expect(content).toBe("Alpha\n\nBravo\n\nCharlie\n\nDelta");
  });

  it("inserts one embed per dragged block", () => {
    expect(
      insertBlocksAtBoundary("Destination", "Destination".length, [
        "![[Book#^first]]",
        "![[Book#^second]]",
      ]),
    ).toBe("Destination\n\n![[Book#^first]]\n\n![[Book#^second]]");
  });

  it("detects existing block IDs before a move confirmation", () => {
    expect(requiresMoveConfirmation([block(0, 5, "plain")])).toBe(false);
    expect(requiresMoveConfirmation([block(0, 5, "plain", "quoted")] )).toBe(true);
    expect(
      requiresMoveConfirmation([block(0, 5, "plain", "quoted")], "same-file"),
    ).toBe(false);
    expect(
      requiresMoveConfirmation([block(0, 5, "plain", "quoted")], "cross-file"),
    ).toBe(true);
  });
});
