import { EditorState } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyBlockIdInsertions,
  createRandomBlockId,
  ensurePlannedReference,
  isValidBlockId,
  sourceSubpath,
} from "../src/block-reference";
import type { SourceUnit } from "../src/model";

function createState(doc: string): EditorState {
  return EditorState.create({ doc });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("block references", () => {
  it("creates valid block IDs and rejects unsupported characters", () => {
    expect(createRandomBlockId()).toMatch(/^[0-9a-f]{6}$/);
    expect(createRandomBlockId(12)).toMatch(/^[0-9a-f]{12}$/);

    for (const valid of ["a", "abc123", "ABC-xyz-09"]) {
      expect(isValidBlockId(valid)).toBe(true);
    }
    for (const invalid of ["", "has space", "under_score", "^prefixed", "中文"]) {
      expect(isValidBlockId(invalid)).toBe(false);
    }
  });

  it("reuses existing IDs and retries generated collisions", () => {
    const state = createState("Alpha");
    const existing: SourceUnit = {
      from: 0,
      to: state.doc.length,
      text: "Alpha",
      kind: "paragraph",
      existingBlockId: "keep-id",
    };
    const existingIds = new Set(["reserved"]);

    expect(ensurePlannedReference(state, existing, existingIds)).toEqual({
      ...existing,
      plannedBlockId: "keep-id",
    });
    expect(existingIds).toEqual(new Set(["reserved", "keep-id"]));

    const randomValues = [
      ...Array<number>(6).fill(0),
      ...Array<number>(6).fill(1 / 16),
    ];
    vi.spyOn(Math, "random").mockImplementation(
      () => randomValues.shift() ?? 1 / 16,
    );
    const usedIds = new Set(["000000"]);
    const planned = ensurePlannedReference(
      state,
      { ...existing, existingBlockId: undefined },
      usedIds,
    );

    expect(planned.plannedBlockId).toBe("111111");
    expect(usedIds).toEqual(new Set(["000000", "111111"]));
  });

  it("uses heading subpaths without planning a block ID", () => {
    const state = createState("## Section name");
    const heading: SourceUnit = {
      from: 0,
      to: state.doc.length,
      text: "## Section name",
      kind: "heading",
      heading: "Section name",
      headingLevel: 2,
    };
    const usedIds = new Set<string>();

    expect(ensurePlannedReference(state, heading, usedIds)).toBe(heading);
    expect(sourceSubpath(heading)).toBe("#Section name");
    expect(usedIds.size).toBe(0);
  });

  it("places inline IDs at line ends and standalone IDs after their anchor", () => {
    vi.spyOn(Math, "random").mockReturnValue(2 / 16);
    const state = createState(
      ["Paragraph", "- Parent", "  continuation", "```", "code", "```"].join(
        "\n",
      ),
    );
    const paragraphLine = state.doc.line(1);
    const listFirstLine = state.doc.line(2);
    const listLastLine = state.doc.line(3);
    const codeFirstLine = state.doc.line(4);
    const codeLastLine = state.doc.line(6);

    const paragraph = ensurePlannedReference(
      state,
      {
        from: paragraphLine.from,
        to: paragraphLine.to,
        text: paragraphLine.text,
        kind: "paragraph",
      },
      new Set(),
    );
    const listItem = ensurePlannedReference(
      state,
      {
        from: listFirstLine.from,
        to: listLastLine.to,
        text: state.doc.sliceString(listFirstLine.from, listLastLine.to),
        kind: "list-item",
        blockIdPlacement: "inline",
        anchorTo: listLastLine.to,
      },
      new Set(),
    );
    const code = ensurePlannedReference(
      state,
      {
        from: codeFirstLine.from,
        to: codeLastLine.to,
        text: state.doc.sliceString(codeFirstLine.from, codeLastLine.to),
        kind: "code",
        blockIdPlacement: "standalone",
        anchorTo: codeLastLine.to,
      },
      new Set(),
    );

    expect(paragraph.blockIdInsert).toEqual({
      pos: paragraphLine.to,
      text: " ^222222",
    });
    expect(listItem.blockIdInsert).toEqual({
      pos: listLastLine.to,
      text: " ^222222",
    });
    expect(code.blockIdInsert).toEqual({
      pos: codeLastLine.to,
      text: "\n^222222",
    });
  });

  it("applies multiple insertions in one update without shifting later positions", () => {
    const state = createState(["Alpha", "", "Beta", "", "Gamma"].join("\n"));
    const alphaEnd = state.doc.line(1).to;
    const betaEnd = state.doc.line(3).to;
    const gammaEnd = state.doc.line(5).to;
    const units: SourceUnit[] = [
      {
        from: state.doc.line(5).from,
        to: gammaEnd,
        text: "Gamma",
        kind: "paragraph",
        blockIdInsert: { pos: gammaEnd, text: " ^cccccc" },
      },
      {
        from: 0,
        to: alphaEnd,
        text: "Alpha",
        kind: "paragraph",
        blockIdInsert: { pos: alphaEnd, text: " ^aaaaaa" },
      },
      {
        from: state.doc.line(3).from,
        to: betaEnd,
        text: "Beta",
        kind: "paragraph",
        blockIdInsert: { pos: betaEnd, text: " ^bbbbbb" },
      },
    ];
    let updatedState = state;
    let dispatchCount = 0;

    applyBlockIdInsertions(
      state,
      (transaction) => {
        dispatchCount += 1;
        updatedState = transaction.state;
      },
      units,
    );

    expect(dispatchCount).toBe(1);
    expect(updatedState.doc.toString()).toBe(
      ["Alpha ^aaaaaa", "", "Beta ^bbbbbb", "", "Gamma ^cccccc"].join(
        "\n",
      ),
    );
  });

  it("keeps a child inline ID before a parent standalone ID at the same offset", () => {
    const state = createState(["- Parent", "  - Child"].join("\n"));
    const childEnd = state.doc.line(2).to;
    const units: SourceUnit[] = [
      {
        from: 0,
        to: state.doc.line(1).to,
        text: "- Parent",
        kind: "list-item",
        blockIdInsert: { pos: childEnd, text: "\n^parent" },
      },
      {
        from: state.doc.line(2).from,
        to: childEnd,
        text: "  - Child",
        kind: "list-item",
        blockIdInsert: { pos: childEnd, text: " ^child" },
      },
    ];
    let updatedState = state;

    applyBlockIdInsertions(
      state,
      (transaction) => {
        updatedState = transaction.state;
      },
      units,
    );

    expect(updatedState.doc.toString()).toBe(
      ["- Parent", "  - Child ^child", "^parent"].join("\n"),
    );
  });

  it("keeps exactly one space between body text and an inline ID", () => {
    vi.spyOn(Math, "random").mockReturnValue(3 / 16);
    const state = createState("Callout body   ");
    const line = state.doc.line(1);
    const planned = ensurePlannedReference(
      state,
      {
        from: line.from,
        to: line.to,
        text: line.text,
        kind: "callout",
      },
      new Set(),
    );

    expect(planned.blockIdInsert).toEqual({
      pos: "Callout body".length,
      text: " ^333333",
    });
  });
});
