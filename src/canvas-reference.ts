import type { EditorState } from "@codemirror/state";
import { ensurePlannedReference, sourceSubpath } from "./block-reference";
import { directBlockEmbedLinktext } from "./markdown-drop";
import type { SourceUnit } from "./model";

export interface ParsedLinktext {
  path: string;
  subpath: string;
}

export interface FileLike {
  path: string;
}

export interface CanvasReference<TFile extends FileLike = FileLike> {
  unit: SourceUnit;
  file: TFile;
  subpath: string;
}

type LinktextParser = (linktext: string) => ParsedLinktext;
type LinkpathResolver<TFile extends FileLike> = (path: string, sourceFile: TFile) => TFile | null;

function usedBlockIds(state: EditorState): Set<string> {
  const used = new Set<string>();
  for (const match of state.doc.toString().matchAll(/\^([A-Za-z0-9-]+)/g)) {
    used.add(match[1]);
  }
  return used;
}

export function planCanvasReferences<TFile extends FileLike>(
  state: EditorState,
  units: SourceUnit[],
  sourceFile: TFile,
  parseLinktext: LinktextParser,
  resolveLinkpath: LinkpathResolver<TFile>,
): CanvasReference<TFile>[] | null {
  const usedIds = usedBlockIds(state);
  const plannedUnits = units.map((unit) => {
    if (directBlockEmbedLinktext(unit.text)) return unit;
    return ensurePlannedReference(state, unit, usedIds);
  });
  const references: CanvasReference<TFile>[] = [];

  for (const unit of plannedUnits) {
    const linktext = directBlockEmbedLinktext(unit.text);
    if (!linktext) {
      references.push({
        unit,
        file: sourceFile,
        subpath: sourceSubpath(unit),
      });
      continue;
    }

    let parsed: ParsedLinktext;
    try {
      parsed = parseLinktext(linktext);
    } catch {
      return null;
    }
    if (!parsed.subpath.startsWith("#^")) return null;

    const path = parsed.path.trim();
    const file = path.length === 0
      ? sourceFile
      : resolveLinkpath(path, sourceFile);
    if (!file) return null;

    const blockId = parsed.subpath.slice(2);
    references.push({
      unit: {
        ...unit,
        existingBlockId: blockId,
        plannedBlockId: undefined,
        blockIdInsert: undefined,
      },
      file,
      subpath: parsed.subpath,
    });
  }

  return references;
}
