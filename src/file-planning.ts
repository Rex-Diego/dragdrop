import type { SourceUnit, TitleFilenameMode } from "./model";

export type FileNamePromptReason = "title-prompt" | "conflict";

export type FilePlanningDecision =
  | { type: "create"; name: string }
  | { type: "skip" }
  | { type: "cancel-remaining" };

export interface FileNamePromptRequest {
  unit: SourceUnit;
  initialName: string;
  reason: FileNamePromptReason;
  validateCandidate: (value: string) => string | null;
}

export interface FileNamePlanningOptions {
  titleFilenameMode: TitleFilenameMode;
  keyForName: (fileName: string) => string;
  isExistingKey: (key: string) => boolean;
  prompt: (request: FileNamePromptRequest) => Promise<FilePlanningDecision>;
}

export interface PlannedFileName {
  unit: SourceUnit;
  fileName: string;
}

const INVALID_FILE_CHARS_RE = /[\\/:*?"<>|#[\]^]/g;

export function cleanFileName(value: string): string {
  return value
    .replace(INVALID_FILE_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim();
}

export function suggestedFileName(unit: SourceUnit): string {
  if (unit.kind === "heading") {
    return cleanFileName(unit.heading ?? "Untitled") || "Untitled";
  }
  return unit.plannedBlockId ?? unit.existingBlockId ?? "Untitled";
}

export function validateFileNameCandidate(
  value: string,
  isOccupied: (fileName: string) => boolean,
): string | null {
  const cleaned = cleanFileName(value);
  if (cleaned.length === 0) return "File name cannot be empty.";
  if (cleaned !== value.trim()) {
    return "File name contains unsupported characters.";
  }
  if (isOccupied(cleaned)) return "A note with this name already exists.";
  return null;
}

export async function planFileNames(
  units: SourceUnit[],
  options: FileNamePlanningOptions,
): Promise<PlannedFileName[]> {
  const accepted: PlannedFileName[] = [];
  const reservedKeys = new Set<string>();

  const isOccupied = (fileName: string): boolean => {
    const key = options.keyForName(fileName);
    return reservedKeys.has(key) || options.isExistingKey(key);
  };

  for (const unit of units) {
    const suggestedName = suggestedFileName(unit);
    const hasConflict = isOccupied(suggestedName);
    const alwaysPrompt =
      unit.kind === "heading" && options.titleFilenameMode === "prompt";
    let fileName = suggestedName;

    if (hasConflict || alwaysPrompt) {
      const validateCandidate = (value: string): string | null =>
        validateFileNameCandidate(value, isOccupied);
      const decision = await options.prompt({
        unit,
        initialName: suggestedName,
        reason: hasConflict ? "conflict" : "title-prompt",
        validateCandidate,
      });

      if (decision.type === "cancel-remaining") break;
      if (decision.type === "skip") continue;

      const validationError = validateCandidate(decision.name);
      if (validationError !== null) {
        throw new Error(`File name prompt returned an invalid name: ${validationError}`);
      }
      fileName = cleanFileName(decision.name);
    }

    reservedKeys.add(options.keyForName(fileName));
    accepted.push({ unit, fileName });
  }

  return accepted;
}
