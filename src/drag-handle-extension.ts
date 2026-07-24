import { RangeSetBuilder, StateField } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { setIcon } from "obsidian";
import { buildHandleRanges } from "./content-segmentation";
import type { HandleRange } from "./content-segmentation";

export interface DragStarter {
  beginDrag(event: DragEvent, view: EditorView, handle: HandleRange): void;
  beginPointerDrag(
    event: PointerEvent,
    view: EditorView,
    handle: HandleRange,
    element: HTMLElement,
  ): void;
  movePointerDrag(event: PointerEvent): void;
  endPointerDrag(event: PointerEvent): Promise<void>;
  cancelPointerDrag(pointerId: number): void;
}

class DragHandleWidget extends WidgetType {
  constructor(
    private readonly starter: DragStarter,
    private readonly range: HandleRange,
  ) {
    super();
  }

  eq(other: DragHandleWidget): boolean {
    return (
      other.starter === this.starter &&
      other.range.from === this.range.from &&
      other.range.to === this.range.to &&
      other.range.kind === this.range.kind
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const element = createSpan({
      cls: "dragdrop-handle",
      attr: {
        draggable: "true",
        tabindex: "0",
        role: "button",
        "aria-label": "Drag Markdown block",
        "data-tooltip-position": "top",
      },
    });
    if (element.ownerDocument !== view.dom.ownerDocument) {
      view.dom.ownerDocument.adoptNode(element);
    }

    const icon = element.createSpan({ cls: "dragdrop-handle-icon" });
    setIcon(icon, "grip-vertical");

    element.addEventListener("dragstart", (event) => {
      this.starter.beginDrag(event, view, this.range);
    });
    element.addEventListener("pointerdown", (event) => {
      this.starter.beginPointerDrag(event, view, this.range, element);
    });
    element.addEventListener("pointermove", (event) => {
      this.starter.movePointerDrag(event);
    });
    element.addEventListener("pointerup", (event) => {
      void this.starter.endPointerDrag(event);
    });
    element.addEventListener("pointercancel", (event) => {
      this.starter.cancelPointerDrag(event.pointerId);
    });
    element.addEventListener("lostpointercapture", (event) => {
      this.starter.cancelPointerDrag(event.pointerId);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      view.dispatch({
        selection: { anchor: this.range.from, head: this.range.to },
        scrollIntoView: true,
      });
      view.focus();
    });

    return element;
  }

  ignoreEvent(): boolean {
    // Keep CodeMirror from turning a handle drag into an editor text selection.
    return true;
  }
}

function buildDecorations(state: EditorState, starter: DragStarter): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of buildHandleRanges(state)) {
    builder.add(
      range.from,
      range.from,
      Decoration.widget({
        widget: new DragHandleWidget(starter, range),
        side: -1,
        inlineOrder: true,
      }),
    );
  }
  return builder.finish();
}

export function createDragHandleExtension(starter: DragStarter): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, starter);
    },
    update(value, transaction) {
      if (!transaction.docChanged) return value;
      return buildDecorations(transaction.state, starter);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
