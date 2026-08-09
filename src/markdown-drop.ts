import type { SourceUnit } from "./model";

const DIRECT_BLOCK_EMBED_RE = /^\s*!\[\[[^\]\r\n]*#\^[A-Za-z0-9-]+(?:\|[^\]\r\n]*)?\]\]\s*$/;

export function directBlockEmbed(text: string): string | null {
  const trimmed = text.trim();
  return DIRECT_BLOCK_EMBED_RE.test(trimmed) ? trimmed : null;
}

export function directBlockEmbedLinktext(text: string): string | null {
  const embed = directBlockEmbed(text);
  if (!embed) return null;
  return embed.slice(3, -2).split("|", 1)[0]?.trim() ?? null;
}

export interface TextRange {
  from: number;
  to: number;
}

export interface MarkdownDropBoundary {
  position: number;
  top: number;
}

export function collectMarkdownDropBoundaryPositions(
  documentLength: number,
  ranges: readonly TextRange[],
): number[] {
  const positions = new Set<number>([0, Math.max(0, documentLength)]);
  for (const range of ranges) {
    positions.add(Math.max(0, Math.min(documentLength, range.from)));
    positions.add(Math.max(0, Math.min(documentLength, range.to)));
  }
  return [...positions].sort((left, right) => left - right);
}

export function chooseMarkdownDropPosition(
  rawPosition: number,
  clientY: number,
  boundaries: readonly MarkdownDropBoundary[],
): number | null {
  if (boundaries.length === 0) return null;

  return boundaries.reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate.top - clientY);
    const bestDistance = Math.abs(best.top - clientY);
    if (candidateDistance !== bestDistance) {
      return candidateDistance < bestDistance ? candidate : best;
    }

    const candidatePositionDistance = Math.abs(candidate.position - rawPosition);
    const bestPositionDistance = Math.abs(best.position - rawPosition);
    return candidatePositionDistance < bestPositionDistance ? candidate : best;
  }).position;
}

export interface TextChange extends TextRange {
  insert: string;
}

export interface MarkdownMoveBlock extends TextRange {
  text: string;
}

type RemovalRange = TextRange;

export type MoveConfirmationContext = "same-file" | "cross-file" | "destructive-edit";

export function requiresMoveConfirmation(
  units: readonly SourceUnit[],
  context: MoveConfirmationContext = "destructive-edit",
): boolean {
  return context !== "same-file" && units.some((unit) => unit.existingBlockId !== undefined);
}

function normalizedRanges(content: string, ranges: readonly TextRange[]): TextRange[] {
  const sorted = [...ranges]
    .map((range) => ({
      from: Math.max(0, range.from),
      to: Math.min(content.length, range.to),
    }))
    .sort((left, right) => left.from - right.from || left.to - right.to);

  let previousTo = 0;
  for (const range of sorted) {
    if (range.from > range.to || range.from < previousTo) {
      throw new Error("Markdown block ranges overlap or exceed the document.");
    }
    previousTo = range.to;
  }
  return sorted;
}

function removalRanges(content: string, ranges: readonly TextRange[]): RemovalRange[] {
  const sourceRanges = normalizedRanges(content, ranges);
  const result: RemovalRange[] = [];

  for (const range of sourceRanges) {
    const previous = result.at(-1);
    let from = Math.max(range.from, previous?.to ?? 0);
    let to = range.to;

    const after = content.slice(to, to + 2);
    if (after === "\n\n") to += 2;
    else if (content.slice(to, to + 1) === "\n") to += 1;
    else if (!previous || previous.to < range.from) {
      if (content.slice(Math.max(0, from - 2), from) === "\n\n") from -= 2;
      else if (content.slice(Math.max(0, from - 1), from) === "\n") from -= 1;
    }

    if (previous && from < previous.to) from = previous.to;
    result.push({ from, to });
  }

  return result;
}

export function removeTextRanges(
  content: string,
  ranges: readonly TextRange[],
): string {
  const removals = removalRanges(content, ranges);
  let result = "";
  let cursor = 0;
  for (const range of removals) {
    result += content.slice(cursor, range.from);
    cursor = range.to;
  }
  return result + content.slice(cursor);
}

