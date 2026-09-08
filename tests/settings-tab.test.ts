import { describe, expect, it, vi } from "vitest";
import type { App, Plugin } from "obsidian";
import { DragDropSettingTab } from "../src/settings-tab";
import { mergeSettings } from "../src/settings-model";
import { settingsTextForLanguage } from "../src/settings-i18n";

vi.mock("obsidian", () => ({
  moment: { locale: () => "zh" }, Notice: class {}, Setting: class {},
  PluginSettingTab: class { containerEl = { addClass: vi.fn() }; },
}));

type Group = { heading: string; items: { name: string; desc: string; control: { key: string } }[] };

describe("settings page organization", () => {
  it("separates drop scopes, removes same-file alias links, and retains every scalar control once", async () => {
    const host = { config: mergeSettings(undefined), saveSettings: vi.fn().mockResolvedValue(undefined) };
    const tab = new DragDropSettingTab({} as App, host as Plugin & typeof host);
    const groups = tab.getSettingDefinitions() as Group[];
    const text = settingsTextForLanguage("zh");
    expect(groups.slice(0, 3).map((group) => group.heading)).toEqual([text.sameMarkdownScope, text.crossMarkdownScope, text.canvasScope]);
    expect(groups[0].items.map((item) => item.control.key)).toEqual([
      "sameMarkdownAction.embed-source", "sameMarkdownAction.move", "sameMarkdownAction.none",
    ]);
    expect(groups[1].items.some((item) => item.control.key === "markdownAction.link-source")).toBe(true);
    const items = groups.flatMap((group) => group.items);
    const keys = items.map((item) => item.control.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of Object.keys(host.config)) {
      if (key === "schemaVersion" || key.endsWith("Bindings")) continue;
      expect(keys, key).toContain(key);
    }
    expect(groups[0].items[0].desc).toBe(text.markdownEmbedActionDescription);
    expect(groups[0].items[1].desc).toBe(text.markdownMoveActionDescription);
    expect(groups[1].items.find((item) => item.control.key === "markdownAction.move")?.desc).toBe(text.crossMarkdownMoveDescription);
    await tab.setControlValue("sameMarkdownAction.link-source", "shift");
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(host.config.sameMarkdownBindings.shift).toBe("inherit");
  });
});
