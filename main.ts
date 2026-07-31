import { Plugin } from "obsidian";
import { createDragHandleExtension } from "./src/drag-handle-extension";
import { DragSessionManager } from "./src/drag-session-manager";
import { CanvasSummaryFeature } from "./src/canvas-summary";
import { DragDropSettingTab } from "./src/settings-tab";
import { DEFAULT_SETTINGS, mergeSettings, type DragDropSettings } from "./src/settings-model";

const LARGE_TOUCH_HANDLE_CLASS = "dragdrop-large-touch-handles";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default class DragDropPlugin extends Plugin {
  config: DragDropSettings = mergeSettings(DEFAULT_SETTINGS);
  private canvasSummaryFeature: CanvasSummaryFeature | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.applyLargeTouchHandlePreference();
    this.registerEvent(
      this.app.workspace.on("window-open", () => this.applyLargeTouchHandlePreference()),
    );
    this.app.workspace.onLayoutReady(() => this.applyLargeTouchHandlePreference());

    const dragManager = new DragSessionManager(this);
    this.addChild(dragManager);
    this.canvasSummaryFeature = new CanvasSummaryFeature({
      app: this.app,
      config: this.config,
      plugin: this,
    });
    this.addChild(this.canvasSummaryFeature);
    this.registerEditorExtension(createDragHandleExtension(dragManager));
    this.addSettingTab(new DragDropSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.config);
    this.applyLargeTouchHandlePreference();
    this.canvasSummaryFeature?.refresh();
  }

  private applyLargeTouchHandlePreference(): void {
    const documents = new Set<Document>();
    documents.add(this.app.workspace.containerEl.ownerDocument);
    this.app.workspace.iterateAllLeaves((leaf) => {
      documents.add(leaf.view.containerEl.ownerDocument);
    });

    for (const document of documents) {
      document.body?.classList.toggle(LARGE_TOUCH_HANDLE_CLASS, this.config.largeTouchHandles);
    }
  }

  private async loadSettings(): Promise<void> {
    const loaded: unknown = await this.loadData();
    this.config = mergeSettings(isRecord(loaded) ? loaded : undefined);
  }
}
