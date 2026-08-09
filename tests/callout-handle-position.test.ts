import { describe, expect, it } from "vitest";
import { calloutGutterOffset } from "../src/callout-handle-position";

describe("Callout gutter positioning", () => {
  const geometry = {
    lineLeft: 344,
    lineRight: 344,
    markerLeft: 18,
    markerRight: 34,
    previousOffset: 0,
    gap: 4,
  };

  it("places the left handle immediately before the text column", () => {
    expect(calloutGutterOffset("left", geometry)).toBe(306);
  });

  it("places the right handle immediately after the text column", () => {
    expect(calloutGutterOffset("right", geometry)).toBe(330);
  });

  it("does not accumulate an offset across repeated measurements", () => {
    const firstOffset = calloutGutterOffset("left", geometry);
    expect(calloutGutterOffset("left", {
      ...geometry,
      markerLeft: geometry.markerLeft + firstOffset,
      markerRight: geometry.markerRight + firstOffset,
      previousOffset: firstOffset,
    })).toBe(firstOffset);
  });
});
