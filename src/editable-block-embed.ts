import { EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  Component,
  MarkdownView,
  Notice,
  TFile,
  setIcon,
  setTooltip,
  type App,
} from "obsidian";
import {
  findBlockLocation,
  preservesBlockIdPosition,
  replaceBlockById,
  type BlockReplacementResult,
  type MarkdownBlockLocation,
} from "./editable-block-embed-model";

const ROOT_CLASS = "dragdrop-editable-block-embed";
const BUTTON_CLASS = "dragdrop-editable-block-embed-button";
const BUTTON_LABEL = "Edit original block";
const SAVE_DELAY = 400;
type OwnerWindow = Window & { MutationObserver: typeof MutationObserver };

interface EditableBlockEmbedHost {
  app: App;
}

interface PrivateEmbedContext {
  app?: App;
  containerEl: HTMLElement;
  displayMode?: boolean;
}

interface PrivateMarkdownEmbed {
  containerEl: HTMLElement;
  editable?: boolean;
  editMode?: unknown;
}

interface PrivateEmbedRegistry {
  embedByExtension?: {
    md?: MarkdownEmbedCreator;
  };
}

type PrivateApp = App & { embedRegistry?: PrivateEmbedRegistry };
type MarkdownEmbedCreator = (context: unknown, file: unknown, subpath: unknown) => unknown;
type UnknownMethod = (...args: unknown[]) => unknown;

interface PropertyPatch {
  target: Record<string, unknown>;
  key: string;
  descriptor: PropertyDescriptor | undefined;
}

interface WriteSuccess {
  status: "ok";
  block: string;
}

type WriteResult =
  | WriteSuccess
  | { status: "missing" | "duplicate" | "conflict" | "id-changed" | "readonly" | "error" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asElement(value: unknown): HTMLElement | null {
  if (!isRecord(value) || value.nodeType !== 1) return null;
  if (!("ownerDocument" in value) || !("querySelector" in value)) return null;
  return value as unknown as HTMLElement;
}

function asEmbedContext(value: unknown): PrivateEmbedContext | null {
  if (!isRecord(value)) return null;
  const containerEl = asElement(value.containerEl);
  return containerEl ? { app: value.app as App | undefined, containerEl, displayMode: typeof value.displayMode === "boolean" ? value.displayMode : undefined } : null;
}

function asNativeEmbed(value: unknown): PrivateMarkdownEmbed | null {
  if (!isRecord(value)) return null;
  const containerEl = asElement(value.containerEl);
  return containerEl ? (value as unknown as PrivateMarkdownEmbed) : null;
}

function getMethod(target: Record<string, unknown>, key: string): UnknownMethod | null {
  const value = target[key];
  return typeof value === "function" ? (value as UnknownMethod) : null;
}

function restoreProperty(patch: PropertyPatch): void {
  if (patch.descriptor) {
    Object.defineProperty(patch.target, patch.key, patch.descriptor);
  } else {
    Reflect.deleteProperty(patch.target, patch.key);
  }
}

function setPatchedProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): PropertyPatch {
  const patch = { target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) };
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: patch.descriptor?.enumerable ?? true,
    writable: true,
    value,
  });
  return patch;
}

function blockIdFromSubpath(subpath: unknown): string | null {
  if (typeof subpath !== "string") return null;
  const match = /(?:^|#)\^([A-Za-z0-9-]+)$/.exec(subpath);
  return match?.[1] ?? null;
}

function isEditorView(value: unknown): value is EditorView {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.state) &&
    typeof value.dispatch === "function" &&
    asElement(value.dom) !== null
  );
}

function isEditableEditor(view: EditorView): boolean {
  return view.state.facet(EditorState.readOnly) !== true && view.state.facet(EditorView.editable) !== false;
}

function editorBlockText(view: EditorView, id: string): MarkdownBlockLocation | null {
  const location = findBlockLocation(view.state.doc.toString(), id);
  return location.status === "ok" ? location.location : null;
}

export class EditableBlockEmbedFeature extends Component {
  private readonly instances = new Set<EditableBlockEmbedInstance>();
  private registryPatch: PropertyPatch | null = null;

  constructor(private readonly host: EditableBlockEmbedHost) {
    super();
  }

