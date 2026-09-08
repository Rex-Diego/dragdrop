import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownView, Platform, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { DragSessionManager } from "../src/drag-session-manager";
import { MoveConfirmationModal } from "../src/move-confirmation-modal";
import { mergeSettings } from "../src/settings-model";
import type { DragSession } from "../src/model";
import { testEditor } from "./editor-test-view";

vi.mock("obsidian", () => ({
  Component: class {}, Modal: class {}, Setting: class {}, Menu: class {},
  MarkdownView: class {}, TFile: class {}, Notice: vi.fn(), MarkdownRenderer: {},
  Platform: { isIosApp: false },
  parseLinktext: (text: string) => {
    const split = text.indexOf("#");
    return { path: text.slice(0, split), subpath: text.slice(split) };
  },
}));

// Access event adapters directly while keeping real CodeMirror transactions.
type ManagerAdapter = {
  session: DragSession;
  pointerDrag: unknown;
  cleanupDrag(): void;
  stopAutoScroll: () => void;
  findPointerDropTarget: () => unknown;
  findMarkdownDropTarget(event: PointerEvent): unknown;
  commitMarkdownDrop(session: DragSession, target: unknown, action: string): Promise<void>;
  applyMarkdownDocuments(source: EditorView, target: EditorView, before: string, targetBefore: string, after: string, targetAfter: string): Promise<boolean>;
};

function fixture(same = true) {
  const config = mergeSettings({ schemaVersion: 4 });
  config.sameMarkdownBindings.none = "move";
  config.sameMarkdownBindings.primary = "embed-source";
  config.preserveFoldState = false;
  const source = testEditor(EditorState.create({ doc: "Alpha\nBravo\nCharlie" }));
  const destination = same ? source : testEditor(EditorState.create({ doc: "Target" }));
  const file = Object.assign(new TFile(), { path: "Source.md" });
  const targetFile = same ? file : Object.assign(new TFile(), { path: "Target.md" });
  const ownerDocument = {} as Document;
  const view = Object.assign(new MarkdownView({} as WorkspaceLeaf), {
    file: targetFile, containerEl: { isConnected: true, ownerDocument },
  });
  const target = {
    view, file: targetFile, editorView: destination.view, position: destination.view.state.doc.length,
    issue: null, context: same ? "same-file" : "cross-file", ownerDocument,
    targetLineText: "Charlie", listIntent: null,
  };
  const host = {
    config,
    app: { metadataCache: { fileToLinktext: (sourceFile: TFile) => sourceFile.path.replace(/\.md$/, "") } } as unknown as App,
  };
  const manager = new DragSessionManager(host);
  const adapter = manager as unknown as ManagerAdapter;
  adapter.cleanupDrag = vi.fn();
  adapter.stopAutoScroll = vi.fn();
  adapter.session = {
    id: "drag-1", sourceFile: file, sourcePath: file.path,
    sourceView: source.view, sourceState: source.view.state, previewMarkdown: "Bravo",
    units: [{ from: 6, to: 11, text: "Bravo", kind: "paragraph" }],
  };
  return { manager, adapter, target, source, destination, config, host };
}

beforeEach(() => { vi.restoreAllMocks(); Platform.isIosApp = false; });

