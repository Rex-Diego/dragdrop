import { foldable } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import type { ListParentDisplay, SourceUnit, SourceUnitKind } from "./model";

export interface SourceRange {
  from: number;
  to: number;
}

export interface HandleRange extends SourceRange {
  kind: SourceUnitKind;
}

interface PrimitiveBlock extends SourceUnit {
  lineFrom: number;
  lineTo: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const LIST_RE = /^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const MATH_FENCE_RE = /^\s*\$\$\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?\s*)?$/;
const BLOCK_ID_RE = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;
const STANDALONE_BLOCK_ID_RE = /^\s*\^([A-Za-z0-9-]+)\s*$/;

function headingInfo(text: string): { level: number; heading: string } | null {
  const match = text.match(HEADING_RE);
  if (!match) return null;
  return {
    level: match[1].length,
    heading: match[2].trim(),
  };
}

function listInfo(text: string): { depth: number; contentStart: number } | null {
  const match = text.match(LIST_RE);
  if (!match) return null;
  const indent = match[1].replace(/\t/g, "    ").length;
  return { depth: indent, contentStart: match[0].length };
}

function existingBlockId(text: string): string | undefined {
  const trimmedLines = text.trimEnd().split("\n");
  const lastLine = trimmedLines.at(-1) ?? "";
  return lastLine.match(BLOCK_ID_RE)?.[1];
}

function openingLineBlockId(text: string): string | undefined {
  const firstLine = text.split("\n", 1)[0] ?? "";
  return firstLine.match(BLOCK_ID_RE)?.[1];
}

function blockIdOnAnyLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.match(BLOCK_ID_RE)?.[1])
    .filter((value): value is string => value !== undefined)
    .at(-1);
}

function standaloneBlockIdAfter(doc: Text, to: number): string | undefined {
  const line = doc.lineAt(to);
  if (line.number >= doc.lines) return undefined;
  return doc.line(line.number + 1).text.match(STANDALONE_BLOCK_ID_RE)?.[1];
}

function withoutTrailingBlockId(text: string): string {
  return text
    .replace(/(?:\s+|\n)\^[A-Za-z0-9-]+\s*$/, "")
    .trimEnd();
}

function createPrimitive(
  doc: Text,
  lineFrom: number,
  lineTo: number,
  kind: SourceUnitKind,
  extra: Partial<PrimitiveBlock> = {},
): PrimitiveBlock {
  const from = doc.line(lineFrom).from;
  const to = doc.line(lineTo).to;
  const text = doc.sliceString(from, to);
  const openingId =
    kind === "quote" || kind === "callout"
      ? openingLineBlockId(text)
      : undefined;
  const quotedBlockId =
    kind === "quote" || kind === "callout"
      ? blockIdOnAnyLine(text)
      : undefined;
  return {
    from,
    to,
    text,
    kind,
    lineFrom,
    lineTo,
    existingBlockId:
      kind === "heading"
        ? undefined
        : openingId ?? quotedBlockId ?? existingBlockId(text) ?? standaloneBlockIdAfter(doc, to),
    anchorFrom: from,
    anchorTo: to,
    selfOnlyText: withoutTrailingBlockId(text.split("\n", 1)[0] ?? text),
    ...extra,
  };
}

function isTableStart(doc: Text, lineNumber: number): boolean {
  if (lineNumber >= doc.lines) return false;
  const current = doc.line(lineNumber).text;
  const next = doc.line(lineNumber + 1).text;
  return current.includes("|") && TABLE_SEPARATOR_RE.test(next);
}

function startsExplicitBlock(doc: Text, lineNumber: number): boolean {
  const text = doc.line(lineNumber).text;
  return (
    headingInfo(text) !== null ||
    listInfo(text) !== null ||
    FENCE_RE.test(text) ||
    MATH_FENCE_RE.test(text) ||
    isTableStart(doc, lineNumber) ||
    STANDALONE_BLOCK_ID_RE.test(text)
  );
}

