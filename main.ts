import { Plugin } from "obsidian";
import { createDragHandleExtension } from "./src/drag-handle-extension";
import { DragSessionManager } from "./src/drag-session-manager";
import { CanvasSummaryFeature } from "./src/canvas-summary";
import { DragDropSettingTab } from "./src/settings-tab";
import { DEFAULT_SETTINGS, mergeSettings, type DragDropSettings } from "./src/settings-model";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default class DragDropPlugin extends Plugin {
  config: DragDropSettings = mergeSettings(DEFAULT_SETTINGS);

  async onload(): Promise<void> {
    await this.loadSettings();

    const dragManager = new DragSessionManager(this);
    this.addChild(dragManager);
    this.addChild(new CanvasSummaryFeature({ app: this.app, config: this.config, plugin: this }));
    this.registerEditorExtension(createDragHandleExtension(dragManager));
    this.addSettingTab(new DragDropSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.config);
  }

  private async loadSettings(): Promise<void> {
    const loaded: unknown = await this.loadData();
    this.config = mergeSettings(isRecord(loaded) ? loaded : undefined);
  }
}