describe("Markdown event and transaction adapters", () => {
  it.each([false, true])("uses actual saved modifiers for pen release, ctrl=%s", async (ctrlKey) => {
    const { manager, adapter, target, source } = fixture();
    adapter.pointerDrag = { pointerId: 1, active: true, surfacePenSideButton: true };
    adapter.findPointerDropTarget = () => target;
    const event = { pointerId: 1, pointerType: "pen", ctrlKey, metaKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn() } as unknown as PointerEvent;
    await manager.endPointerDrag(event);
    expect(source.view.state.doc.toString()).toMatch(ctrlKey ? /!\[\[Source#\^/ : /^Alpha\nCharlie\nBravo$/);
    expect(source.dispatch).toHaveBeenCalledTimes(1);
    await manager.endPointerDrag(event);
    expect(source.dispatch).toHaveBeenCalledTimes(1);
    expect(adapter.stopAutoScroll).toHaveBeenCalledTimes(1);
  });

  it("inserts an ordinary alias link and a source ID in a cross-file drop", async () => {
    const { adapter, target, source, destination } = fixture(false);
    await adapter.commitMarkdownDrop(adapter.session, target, "link-source");
    const id = source.view.state.doc.toString().match(/Bravo \^([a-f0-9]+)/)?.[1];
    expect(id).toBeTruthy();
    expect(destination.view.state.doc.toString()).toBe(`Target\n\n[[Source#^${id}|🔗]]`);
  });

  it("rolls back the target when the source rejects a move", async () => {
    const { adapter, destination } = fixture(false);
    const source = testEditor(EditorState.create({ doc: "source", extensions: [EditorState.changeFilter.of(() => false)] }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await adapter.applyMarkdownDocuments(source.view, destination.view, "source", "Target", "", "Target\nsource")).toBe(false);
    expect(source.view.state.doc.toString()).toBe("source");
    expect(destination.view.state.doc.toString()).toBe("Target");
  });

  it("restores both documents when source dispatch throws after applying its transaction", async () => {
    const { adapter, source, destination } = fixture(false);
    const before = source.view.state.doc.toString();
    source.dispatch.mockImplementationOnce((transaction) => {
      source.view.setState("startState" in transaction ? transaction.state : source.view.state.update(transaction).state);
      throw new Error("plugin dispatch failed after applying");
    });
    source.view.setState = (state) => { Object.assign(source.view, { state }); };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await adapter.applyMarkdownDocuments(source.view, destination.view, before, "Target", "", `Target\n${before}`)).toBe(false);
    expect(source.view.state.doc.toString()).toBe(before);
    expect(destination.view.state.doc.toString()).toBe("Target");
  });

  it("keeps an existing embed alias while rebasing its source for the target note", async () => {
    const { adapter, target, source, destination } = fixture(false);
    const content = "![[#^abc|old label]]";
    Object.assign(source.view, { state: EditorState.create({ doc: content }) });
    adapter.session.sourceState = source.view.state;
    adapter.session.units = [{ from: 0, to: content.length, text: content, kind: "paragraph" }];
    await adapter.commitMarkdownDrop(adapter.session, target, "embed-source");
    expect(source.dispatch).not.toHaveBeenCalled();
    expect(destination.view.state.doc.toString()).toBe("Target\n\n![[Source#^abc|old label]]");
  });

  it("does not apply an old drop position after the confirmation target changes", async () => {
    const { adapter, target, source, destination } = fixture(false);
    adapter.session.units[0].existingBlockId = "existing";
    vi.spyOn(MoveConfirmationModal.prototype, "openAndConfirm").mockImplementation(() => {
      destination.view.dispatch({ changes: { from: 0, insert: "user " } });
      return Promise.resolve(true);
    });
    await adapter.commitMarkdownDrop(adapter.session, target, "move");
    expect(source.dispatch).not.toHaveBeenCalled();
    expect(destination.view.state.doc.toString()).toBe("user Target");
  });

  it("chooses the pane at the pointer coordinates despite the captured source path", () => {
    const { adapter, target, source, host } = fixture(false);
    const pointElement = {};
    const ownerDocument = { elementFromPoint: () => pointElement };
    const targetContainer = { isConnected: true, ownerDocument, contains: (node: unknown) => node === pointElement, querySelector: () => pointElement };
    const sourceContainer = { isConnected: true, ownerDocument, contains: () => false };
    const sourcePane = Object.assign(new MarkdownView({} as WorkspaceLeaf), { file: adapter.session.sourceFile, containerEl: sourceContainer });
    Object.assign(target.view, { containerEl: targetContainer });
    Object.assign(source.view, {
      dom: { ownerDocument, contains: () => true }, posAtCoords: () => 0, coordsAtPos: () => null,
      domAtPos: () => ({ node: { nodeType: 3, parentElement: null } }),
    });
    host.app.workspace = { iterateAllLeaves: (callback: (leaf: unknown) => void) => {
      callback({ view: sourcePane }); callback({ view: target.view });
    } } as App["workspace"];
    vi.spyOn(EditorView, "findFromDOM").mockReturnValue(source.view);
    const result = adapter.findMarkdownDropTarget({
      pointerId: 1, target: { nodeType: 1, ownerDocument }, clientX: 500, clientY: 100,
      composedPath: () => [sourceContainer],
    } as unknown as PointerEvent);
    expect(result).toMatchObject({ file: target.file, context: "cross-file" });
  });
});
