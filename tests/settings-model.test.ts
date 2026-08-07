import { describe, expect, it } from "vitest";
import {
  assignedModifierForAction,
  assignModifierToAction,
  DEFAULT_SETTINGS,
  mergeSettings,
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
});
