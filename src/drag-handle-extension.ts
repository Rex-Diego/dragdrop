import { RangeSetBuilder, StateField } from "@codemirror/state";
import type { EditorState, Extension, RangeSet } from "@codemirror/state";
import { Decoration, Direction, EditorView, GutterMarker, gutter, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { setIcon } from "obsidian";
import { buildHandleRanges } from "./content-segmentation";
import type { HandleRange } from "./content-segmentation";
import { calloutGutterOffset } from "./callout-handle-position";
import { restorePendingEditorSync } from "./editor-view-state";

export interface DragStarter {
  openHandleMenu(
    event: MouseEvent,
    view: EditorView,
    handle: HandleRange,
    element: HTMLElement,
  ): boolean;
  handleHandlePointerDown(
    event: PointerEvent,
    view: EditorView,
    handle: HandleRange,
    element: HTMLElement,
  ): boolean;
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
    return createDragHandleElement(this.starter, view, this.range);
  }

  ignoreEvent(): boolean {
    // Keep CodeMirror from turning a handle drag into an editor text selection.
    return true;
  }
}

class DragHandleGutterMarker extends GutterMarker {
  elementClass = "dragdrop-gutter-marker";

  constructor(
    private readonly starter: DragStarter,
    private readonly handleRange: HandleRange,
  ) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return (
      other instanceof DragHandleGutterMarker &&
      other.starter === this.starter &&
      other.handleRange.from === this.handleRange.from &&
      other.handleRange.to === this.handleRange.to &&
      other.handleRange.kind === this.handleRange.kind
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const element = createDragHandleElement(this.starter, view, this.handleRange);
    return element;
  }
}

const hoveredGutterHandles = new WeakMap<EditorView, HTMLElement>();
const calloutGutterOffsets = new WeakMap<HTMLElement, number>();
const calloutAlignmentMeasureKey = {};

interface CalloutGutterAlignment {
  marker: HTMLElement;
  offset: number;
}

