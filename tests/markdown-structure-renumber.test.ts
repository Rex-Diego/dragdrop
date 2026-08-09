import { describe, expect, it } from "vitest";
import { renumberOrderedListMarkers } from "../src/markdown-structure";

describe("ordered list renumbering", () => {
  it("renumbers contiguous ordered lists but leaves fenced code untouched", () => {
    expect(
      renumberOrderedListMarkers("3. first\n7. second\n\n```\n9. code\n```").trim(),
    ).toBe("1. first\n2. second\n\n```\n9. code\n```");
  });

  it("keeps nested list counters independent", () => {
    expect(renumberOrderedListMarkers("4. parent\n  8. child\n  9. child two\n5. next")).toBe(
      "1. parent\n  1. child\n  2. child two\n2. next",
    );
  });
});
