import { describe, expect, it } from "vitest";
import { calloutGutterOffset } from "../src/callout-handle-position";

describe("Callout gutter positioning", () => {
  const geometry = {
    contentLeft: 320,
    contentRight: 1_080,
    lineStart: 344,
    markerLeft: 18,
    markerRight: 34,
    previousOffset: 40,
  };

  it("aligns the left handle with the text column after a wide margin", () => {
    expect(calloutGutterOffset("left", geometry)).toBe(366);
  });

  it("aligns the right handle with the content edge", () => {
    expect(calloutGutterOffset("right", geometry)).toBe(1_086);
  });
});
