import {
  modifierChordFromEvent,
  type CanvasDropAction,
  type MarkdownDropAction,
  type ModifierChord,
} from "./model";

export type ResolvedCanvasDropAction = Exclude<CanvasDropAction, "inherit">;
export type ResolvedMarkdownDropAction = Exclude<MarkdownDropAction, "inherit">;
export type MarkdownDropContext = "same-file" | "cross-file";
export type ModifierKeyState = Pick<
  KeyboardEvent,
  "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
>;
export type CanvasActionBindings = Readonly<
  Partial<Record<ModifierChord, unknown>>
>;
export type MarkdownActionBindings = Readonly<
  Partial<Record<ModifierChord, unknown>>
>;

function isResolvedCanvasDropAction(
  value: unknown,
): value is ResolvedCanvasDropAction {
  return value === "link-source" || value === "create-note" || value === "none";
}

function isResolvedMarkdownDropAction(
  value: unknown,
): value is ResolvedMarkdownDropAction {
  return value === "embed-source" || value === "move" || value === "none";
}

export function resolveCanvasDropAction(
  event: ModifierKeyState,
  bindings: CanvasActionBindings | null | undefined,
): ResolvedCanvasDropAction {
  const configured = bindings?.[modifierChordFromEvent(event)];
  if (isResolvedCanvasDropAction(configured)) return configured;

  const fallback = bindings?.none;
  return isResolvedCanvasDropAction(fallback) ? fallback : "link-source";
}

export function resolveMarkdownDropAction(
  event: ModifierKeyState,
  bindings: MarkdownActionBindings | null | undefined,
): ResolvedMarkdownDropAction {
  const configured = bindings?.[modifierChordFromEvent(event)];
  if (isResolvedMarkdownDropAction(configured)) return configured;

  const fallback = bindings?.none;
  return isResolvedMarkdownDropAction(fallback) ? fallback : "embed-source";
}

export function resolveMarkdownDropActionForContext(
  event: ModifierKeyState,
  context: MarkdownDropContext,
  crossFileBindings: MarkdownActionBindings | null | undefined,
  sameFileBindings: MarkdownActionBindings | null | undefined,
): ResolvedMarkdownDropAction {
  return resolveMarkdownDropAction(
    event,
    context === "same-file" ? sameFileBindings : crossFileBindings,
  );
}
