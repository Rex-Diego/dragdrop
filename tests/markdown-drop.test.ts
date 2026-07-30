import { describe, expect, it } from "vitest";
import {
  chooseMarkdownDropPosition,
  collectMarkdownDropBoundaryPositions,
  directBlockEmbed,
  directBlockEmbedLinktext,
  insertBlocksAtBoundary,
  planMarkdownMove,
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
  });
});
