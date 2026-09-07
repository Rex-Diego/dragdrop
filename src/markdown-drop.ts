import { ChangeSet, Text } from "@codemirror/state";
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

    const after = leadingNewlineCount(content.slice(to));
    if (after > 0 && to + after < content.length) to += after;
    else if (!previous || previous.to < range.from) {
      from -= trailingNewlineCount(content.slice(0, from));
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

function trailingNewlineCount(text: string): number {
  let count = 0;
  for (let index = text.length - 1; index >= 0 && text[index] === "\n"; index -= 1) {
    count += 1;
  }
  return count;
}

function leadingNewlineCount(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length && text[index] === "\n"; index += 1) {
    count += 1;
  }
  return count;
}

function moveSeparatorHint(content: string, ranges: readonly TextRange[]): string {
  const sorted = normalizedRanges(content, ranges);
  const first = sorted[0];
  if (!first) return "\n";

  // Removing a block consumes the newline run on its right when one exists,
  // leaving the run on its left to separate the two neighboring blocks. Use
  // that surviving run as the fallback separator when the destination is an
  // end-of-document boundary.
  const before = trailingNewlineCount(content.slice(0, first.from));
  if (before > 0) return "\n".repeat(before);

  const after = leadingNewlineCount(content.slice(first.to));
  return "\n".repeat(Math.max(1, after));
}

interface MoveBoundaryInsertion {
  text: string;
  start: number;
}

function moveBoundaryInsertion(
  content: string,
  position: number,
  blocks: readonly string[],
  fallbackSeparator: string,
  blockSeparators: readonly string[] = [],
): MoveBoundaryInsertion {
  const safePosition = Math.max(0, Math.min(position, content.length));
  const before = content.slice(0, safePosition);
  const after = content.slice(safePosition);
  const body = blocks
    // Source ranges are line bounded, but stripping terminal line breaks here
    // keeps this helper safe for callers that provide a whole-line range while
    // preserving meaningful trailing spaces in the block itself.
    .map((block) => block.replace(/\n+$/g, ""))
    .filter((block) => block.trim().length > 0)
    .map((block, index) => `${index === 0 ? "" : blockSeparators[index - 1] ?? fallbackSeparator}${block}`)
    .join("");
  if (!body) return { text: "", start: safePosition };

  const beforeNewlines = trailingNewlineCount(before);
  const afterNewlines = leadingNewlineCount(after);
  const fallbackCount = Math.max(1, trailingNewlineCount(fallbackSeparator));
  // A line-boundary drop already has the destination's original newline run
  // on one side. Mirror that run on the other side of the moved block so the
  // destination gap remains unchanged. End-of-document drops use the
  // separator that survives source removal instead.
  const destinationCount = after.length === afterNewlines
    ? beforeNewlines
    : Math.max(beforeNewlines, afterNewlines);
  const separator = "\n".repeat(destinationCount > 0 ? destinationCount : fallbackCount);
  const beforeSeparator = before.length === 0 || beforeNewlines > 0
    ? ""
    : separator;
  const afterSeparator = after.length === 0 || afterNewlines > 0
    ? ""
    : separator;

  return {
    text: `${beforeSeparator}${body}${afterSeparator}`,
    start: safePosition + beforeSeparator.length,
  };
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
  return planMarkdownMoveChanges(content, blocks, targetPosition).after;
}

export function planMarkdownMoveChanges(
  content: string,
  blocks: readonly MarkdownMoveBlock[],
  targetPosition: number,
): { changes: ChangeSet; after: string; mapPosition: (position: number) => number } {
  blocks = [...blocks].sort((left, right) => left.from - right.from);
  const ranges = blocks.map(({ from, to }) => ({ from, to }));
  const doc = Text.of(content.split("\n"));
  const removals = ChangeSet.of(removalRanges(content, ranges).map((range) => ({
    ...range, insert: "",
  })), content.length);
  const remaining = removals.apply(doc).toString();
  let mappedPosition = removals.mapPos(Math.max(0, Math.min(targetPosition, content.length)));
  if (targetPosition >= content.length) mappedPosition -= trailingNewlineCount(remaining);
  const separator = moveSeparatorHint(content, ranges);
  const blockSeparators = blocks.slice(1).map((block, index) => {
    const gap = content.slice(blocks[index].to, block.from);
    return /^\n+$/.test(gap) ? gap : separator;
  });
  const insertion = moveBoundaryInsertion(
    remaining,
    mappedPosition,
    blocks.map((block) => block.text),
    separator,
    blockSeparators,
  );
  const changes = removals.compose(ChangeSet.of({
    from: mappedPosition, insert: insertion.text,
  }, remaining.length));
  return {
    changes,
    after: changes.apply(doc).toString(),
    mapPosition: (position) => {
      let start = insertion.start;
      for (const [index, block] of blocks.entries()) {
        const text = block.text.replace(/\n+$/g, "");
        if (position >= block.from && position <= block.to) {
          return start + mapMovedBlockOffset(
            content.slice(block.from, block.to), text, position - block.from,
          );
        }
        start += text.length + (blockSeparators[index] ?? separator).length;
      }
      return changes.mapPos(position, 1);
    },
  };
}

function mapMovedBlockOffset(before: string, after: string, offset: number): number {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let oldStart = 0;
  let newStart = 0;
  for (let index = 0; index < oldLines.length; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index] ?? "";
    if (offset <= oldStart + oldLine.length) {
      const oldIndent = oldLine.match(/^[ \t]*/)?.[0].length ?? 0;
      const newIndent = newLine.match(/^[ \t]*/)?.[0].length ?? 0;
      return newStart + Math.max(0, Math.min(newLine.length, offset - oldStart + newIndent - oldIndent));
    }
    oldStart += oldLine.length + 1;
    newStart += newLine.length + 1;
  }
  return after.length;
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
  return planMarkdownMoveChanges(content, blocks, targetPosition).mapPosition(position);
}

export function boundaryInsertionForBlocks(
  content: string,
  position: number,
  blocks: readonly string[],
): string {
  return boundaryInsertion(content, position, blocks);
}
