import { describe, expect, it } from "vitest";
import { edgeScrollDelta } from "../src/drag-auto-scroll";

const viewport = { left: 0, top: 0, right: 1_000, bottom: 800 };

describe("drag edge auto-scroll", () => {
  it("returns no movement away from the edge zone", () => {
    expect(edgeScrollDelta({ x: 500, y: 400 }, viewport, 60, 12)).toEqual({ x: 0, y: 0 });
  });

  it("ramps toward the edge and clamps at the configured maximum", () => {
    expect(edgeScrollDelta({ x: 0, y: 30 }, viewport, 60, 12)).toEqual({ x: -12, y: -6 });
    expect(edgeScrollDelta({ x: 970, y: 770 }, viewport, 60, 12)).toEqual({ x: 6, y: 6 });
  });
});
