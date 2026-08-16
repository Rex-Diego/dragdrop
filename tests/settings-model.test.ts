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

  it("normalizes the text selection menu timeout without affecting legacy data", () => {
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: -1 }).selectionMenuAutoDismissSeconds).toBe(-1);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: 0 }).selectionMenuAutoDismissSeconds).toBe(0);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: 2.8 }).selectionMenuAutoDismissSeconds).toBe(2);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: 9_000 }).selectionMenuAutoDismissSeconds).toBe(3_600);
    expect(mergeSettings({ selectionMenuAutoDismissSeconds: -3 }).selectionMenuAutoDismissSeconds).toBe(-1);
  });
});