  onload(): void {
    this.registerEvent(
      this.host.app.vault.on("modify", (file) => {
        if (file instanceof TFile) void this.handleFileChange(file);
      }),
    );
    this.registerEvent(
      this.host.app.vault.on("delete", (file) => {
        if (file instanceof TFile) this.handleFileDelete(file);
      }),
    );
    this.patchMarkdownEmbedCreator();
  }

  onunload(): void {
    for (const instance of [...this.instances]) instance.dispose(false);
    this.instances.clear();
    if (this.registryPatch) {
      restoreProperty(this.registryPatch);
      this.registryPatch = null;
    }
  }

  unregister(instance: EditableBlockEmbedInstance): void {
    this.instances.delete(instance);
  }

  findSourceEditor(file: TFile): EditorView | null {
    let result: EditorView | null = null;
    this.host.app.workspace.iterateAllLeaves((leaf) => {
      if (result || !(leaf.view instanceof MarkdownView)) return;
      if (!(leaf.view.file instanceof TFile) || leaf.view.file.path !== file.path) return;
      for (const editorElement of Array.from(
        leaf.view.containerEl.querySelectorAll<HTMLElement>(".cm-editor"),
      )) {
        if (editorElement.closest(`.${ROOT_CLASS}`)) continue;
        try {
          const view = EditorView.findFromDOM(editorElement);
          if (view) {
            result = view;
            return;
          }
        } catch {
          // A private editor may use a different CodeMirror realm.
        }
      }
    });
    return result;
  }

  async readSource(file: TFile): Promise<string> {
    const editor = this.findSourceEditor(file);
    return editor ? editor.state.doc.toString() : this.host.app.vault.read(file);
  }

  async writeBlock(
    file: TFile,
    id: string,
    baselineBlock: string,
    nextBlock: string,
  ): Promise<WriteResult> {
    const editor = this.findSourceEditor(file);
    if (editor) {
      if (!isEditableEditor(editor)) return { status: "readonly" };
      const current = findBlockLocation(editor.state.doc.toString(), id);
      if (current.status !== "ok") return current;
      const replacement = replaceBlockById(
        editor.state.doc.toString(),
        id,
        baselineBlock,
        nextBlock,
      );
      if (replacement.status !== "ok") return replacement;
      editor.dispatch({
        changes: {
          from: current.location.from,
          to: current.location.to,
          insert: nextBlock,
        },
      });
      return { status: "ok", block: replacement.location.text };
    }

    let replacement: BlockReplacementResult | null = null;
    try {
      await this.host.app.vault.process(file, (data) => {
        const current = replaceBlockById(data, id, baselineBlock, nextBlock);
        replacement = current;
        return current.status === "ok" ? current.content : data;
      });
    } catch {
      return { status: "error" };
    }

    const completed = replacement as BlockReplacementResult | null;
    if (completed === null) return { status: "error" };
    if (completed.status !== "ok") return completed;
    return { status: "ok", block: completed.location.text };
  }

  private async handleFileChange(file: TFile): Promise<void> {
    for (const instance of [...this.instances]) {
      if (instance.file.path !== file.path) continue;
      await instance.handleExternalChange();
    }
  }

  private handleFileDelete(file: TFile): void {
    for (const instance of [...this.instances]) {
      if (instance.file.path === file.path) instance.disable("The original note was deleted.");
    }
  }

  private patchMarkdownEmbedCreator(): void {
    const privateApp = this.host.app as PrivateApp;
    const registry = privateApp.embedRegistry;
    const embedByExtension = registry?.embedByExtension;
    const original = embedByExtension?.md;
    if (!embedByExtension || typeof original !== "function") return;

    const decorate = this.decorate.bind(this);
    const patched: MarkdownEmbedCreator = function (this: unknown, contextValue, fileValue, subpathValue) {
      const nativeValue = original.call(this, contextValue, fileValue, subpathValue);
      try {
        decorate(nativeValue, contextValue, fileValue, subpathValue);
      } catch {
        // A private API mismatch must leave the original renderer usable.
      }
      return nativeValue;
    };
    this.registryPatch = setPatchedProperty(
      embedByExtension,
      "md",
      patched,
    );
  }

  private decorate(
    nativeValue: unknown,
    contextValue: unknown,
    fileValue: unknown,
    subpathValue: unknown,
  ): void {
    const native = asNativeEmbed(nativeValue);
    const context = asEmbedContext(contextValue);
    if (!native || !context || !(fileValue instanceof TFile)) return;
    const id = blockIdFromSubpath(subpathValue);
    if (!id || this.shouldSkip(context.containerEl, fileValue)) return;

    const instance = new EditableBlockEmbedInstance(this, native, fileValue, id);
    this.instances.add(instance);
    instance.install();
  }