export function mapPositionAfterRemovals(
  position: number,
  content: string,
  ranges: readonly TextRange[],
): number {
  const removals = removalRanges(content, ranges);
  let removed = 0;
  for (const range of removals) {
    if (position <= range.from) return position - removed;
    if (position < range.to) return range.from - removed;
    removed += range.to - range.from;
  }
  return position - removed;
}

function boundaryInsertion(
  content: string,
  position: number,
  blocks: readonly string[],
): string {
  const safePosition = Math.max(0, Math.min(position, content.length));
  const before = content.slice(0, safePosition);
  const after = content.slice(safePosition);
  const body = blocks
    .map((block) => block.trimEnd())
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
  if (!body) return "";

  const beforeSeparator =
    before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const afterSeparator =
    after.length === 0 ? "" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return `${beforeSeparator}${body}${afterSeparator}`;
}

export function insertBlocksAtBoundary(
  content: string,
  position: number,
  blocks: readonly string[],
): string {
  const safePosition = Math.max(0, Math.min(position, content.length));
  return `${content.slice(0, safePosition)}${boundaryInsertion(content, safePosition, blocks)}${content.slice(safePosition)}`;
}

export function planMarkdownMove(
  content: string,
  blocks: readonly MarkdownMoveBlock[],
  targetPosition: number,
): string {
  const ranges = blocks.map(({ from, to }) => ({ from, to }));
  const remaining = removeTextRanges(content, ranges);
  const mappedPosition = mapPositionAfterRemovals(targetPosition, content, ranges);
  return insertBlocksAtBoundary(
    remaining,
    mappedPosition,
    blocks.map((block) => block.text),
  );
}

export function applyTextChanges(
  content: string,
  changes: readonly TextChange[],
): string {
  const sorted = changes
    .map((change, index) => ({ ...change, index }))
    .sort((left, right) => left.from - right.from || left.to - right.to || left.index - right.index);

  let result = "";
  let cursor = 0;
  for (const change of sorted) {
    if (change.from < cursor || change.from > change.to || change.to > content.length) {
      throw new Error("Markdown text changes overlap or exceed the document.");
    }
    result += content.slice(cursor, change.from);
    result += change.insert;
    cursor = change.to;
  }
  return result + content.slice(cursor);
}

export function mapPositionAfterChanges(
  position: number,
  changes: readonly TextChange[],
): number {
  return position + changes.reduce((offset, change) => {
    if (change.from > position) return offset;
    return offset + change.insert.length - (change.to - change.from);
  }, 0);
}

export function mapPositionAfterInsertion(
  content: string,
  position: number,
  blocks: readonly string[],
  insertionPosition: number,
): number {
  const safePosition = Math.max(0, Math.min(position, content.length));
  const safeInsertionPosition = Math.max(0, Math.min(insertionPosition, content.length));
  const inserted = boundaryInsertion(content, safeInsertionPosition, blocks);
  return safePosition >= safeInsertionPosition
    ? safePosition + inserted.length
    : safePosition;
}

export function mapPositionAfterMove(
  content: string,
  blocks: readonly MarkdownMoveBlock[],
  targetPosition: number,
  position: number,
): number {
  const ranges = blocks.map(({ from, to }) => ({ from, to }));
  const remaining = removeTextRanges(content, ranges);
  const mappedTarget = mapPositionAfterRemovals(targetPosition, content, ranges);
  const inserted = boundaryInsertion(remaining, mappedTarget, blocks.map((block) => block.text));
  const before = remaining.slice(0, Math.max(0, Math.min(mappedTarget, remaining.length)));
  const beforeSeparator =
    before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const insertionStart = mappedTarget + beforeSeparator.length;

  const containing = ranges.find((range) => position >= range.from && position <= range.to);
  if (containing) {
    return insertionStart + Math.max(0, Math.min(position - containing.from, containing.to - containing.from));
  }

  const afterRemoval = mapPositionAfterRemovals(position, content, ranges);
  return afterRemoval >= mappedTarget ? afterRemoval + inserted.length : afterRemoval;
}

export function boundaryInsertionForBlocks(
  content: string,
  position: number,
  blocks: readonly string[],
): string {
  return boundaryInsertion(content, position, blocks);
}