function scanPrimitives(state: EditorState): PrimitiveBlock[] {
  const { doc } = state;
  const blocks: PrimitiveBlock[] = [];
  let lineNumber = 1;

  if (doc.lines >= 2 && doc.line(1).text.trim() === "---") {
    lineNumber = 2;
    while (lineNumber <= doc.lines && doc.line(lineNumber).text.trim() !== "---") {
      lineNumber += 1;
    }
    if (lineNumber <= doc.lines) lineNumber += 1;
  }

  while (lineNumber <= doc.lines) {
    const line = doc.line(lineNumber);
    const text = line.text;

    if (text.trim().length === 0) {
      lineNumber += 1;
      continue;
    }

    if (STANDALONE_BLOCK_ID_RE.test(text)) {
      lineNumber += 1;
      continue;
    }

    const heading = headingInfo(text);
    if (heading) {
      blocks.push(
        createPrimitive(doc, lineNumber, lineNumber, "heading", {
          heading: heading.heading,
          headingLevel: heading.level,
        }),
      );
      lineNumber += 1;
      continue;
    }

    const fence = text.match(FENCE_RE)?.[1];
    if (fence) {
      const marker = fence[0];
      const minLength = fence.length;
      let endLine = lineNumber + 1;
      while (endLine <= doc.lines) {
        const candidate = doc.line(endLine).text.trimStart();
        const close = candidate.match(marker === "`" ? /^`{3,}/ : /^~{3,}/)?.[0];
        if (close && close.length >= minLength) break;
        endLine += 1;
      }
      endLine = Math.min(endLine, doc.lines);
      blocks.push(createPrimitive(doc, lineNumber, endLine, "code"));
      lineNumber = endLine + 1;
      continue;
    }

    if (MATH_FENCE_RE.test(text)) {
      let endLine = lineNumber + 1;
      while (endLine <= doc.lines && !MATH_FENCE_RE.test(doc.line(endLine).text)) {
        endLine += 1;
      }
      endLine = Math.min(endLine, doc.lines);
      blocks.push(createPrimitive(doc, lineNumber, endLine, "math"));
      lineNumber = endLine + 1;
      continue;
    }

    if (/^\s*>/.test(text)) {
      let endLine = lineNumber;
      while (endLine + 1 <= doc.lines) {
        const nextLine = doc.line(endLine + 1).text;
        if (
          nextLine.trim().length === 0 ||
          (!/^\s*>/.test(nextLine) && startsExplicitBlock(doc, endLine + 1))
        ) {
          break;
        }
        endLine += 1;
      }
      blocks.push(
        createPrimitive(
          doc,
          lineNumber,
          endLine,
          /^\s*>\s*\[!/.test(text) ? "callout" : "quote",
        ),
      );
      lineNumber = endLine + 1;
      continue;
    }

    if (isTableStart(doc, lineNumber)) {
      let endLine = lineNumber + 1;
      while (
        endLine + 1 <= doc.lines &&
        doc.line(endLine + 1).text.trim().length > 0 &&
        doc.line(endLine + 1).text.includes("|")
      ) {
        endLine += 1;
      }
      blocks.push(createPrimitive(doc, lineNumber, endLine, "table"));
      lineNumber = endLine + 1;
      continue;
    }

    const list = listInfo(text);
    if (list) {
      let endLine = lineNumber;
      while (endLine + 1 <= doc.lines) {
        const next = doc.line(endLine + 1).text;
        if (
          next.trim().length === 0 ||
          /^\s*>/.test(next) ||
          startsExplicitBlock(doc, endLine + 1)
        ) {
          break;
        }
        endLine += 1;
      }
      blocks.push(
        createPrimitive(doc, lineNumber, endLine, "list-item", {
          listDepth: list.depth,
        }),
      );
      lineNumber = endLine + 1;
      continue;
    }

    let endLine = lineNumber;
    while (endLine + 1 <= doc.lines) {
      const next = doc.line(endLine + 1).text;
      if (
        next.trim().length === 0 ||
        headingInfo(next) ||
        listInfo(next) ||
        FENCE_RE.test(next) ||
        MATH_FENCE_RE.test(next) ||
        /^\s*>/.test(next) ||
        isTableStart(doc, endLine + 1)
      ) {
        break;
      }
      endLine += 1;
    }
    blocks.push(createPrimitive(doc, lineNumber, endLine, "paragraph"));
    lineNumber = endLine + 1;
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind !== "list-item") continue;
    const next = blocks[index + 1];
    block.hasListChildren =
      next?.kind === "list-item" &&
      (next.listDepth ?? 0) > (block.listDepth ?? 0);
    const line = state.doc.lineAt(block.from);
    const folded = foldable(state, line.from, line.to);
    if (folded) block.anchorTo = folded.to;
  }

  return blocks;
}

export function buildHandleRanges(state: EditorState): HandleRange[] {
  const primitives = scanPrimitives(state);
  return primitives.map((block) => {
    if (block.kind === "heading" || block.kind === "list-item") {
      const line = state.doc.lineAt(block.from);
      const folded = foldable(state, line.from, line.to);
      if (folded) {
        return {
          from: block.from,
          to: folded.to,
          kind: block.kind,
        };
      }
    }
    return { from: block.from, to: block.to, kind: block.kind };
  });
}

function rangeLineBounds(doc: Text, range: SourceRange): SourceRange {
  const startLine = doc.lineAt(Math.max(0, Math.min(range.from, doc.length)));
  const endPos = Math.max(range.from, Math.min(Math.max(range.to - 1, range.from), doc.length));
  const endLine = doc.lineAt(endPos);
  return {
    from: startLine.from,
    to: endLine.to,
  };
}

function overlaps(block: PrimitiveBlock, range: SourceRange): boolean {
  return block.to >= range.from && block.from <= range.to;
}

function combineListRun(state: EditorState, run: PrimitiveBlock[]): SourceUnit {
  const first = run[0];
  const last = run.at(-1) ?? first;
  const text = state.doc.sliceString(first.from, last.to);
  return {
    ...first,
    kind: "list-tree",
    from: first.from,
    to: last.to,
    text,
    existingBlockId:
      existingBlockId(text) ??
      standaloneBlockIdAfter(state.doc, last.anchorTo ?? last.to),
    hasListChildren: run.length > 1,
    anchorFrom: first.from,
    anchorTo: last.anchorTo ?? last.to,
    blockIdPlacement: "standalone",
    selfOnlyText: withoutTrailingBlockId(first.text.split("\n", 1)[0] ?? first.text),
  };
}

function groupLists(
  state: EditorState,
  blocks: PrimitiveBlock[],
  splitListItems: boolean,
  listParentDisplay: ListParentDisplay,
): SourceUnit[] {
  if (splitListItems) {
    return blocks.map((block) => {
      if (block.kind !== "list-item") return { ...block };
      const nativeSubtree = listParentDisplay === "native-subtree";
      const anchorTo = nativeSubtree ? block.anchorTo ?? block.to : block.to;
      const standalone = nativeSubtree && block.hasListChildren === true;
      return {
        ...block,
        anchorTo,
        existingBlockId: standalone
          ? standaloneBlockIdAfter(state.doc, anchorTo) ?? block.existingBlockId
          : block.existingBlockId,
        blockIdPlacement: standalone ? "standalone" : "inline",
      };
    });
  }

  const units: SourceUnit[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block.kind !== "list-item") {
      units.push({ ...block });
      index += 1;
      continue;
    }

    const run: PrimitiveBlock[] = [block];
    index += 1;
    while (index < blocks.length) {
      const next = blocks[index];
      const previous = run.at(-1) ?? block;
      if (
        next.kind !== "list-item" ||
        next.lineFrom !== previous.lineTo + 1
      ) {
        break;
      }
      run.push(next);
      index += 1;
    }
    units.push(combineListRun(state, run));
  }
  return units;
}

function collectHeadingLevel(
  state: EditorState,
  primitives: PrimitiveBlock[],
  root: PrimitiveBlock,
  range: SourceRange,
  splitListItems: boolean,
  listParentDisplay: ListParentDisplay,
): SourceUnit[] {
  const result: PrimitiveBlock[] = [];
  const rootLevel = root.headingLevel ?? 1;
  let index = primitives.indexOf(root) + 1;

  while (index < primitives.length) {
    const block = primitives[index];
    if (block.from > range.to) break;

    if (block.kind === "heading") {
      const level = block.headingLevel ?? 6;
      if (level <= rootLevel) break;

      const line = state.doc.lineAt(block.from);
      const folded = foldable(state, line.from, line.to);
      const sectionEnd = Math.min(folded?.to ?? block.to, range.to);
      result.push({
        ...block,
        to: sectionEnd,
        text: state.doc.sliceString(block.from, sectionEnd),
      });
      while (index + 1 < primitives.length && primitives[index + 1].from <= sectionEnd) {
        index += 1;
      }
      index += 1;
      continue;
    }

    result.push({ ...block });
    index += 1;
  }

  if (result.length === 0) return [{ ...root }];
  return groupLists(state, result, splitListItems, listParentDisplay);
}

export function collectSourceUnits(
  state: EditorState,
  ranges: SourceRange[],
  splitListItems: boolean,
  listParentDisplay: ListParentDisplay,
): SourceUnit[] {
  const primitives = scanPrimitives(state);
  const collected: SourceUnit[] = [];

  for (const rawRange of ranges) {
    const range = rangeLineBounds(state.doc, rawRange);
    const selected = primitives.filter((block) => overlaps(block, range));
    const first = selected[0];

    if (
      first?.kind === "heading" &&
      first.from === range.from &&
      range.to > first.to
    ) {
      collected.push(
        ...collectHeadingLevel(
          state,
          primitives,
          first,
          range,
          splitListItems,
          listParentDisplay,
        ),
      );
    } else {
      collected.push(
        ...groupLists(state, selected, splitListItems, listParentDisplay),
      );
    }
  }

  const deduplicated = new Map<string, SourceUnit>();
  for (const unit of collected) {
    const key = `${unit.from}:${unit.to}:${unit.kind}`;
    deduplicated.set(key, unit);
  }

  return [...deduplicated.values()].sort((left, right) => {
    if (left.from !== right.from) return left.from - right.from;
    return left.to - right.to;
  });
}

export function previewMarkdownForUnits(units: SourceUnit[]): string {
  return units.map((unit) => unit.text.trim()).filter(Boolean).join("\n\n---\n\n");
}

export function lineEndForUnit(state: EditorState, unit: SourceUnit): number {
  return state.doc.lineAt(unit.to).to;
}

export function firstLineEndForUnit(state: EditorState, unit: SourceUnit): number {
  return state.doc.lineAt(unit.from).to;
}