  private shouldSkip(container: HTMLElement, file: TFile): boolean {
    if (container.closest(`.${ROOT_CLASS}`) || container.closest(".canvas-node")) return true;
    const ownerFile = this.findContainingMarkdownFile(container);
    return ownerFile?.path === file.path;
  }

  private findContainingMarkdownFile(container: HTMLElement): TFile | null {
    let result: TFile | null = null;
    this.host.app.workspace.iterateAllLeaves((leaf) => {
      if (result || !(leaf.view instanceof MarkdownView)) return;
      if (!(leaf.view.file instanceof TFile)) return;
      if (leaf.view.containerEl.contains(container)) result = leaf.view.file;
    });
    return result;
  }
}

class EditableBlockEmbedInstance {
  private readonly container: HTMLElement;
  private readonly ownerWindow: OwnerWindow | null;
  private button: HTMLButtonElement | null = null;
  private observer: MutationObserver | null = null;
  private editor: EditorView | null = null;
  private baselineBlock: string | null = null;
  private saveTimer: number | null = null;
  private requestSavePatch: PropertyPatch | null = null;
  private unloadPatch: PropertyPatch | null = null;
  private dispatchPatch: PropertyPatch | null = null;
  private previousEditable: boolean | undefined;
  private active = false;
  private disabled = false;
  private disposed = false;
  private noticeShown = false;

  constructor(
    private readonly feature: EditableBlockEmbedFeature,
    private readonly native: PrivateMarkdownEmbed,
    readonly file: TFile,
    private readonly id: string,
  ) {
    this.container = native.containerEl;
    this.ownerWindow = this.container.ownerDocument.defaultView;
  }

  install(): void {
    this.container.addClass(ROOT_CLASS);
    this.ensureButton();
    const ownerWindow = this.ownerWindow;
    if (!ownerWindow) return;
    const observer = new ownerWindow.MutationObserver(() => this.ensureButton());
    this.observer = observer;
    observer.observe(this.container, { childList: true, subtree: true });
    this.patchUnload();
  }

