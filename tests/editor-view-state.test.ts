import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, StateEffect } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import { testEditor } from "./editor-test-view";
import { planMarkdownMoveChanges } from "../src/markdown-drop";
import {
  dispatchEditorChanges,
  documentChanges,
  mappedSelectionSnapshot,
  preserveEditorOnSync,
  restorePendingEditorSync,
  type EditorViewSnapshot,
} from "../src/editor-view-state";

describe("editor view state mapping", () => {
  it("maps every selection range and keeps ranges in document order", () => {
    const snapshot: EditorViewSnapshot = {
      selection: [
        { anchor: 12, head: 15 },
        { anchor: 2, head: 4 },
      ],
      scrollTop: 240,
      scrollLeft: 6,
      focused: true,
    };

    const selection = mappedSelectionSnapshot(
      snapshot,
      (position) => position + (position >= 10 ? 20 : 3),
      30,
    );

    expect(selection.ranges.map(({ from, to }) => [from, to])).toEqual([
      [5, 7],
      [30, 30],
    ]);
  });

  it("clamps mapped positions to the new document", () => {
    const snapshot: EditorViewSnapshot = {
      selection: [{ anchor: 4, head: 10 }],
      scrollTop: 0,
      scrollLeft: 0,
      focused: false,
    };
    const selection = mappedSelectionSnapshot(snapshot, (position) => position + 100, 8);

    expect(selection.main.from).toBe(8);
    expect(selection.main.to).toBe(8);
  });

  it("coalesces ranges that overlap after a move mapping", () => {
    const snapshot: EditorViewSnapshot = {
      selection: [
        { anchor: 2, head: 5 },
        { anchor: 10, head: 14 },
      ],
      scrollTop: 0,
      scrollLeft: 0,
      focused: true,
    };

    const selection = mappedSelectionSnapshot(
      snapshot,
      (position) => (position >= 10 ? position - 8 : position),
      20,
    );

    expect(selection.ranges.map(({ from, to }) => [from, to])).toEqual([[2, 6]]);
  });

  it("moves content and selection in one transaction but maps the viewport through normal changes", () => {
    const doc = "Alpha\nBravo\nCharlie";
    const editor = testEditor(EditorState.create({ doc, selection: { anchor: 7 } }));
    const scroll = StateEffect.define<number>({ map: (value, changes) => changes.mapPos(value) });
    Object.assign(editor.view, { scrollSnapshot: () => scroll.of(7) });
    const plan = planMarkdownMoveChanges(doc, [{ from: 6, to: 11, text: "Bravo" }], doc.length);
    dispatchEditorChanges(editor.view, plan.changes, plan.mapPosition);
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
    expect(editor.view.state.doc.toString()).toBe("Alpha\nCharlie\nBravo");
    expect(editor.view.state.selection.main.head).toBe(15);
    expect(editor.transactions[0].effects.find((effect) => effect.is(scroll))?.value).toBe(6);
    expect(editor.transactions[0].scrollIntoView).toBe(false);
    expect(editor.focus).not.toHaveBeenCalled();
  });

  it("rejects filtered writes before dispatch so partial edits cannot escape rollback", () => {
    const editor = testEditor(EditorState.create({
      doc: "source", extensions: [EditorState.changeFilter.of(() => false)],
    }));
    expect(() => dispatchEditorChanges(editor.view, { from: 0, to: 6, insert: "target" })).toThrow("rejected");
    expect(editor.dispatch).not.toHaveBeenCalled();
    expect(editor.view.state.doc.toString()).toBe("source");
  });

  it("preserves the main selection after sorting multiple moved ranges", () => {
    const result = mappedSelectionSnapshot({
      selection: [{ anchor: 8, head: 5 }, { anchor: 12, head: 14 }],
      mainIndex: 1, scrollTop: 0, scrollLeft: 0, focused: false,
    }, (position) => position < 10 ? position + 10 : position - 10, 30);
    expect(result.main).toEqual(EditorSelection.range(2, 4));
    expect(result.ranges[1].anchor).toBe(18);
  });

  it("restores the other pane only after the expected document sync", async () => {
    const editor = testEditor(EditorState.create({ doc: "alpha\nbeta", selection: { anchor: 7 } }));
    const changes = documentChanges("alpha\nbeta", "alpha\nnew beta");
    preserveEditorOnSync(editor.view, changes);
    expect(editor.dispatch).not.toHaveBeenCalled();
    editor.view.dispatch({ changes });
    restorePendingEditorSync({ view: editor.view, state: editor.view.state, docChanged: true } as ViewUpdate);
    await Promise.resolve();
    expect(editor.view.state.selection.main.head).toBe(11);
    expect(editor.dispatch).toHaveBeenCalledTimes(2);
    expect(editor.transactions[1].docChanged).toBe(false);
  });

  it("does not restore stale state after a different pane edit", async () => {
    const editor = testEditor(EditorState.create({ doc: "alpha" }));
    preserveEditorOnSync(editor.view, documentChanges("alpha", "beta"));
    editor.view.dispatch({ changes: { from: 0, insert: "user " } });
    restorePendingEditorSync({ view: editor.view, state: editor.view.state, docChanged: true } as ViewUpdate);
    await Promise.resolve();
    expect(editor.dispatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["1. a\n2. b\n3. c", "1. a\n3. b\n4. c"],
    ["a\nb\nc", "a\nnew\nb\nc"],
    ["same", "same"],
    ["", "new"],
  ])("builds a minimal document change for %j", (before, after) => {
    const state = EditorState.create({ doc: before });
    expect(documentChanges(before, after).apply(state.doc).toString()).toBe(after);
  });
});
