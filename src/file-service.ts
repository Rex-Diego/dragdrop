import {
  Notice,
  TFile,
  TFolder,
  normalizePath,
  type App,
} from "obsidian";
import type { CanvasView } from "./canvas-types";
import { sourceEmbedLink, sourceSubpath } from "./block-reference";
import { FileNameModal } from "./file-name-modal";
import { planFileNames } from "./file-planning";
import type { DragDropSettings } from "./settings-model";
import type { SourceUnit } from "./model";

export interface ResolvedNoteTask {
  unit: SourceUnit;
  path: string;
}

export interface AtomicNotePlan {
  path: string;
}

export interface NoteSourceReference {
  file: TFile;
  subpath: string;
}

export class FileService {
  constructor(
    private readonly app: App,
    private readonly settings: DragDropSettings,
  ) {}

  async resolveNoteTasks(
    units: SourceUnit[],
    sourceFile: TFile,
    canvasView: CanvasView,
  ): Promise<ResolvedNoteTask[]> {
    const folder = await this.resolveFolder(sourceFile, canvasView.file);
    if (folder === null) return [];

    const planned = await planFileNames(units, {
      titleFilenameMode: this.settings.titleFilenameMode,
      keyForName: (fileName) => this.pathFor(folder.path, fileName),
      isExistingKey: (path) =>
        this.app.vault.getAbstractFileByPath(path) !== null,
      prompt: async (request) => {
        const description =
          request.reason === "conflict"
            ? "A note with this name already exists. Choose another name."
            : "Choose a name for the note created from this heading.";
        const modal = new FileNameModal(
          this.app,
          request.initialName,
          description,
          request.validateCandidate,
        );
        return modal.openAndGetDecision();
      },
    });

    return planned.map(({ unit, fileName }) => ({
      unit,
      path: this.pathFor(folder.path, fileName),
    }));
  }

  async createNotes(
    tasks: ResolvedNoteTask[],
    sourceFile: TFile,
    sourceReferences: ReadonlyMap<SourceUnit, NoteSourceReference> = new Map(),
  ): Promise<Array<{ unit: SourceUnit; file: TFile }>> {
    const created: Array<{ unit: SourceUnit; file: TFile }> = [];
    for (const task of tasks) {
      try {
        const reference = sourceReferences.get(task.unit);
        const referencedFile = reference?.file ?? sourceFile;
        const linkText = this.app.metadataCache.fileToLinktext(
          referencedFile,
          task.path,
          true,
        );
        const content = `\n${sourceEmbedLink(linkText, reference?.subpath ?? sourceSubpath(task.unit))}`;
        const file = await this.app.vault.create(task.path, content);
        created.push({ unit: task.unit, file });
      } catch (error) {
        console.error(`DragDrop could not create ${task.path}.`, error);
        new Notice(`Could not create ${task.path}.`);
      }
    }
    return created;
  }

  async planAtomicNote(
    sourceFile: TFile,
    canvasView: CanvasView,
  ): Promise<AtomicNotePlan | null> {
    const folder = await this.resolveFolder(sourceFile, canvasView.file);
    if (folder === null) return null;

    const placeholder: SourceUnit = {
      from: 0,
      to: 0,
      text: "",
      kind: "heading",
      heading: "Untitled",
    };
    const planned = await planFileNames([placeholder], {
      titleFilenameMode: "prompt",
      keyForName: (fileName) => this.pathFor(folder.path, fileName),
      isExistingKey: (path) =>
        this.app.vault.getAbstractFileByPath(path) !== null,
      prompt: async (request) => {
        const modal = new FileNameModal(
          this.app,
          request.initialName,
          "Enter the judgment name for this atomic note.",
          request.validateCandidate,
          { allowSkip: false, cancelText: "Cancel" },
        );
        return modal.openAndGetDecision();
      },
    });

    const result = planned[0];
    return result === undefined
      ? null
      : { path: this.pathFor(folder.path, result.fileName) };
  }

  async createAtomicNote(plan: AtomicNotePlan, content: string): Promise<TFile | null> {
    try {
      return await this.app.vault.create(plan.path, content);
    } catch (error) {
      console.error(`DragDrop could not create ${plan.path}.`, error);
      new Notice(`Could not create ${plan.path}.`);
      return null;
    }
  }

  private pathFor(folderPath: string, fileName: string): string {
    return normalizePath(folderPath ? `${folderPath}/${fileName}.md` : `${fileName}.md`);
  }

  private async resolveFolder(
    sourceFile: TFile,
    canvasFile: TFile | null,
  ): Promise<TFolder | null> {
    const requested =
      this.settings.folderStrategy === "source"
        ? sourceFile.parent?.path ?? ""
        : this.settings.folderStrategy === "canvas"
          ? canvasFile?.parent?.path ?? ""
          : this.settings.defaultFolder;
    const path = normalizePath(requested.trim());
    if (path.length === 0 || path === "/") return this.app.vault.getRoot();

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return existing;
    if (existing instanceof TFile) {
      new Notice(`The note folder path points to a file: ${path}`);
      return null;
    }

    try {
      await this.ensureFolderPath(path);
      const created = this.app.vault.getAbstractFileByPath(path);
      if (created instanceof TFolder) return created;
    } catch (error) {
      console.error(`DragDrop could not create folder ${path}.`, error);
    }
    new Notice(`Could not create note folder: ${path}`);
    return null;
  }

  private async ensureFolderPath(path: string): Promise<void> {
    const segments = normalizePath(path).split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = normalizePath(current ? `${current}/${segment}` : segment);
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing instanceof TFile) throw new Error(`${current} is a file`);
      await this.app.vault.createFolder(current);
    }
  }
}
