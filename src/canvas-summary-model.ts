import type { CanvasNode } from "./canvas-types";
import { sourceEmbedLink } from "./block-reference";

export type CanvasSummaryItem =
  | { type: "file"; filePath: string; subpath?: string }
  | { type: "text"; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCanvasFileNode(node: CanvasNode): boolean {
  const candidate = node as unknown as Record<string, unknown>;
  const file = candidate.file;
  return (
    typeof candidate.filePath === "string" &&
    isRecord(file) &&
    typeof file.path === "string"
  );
}

export function sortCanvasSelection(nodes: Iterable<CanvasNode>): CanvasNode[] {
  return [...nodes].sort(
    (left, right) =>
      left.y - right.y || left.x - right.x || left.id.localeCompare(right.id),
  );
}

export function canvasSummaryItem(node: CanvasNode): CanvasSummaryItem | null {
  if (isCanvasFileNode(node)) {
    const candidate = node as unknown as Record<string, unknown>;
    const filePath = candidate.filePath;
    if (typeof filePath !== "string") return null;
    const subpath =
      typeof candidate.subpath === "string" && candidate.subpath.length > 0
        ? candidate.subpath
        : undefined;
    return { type: "file", filePath, subpath };
  }

  const candidate = node as unknown as Record<string, unknown>;
  return typeof candidate.text === "string" && candidate.text.length > 0
    ? { type: "text", text: candidate.text }
    : null;
}

export function collectCanvasSummaryItems(
  nodes: Iterable<CanvasNode>,
): CanvasSummaryItem[] {
  return sortCanvasSelection(nodes)
    .map((node) => canvasSummaryItem(node))
    .filter((item): item is CanvasSummaryItem => item !== null);
}

export function buildAtomicNoteContent(
  items: readonly CanvasSummaryItem[],
  linkTextForFile: (filePath: string) => string,
): string {
  const entries = items.map((item) => {
    if (item.type === "text") return item.text;
    return sourceEmbedLink(linkTextForFile(item.filePath), item.subpath ?? "");
  });
  return `---\nup:\ntopics:\ntags:\nrank:\n---\n\n${entries.join("\n\n")}`;
}
