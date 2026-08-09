import {
  planMarkdownMove,
  type MarkdownMoveBlock,
  type TextRange,
} from "./markdown-drop";

export type ListDropMode = "sibling" | "child" | "outdent";

export interface ListDropIntent {
  mode: ListDropMode;
  contextLineNumber: number;
  targetIndentWidth: number;
}

export type MarkdownDropIssue =
  | "inside-source"
  | "frontmatter"
  | "table-cell"
  | "fenced-code"
  | "quote-run"
  | "horizontal-rule";

interface ListLine {
  indentRaw: string;
  indentWidth: number;
  marker: string;
  markerEnd: number;
}

const LIST_LINE_RE = /^(?<indent>[ \t]*)(?<marker>(?:[-+*]|\d+[.)]))(?<spacing>\s+)/;
const FENCE_LINE_RE = /^\s*(?<marker>`{3,}|~{3,})/;
const HORIZONTAL_RULE_RE = /^\s*(?:\*\s*){3,}$|^\s*(?:-\s*){3,}$|^\s*(?:_\s*){3,}$/;
const ORDERED_LIST_RE = /^(?<indent>[ \t]*)(?<number>\d+)(?<marker>[.)])(?<spacing>\s+)/;

function indentWidth(raw: string): number {
  let width = 0;
  for (const character of raw) width += character === "\t" ? 4 : 1;
  return width;
}

function parseListLine(line: string): ListLine | null {
  const match = line.match(LIST_LINE_RE);
  if (!match?.groups) return null;
  const indentRaw = match.groups.indent ?? "";
  const marker = match.groups.marker ?? "";
  const spacing = match.groups.spacing ?? "";
  return {
    indentRaw,
    indentWidth: indentWidth(indentRaw),
    marker,
    markerEnd: indentRaw.length + marker.length + spacing.length,
  };
}

function startsExplicitBlock(line: string, nextLine: string | undefined): boolean {
  return (
    /^\s*#{1,6}\s+/.test(line) ||
    parseListLine(line) !== null ||
    FENCE_LINE_RE.test(line) ||
    /^\s*\$\$\s*$/.test(line) ||
    (line.includes("|") && nextLine !== undefined && /\|?\s*:?-{3,}:?\s*\|/.test(nextLine)) ||
    /^\s*\^[A-Za-z0-9-]+\s*$/.test(line)
  );
}

function firstNonEmptyLine(text: string): string | null {
  return text.split("\n").find((line) => line.trim().length > 0) ?? null;
}

function indentationUnitWidth(sourceText: string, targetIndentRaw: string): number {
  if (targetIndentRaw.includes("\t")) return 4;

  const sourceLines = sourceText.split("\n");
  const first = sourceLines.map((line) => parseListLine(line)).find((line) => line !== null);
  const base = first?.indentWidth ?? 0;
  const nested = sourceLines
    .map((line) => indentWidth(line.match(/^[ \t]*/)?.[0] ?? ""))
    .find((width) => width > base);
  if (nested !== undefined) return Math.max(1, nested - base);
  if (targetIndentRaw.length > 0) return Math.min(2, Math.max(1, indentWidth(targetIndentRaw)));
  return 2;
}

function buildIndent(sample: string, width: number): string {
  const safeWidth = Math.max(0, Math.trunc(width));
  if (!sample.includes("\t")) return " ".repeat(safeWidth);

  const tabs = Math.floor(safeWidth / 4);
  return "\t".repeat(tabs) + " ".repeat(safeWidth % 4);
}

export function resolveListDropIntent(params: {
  sourceText: string;
  targetLineText: string;
  pointerColumn: number;
  contextLineNumber: number;
}): ListDropIntent | null {
  const source = firstNonEmptyLine(params.sourceText);
  const sourceList = source ? parseListLine(source) : null;
  const targetList = parseListLine(params.targetLineText);
  if (!sourceList || !targetList) return null;

  const unit = indentationUnitWidth(params.sourceText, targetList.indentRaw);
  const pointerColumn = Math.max(0, Math.trunc(params.pointerColumn));
  let mode: ListDropMode = "sibling";
  let targetIndentWidth = targetList.indentWidth;

  if (pointerColumn <= targetList.indentWidth && targetList.indentWidth >= unit) {
    mode = "outdent";
    targetIndentWidth = targetList.indentWidth - unit;
  } else if (pointerColumn > targetList.markerEnd) {
    mode = "child";
    targetIndentWidth = targetList.indentWidth + unit;
  }

  return {
    mode,
    contextLineNumber: params.contextLineNumber,
    targetIndentWidth,
  };
}

export function adjustListBlockIndent(
  sourceText: string,
  targetLineText: string,
  intent: ListDropIntent,
): string {
  const sourceLine = firstNonEmptyLine(sourceText);
  const sourceList = sourceLine ? parseListLine(sourceLine) : null;
  const targetList = parseListLine(targetLineText);
  if (!sourceList || !targetList) return sourceText;

  const delta = intent.targetIndentWidth - sourceList.indentWidth;
  if (delta === 0) return sourceText;
  const unitSample = targetList.indentRaw || sourceList.indentRaw;

  return sourceText
    .split("\n")
    .map((line) => {
      if (line.trim().length === 0) return line;
      const leading = line.match(/^[ \t]*/)?.[0] ?? "";
      const currentWidth = indentWidth(leading);
      if (currentWidth < sourceList.indentWidth) return line;
      const adjusted = buildIndent(unitSample, currentWidth + delta);
      return `${adjusted}${line.slice(leading.length)}`;
    })
    .join("\n");
}

export function findMoveTargetIssue(
  content: string,
  sourceRanges: readonly TextRange[],
  targetPosition: number,
): MarkdownDropIssue | null {
  if (sourceRanges.some((range) => targetPosition >= range.from && targetPosition <= range.to)) {
    return "inside-source";
  }

  const safePosition = Math.max(0, Math.min(content.length, targetPosition));
  const lines = content.split("\n");
  const lineOffsets: number[] = [];
  let nextOffset = 0;
  for (const line of lines) {
    lineOffsets.push(nextOffset);
    nextOffset += line.length + 1;
  }
  let offset = 0;
  let lineIndex = 0;
  for (const [index, line] of lines.entries()) {
    const lineEnd = offset + line.length;
    if (safePosition <= lineEnd) {
      lineIndex = index;
      break;
    }
    offset = lineEnd + 1;
  }

  const line = lines[lineIndex] ?? "";
  const lineStart = offset;
  const lineEnd = lineStart + line.length;
  const insideLine = safePosition > lineStart && safePosition < lineStart + line.length;

  if (lines[0]?.trim() === "---") {
    const closing = lines.slice(1).findIndex((candidate) => candidate.trim() === "---");
    if (closing >= 0 && lineIndex <= closing + 1) {
      const closingIndex = closing + 1;
      const isBeforeFrontmatter = lineIndex === 0 && safePosition === lineStart;
      const isAfterFrontmatter = lineIndex === closingIndex && safePosition === lineEnd;
      if (!isBeforeFrontmatter && !isAfterFrontmatter) return "frontmatter";
    }
  }

  if (line.includes("|")) {
    let tableStart = lineIndex;
    while (tableStart > 0 && lines[tableStart - 1]?.includes("|")) tableStart -= 1;
    let tableEnd = lineIndex;
    while (tableEnd + 1 < lines.length && lines[tableEnd + 1]?.includes("|")) tableEnd += 1;
    const hasSeparator = lines
      .slice(tableStart, tableEnd + 1)
      .some((candidate) => /\|?\s*:?-{3,}:?\s*\|/.test(candidate));
    if (hasSeparator) {
      const isBeforeTable = lineIndex === tableStart && safePosition === lineStart;
      const isAfterTable = lineIndex === tableEnd && safePosition === lineEnd;
      if (!isBeforeTable && !isAfterTable) return "table-cell";
    }
  }

  if (insideLine && HORIZONTAL_RULE_RE.test(line)) return "horizontal-rule";

  let fenceMarker: string | null = null;
  let fenceStart = -1;
  let fenceEnd = -1;
  for (const [index, candidate] of lines.entries()) {
    if (index > lineIndex && fenceEnd < 0) break;
    const fence = candidate.match(FENCE_LINE_RE)?.groups?.marker;
    if (!fence) continue;
    if (fenceMarker === null) {
      fenceMarker = fence[0] ?? null;
      fenceStart = index;
    } else if (fence[0] === fenceMarker && fence.length >= fenceMarker.length) {
      fenceEnd = index;
      fenceMarker = null;
    }
  }
  if (fenceStart >= 0 && (fenceEnd < 0 || lineIndex < fenceEnd)) {
    const isBeforeFence = lineIndex === fenceStart && safePosition === lineStart;
    if (!isBeforeFence) return "fenced-code";
  }
  if (fenceEnd === lineIndex && safePosition < lineEnd) {
    return "fenced-code";
  }

  if (/^\s*>/.test(line)) {
    let quoteStart = lineIndex;
    while (quoteStart > 0 && /^\s*>/.test(lines[quoteStart - 1] ?? "")) quoteStart -= 1;
    let quoteEnd = lineIndex;
    while (quoteEnd + 1 < lines.length && /^\s*>/.test(lines[quoteEnd + 1] ?? "")) quoteEnd += 1;
    const isBeforeQuote = lineIndex === quoteStart && safePosition === lineStart;
    const isAfterQuote = lineIndex === quoteEnd && safePosition === lineEnd;
    if (!isBeforeQuote && !isAfterQuote) return "quote-run";
  }

  let calloutStart = -1;
  for (let index = lineIndex; index >= 0; index -= 1) {
    const candidate = lines[index] ?? "";
    if (/^\s*>\s*\[!/.test(candidate)) {
      calloutStart = index;
      break;
    }
    if (candidate.trim().length === 0) break;
    if (index < lineIndex && startsExplicitBlock(candidate, lines[index + 1])) break;
  }
  if (calloutStart >= 0) {
    let calloutEnd = calloutStart;
    while (calloutEnd + 1 < lines.length) {
      const candidate = lines[calloutEnd + 1] ?? "";
      if (candidate.trim().length === 0) break;
      if (
        !/^\s*>/.test(candidate) &&
        startsExplicitBlock(candidate, lines[calloutEnd + 2])
      ) {
        break;
      }
      calloutEnd += 1;
    }
    if (lineIndex >= calloutStart && lineIndex <= calloutEnd) {
      const isBeforeCallout =
        lineIndex === calloutStart && safePosition === lineOffsets[calloutStart];
      const isAfterCallout =
        lineIndex === calloutEnd && safePosition === lineOffsets[calloutEnd] + line.length;
      if (!isBeforeCallout && !isAfterCallout) return "quote-run";
    }
  }

  return null;
}

export function planStructuredMarkdownMove(
  content: string,
  blocks: readonly MarkdownMoveBlock[],
  targetPosition: number,
  targetLineText: string,
  listIntent: ListDropIntent | null,
): string {
  return planMarkdownMove(
    content,
    structuredMoveBlocks(blocks, targetLineText, listIntent),
    targetPosition,
  );
}

export function structuredMoveBlocks(
  blocks: readonly MarkdownMoveBlock[],
  targetLineText: string,
  listIntent: ListDropIntent | null,
): MarkdownMoveBlock[] {
  return listIntent === null
    ? [...blocks]
    : blocks.map((block) => ({
        ...block,
        text: adjustListBlockIndent(block.text, targetLineText, listIntent),
      }));
}

export function renumberOrderedListMarkers(content: string): string {
  const lines = content.split("\n");
  const counters = new Map<number, number>();
  let inFence: string | null = null;
  let previousWasOrdered = false;

  for (const [index, line] of lines.entries()) {
    const fence = line.match(FENCE_LINE_RE)?.groups?.marker;
    if (fence) {
      if (inFence === null) inFence = fence;
      else if (fence[0] === inFence && fence.length >= inFence.length) inFence = null;
      previousWasOrdered = false;
      continue;
    }
    if (inFence !== null) continue;

    const match = line.match(ORDERED_LIST_RE);
    if (!match?.groups) {
      if (line.trim().length === 0) {
        counters.clear();
      } else if (!/^\s+/.test(line)) {
        counters.clear();
      }
      previousWasOrdered = false;
      continue;
    }

    const indent = indentWidth(match.groups.indent ?? "");
    const nextNumber = previousWasOrdered && counters.has(indent)
      ? counters.get(indent)! + 1
      : 1;
    counters.set(indent, nextNumber);
    lines[index] = `${match.groups.indent ?? ""}${nextNumber}${match.groups.marker ?? "."}${match.groups.spacing ?? ""}${line.slice(match[0].length)}`;
    previousWasOrdered = true;
  }

  return lines.join("\n");
}
