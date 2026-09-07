import { EditorState, type Transaction, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { vi } from "vitest";

export function testEditor(state: EditorState) {
  const transactions: Transaction[] = [];
  const view = {
    state,
    dom: { isConnected: true },
    scrollDOM: { scrollTop: 240, scrollLeft: 0 },
    hasFocus: false,
    focus: vi.fn(),
    requestMeasure: vi.fn(),
    dispatch: vi.fn((transaction: Transaction | TransactionSpec) => {
      const result = "startState" in transaction ? transaction : view.state.update(transaction);
      transactions.push(result);
      view.state = result.state;
    }),
  };
  return { view: view as unknown as EditorView, transactions, dispatch: view.dispatch, focus: view.focus };
}