  dispose(restoreNative: boolean): void {
    if (this.disposed) return;
    this.disposed = true;
    const shouldRestoreNative = restoreNative && this.active;
    const editor = this.editor;
    if (editor) this.unregisterEditorEvents(editor);
    this.editor = null;
    this.baselineBlock = null;
    this.active = false;
    if (this.saveTimer !== null && this.ownerWindow) {
      this.ownerWindow.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.restoreEditorPatches();
    this.restoreNativePatches();
    this.observer?.disconnect();
    this.observer = null;
    this.button?.remove();
    this.button = null;
    this.container.removeClass(ROOT_CLASS);
    this.feature.unregister(this);
    if (shouldRestoreNative) void this.restoreNativeView();
  }

  async handleExternalChange(): Promise<void> {
    if (this.disposed || !this.container.isConnected) {
      this.dispose(false);
      return;
    }

    if (!this.active) {
      await this.reloadNativeView();
      return;
    }

    if (!this.baselineBlock || !this.editor) return;
    const latest = await this.feature.readSource(this.file);
    const latestLocation = findBlockLocation(latest, this.id);
    if (latestLocation.status !== "ok") {
      this.disable("The original block ID is no longer available.");
      return;
    }
    const currentEditorBlock = editorBlockText(this.editor, this.id);
    if (!currentEditorBlock) {
      this.disable("The original block changed while this embed was being edited.");
      return;
    }

    if (currentEditorBlock.text !== this.baselineBlock && latestLocation.location.text !== currentEditorBlock.text) {
      this.disable("The original block changed while this embed was being edited.");
      return;
    }
    if (latestLocation.location.text === currentEditorBlock.text) {
      this.baselineBlock = latestLocation.location.text;
      return;
    }

    this.editor.dispatch({
      changes: {
        from: currentEditorBlock.from,
        to: currentEditorBlock.to,
        insert: latestLocation.location.text,
      },
    });
    this.baselineBlock = latestLocation.location.text;
  }

  disable(message: string): void {
    this.disabled = true;
    this.clearSaveTimer();
    if (!this.noticeShown) {
      this.noticeShown = true;
      new Notice(message);
    }
  }

  private ensureButton(): void {
    if (this.disposed || !this.container.isConnected || this.button?.isConnected) return;
    try {
      const button = this.container.createEl("button", {
        cls: ["clickable-icon", BUTTON_CLASS],
        attr: {
          type: "button",
          "aria-label": BUTTON_LABEL,
          "data-tooltip-position": "top",
        },
      });
      setIcon(button, "pencil");
      setTooltip(button, BUTTON_LABEL);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.activate();
      });
      this.button = button;
    } catch {
      // A changed private embed DOM only removes this optional affordance.
    }
  }

  private async activate(): Promise<void> {
    if (this.active || this.disabled || this.disposed) return;
    const source = await this.feature.readSource(this.file);
    const sourceLocation = findBlockLocation(source, this.id);
    if (sourceLocation.status !== "ok") {
      this.disable(sourceLocation.status === "duplicate" ? "The original block ID is duplicated." : "The original block ID was not found.");
      return;
    }

    const nativeObject = this.native as unknown as Record<string, unknown>;
    const showEditor = getMethod(nativeObject, "showEditor");
    if (!showEditor) {
      this.disable("This Obsidian version does not expose an editable block embed.");
      return;
    }

    this.previousEditable = this.native.editable;
    try {
      this.native.editable = true;
      showEditor.call(this.native);
      const editor = await this.waitForEditor();
      const embeddedLocation = editor ? editorBlockText(editor, this.id) : null;
      if (!editor || !embeddedLocation) throw new Error("The native editor did not expose the target block.");

      this.editor = editor;
      this.baselineBlock = sourceLocation.location.text;
      this.active = true;
      this.container.addClass("dragdrop-editable-block-embed-active");
      this.patchRequestSave();
      this.patchEditorDispatch(editor);
      this.registerEditorEvents(editor);
    } catch {
      this.editor = null;
      this.baselineBlock = null;
      this.active = false;
      await this.restoreNativeView();
      new Notice("Could not open this block for editing.");
    }
  }

  private async waitForEditor(): Promise<EditorView | null> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const editor = this.findNativeEditor();
      if (editor) return editor;
      await this.delay(20);
    }
    return null;
  }

  private findNativeEditor(): EditorView | null {
    const mode = isRecord(this.native.editMode) ? this.native.editMode : null;
    if (mode && isEditorView(mode.cm)) return mode.cm;

    const editorElement = asElement(mode?.editorEl) ?? this.container.querySelector<HTMLElement>(".cm-editor");
    if (!editorElement) return null;
    try {
      return EditorView.findFromDOM(editorElement);
    } catch {
      return null;
    }
  }

  private patchRequestSave(): void {
    const target = this.native as unknown as Record<string, unknown>;
    if (!getMethod(target, "requestSave")) return;
    this.requestSavePatch = setPatchedProperty(target, "requestSave", () => undefined);
  }

  private patchUnload(): void {
    const target = this.native as unknown as Record<string, unknown>;
    const original = getMethod(target, "unload");
    if (!original) return;
    this.unloadPatch = setPatchedProperty(target, "unload", (...args: unknown[]) => {
      this.dispose(false);
      return original.apply(this.native, args);
    });
  }

  private patchEditorDispatch(editor: EditorView): void {
    const target = editor as unknown as Record<string, unknown>;
    const original = getMethod(target, "dispatch");
    if (!original) return;
    const guardedDispatch = (...specs: unknown[]): void => {
      try {
        const normalized = specs.length === 1 && Array.isArray(specs[0]) ? specs[0] : specs;
        const nextState = editor.state.update(...(normalized as TransactionSpec[]));
        const currentLocation = editorBlockText(editor, this.id);
        const nextLocation = findBlockLocation(nextState.state.doc.toString(), this.id);
        if (
          !currentLocation ||
          nextLocation.status !== "ok" ||
          !preservesBlockIdPosition(currentLocation.text, nextLocation.location.text, this.id)
        ) {
          this.showIdGuardNotice();
          return;
        }
      } catch {
        this.showIdGuardNotice();
        return;
      }
      original.apply(editor, specs);
      if (!this.disabled) this.scheduleSave();
    };
    this.dispatchPatch = setPatchedProperty(target, "dispatch", guardedDispatch);
  }

  private restoreEditorPatches(): void {
    if (this.dispatchPatch) {
      restoreProperty(this.dispatchPatch);
      this.dispatchPatch = null;
    }
  }

  private restoreNativePatches(): void {
    if (this.requestSavePatch) {
      restoreProperty(this.requestSavePatch);
      this.requestSavePatch = null;
    }
    if (this.unloadPatch) {
      restoreProperty(this.unloadPatch);
      this.unloadPatch = null;
    }
  }

  private registerEditorEvents(editor: EditorView): void {
    editor.dom.addEventListener("keydown", this.handleEditorKeydown, true);
    editor.dom.addEventListener("blur", this.handleEditorBlur, true);
  }

  private unregisterEditorEvents(editor: EditorView): void {
    editor.dom.removeEventListener("keydown", this.handleEditorKeydown, true);
    editor.dom.removeEventListener("blur", this.handleEditorBlur, true);
  }

  private readonly handleEditorKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    void this.finishEditing();
  };

  private readonly handleEditorBlur = (): void => {
    if (!this.ownerWindow) return;
    this.ownerWindow.setTimeout(() => {
      if (!this.editor || this.container.contains(this.container.ownerDocument.activeElement)) return;
      void this.finishEditing();
    }, 0);
  };

  private scheduleSave(): void {
    if (!this.ownerWindow || this.saveTimer !== null || !this.active || this.disabled) return;
    this.saveTimer = this.ownerWindow.setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, SAVE_DELAY);
  }

  private clearSaveTimer(): void {
    if (this.saveTimer !== null && this.ownerWindow) this.ownerWindow.clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private async flush(): Promise<boolean> {
    if (!this.active || this.disabled || !this.editor || !this.baselineBlock) return false;
    const currentEditorBlock = editorBlockText(this.editor, this.id);
    if (!currentEditorBlock) {
      this.disable("The block ID cannot be changed while editing.");
      return false;
    }
    if (currentEditorBlock.text === this.baselineBlock) return true;

    const result = await this.feature.writeBlock(
      this.file,
      this.id,
      this.baselineBlock,
      currentEditorBlock.text,
    );
    if (result.status !== "ok") {
      this.disable(this.messageForWriteFailure(result.status));
      return false;
    }
    this.baselineBlock = result.block;
    return true;
  }

  private async finishEditing(): Promise<void> {
    if (!this.active || this.disposed) return;
    this.clearSaveTimer();
    const saved = await this.flush();
    if (!saved || this.disabled) return;
    const editor = this.editor;
    if (editor) this.unregisterEditorEvents(editor);
    this.restoreEditorPatches();
    this.restoreNativePatches();
    this.editor = null;
    this.baselineBlock = null;
    this.active = false;
    this.container.removeClass("dragdrop-editable-block-embed-active");
    await this.restoreNativeView();
  }

  private async restoreNativeView(): Promise<void> {
    this.native.editable = this.previousEditable ?? false;
    const loadFile = getMethod(this.native as unknown as Record<string, unknown>, "loadFile");
    if (loadFile) {
      try {
        await Promise.resolve(loadFile.call(this.native, this.file));
      } catch {
        // Keep the native component alive even if a private reload method changes.
      }
    }
  }

  private async reloadNativeView(): Promise<void> {
    if (this.disposed) return;
    const loadFile = getMethod(this.native as unknown as Record<string, unknown>, "loadFile");
    if (!loadFile) return;
    try {
      await Promise.resolve(loadFile.call(this.native, this.file));
    } catch {
      // Native embeds already have their own error UI.
    }
  }

  private showIdGuardNotice(): void {
    if (this.noticeShown) return;
    this.noticeShown = true;
    new Notice("The block ID cannot be edited or moved.");
  }

  private messageForWriteFailure(status: Exclude<WriteResult["status"], "ok">): string {
    switch (status) {
      case "conflict":
        return "The original block changed elsewhere. Reload the embed before editing again.";
      case "missing":
        return "The original block ID is no longer available.";
      case "duplicate":
        return "The original block ID is duplicated.";
      case "id-changed":
        return "The block ID cannot be edited or moved.";
      case "readonly":
        return "The original note is read-only.";
      default:
        return "Could not save the original block.";
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.ownerWindow) this.ownerWindow.setTimeout(resolve, milliseconds);
      else resolve();
    });
  }
}
