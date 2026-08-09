import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  buildHandleRanges,
  collectSourceUnits,
  previewMarkdownForUnits,
  type SourceRange,
} from "../src/content-segmentation";
import {
  applyBlockIdInsertions,
  ensurePlannedReference,
  sourceSubpath,
} from "../src/block-reference";
import type { ListParentDisplay, SourceUnit } from "../src/model";

function createMarkdownState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown()],
  });
}

function collectAll(
  doc: string,
  splitListItems = true,
  listParentDisplay: ListParentDisplay = "native-subtree",
): { state: EditorState; units: SourceUnit[] } {
  const state = createMarkdownState(doc);
  return {
    state,
    units: collectSourceUnits(
      state,
      [{ from: 0, to: state.doc.length }],
      splitListItems,
      listParentDisplay,
    ),
  };
}

describe("content segmentation", () => {
  it("keeps a callout lazy continuation in one blank-line-delimited block", () => {
    const blockId = "2026-05-04-14-03-06";
    const doc = [
      `> [!PDF|] [[课程097 教言讲解合集.pdf#page=764&selection=12,0,20,20|p.758]] ^${blockId}`,
      "藏传佛教以阿底峡尊者所造的《菩提道灯论》为基础，把学佛的次第分为三士道。因此，龙钦巴尊者所造的《大圆满心性休息》，以及宗喀巴大师所造的《菩提道次第广论》，都宣讲了三士道的修行次第。",
    ].join("\n");
    const state = createMarkdownState(doc);

    const handles = buildHandleRanges(state);
    expect(handles).toEqual([
      { from: 0, to: doc.length, kind: "callout" },
    ]);

    const units = collectSourceUnits(
      state,
      handles,
      true,
      "native-subtree",
    );
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      from: 0,
      to: doc.length,
      text: doc,
      kind: "callout",
      existingBlockId: blockId,
      anchorFrom: 0,
      anchorTo: doc.length,
    });

    const usedIds = new Set<string>();
    const planned = ensurePlannedReference(state, units[0], usedIds);
    expect(planned.plannedBlockId).toBe(blockId);
    expect(planned.blockIdInsert).toBeUndefined();
    expect(sourceSubpath(planned)).toBe(`#^${blockId}`);
    expect(usedIds).toEqual(new Set([blockId]));
    expect(previewMarkdownForUnits(units)).toBe(doc.trim());

    let dispatchCount = 0;
    applyBlockIdInsertions(state, () => {
      dispatchCount += 1;
    }, [planned]);
    expect(dispatchCount).toBe(0);
  });

  it("keeps opening-line IDs across explicit and lazy quote continuations", () => {
    const cases = [
      {
        doc: ["> Quote ^quote-id", "lazy quote body"].join("\n"),
        kind: "quote",
        blockId: "quote-id",
      },
      {
        doc: [
          "> [!note] Title ^callout-id",
          "> explicitly quoted body",
          "lazy callout tail",
        ].join("\n"),
        kind: "callout",
        blockId: "callout-id",
      },
    ] as const;

    for (const { doc, kind, blockId } of cases) {
      const state = createMarkdownState(doc);
      const handles = buildHandleRanges(state);
      expect(handles).toEqual([{ from: 0, to: doc.length, kind }]);

      const units = collectSourceUnits(
        state,
        handles,
        true,
        "native-subtree",
      );
      expect(units).toHaveLength(1);
      expect(units[0]).toMatchObject({
        text: doc,
        kind,
        existingBlockId: blockId,
      });
    }
  });

  it("reuses a block ID placed on an interior Callout line", () => {
    const doc = [
      "> [!note] Header",
      "> Callout body ^interior-callout-id",
      "> lazy continuation",
    ].join("\n");
    const state = createMarkdownState(doc);
    const units = collectSourceUnits(
      state,
      buildHandleRanges(state),
      true,
      "native-subtree",
    );

    expect(units).toHaveLength(1);
    expect(units[0].existingBlockId).toBe("interior-callout-id");

    const planned = ensurePlannedReference(state, units[0], new Set());
    expect(planned.plannedBlockId).toBe("interior-callout-id");
    expect(planned.blockIdInsert).toBeUndefined();
    expect(sourceSubpath(planned)).toBe("#^interior-callout-id");
  });

  it("adds one inline ID at the end of the final lazy callout line", () => {
    const doc = ["> [!PDF] reference", "lazy body"].join("\n");
    const state = createMarkdownState(doc);
    const units = collectSourceUnits(
      state,
      buildHandleRanges(state),
      true,
      "native-subtree",
    );
    const planned = ensurePlannedReference(state, units[0], new Set());

    expect(units).toHaveLength(1);
    expect(planned.plannedBlockId).toMatch(/^[0-9a-f]{6}$/);
    expect(planned.blockIdInsert).toEqual({
      pos: state.doc.line(2).to,
      text: ` ^${planned.plannedBlockId}`,
    });

    let updatedState = state;
    applyBlockIdInsertions(
      state,
      (transaction) => {
        updatedState = transaction.state;
      },
      [planned],
    );
    expect(updatedState.doc.toString()).toBe(
      `${doc} ^${planned.plannedBlockId ?? ""}`,
    );
  });

  it("stops a lazy callout at blank lines and explicit Markdown blocks", () => {
    const suffixes = [
      { markdown: "body", expectedKind: "paragraph" },
      { markdown: "# Heading", expectedKind: "heading" },
      { markdown: "- item", expectedKind: "list-item" },
      { markdown: ["```ts", "value", "```"].join("\n"), expectedKind: "code" },
      { markdown: ["| A |", "| --- |", "| B |"].join("\n"), expectedKind: "table" },
      { markdown: ["$$", "x", "$$"].join("\n"), expectedKind: "math" },
    ] as const;

    for (const { markdown, expectedKind } of suffixes) {
      const separator = expectedKind === "paragraph" ? "\n\n" : "\n";
      const doc = `> [!note] Header ^header-id${separator}${markdown}`;
      const state = createMarkdownState(doc);
      const units = collectSourceUnits(
        state,
        [{ from: 0, to: state.doc.length }],
        true,
        "native-subtree",
      );

      expect(units.map((unit) => unit.kind)).toEqual([
        "callout",
        expectedKind,
      ]);
      expect(units[0]).toMatchObject({
        text: "> [!note] Header ^header-id",
        existingBlockId: "header-id",
      });
    }
  });

  it("uses a standalone marker after a lazy callout without including it in the unit", () => {
    const block = ["> [!note] Header", "lazy body"].join("\n");
    const doc = `${block}\n^keep-id`;
    const state = createMarkdownState(doc);
    const handles = buildHandleRanges(state);
    const units = collectSourceUnits(
      state,
      handles,
      true,
      "native-subtree",
    );

    expect(handles).toEqual([{ from: 0, to: block.length, kind: "callout" }]);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      text: block,
      existingBlockId: "keep-id",
    });
  });

  it("keeps an unindented lazy continuation in its list item until a blank line", () => {
    const firstItem = ["- Item", "lazy continuation"].join("\n");
    const doc = [firstItem, "", "After list"].join("\n");
    const state = createMarkdownState(doc);
    const handles = buildHandleRanges(state);
    const units = collectSourceUnits(
      state,
      [{ from: 0, to: state.doc.length }],
      true,
      "self-only",
    );

    expect(handles.map(({ from, to, kind }) => ({ from, to, kind }))).toEqual([
      { from: 0, to: firstItem.length, kind: "list-item" },
      {
        from: doc.indexOf("After list"),
        to: doc.length,
        kind: "paragraph",
      },
    ]);
    expect(units.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "list-item", text: firstItem },
      { kind: "paragraph", text: "After list" },
    ]);
  });

  it("keeps paragraphs and special Markdown blocks as representative atomic units", () => {
    const doc = [
      "First paragraph line",
      "continues here.",
      "",
      "```ts",
      "const value = 1;",
      "",
      "console.log(value);",
      "```",
      "",
      "> [!note]",
      "> Callout body",
      ">",
      "> Still the same callout",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "$$",
      "x + y",
      "$$",
      "",
      "> Quoted line",
      "> Second quoted line",
    ].join("\n");

    const { units } = collectAll(doc);

    expect(units.map((unit) => unit.kind)).toEqual([
      "paragraph",
      "code",
      "callout",
      "table",
      "math",
      "quote",
    ]);
    expect(units.map((unit) => unit.text)).toEqual([
      "First paragraph line\ncontinues here.",
      "```ts\nconst value = 1;\n\nconsole.log(value);\n```",
      "> [!note]\n> Callout body\n>\n> Still the same callout",
      "| A | B |\n| --- | --- |\n| 1 | 2 |",
      "$$\nx + y\n$$",
      "> Quoted line\n> Second quoted line",
    ]);
  });

  it("keeps blank-line-separated lists as separate whole-list trees", () => {
    const doc = [
      "- First tree item",
      "- Second tree item",
      "",
      "- Other tree parent",
      "  - Other tree child",
    ].join("\n");

    const { units } = collectAll(doc, false);

    expect(units.map(({ kind, text }) => ({ kind, text }))).toEqual([
      {
        kind: "list-tree",
        text: "- First tree item\n- Second tree item",
      },
      {
        kind: "list-tree",
        text: "- Other tree parent\n  - Other tree child",
      },
    ]);
  });

  it("supports whole-tree, self-only, and native-subtree list modes", () => {
    const doc = ["- Parent", "  - Child", "- Sibling"].join("\n");

    const wholeTree = collectAll(doc, false).units;
    expect(wholeTree).toHaveLength(1);
    expect(wholeTree[0]).toMatchObject({
      kind: "list-tree",
      text: doc,
      blockIdPlacement: "standalone",
    });

    const selfOnly = collectAll(doc, true, "self-only");
    expect(selfOnly.units.map((unit) => unit.kind)).toEqual([
      "list-item",
      "list-item",
      "list-item",
    ]);
    expect(selfOnly.units[0]).toMatchObject({
      hasListChildren: true,
      anchorTo: selfOnly.state.doc.line(1).to,
      blockIdPlacement: "inline",
    });

    const nativeSubtree = collectAll(doc, true, "native-subtree");
    expect(nativeSubtree.units[0]).toMatchObject({
      hasListChildren: true,
      anchorTo: nativeSubtree.state.doc.line(2).to,
      blockIdPlacement: "standalone",
    });
  });

  it("splits only the current heading level and keeps deeper subtrees together", () => {
    const doc = [
      "# Root",
      "Intro one.",
      "",
      "Intro two.",
      "",
      "## Child",
      "Child body.",
      "",
      "### Grandchild",
      "Deep body.",
      "",
      "## Next child",
      "Next body.",
      "",
      "# Outside",
      "Outside body.",
    ].join("\n");
    const state = createMarkdownState(doc);
    const rootRange = buildHandleRanges(state)[0];

    expect(rootRange).toMatchObject({ from: 0, kind: "heading" });
    const units = collectSourceUnits(
      state,
      [{ from: rootRange.from, to: rootRange.to }],
      true,
      "native-subtree",
    );

    expect(units.map((unit) => unit.kind)).toEqual([
      "paragraph",
      "paragraph",
      "heading",
      "heading",
    ]);
    expect(units.map((unit) => unit.heading)).toEqual([
      undefined,
      undefined,
      "Child",
      "Next child",
    ]);
    expect(units[2].text).toBe(
      "## Child\nChild body.\n\n### Grandchild\nDeep body.",
    );
    expect(units[3].text).toBe("## Next child\nNext body.");
  });

  it("deduplicates overlapping ranges and sorts units by source position", () => {
    const doc = ["Alpha", "", "Beta", "", "Gamma"].join("\n");
    const state = createMarkdownState(doc);
    const alpha: SourceRange = { from: 0, to: "Alpha".length };
    const betaFrom = doc.indexOf("Beta");
    const beta: SourceRange = { from: betaFrom, to: betaFrom + "Beta".length };
    const gammaFrom = doc.indexOf("Gamma");
    const gamma: SourceRange = { from: gammaFrom, to: doc.length };

    const units = collectSourceUnits(
      state,
      [gamma, { from: alpha.from, to: beta.to }, beta, alpha],
      true,
      "self-only",
    );

    expect(units.map((unit) => unit.text)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(units.map((unit) => unit.from)).toEqual([
      alpha.from,
      beta.from,
      gamma.from,
    ]);
  });
});
