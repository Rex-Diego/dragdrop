import { foldEffect, foldedRanges, foldable } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export function captureFoldStarts(state: EditorState): number[] {
  const starts: number[] = [];
  foldedRanges(state).between(0, state.doc.length, (from) => {
    starts.push(from);
  });
  return starts;
}

export function restoreFoldStarts(view: EditorView, starts: readonly number[]): void {
  if (starts.length === 0 || view.state.doc.length === 0) return;

  const seen = new Set<string>();
  const effects = starts.flatMap((start) => {
    const safeStart = Math.max(0, Math.min(start, view.state.doc.length));
    const line = view.state.doc.lineAt(safeStart);
    const range = foldable(view.state, line.from, line.to);
    if (!range) return [];

    const key = `${range.from}:${range.to}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [foldEffect.of(range)];
  });

  if (effects.length > 0) view.dispatch({ effects });
}
