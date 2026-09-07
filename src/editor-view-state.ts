import { ChangeSet, EditorSelection, Transaction, type ChangeSpec, type StateEffect } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";

export interface EditorSelectionSnapshot {
  anchor: number;
  head: number;
}

export interface EditorViewSnapshot {
  selection: readonly EditorSelectionSnapshot[];
  mainIndex?: number;
  scrollTop: number;
  scrollLeft: number;
  focused: boolean;
  scrollEffect?: StateEffect<unknown>;
}

export function captureEditorViewSnapshot(view: EditorView): EditorViewSnapshot {
  const scrollTop = view.scrollDOM.scrollTop;
  return {
    selection: view.state.selection.ranges.map(({ anchor, head }) => ({ anchor, head })),
    mainIndex: view.state.selection.mainIndex,
    scrollTop,
    scrollLeft: view.scrollDOM.scrollLeft,
    focused: view.hasFocus,
    scrollEffect: typeof view.scrollSnapshot === "function" ? view.scrollSnapshot() : undefined,
  };
}

export function mappedSelectionSnapshot(
  snapshot: EditorViewSnapshot,
  mapPosition: (position: number) => number,
  documentLength: number,
): EditorSelection {
  const ranges = snapshot.selection
    .map(({ anchor, head }) =>
      EditorSelection.range(
        Math.max(0, Math.min(documentLength, mapPosition(anchor))),
        Math.max(0, Math.min(documentLength, mapPosition(head))),
      ),
    );
  return EditorSelection.create(ranges, snapshot.mainIndex ?? 0);
}

export function restoreEditorViewSnapshot(
  view: EditorView,
  snapshot: EditorViewSnapshot,
  mapPosition: (position: number) => number = (position) => position,
  changes?: ChangeSet,
): void {
  const scrollEffect = changes ? snapshot.scrollEffect?.map(changes) : snapshot.scrollEffect;
  view.dispatch({
    selection: mappedSelectionSnapshot(snapshot, mapPosition, view.state.doc.length),
    effects: scrollEffect ? [scrollEffect] : [],
    scrollIntoView: false,
    annotations: Transaction.addToHistory.of(false),
  });
  if (!scrollEffect) restoreLegacyScroll(view, snapshot);
}

function restoreLegacyScroll(view: EditorView, snapshot: EditorViewSnapshot): void {
  view.requestMeasure({
    read: () => null,
    write: () => {
      if (!view.dom.isConnected) return;
      const maxTop = Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
      const maxLeft = Math.max(0, view.scrollDOM.scrollWidth - view.scrollDOM.clientWidth);
      view.scrollDOM.scrollTop = Math.min(Math.max(0, snapshot.scrollTop), maxTop);
      view.scrollDOM.scrollLeft = Math.min(Math.max(0, snapshot.scrollLeft), maxLeft);
    },
  });
}

export function dispatchEditorChanges(
  view: EditorView,
  changeSpec: ChangeSpec,
  mapPosition?: (position: number) => number,
): void {
  const changes = ChangeSet.of(changeSpec, view.state.doc.length);
  if (changes.empty) return;
  const snapshot = captureEditorViewSnapshot(view);
  const scrollEffect = snapshot.scrollEffect?.map(changes);
  const transaction = view.state.update({
    changes,
    selection: mappedSelectionSnapshot(snapshot, mapPosition ?? ((position) => changes.mapPos(position)), changes.newLength),
    effects: scrollEffect ? [scrollEffect] : [],
    scrollIntoView: false,
    userEvent: "input.drop",
  });
  if (!transaction.newDoc.eq(changes.apply(view.state.doc))) {
    throw new Error("An editor rejected or modified the Markdown drop.");
  }
  view.dispatch(transaction);
  if (!scrollEffect) restoreLegacyScroll(view, snapshot);
}

interface PendingEditorSync {
  snapshot: EditorViewSnapshot;
  changes: ChangeSet;
  after: string;
  mapPosition: (position: number) => number;
  expiresAt: number;
}

const pendingEditorSync = new WeakMap<EditorView, PendingEditorSync>();

/** The other pane receives Obsidian's document sync, never a second content write. */
export function preserveEditorOnSync(
  view: EditorView,
  changes: ChangeSet,
  mapPosition: (position: number) => number = (position) => changes.mapPos(position),
): () => void {
  const pending = {
    snapshot: captureEditorViewSnapshot(view), changes, mapPosition,
    after: changes.apply(view.state.doc).toString(), expiresAt: Date.now() + 5_000,
  };
  pendingEditorSync.set(view, pending);
  return () => {
    if (pendingEditorSync.get(view) === pending) pendingEditorSync.delete(view);
  };
}

export function restorePendingEditorSync(update: ViewUpdate): void {
  const pending = pendingEditorSync.get(update.view);
  if (!pending || !update.docChanged) return;
  pendingEditorSync.delete(update.view);
  if (Date.now() > pending.expiresAt || update.state.doc.toString() !== pending.after) return;
  const state = update.state;
  queueMicrotask(() => {
    if (!update.view.dom.isConnected || update.view.state !== state) return;
    restoreEditorViewSnapshot(update.view, pending.snapshot, pending.mapPosition, pending.changes);
  });
}

/** Keep unchanged lines outside the edit, including when only list numbers change. */
export function documentChanges(before: string, after: string): ChangeSet {
  if (before === after) return ChangeSet.empty(before.length);
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const changes: { from: number; to: number; insert: string }[] = [];
  const addChange = (oldText: string, newText: string, offset: number): void => {
    let start = 0;
    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (start < oldEnd && start < newEnd && oldText[start] === newText[start]) start += 1;
    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd -= 1;
      newEnd -= 1;
    }
    if (start < oldEnd || start < newEnd) changes.push({ from: offset + start, to: offset + oldEnd, insert: newText.slice(start, newEnd) });
  };
  if (oldLines.length === newLines.length) {
    let offset = 0;
    oldLines.forEach((line, index) => {
      addChange(line, newLines[index], offset);
      offset += line.length + 1;
    });
  } else addChange(before, after, 0);
  return ChangeSet.of(changes, before.length);
}
