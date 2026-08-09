import { describe, expect, it } from "vitest";
import { runMarkdownTransaction, type MarkdownMutation } from "../src/markdown-transaction";

function mutation(path: string, before: string, after: string): MarkdownMutation {
  return { path, before, after };
}

describe("Markdown transaction coordinator", () => {
  it("applies all changes and skips no-op mutations", async () => {
    const applied: string[] = [];
    const result = await runMarkdownTransaction(
      [mutation("source.md", "a", "b"), mutation("target.md", "x", "x")],
      {
        apply: (change) => {
          applied.push(`${change.path}:${change.after}`);
        },
        rollback: () => undefined,
      },
    );

    expect(result).toEqual({ ok: true, rollbackFailed: false });
    expect(applied).toEqual(["source.md:b"]);
  });

  it("rolls back already-applied files in reverse order", async () => {
    const events: string[] = [];
    const result = await runMarkdownTransaction(
      [mutation("source.md", "a", "b"), mutation("target.md", "x", "y")],
      {
        apply: (change) => {
          events.push(`apply:${change.path}`);
          if (change.path === "target.md") throw new Error("target changed");
        },
        rollback: (change) => {
          events.push(`rollback:${change.path}`);
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.rollbackFailed).toBe(false);
    expect(events).toEqual(["apply:source.md", "apply:target.md", "rollback:source.md"]);
  });

  it("rejects duplicate paths before writing anything", async () => {
    let writes = 0;
    const result = await runMarkdownTransaction(
      [mutation("same.md", "a", "b"), mutation("same.md", "b", "c")],
      {
        apply: () => { writes += 1; },
        rollback: () => undefined,
      },
    );

    expect(result.ok).toBe(false);
    expect(writes).toBe(0);
  });
});
