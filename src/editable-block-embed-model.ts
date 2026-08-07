export type BlockIdPlacement = "inline" | "standalone";

export interface MarkdownBlockLocation {
  id: string;
  from: number;
  to: number;
  markerFrom: number;
  markerTo: number;
  placement: BlockIdPlacement;
  text: string;
  bodyText: string;
}

export type BlockLookupResult =
  | { status: "ok"; location: MarkdownBlockLocation }
  | { status: "missing" }
  | { status: "duplicate" };

export type BlockReplacementResult =
  | { status: "ok"; content: string; location: MarkdownBlockLocation }
  | { status: "missing" | "duplicate" | "conflict" | "id-changed" };

interface MarkdownLine {
  from: number;
  to: number;
  contentEnd: number;
  text: string;
}

interface BlockIdToken {
  id: string;
  from: number;
  to: number;
  lineIndex: number;
  standalone: boolean;
}

const BLOCK_ID_CHAR_RE = /[A-Za-z0-9-]/;
const LIST_RE = /^(\s*)(?:[-+*]|\d+[.)])\s+/;
const HEADING_RE = /^\s{0,3}#{1,6}(?:\s|$)/;
const QUOTE_RE = /^\s*>/;
const FENCE_RE = /^\s{0,3}(?:`{3,}|~{3,})/;

function splitLines(content: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let from = 0;
  let index = 0;

  while (index < content.length) {
    if (content[index] !== "\n") {
      index += 1;
      continue;
    }

    const contentEnd = index > from && content[index - 1] === "\r" ? index - 1 : index;
    lines.push({ from, to: index + 1, contentEnd, text: content.slice(from, contentEnd) });
    from = index + 1;
    index += 1;
  }

  if (from < content.length || lines.length === 0) {
    lines.push({
      from,
      to: content.length,
      contentEnd: content.length,
      text: content.slice(from),
    });
  }

  return lines;
}

function isBlank(line: MarkdownLine): boolean {
  return /^\s*$/.test(line.text);
}

function listIndent(line: MarkdownLine): number | null {
  const match = LIST_RE.exec(line.text);
  return match ? match[1].length : null;
}

function isIndented(line: MarkdownLine): boolean {
  return /^\s+\S/.test(line.text);
}

function isStructuralLine(line: MarkdownLine): boolean {
  return HEADING_RE.test(line.text) || QUOTE_RE.test(line.text) || LIST_RE.test(line.text);
}

function isBlockIdChar(value: string | undefined): boolean {
  return value !== undefined && BLOCK_ID_CHAR_RE.test(value);
}

function isWikiEmbedStart(text: string, index: number): boolean {
  return text[index] === "[" && text[index + 1] === "[";
}

function collectLineTokens(
  line: MarkdownLine,
  lineIndex: number,
  includeNonTerminal: boolean,
): BlockIdToken[] {
  const tokens: BlockIdToken[] = [];
  const text = line.text;
  let index = 0;

  while (index < text.length) {
    if (isWikiEmbedStart(text, index)) {
      const end = text.indexOf("]]", index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }

    if (text[index] !== "^") {
      index += 1;
      continue;
    }

    const previous = text[index - 1];
    if (isBlockIdChar(previous)) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < text.length && isBlockIdChar(text[end])) end += 1;
    const id = text.slice(index + 1, end);
    const next = text[end];
    if (id.length === 0 || isBlockIdChar(next)) {
      index = Math.max(end, index + 1);
      continue;
    }

    const before = text.slice(0, index);
    const after = text.slice(end);
    if (!includeNonTerminal && !/^\s*$/.test(after)) {
      index = end;
      continue;
    }
    tokens.push({
      id,
      from: line.from + index,
      to: line.from + end,
      lineIndex,
      standalone: /^\s*>?\s*$/.test(before) && /^\s*$/.test(after),
    });
    index = end;
  }

  return tokens;
}

function isSameListItemOrContinuation(previous: MarkdownLine, current: MarkdownLine): boolean {
  const previousIndent = listIndent(previous);
  const currentIndent = listIndent(current);
  if (previousIndent === null) return false;
  if (currentIndent !== null) return currentIndent > previousIndent;
  return isIndented(current) || !isStructuralLine(current);
}

function canContinueBackward(previous: MarkdownLine, current: MarkdownLine): boolean {
  if (isBlank(previous)) return false;
  if (HEADING_RE.test(previous.text)) return false;

  const previousListIndent = listIndent(previous);
  if (previousListIndent !== null) {
    return isSameListItemOrContinuation(previous, current);
  }

  if (QUOTE_RE.test(previous.text)) {
    return QUOTE_RE.test(current.text) || !isStructuralLine(current);
  }

  if (QUOTE_RE.test(current.text) || listIndent(current) !== null) return false;
  return !FENCE_RE.test(previous.text);
}

function findBlockStart(lines: MarkdownLine[], anchorLine: number): number {
  let start = anchorLine;
  while (start > 0 && canContinueBackward(lines[start - 1], lines[start])) {
    start -= 1;
  }
  return start;
}

function canContinueForward(current: MarkdownLine, anchor: MarkdownLine): boolean {
  if (isBlank(current)) return false;
  if (HEADING_RE.test(current.text) || FENCE_RE.test(current.text)) return false;

  const anchorListIndent = listIndent(anchor);
  const currentListIndent = listIndent(current);
  if (anchorListIndent !== null) {
    if (currentListIndent !== null) return currentListIndent > anchorListIndent;
    return isIndented(current) || !isStructuralLine(current);
  }

  if (QUOTE_RE.test(anchor.text)) {
    return QUOTE_RE.test(current.text) || !isStructuralLine(current);
  }

  return !isStructuralLine(current);
}

function findBlockEnd(lines: MarkdownLine[], startLine: number, anchorLine: number): number {
  let end = anchorLine + 1;
  while (end < lines.length && canContinueForward(lines[end], lines[anchorLine])) {
    end += 1;
  }

  if (end <= startLine) return startLine + 1;
  return end;
}

function bodyTextForLocation(content: string, markerFrom: number, markerTo: number, from: number, to: number, placement: BlockIdPlacement): string {
  if (placement === "inline") {
    const beforeMarker = content.slice(from, markerFrom).replace(/[ \t]+$/, "");
    return `${beforeMarker}${content.slice(markerTo, to)}`.replace(/\r?\n$/, "");
  }

  return content.slice(from, markerFrom).replace(/\r?\n$/, "");
}

function markerLineOffset(content: string, location: MarkdownBlockLocation): number {
  return content.slice(location.from, location.markerFrom).split(/\r?\n/).length - 1;
}

function buildLocation(content: string, lines: MarkdownLine[], token: BlockIdToken): MarkdownBlockLocation {
  const placement: BlockIdPlacement = token.standalone ? "standalone" : "inline";
  const anchorLine = placement === "standalone" ? Math.max(0, token.lineIndex - 1) : token.lineIndex;
  const startLine = findBlockStart(lines, anchorLine);
  const endLine = placement === "standalone"
    ? token.lineIndex + 1
    : findBlockEnd(lines, startLine, token.lineIndex);
  const from = lines[startLine].from;
  const to = lines[Math.min(endLine, lines.length) - 1].to;

  return {
    id: token.id,
    from,
    to,
    markerFrom: token.from,
    markerTo: token.to,
    placement,
    text: content.slice(from, to),
    bodyText: bodyTextForLocation(content, token.from, token.to, from, to, placement),
  };
}

export function findBlockIdTokens(content: string): ReadonlyArray<{ id: string; from: number; to: number }> {
  return splitLines(content).flatMap((line, lineIndex) =>
    collectLineTokens(line, lineIndex, false).map(({ id, from, to }) => ({ id, from, to })),
  );
}

export function findBlockLocation(content: string, id: string): BlockLookupResult {
  const lines = splitLines(content);
  const tokens = lines.flatMap((line, lineIndex) => collectLineTokens(line, lineIndex, false));
  const allTokens = lines.flatMap((line, lineIndex) => collectLineTokens(line, lineIndex, true));
  const matches = tokens.filter((token) => token.id === id);
  const allMatches = allTokens.filter((token) => token.id === id);
  if (allMatches.length > 1) return { status: "duplicate" };
  if (matches.length === 0) return { status: "missing" };
  if (matches.length > 1) return { status: "duplicate" };
  return { status: "ok", location: buildLocation(content, lines, matches[0]) };
}

export function preservesBlockIdPosition(
  baselineBlock: string,
  nextBlock: string,
  id: string,
): boolean {
  const baseline = findBlockLocation(baselineBlock, id);
  const next = findBlockLocation(nextBlock, id);
  if (baseline.status !== "ok" || next.status !== "ok") return false;
  if (baseline.location.placement !== next.location.placement) return false;
  if (next.location.placement === "standalone") return next.location.to === nextBlock.length;
  return markerLineOffset(baselineBlock, baseline.location) === markerLineOffset(nextBlock, next.location);
}

export function replaceBlockById(
  content: string,
  id: string,
  baselineBlock: string,
  nextBlock: string,
): BlockReplacementResult {
  const current = findBlockLocation(content, id);
  if (current.status !== "ok") return current;
  if (current.location.text !== baselineBlock) return { status: "conflict" };

  const next = findBlockLocation(nextBlock, id);
  if (next.status !== "ok") return { status: "id-changed" };
  if (!preservesBlockIdPosition(baselineBlock, nextBlock, id)) return { status: "id-changed" };

  const updatedContent = `${content.slice(0, current.location.from)}${nextBlock}${content.slice(current.location.to)}`;
  const updated = findBlockLocation(updatedContent, id);
  if (updated.status !== "ok") return { status: "id-changed" };

  return { status: "ok", content: updatedContent, location: updated.location };
}
