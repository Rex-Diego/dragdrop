import { describe, expect, it } from "vitest";
import {
  cleanFileName,
  planFileNames,
  suggestedFileName,
  type FileNamePromptRequest,
  type FilePlanningDecision,
} from "../src/file-planning";
import type { SourceUnit, TitleFilenameMode } from "../src/model";

function heading(name: string, from = 0): SourceUnit {
  return {
    from,
    to: from + name.length,
    text: `# ${name}`,
    kind: "heading",
    heading: name,
  };
}

function paragraph(blockId: string, from = 0): SourceUnit {
  return {
    from,
    to: from + blockId.length,
    text: blockId,
    kind: "paragraph",
    plannedBlockId: blockId,
  };
}

interface PlanningHarness {
  existing?: string[];
  mode?: TitleFilenameMode;
  decide?: (
    request: FileNamePromptRequest,
    promptIndex: number,
  ) => FilePlanningDecision;
}

async function runPlanning(units: SourceUnit[], harness: PlanningHarness = {}) {
  const prompts: FileNamePromptRequest[] = [];
  const existing = new Set(harness.existing ?? []);
  const planned = await planFileNames(units, {
    titleFilenameMode: harness.mode ?? "auto",
    keyForName: (fileName) => `Notes/${fileName}.md`,
    isExistingKey: (key) => existing.has(key),
    prompt: async (request) => {
      prompts.push(request);
      return harness.decide?.(request, prompts.length - 1) ?? { type: "skip" };
    },
  });
  return { planned, prompts };
}

describe("file planning", () => {
  it("cleans unsupported filename characters and builds stable suggestions", () => {
    expect(cleanFileName('  Bad\\/:*?"<>|#[]^   name...  ')).toBe("Bad name");
    expect(cleanFileName(" ... ")).toBe("");
    expect(suggestedFileName(heading("  Alpha / Beta...  "))).toBe(
      "Alpha Beta",
    );
    expect(suggestedFileName(heading("///"))).toBe("Untitled");
    expect(
      suggestedFileName({
        ...paragraph("planned"),
        existingBlockId: "existing",
      }),
    ).toBe("planned");
    expect(
      suggestedFileName({
        ...paragraph("planned"),
        plannedBlockId: undefined,
        existingBlockId: "existing",
      }),
    ).toBe("existing");
  });

  it("auto-accepts free names and prompts every heading in prompt mode", async () => {
    const automatic = await runPlanning([heading("Alpha"), paragraph("a1b2c3")]);
    expect(automatic.prompts).toHaveLength(0);
    expect(automatic.planned.map(({ fileName }) => fileName)).toEqual([
      "Alpha",
      "a1b2c3",
    ]);

    const prompted = await runPlanning([heading("Alpha"), paragraph("a1b2c3")], {
      mode: "prompt",
      decide: (request) => {
        expect(request.reason).toBe("title-prompt");
        expect(request.validateCandidate("Renamed alpha")).toBeNull();
        return { type: "create", name: "Renamed alpha" };
      },
    });
    expect(prompted.prompts).toHaveLength(1);
    expect(prompted.planned.map(({ fileName }) => fileName)).toEqual([
      "Renamed alpha",
      "a1b2c3",
    ]);
  });

  it("routes an existing Vault conflict through rename validation", async () => {
    const result = await runPlanning([heading("Alpha")], {
      existing: ["Notes/Alpha.md"],
      decide: (request) => {
        expect(request.reason).toBe("conflict");
        expect(request.validateCandidate("Alpha")).toBe(
          "A note with this name already exists.",
        );
        expect(request.validateCandidate("Bad/name")).toBe(
          "File name contains unsupported characters.",
        );
        expect(request.validateCandidate("Renamed")).toBeNull();
        return { type: "create", name: "Renamed" };
      },
    });

    expect(result.planned.map(({ fileName }) => fileName)).toEqual(["Renamed"]);
  });

  it("reserves automatically accepted names within the current batch", async () => {
    const result = await runPlanning([heading("Duplicate"), heading("Duplicate", 20)], {
      decide: (request) => {
        expect(request.reason).toBe("conflict");
        expect(request.validateCandidate("Duplicate")).toBe(
          "A note with this name already exists.",
        );
        return { type: "create", name: "Duplicate 2" };
      },
    });

    expect(result.prompts).toHaveLength(1);
    expect(result.planned.map(({ fileName }) => fileName)).toEqual([
      "Duplicate",
      "Duplicate 2",
    ]);
  });

  it("reserves a renamed result before planning later items", async () => {
    const result = await runPlanning([heading("Existing"), heading("Renamed", 20)], {
      existing: ["Notes/Existing.md"],
      decide: (request, promptIndex) => {
        expect(request.reason).toBe("conflict");
        if (promptIndex === 0) {
          expect(request.validateCandidate("Renamed")).toBeNull();
          return { type: "create", name: "Renamed" };
        }
        expect(request.validateCandidate("Renamed")).toBe(
          "A note with this name already exists.",
        );
        return { type: "create", name: "Renamed 2" };
      },
    });

    expect(result.prompts).toHaveLength(2);
    expect(result.planned.map(({ fileName }) => fileName)).toEqual([
      "Renamed",
      "Renamed 2",
    ]);
  });

  it("skips the current conflict and cancels only the remaining queue", async () => {
    const result = await runPlanning(
      [
        heading("Accepted"),
        heading("Skip"),
        heading("Cancel", 20),
        heading("After", 40),
      ],
      {
        existing: ["Notes/Skip.md", "Notes/Cancel.md"],
        decide: (_request, promptIndex) =>
          promptIndex === 0 ? { type: "skip" } : { type: "cancel-remaining" },
      },
    );

    expect(result.prompts).toHaveLength(2);
    expect(result.planned.map(({ fileName }) => fileName)).toEqual(["Accepted"]);
  });
});
