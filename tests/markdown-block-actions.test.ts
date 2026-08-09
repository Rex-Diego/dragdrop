import { describe, expect, it } from "vitest";
import {
  canConvertMarkdownBlock,
  convertMarkdownBlock,
} from "../src/markdown-block-actions";
import type { SourceUnit } from "../src/model";

function unit(text: string, kind: SourceUnit["kind"] = "paragraph"): SourceUnit {
  return { from: 0, to: text.length, text, kind };
}

describe("Markdown block actions", () => {
  it("converts common block types while retaining the block ID token", () => {
    expect(convertMarkdownBlock("Idea ^keep", "heading-2")).toBe("## Idea ^keep");
    expect(convertMarkdownBlock("Idea ^keep", "task-list")).toBe("- [ ] Idea ^keep");
    expect(convertMarkdownBlock("Idea ^keep", "quote")).toBe("> Idea ^keep");
    expect(convertMarkdownBlock("Idea ^keep", "code")).toBe("```\nIdea\n``` ^keep");
  });

  it("does not offer conversion for embeds, containers or multi-line blocks", () => {
    expect(canConvertMarkdownBlock(unit("![[Book#^id]]"), "paragraph")).toBe(false);
    expect(canConvertMarkdownBlock(unit("> [!NOTE]\nbody", "callout"), "paragraph")).toBe(false);
    expect(canConvertMarkdownBlock(unit("one\ntwo"), "heading-1")).toBe(false);
  });

  it("rejects conversion when an existing ID is not present in the source text", () => {
    expect(
      canConvertMarkdownBlock(
        { ...unit("Idea"), existingBlockId: "keep" },
        "paragraph",
      ),
    ).toBe(false);
  });
});
