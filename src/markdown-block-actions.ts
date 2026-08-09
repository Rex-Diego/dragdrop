import { directBlockEmbed } from "./markdown-drop";
import type { SourceUnit, SourceUnitKind } from "./model";

export type MarkdownBlockConversion =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "quote"
  | "code"
  | "math";

const BLOCK_ID_RE = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;
const HEADING_RE = /^\s*#{1,6}\s+/;
const LIST_RE = /^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?/;

function splitBlockId(text: string): { body: string; id: string | null } {
  const match = text.match(BLOCK_ID_RE);
  if (!match || match.index === undefined) return { body: text.trim(), id: null };
  return {
    body: text.slice(0, match.index).trimEnd(),
    id: match[1] ?? null,
  };
}

function removeMarkdownWrapper(text: string): string {
  const lines = text.split("\n");
  const first = lines[0]?.trim() ?? "";
  const last = lines.at(-1)?.trim() ?? "";
  if (/^(`{3,}|~{3,})/.test(first) && last === first[0]?.repeat(first.length)) {
    return lines.slice(1, -1).join("\n");
  }
  if (first === "$$" && last === "$$") return lines.slice(1, -1).join("\n");
  return text;
}

function plainBlockBody(text: string): string {
  return removeMarkdownWrapper(text)
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, "").replace(HEADING_RE, "").replace(LIST_RE, ""))
    .join("\n")
    .trim();
}

function withBlockId(text: string, id: string | null): string {
  return id ? `${text.trimEnd()} ^${id}` : text.trimEnd();
}

export function canConvertMarkdownBlock(
  unit: Pick<SourceUnit, "text" | "kind" | "existingBlockId">,
  conversion: MarkdownBlockConversion,
): boolean {
  if (directBlockEmbed(unit.text)) return false;
  if (unit.kind === "callout" || unit.kind === "table" || unit.kind === "list-tree") return false;
  if (unit.text.includes("\n") && conversion !== "code" && conversion !== "math") return false;
  return unit.existingBlockId === undefined || unit.text.includes(`^${unit.existingBlockId}`);
}

export function convertMarkdownBlock(
  text: string,
  conversion: MarkdownBlockConversion,
): string | null {
  const { body: rawBody, id } = splitBlockId(text);
  const body = plainBlockBody(rawBody);
  if (!body) return null;

  let converted: string;
  switch (conversion) {
    case "paragraph":
      converted = body;
      break;
    case "heading-1":
    case "heading-2":
    case "heading-3":
    case "heading-4":
    case "heading-5":
    case "heading-6":
      converted = `${"#".repeat(Number(conversion.slice(-1)))} ${body}`;
      break;
    case "bullet-list":
      converted = `- ${body}`;
      break;
    case "ordered-list":
      converted = `1. ${body}`;
      break;
    case "task-list":
      converted = `- [ ] ${body}`;
      break;
    case "quote":
      converted = body.split("\n").map((line) => `> ${line}`).join("\n");
      break;
    case "code":
      converted = `\`\`\`\n${body}\n\`\`\``;
      break;
    case "math":
      converted = `$$\n${body}\n$$`;
      break;
  }
  return withBlockId(converted, id);
}

export function conversionLabel(conversion: MarkdownBlockConversion): string {
  switch (conversion) {
    case "paragraph": return "Paragraph";
    case "heading-1": return "Heading 1";
    case "heading-2": return "Heading 2";
    case "heading-3": return "Heading 3";
    case "heading-4": return "Heading 4";
    case "heading-5": return "Heading 5";
    case "heading-6": return "Heading 6";
    case "bullet-list": return "Bullet list";
    case "ordered-list": return "Ordered list";
    case "task-list": return "Task list";
    case "quote": return "Quote";
    case "code": return "Code block";
    case "math": return "Math block";
  }
}

export const MARKDOWN_BLOCK_CONVERSIONS: readonly MarkdownBlockConversion[] = [
  "paragraph",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
  "bullet-list",
  "ordered-list",
  "task-list",
  "quote",
  "code",
  "math",
];

export function isConvertibleSourceKind(kind: SourceUnitKind): boolean {
  return kind !== "callout" && kind !== "table" && kind !== "list-tree";
}
