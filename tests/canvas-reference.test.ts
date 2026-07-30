import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { planCanvasReferences } from "../src/canvas-reference";
import { buildHandleRanges, collectSourceUnits } from "../src/content-segmentation";
import type { SourceUnit } from "../src/model";

function file(path: string): { path: string } {
  return { path };
}

function parseLinktext(linktext: string): { path: string; subpath: string } {
  const marker = linktext.lastIndexOf("#^");
  return {
    path: marker < 0 ? linktext : linktext.slice(0, marker),
    subpath: marker < 0 ? "" : linktext.slice(marker),
  };
}

function unit(text: string, from = 0): SourceUnit {
  return {
    from,
    to: from + text.length,
    text,
    kind: "paragraph",
  };
}

describe("Canvas reference planning", () => {
  it("uses the target file and original block ID for an existing embed", () => {
    const sourceFile = file("Capture/Excerpt.md");
    const targetFile = file("Books/Source.md");
    const text = "![[Books/Source#^abc123|source block]]";
    const state = EditorState.create({ doc: text });
    const references = planCanvasReferences(
      state,
      [unit(text)],
      sourceFile,
      parseLinktext,
      (path) => (path === "Books/Source" ? targetFile : null),
    );

    expect(references).toHaveLength(1);
    expect(references?.[0]).toMatchObject({
      file: targetFile,
      subpath: "#^abc123",
    });
    expect(references?.[0].unit.blockIdInsert).toBeUndefined();
    expect(references?.[0].unit.existingBlockId).toBe("abc123");
  });

  it("keeps a block ID on the first line of a lazy Callout when planning a Canvas node", () => {
    const sourceFile = file("Capture/Excerpt.md");
    const blockId = "2024-07-20-09-41-41";
    const text = [
      "> [!PDF|blue] [[Book.pdf#page=49&selection=13,0,21,22&color=blue|p.49]] ^2024-07-20-09-41-41",
      "Callout body without a quote marker",
    ].join("\n");
    const state = EditorState.create({ doc: text, extensions: [markdown()] });
    const units = collectSourceUnits(
      state,
      buildHandleRanges(state),
      true,
      "native-subtree",
    );

    const references = planCanvasReferences(
      state,
      units,
      sourceFile,
      parseLinktext,
      () => null,
    );

    expect(units).toHaveLength(1);
    expect(units[0].existingBlockId).toBe(blockId);
    expect(references).toHaveLength(1);
    expect(references?.[0]).toMatchObject({
      file: sourceFile,
      subpath: `#^${blockId}`,
    });
    expect(references?.[0].unit.blockIdInsert).toBeUndefined();
  });

  it("keeps normal blocks on the source file while resolving embedded blocks separately", () => {
    const sourceFile = file("Capture/Excerpt.md");
    const targetFile = file("Books/Source.md");
    const embeddedText = "![[Books/Source#^abc123]]";
    const state = EditorState.create({ doc: "Plain block\n\n" + embeddedText });
    const references = planCanvasReferences(
      state,
      [unit("Plain block"), unit(embeddedText, 13)],
      sourceFile,
      parseLinktext,
      (path) => (path === "Books/Source" ? targetFile : null),
    );

    expect(references).toHaveLength(2);
    expect(references?.[0].file).toBe(sourceFile);
    expect(references?.[0].unit.blockIdInsert?.text).toMatch(/^ /);
    expect(references?.[1].file).toBe(targetFile);
    expect(references?.[1].subpath).toBe("#^abc123");
    expect(references?.[1].unit.blockIdInsert).toBeUndefined();
  });

  it("aborts the complete plan when an embedded target cannot be resolved", () => {
    const sourceFile = file("Capture/Excerpt.md");
    const text = "![[Missing#^abc123]]";
    const state = EditorState.create({ doc: text });

    expect(
      planCanvasReferences(
        state,
        [unit(text)],
        sourceFile,
        parseLinktext,
        () => null,
      ),
    ).toBeNull();
  });
});
