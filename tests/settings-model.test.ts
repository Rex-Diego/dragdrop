import { describe, expect, it } from "vitest";
import {
  assignedModifierForAction,
  assignModifierToAction,
  DEFAULT_SETTINGS,
  mergeSettings,
  SETTINGS_SCHEMA_VERSION,
  UNASSIGNED_MODIFIER,
} from "../src/settings-model";

describe("action-oriented modifier settings", () => {
  it("projects the default chord bindings as one modifier per action", () => {
    expect(assignedModifierForAction(DEFAULT_SETTINGS.canvasBindings, "link-source")).toBe("none");
    expect(assignedModifierForAction(DEFAULT_SETTINGS.canvasBindings, "create-note")).toBe("primary");
    expect(assignedModifierForAction(DEFAULT_SETTINGS.markdownBindings, "embed-source")).toBe("none");
    expect(assignedModifierForAction(DEFAULT_SETTINGS.markdownBindings, "move")).toBe("primary");
    expect(assignedModifierForAction(DEFAULT_SETTINGS.markdownBindings, "none")).toBe(UNASSIGNED_MODIFIER);
  });

  it("moves a modifier between actions and supports unassigning", () => {
    const bindings = { ...DEFAULT_SETTINGS.markdownBindings };

    assignModifierToAction(bindings, "move", "shift");
    expect(bindings.primary).toBe("inherit");
    expect(bindings.shift).toBe("move");

    assignModifierToAction(bindings, "none", "shift");
    expect(bindings.shift).toBe("none");
    expect(assignedModifierForAction(bindings, "move")).toBe(UNASSIGNED_MODIFIER);

    assignModifierToAction(bindings, "none", UNASSIGNED_MODIFIER);
    expect(assignedModifierForAction(bindings, "none")).toBe(UNASSIGNED_MODIFIER);
    expect(bindings.shift).toBe("inherit");
  });

  it("preserves the Surface Pen toggle when loading settings", () => {
    expect(mergeSettings(undefined).surfacePenSideButtonDrag).toBe(true);
    expect(mergeSettings({ surfacePenSideButtonDrag: false }).surfacePenSideButtonDrag).toBe(false);
  });

  it("preserves the larger touch handle toggle when loading settings", () => {
    expect(mergeSettings(undefined).largeTouchHandles).toBe(true);
    expect(mergeSettings({ largeTouchHandles: false }).largeTouchHandles).toBe(false);
  });

  it("preserves the Canvas summary button toggle when loading settings", () => {
    expect(mergeSettings(undefined).canvasSummaryButton).toBe(true);
    expect(mergeSettings({ canvasSummaryButton: false }).canvasSummaryButton).toBe(false);
  });

  it("keeps editable block embeds disabled unless explicitly enabled", () => {
    expect(mergeSettings(undefined).editableBlockEmbeds).toBe(false);
    expect(mergeSettings({ editableBlockEmbeds: true }).editableBlockEmbeds).toBe(true);
  });

  it("defaults the cross-file embed alias and safely migrates old values", () => {
    expect(mergeSettings(undefined).crossMarkdownEmbedAlias).toBe("🔗");
    expect(mergeSettings({ crossMarkdownEmbedAlias: "📌" }).crossMarkdownEmbedAlias).toBe("📌");
    expect(mergeSettings({ crossMarkdownEmbedAlias: "  来源 |\n" }).crossMarkdownEmbedAlias).toBe("来源");
    expect(mergeSettings({ crossMarkdownEmbedAlias: 42 }).crossMarkdownEmbedAlias).toBe("🔗");
  });

  it("persists new ordinary-link bindings without running the legacy embed migration", () => {
    const settings = mergeSettings({ schemaVersion: 4 });
    settings.markdownBindings.none = "move";
    settings.markdownBindings.primary = "link-source";
    settings.markdownBindings["primary+shift"] = "embed-source";
    settings.sameMarkdownBindings.none = "move";
    settings.sameMarkdownBindings.primary = "embed-source";
    const reloaded = mergeSettings(settings);
    expect(reloaded.markdownBindings).toEqual(settings.markdownBindings);
    expect(reloaded.sameMarkdownBindings).toEqual(settings.sameMarkdownBindings);
  });

  it("removes alias-link actions from same-file bindings while preserving cross-file links", () => {
    const merged = mergeSettings({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      markdownBindings: { ...DEFAULT_SETTINGS.markdownBindings, shift: "link-source" },
      sameMarkdownBindings: { ...DEFAULT_SETTINGS.sameMarkdownBindings, shift: "link-source" },
    });

    expect(merged.markdownBindings.shift).toBe("link-source");
    expect(merged.sameMarkdownBindings.shift).toBe("embed-source");
  });

  it("does not reset explicit same-file bindings when old cross-file defaults migrate", () => {
    const merged = mergeSettings({
      schemaVersion: 3,
      markdownBindings: { ...DEFAULT_SETTINGS.markdownBindings, none: "move", primary: "link-source", "primary+shift": "embed-source" },
      sameMarkdownBindings: { ...DEFAULT_SETTINGS.sameMarkdownBindings, none: "move", primary: "embed-source" },
    });
    expect(merged.sameMarkdownBindings.none).toBe("move");
    expect(merged.sameMarkdownBindings.primary).toBe("embed-source");
  });

  it("migrates old data to the current schema and removes legacy protection", () => {
    const merged = mergeSettings({
      schemaVersion: 0,
      protectedFolders: ["Capture"],
      defaultFolder: "Inbox",
    });

    expect(merged.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(merged.defaultFolder).toBe("Inbox");
    expect(Object.hasOwn(merged, "protectedFolders")).toBe(false);
  });

  it("clamps saved numeric settings without resetting valid user values", () => {
    const merged = mergeSettings({
      nodeWidth: -20,
      initialNodeHeight: 2_000,
      nodeGap: 12.8,
      previewWidth: Number.NaN,
    });

    expect(merged.nodeWidth).toBe(160);
    expect(merged.initialNodeHeight).toBe(1_200);
    expect(merged.nodeGap).toBe(12);
    expect(merged.previewWidth).toBe(DEFAULT_SETTINGS.previewWidth);
  });

  it("keeps structural move and edge scrolling enabled by default", () => {
    const merged = mergeSettings(undefined);

    expect(merged.structuralMarkdownMoves).toBe(true);
    expect(merged.multiBlockSelection).toBe(true);
    expect(merged.blockTypeMenu).toBe(true);
    expect(merged.crossFileFileTargets).toBe(true);
    expect(merged.edgeAutoScroll).toBe(true);
    expect(merged.autoScrollEdgePx).toBe(60);
    expect(merged.autoScrollMaxSpeed).toBe(12);
    expect(merged.preserveFoldState).toBe(true);
    expect(merged.handlePosition).toBe("right");
    expect(merged.handleVisibility).toBe("hover");
    expect(merged.renumberOrderedLists).toBe(false);
    expect(merged.mobileBlockInteractions).toBe(false);
    expect(merged.selectionMenuAutoDismissSeconds).toBe(3);
  });

  it("normalizes the text selection menu timeout while preserving fractional seconds", () => {
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: -1 }).selectionMenuAutoDismissSeconds).toBe(-1);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: 0 }).selectionMenuAutoDismissSeconds).toBe(0);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: 0.7 }).selectionMenuAutoDismissSeconds).toBe(0.7);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: 2.8 }).selectionMenuAutoDismissSeconds).toBe(2.8);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: 9_000 }).selectionMenuAutoDismissSeconds).toBe(3_600);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: -3 }).selectionMenuAutoDismissSeconds).toBe(-1);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: -0.2 }).selectionMenuAutoDismissSeconds).toBe(-1);
  });
});