function elementFromEventTarget(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object" || !("nodeType" in target)) return null;

  const node = target as Node;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

function hoverAnchorFromTarget(target: EventTarget | null, view: EditorView): Element | null {
  const element = elementFromEventTarget(target);
  if (!element || !view.dom.contains(element)) return null;

  const callout = element.closest(".cm-embed-block.cm-callout");
  if (callout) {
    const sourceLine = callout.previousElementSibling;
    return sourceLine?.classList.contains("cm-line") ? sourceLine : callout;
  }

  return element.closest(".cm-line");
}

function findGutterHandle(view: EditorView, anchor: Element): HTMLElement | null {
  const anchorTop = anchor.getBoundingClientRect().top;
  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of view.dom.findAll(".dragdrop-gutter .dragdrop-handle")) {
    const distance = Math.abs(candidate.getBoundingClientRect().top - anchorTop);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearestDistance <= 64 ? nearest : null;
}

function setHoveredGutterHandle(view: EditorView, anchor: Element | null): void {
  const previous = hoveredGutterHandles.get(view);
  const next = anchor ? findGutterHandle(view, anchor) : null;

  if (previous && previous !== next) {
    previous.removeClass("dragdrop-handle-line-hover");
  }

  if (next) {
    next.addClass("dragdrop-handle-line-hover");
    hoveredGutterHandles.set(view, next);
  } else {
    hoveredGutterHandles.delete(view);
  }
}

function createGutterHoverExtension(): Extension {
  return EditorView.domEventHandlers({
    mouseover: (event, view) => {
      setHoveredGutterHandle(view, hoverAnchorFromTarget(event.target, view));
      return false;
    },
    mouseout: (event, view) => {
      setHoveredGutterHandle(view, hoverAnchorFromTarget(event.relatedTarget, view));
      return false;
    },
  });
}

function calloutGutterAlignments(view: EditorView): CalloutGutterAlignment[] {
  const contentRect = view.contentDOM.getBoundingClientRect();
  const handlesRight = view.dom.ownerDocument.body?.classList.contains("dragdrop-handles-right") ?? false;
  const rtl = view.textDirection === Direction.RTL;
  const side = handlesRight === rtl ? "right" : "left";
  const ownerWindow = view.dom.ownerDocument.defaultView;
  const gap = Number.parseFloat(
    ownerWindow?.getComputedStyle(view.dom).getPropertyValue("--size-4-1") ?? "",
  ) || 4;
  const alignments: CalloutGutterAlignment[] = [];

  for (const marker of view.dom.findAll(".dragdrop-gutter-marker")) {
    const handle = marker.querySelector<HTMLElement>(".dragdrop-handle[data-dragdrop-handle-kind='callout']");
    if (!handle) continue;

    const markerRect = marker.getBoundingClientRect();
    const previousOffset = calloutGutterOffsets.get(marker) ?? 0;
    const from = Number(handle.dataset.dragdropHandleFrom ?? 0);
    const coords = view.coordsAtPos(from);
    const nextOffset = calloutGutterOffset(side, {
      lineLeft: coords?.left ?? contentRect.left,
      lineRight: coords?.right ?? contentRect.right,
      markerLeft: markerRect.left,
      markerRight: markerRect.right,
      previousOffset,
      gap,
    });
    alignments.push({ marker, offset: nextOffset });
  }

  return alignments;
}

function scheduleCalloutGutterAlignment(view: EditorView): void {
  view.requestMeasure({
    key: calloutAlignmentMeasureKey,
    read: (measuredView) => calloutGutterAlignments(measuredView),
    write: (alignments, measuredView) => {
      if (!measuredView.dom.isConnected) return;
      for (const { marker, offset } of alignments) {
        if (!marker.isConnected) continue;
        marker.style.setProperty("--dragdrop-callout-offset-x", `${offset}px`);
        calloutGutterOffsets.set(marker, offset);
      }
    },
  });
}

function createDragHandleElement(
  starter: DragStarter,
  view: EditorView,
  range: HandleRange,
): HTMLElement {
  const element = createSpan({
    cls: "dragdrop-handle",
    attr: {
      draggable: "true",
      tabindex: "0",
      role: "button",
      "aria-label": "Drag Markdown block",
      "aria-pressed": "false",
      "data-tooltip-position": "top",
      "data-dragdrop-handle-kind": range.kind,
      "data-dragdrop-handle-from": range.from.toString(),
      "data-dragdrop-handle-to": range.to.toString(),
    },
  });
  if (element.ownerDocument !== view.dom.ownerDocument) {
    view.dom.ownerDocument.adoptNode(element);
  }

  const icon = element.createSpan({ cls: "dragdrop-handle-icon" });
  setIcon(icon, "grip-vertical");

  element.addEventListener("dragstart", (event) => {
    starter.beginDrag(event, view, range);
  });
  element.addEventListener("pointerdown", (event) => {
    if (starter.handleHandlePointerDown(event, view, range, element)) return;
    starter.beginPointerDrag(event, view, range, element);
  });
  element.addEventListener("contextmenu", (event) => {
    starter.openHandleMenu(event, view, range, element);
  });
  element.addEventListener("pointermove", (event) => {
    starter.movePointerDrag(event);
  });
  element.addEventListener("pointerup", (event) => {
    void starter.endPointerDrag(event);
  });
  element.addEventListener("pointercancel", (event) => {
    starter.cancelPointerDrag(event.pointerId);
  });
  element.addEventListener("lostpointercapture", (event) => {
    starter.cancelPointerDrag(event.pointerId);
  });
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      scrollIntoView: true,
    });
    view.focus();
  });

  if (range.kind === "callout") scheduleCalloutGutterAlignment(view);

  return element;
}

function buildDecorations(state: EditorState, starter: DragStarter): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of buildHandleRanges(state)) {
    if (range.kind === "callout") continue;
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

function buildGutterMarkers(state: EditorState, starter: DragStarter): RangeSet<GutterMarker> {
  const builder = new RangeSetBuilder<GutterMarker>();
  for (const range of buildHandleRanges(state)) {
    if (range.kind !== "callout") continue;
    builder.add(range.from, range.from, new DragHandleGutterMarker(starter, range));
  }
  return builder.finish();
}

export function createDragHandleExtension(starter: DragStarter): Extension {
  const decorationField = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, starter);
    },
    update(value, transaction) {
      if (!transaction.docChanged) return value;
      return buildDecorations(transaction.state, starter);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  const gutterField = StateField.define<RangeSet<GutterMarker>>({
    create(state) {
      return buildGutterMarkers(state, starter);
    },
    update(value, transaction) {
      if (!transaction.docChanged) return value;
      return buildGutterMarkers(transaction.state, starter);
    },
  });

  return [
    decorationField,
    gutterField,
    gutter({
      class: "dragdrop-gutter",
      side: "before",
      renderEmptyElements: false,
      markers: (view) => view.state.field(gutterField),
      lineMarkerChange: (update) =>
        update.docChanged || update.viewportChanged || update.geometryChanged,
    }),
    createGutterHoverExtension(),
    EditorView.updateListener.of((update) => {
      restorePendingEditorSync(update);
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        scheduleCalloutGutterAlignment(update.view);
      }
    }),
  ];
}
