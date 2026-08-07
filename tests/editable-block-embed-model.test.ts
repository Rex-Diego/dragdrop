import { describe, expect, it } from "vitest";
import {
  findBlockIdTokens,
  findBlockLocation,
  preservesBlockIdPosition,
  replaceBlockById,
} from "../src/editable-block-embed-model";

describe("editable block embed model", () => {
  it("locates an inline paragraph block and excludes wiki-link IDs", () => {
    const content = "![[Other#^ignored]]\n\nfirst line\nsecond line ^paragraph-id\n\nafter\n";
    const result = findBlockLocation(content, "paragraph-id");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.location.placement).toBe("inline");
    expect(result.location.text).toBe("first line\nsecond line ^paragraph-id\n");
    expect(result.location.bodyText).toBe("first line\nsecond line");
    expect(findBlockLocation(content, "ignored").status).toBe("missing");
  });

  it("locates a standalone marker together with the preceding block", () => {
    const content = "quoted text\ncontinued text\n^standalone-id\n\nnext";
    const result = findBlockLocation(content, "standalone-id");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.location.placement).toBe("standalone");
    expect(result.location.text).toBe("quoted text\ncontinued text\n^standalone-id\n");
    expect(result.location.bodyText).toBe("quoted text\ncontinued text");
  });

  it("keeps a callout's lazy continuation lines in one block", () => {
    const content = "> [!PDF|blue] source ^callout-id\ncallout body\nmore body\n\nnext";
    const result = findBlockLocation(content, "callout-id");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.location.text).toBe(
      "> [!PDF|blue] source ^callout-id\ncallout body\nmore body\n",
    );
  });

  it("keeps nested list items but stops before the next sibling", () => {
    const content = "- parent ^parent-id\n  continuation\n  - child\n- sibling ^sibling-id\n";
    const result = findBlockLocation(content, "parent-id");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.location.text).toBe("- parent ^parent-id\n  continuation\n  - child\n");
  });

  it("reports duplicate IDs and preserves exact ID spelling during replacement", () => {
    const duplicate = findBlockLocation("one ^same\ntwo ^same", "same");
    expect(duplicate.status).toBe("duplicate");

    const content = "prefix\n\noriginal ^Keep-01\n\nsuffix";
    const located = findBlockLocation(content, "Keep-01");
    expect(located.status).toBe("ok");
    if (located.status !== "ok") return;

    const replaced = replaceBlockById(
      content,
      "Keep-01",
      located.location.text,
      "changed body ^Keep-01\n",
    );
    expect(replaced.status).toBe("ok");
    if (replaced.status !== "ok") return;
    expect(replaced.content).toBe("prefix\n\nchanged body ^Keep-01\n\nsuffix");
  });

  it("re-locates after an unrelated prefix change but rejects block conflicts", () => {
    const baseline = "old prefix\n\nbody ^id\n\nend";
    const located = findBlockLocation(baseline, "id");
    expect(located.status).toBe("ok");
    if (located.status !== "ok") return;

    const relocated = replaceBlockById(
      "new prefix\n\nbody ^id\n\nend",
      "id",
      located.location.text,
      "new body ^id\n",
    );
    expect(relocated.status).toBe("ok");

    const conflict = replaceBlockById(
      "old prefix\n\nchanged elsewhere ^id\n\nend",
      "id",
      located.location.text,
      "new body ^id\n",
    );
    expect(conflict.status).toBe("conflict");
  });

  it("does not allow the marker to be removed, duplicated, or moved", () => {
    const content = "body ^id\n";
    expect(replaceBlockById(content, "id", content, "body without marker\n").status).toBe("id-changed");
    expect(replaceBlockById(content, "id", content, "body ^id and ^id\n").status).toBe("id-changed");
    expect(replaceBlockById(content, "id", content, "body\n^id\n").status).toBe("id-changed");
    expect(preservesBlockIdPosition(content, "body\nmoved ^id\n", "id")).toBe(false);
    expect(preservesBlockIdPosition("body\n^id\n", "^id\nbody\n", "id")).toBe(false);
  });

  it("returns all block IDs outside wiki embeds", () => {
    expect(findBlockIdTokens("![[File#^ignored]]\ntext ^kept\n^standalone")).toEqual([
      { id: "kept", from: 24, to: 29 },
      { id: "standalone", from: 30, to: 41 },
    ]);
  });
});
