import type { EditorState } from "@codemirror/state";
import type { SourceUnit } from "./model";
import { lineEndForUnit } from "./content-segmentation";

const BLOCK_ID_RE = /^[A-Za-z0-9-]+$/;

export function createRandomBlockId(length = 6): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function isValidBlockId(value: string): boolean {
  return BLOCK_ID_RE.test(value);
}

function inlineInsertionPosition(state: EditorState, unit: SourceUnit): number {
  const end = Math.max(0, Math.min(unit.anchorTo ?? unit.to, state.doc.length));
  let line = state.doc.lineAt(end);
  while (line.number > 1 && line.text.trim().length === 0) {
    line = state.doc.line(line.number - 1);
  }
  const trailingWhitespace = line.text.match(/\s*$/)?.[0].length ?? 0;
  return line.to - trailingWhitespace;
}

export function ensurePlannedReference(
  state: EditorState,
  unit: SourceUnit,
  usedIds: Set<string>,
): SourceUnit {
  if (unit.kind === "heading") return unit;
  if (unit.existingBlockId) {
    usedIds.add(unit.existingBlockId);
    return { ...unit, plannedBlockId: unit.existingBlockId };
  }

  let blockId = createRandomBlockId();
  while (usedIds.has(blockId)) blockId = createRandomBlockId();
  usedIds.add(blockId);

  const inlineKinds = new Set(["paragraph", "list-item", "quote", "callout"]);
  const inline =
    unit.blockIdPlacement === "inline" ||
    (unit.blockIdPlacement === undefined && inlineKinds.has(unit.kind));
  const pos = inline
    ? inlineInsertionPosition(state, unit)
    : unit.anchorTo ?? lineEndForUnit(state, unit);

  return {
    ...unit,
    plannedBlockId: blockId,
    blockIdInsert: {
      pos,
      text: inline ? ` ^${blockId}` : `\n^${blockId}`,
    },
  };
}

export function sourceSubpath(unit: SourceUnit): string {
  if (unit.kind === "heading") return `#${unit.heading ?? ""}`;
  const blockId = unit.plannedBlockId ?? unit.existingBlockId;
  return blockId ? `#^${blockId}` : "";
}

export function sourceEmbedLink(linktext: string, subpath = ""): string {
  return `![[${linktext}${subpath}]]`;
}

export function applyBlockIdInsertions(
  state: EditorState,
  dispatch: (transaction: ReturnType<EditorState["update"]>) => void,
  units: SourceUnit[],
): void {
  const changes = units
    .flatMap((unit) => (unit.blockIdInsert ? [unit.blockIdInsert] : []))
    .sort((left, right) => {
      const positionOrder = right.pos - left.pos;
      if (positionOrder !== 0) return positionOrder;

      // CodeMirror concatenates same-position inserts in array order.
      return Number(left.text.startsWith("\n")) - Number(right.text.startsWith("\n"));
    })
    .map((change) => ({ from: change.pos, to: change.pos, insert: change.text }));

  if (changes.length === 0) return;
  dispatch(state.update({ changes }));
}
