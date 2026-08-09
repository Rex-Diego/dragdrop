import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export interface EditorSelectionSnapshot {
  anchor: number;
  head: number;
}

export interface EditorViewSnapshot {
  selection: readonly EditorSelectionSnapshot[];
  scrollTop: number;
  scrollLeft: number;
  focused: boolean;
}

export function captureEditorViewSnapshot(view: EditorView): EditorViewSnapshot {
  return {
    selection: view.state.selection.ranges.map(({ anchor, head }) => ({ anchor, head })),
    scrollTop: view.scrollDOM.scrollTop,
    scrollLeft: view.scrollDOM.scrollLeft,
    focused: view.hasFocus,
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
    )
    .sort((left, right) => left.from - right.from || left.to - right.to);
  // A move can map two formerly disjoint ranges onto the same insertion
  // boundary. CodeMirror requires selection ranges to be ordered and
  // non-overlapping, so coalesce those ranges before creating the selection.
  const normalized = ranges.reduce<typeof ranges>((result, range) => {
    const previous = result[result.length - 1];
    if (!previous || range.from > previous.to) {
      result.push(range);
      return result;
    }

    result[result.length - 1] = EditorSelection.range(
      previous.from,
      Math.max(previous.to, range.to),
    );
    return result;
  }, []);
  return EditorSelection.create(normalized);
}

export function restoreEditorViewSnapshot(
  view: EditorView,
  snapshot: EditorViewSnapshot,
  mapPosition: (position: number) => number = (position) => position,
): void {
  view.dispatch({
    selection: mappedSelectionSnapshot(snapshot, mapPosition, view.state.doc.length),
    scrollIntoView: false,
  });
  if (snapshot.focused) view.focus();

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
