import {
  modifierChordFromEvent,
  type CanvasDropAction,
  type ModifierChord,
} from "./model";

export type ResolvedCanvasDropAction = Exclude<CanvasDropAction, "inherit">;
export type ModifierKeyState = Pick<
  KeyboardEvent,
  "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
>;
export type CanvasActionBindings = Readonly<
  Partial<Record<ModifierChord, unknown>>
>;

function isResolvedCanvasDropAction(
  value: unknown,
): value is ResolvedCanvasDropAction {
  return value === "link-source" || value === "create-note" || value === "none";
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
