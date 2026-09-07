import { describe, expect, it } from "vitest";
import {
  adjustListBlockIndent,
  findMoveTargetIssue,
  planStructuredMarkdownMove,
  resolveListDropIntent,
} from "../src/markdown-structure";

describe("Markdown structural move planning", () => {
  it("resolves sibling, child and outdent list intents from the drop column", () => {
    const sourceText = "  - [ ] source\n    - child ^keep";

    expect(
      resolveListDropIntent({
        sourceText,
        targetLineText: "- target",
        pointerColumn: 3,
        contextLineNumber: 1,
      }),
    ).toEqual({ mode: "child", contextLineNumber: 1, targetIndentWidth: 2 });
    expect(
      resolveListDropIntent({
        sourceText,
        targetLineText: "    - nested target",
        pointerColumn: 4,
        contextLineNumber: 3,
      }),
    ).toEqual({ mode: "outdent", contextLineNumber: 3, targetIndentWidth: 2 });
    expect(
      resolveListDropIntent({
        sourceText,
        targetLineText: "- target",
        pointerColumn: 1,
        contextLineNumber: 1,
      }),
    ).toEqual({ mode: "sibling", contextLineNumber: 1, targetIndentWidth: 0 });
  });

  it("changes indentation without changing list markers, task state or block IDs", () => {
    const source = "- [ ] source\n  - child ^keep";
    const childIntent = {
      mode: "child" as const,
      contextLineNumber: 1,
      targetIndentWidth: 2,
    };

    expect(adjustListBlockIndent(source, "- target", childIntent)).toBe(
      "  - [ ] source\n    - child ^keep",
    );
    expect(
      adjustListBlockIndent(
        "  - source\n    - child",
        "- target",
        { mode: "outdent", contextLineNumber: 1, targetIndentWidth: 0 },
      ),
    ).toBe("- source\n  - child");
  });

  it("keeps lazy continuation lines with a nested task subtree", () => {
    expect(
      adjustListBlockIndent(
        "  - [ ] source\ncontinued\n    - child",
        "  - target",
        { mode: "child", contextLineNumber: 1, targetIndentWidth: 4 },
      ),
    ).toBe("    - [ ] source\n  continued\n      - child");
  });

  it("rejects self-range drops and dangerous container interiors", () => {
    expect(findMoveTargetIssue("Alpha\nBravo", [{ from: 0, to: 5 }], 3)).toBe(
      "inside-source",
    );
    expect(findMoveTargetIssue("---\ntitle: x\n---\nBody", [], 8)).toBe(
      "frontmatter",
    );
    expect(findMoveTargetIssue("- a\n| x | y |\n|---|---|\n- b", [], 8)).toBe(
      "table-cell",
    );
    expect(findMoveTargetIssue("```\ncode\n```\nBody", [], 5)).toBe("fenced-code");
    expect(findMoveTargetIssue("> quote one\n> quote two\nBody", [], 12)).toBe(
      "quote-run",
    );
    expect(
      findMoveTargetIssue("> [!PDF]\nlazy continuation\nBody", [], 12),
    ).toBe("quote-run");
    expect(findMoveTargetIssue("Body\n---\nNext", [], 7)).toBe("horizontal-rule");
  });

  it("moves a list block atomically while applying the resolved indent", () => {
    const content = "- source\n\n- target";
    const sourceFrom = 0;
    const sourceTo = "- source".length;

    expect(
      planStructuredMarkdownMove(
        content,
        [{ from: sourceFrom, to: sourceTo, text: "- source" }],
        content.length,
        "- target",
        { mode: "child", contextLineNumber: 3, targetIndentWidth: 2 },
      ),
    ).toBe("- target\n\n  - source");
  });
});
