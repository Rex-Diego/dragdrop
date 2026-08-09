import { describe, expect, it } from "vitest";
import {
  claimDragCommit,
  DragCommitGate,
} from "../src/drag-commit-gate";

describe("drag commit ownership", () => {
  it("allows one owner for a session and rejects a second owner", () => {
    const gate = new DragCommitGate();
    gate.begin("session-a");

    expect(gate.tryClaim("session-a", "canvas")).toBe(true);
    expect(gate.tryClaim("session-a", "markdown")).toBe(false);
    expect(gate.current()).toEqual({ sessionId: "session-a", owner: "canvas" });
  });

  it("does not let a stale session claim the current commit", () => {
    const gate = new DragCommitGate();
    gate.begin("session-a");
    expect(gate.tryClaim("session-a", "markdown")).toBe(true);

    gate.begin("session-b");
    expect(gate.current()).toBeNull();
    expect(gate.tryClaim("session-b", "canvas")).toBe(true);
  });

  it("keeps the first pure claim when another owner races it", () => {
    const first = claimDragCommit(null, "session-a", "markdown");
    const second = claimDragCommit(first.claim, "session-a", "canvas");

    expect(first).toEqual({
      accepted: true,
      claim: { sessionId: "session-a", owner: "markdown" },
    });
    expect(second).toEqual({ accepted: false, claim: first.claim });
  });
});
