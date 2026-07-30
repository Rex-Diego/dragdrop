import { describe, expect, it } from "vitest";
import {
  resolveCanvasDropAction,
  resolveMarkdownDropAction,
  type ModifierKeyState,
  type ResolvedCanvasDropAction,
} from "../src/action-resolution";
import type { CanvasDropAction, ModifierChord } from "../src/model";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/settings-model";

interface ModifierCase {
  chord: ModifierChord;
  event: ModifierKeyState;
  expected: ResolvedCanvasDropAction;
}

const MODIFIER_CASES: readonly ModifierCase[] = [
  {
    chord: "none",
    event: { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
    expected: "link-source",
  },
  {
    chord: "primary",
    event: { ctrlKey: false, metaKey: true, shiftKey: false, altKey: false },
    expected: "create-note",
  },
  {
    chord: "shift",
    event: { ctrlKey: false, metaKey: false, shiftKey: true, altKey: false },
    expected: "none",
  },
  {
    chord: "alt",
    event: { ctrlKey: false, metaKey: false, shiftKey: false, altKey: true },
    expected: "create-note",
  },
  {
    chord: "primary+shift",
    event: { ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
    expected: "link-source",
  },
  {
    chord: "primary+alt",
    event: { ctrlKey: true, metaKey: false, shiftKey: false, altKey: true },
    expected: "none",
  },
  {
    chord: "shift+alt",
    event: { ctrlKey: false, metaKey: false, shiftKey: true, altKey: true },
    expected: "create-note",
  },
  {
    chord: "primary+shift+alt",
    event: { ctrlKey: true, metaKey: false, shiftKey: true, altKey: true },
    expected: "link-source",
  },
];

const TEST_BINDINGS: Record<ModifierChord, CanvasDropAction> = {
  none: "link-source",
  primary: "create-note",
  shift: "none",
  alt: "create-note",
  "primary+shift": "link-source",
  "primary+alt": "none",
  "shift+alt": "create-note",
  "primary+shift+alt": "link-source",
};

describe("Canvas action resolution", () => {
  it.each(MODIFIER_CASES)("resolves the $chord chord", ({ event, expected }) => {
    expect(resolveCanvasDropAction(event, TEST_BINDINGS)).toBe(expected);
  });

  it("falls back from inherit to the no-modifier action", () => {
    const bindings: Record<ModifierChord, CanvasDropAction> = {
      ...DEFAULT_SETTINGS.canvasBindings,
      none: "create-note",
      shift: "inherit",
    };

    expect(resolveCanvasDropAction(MODIFIER_CASES[2].event, bindings)).toBe(
      "create-note",
    );
  });

  it("uses the safe source-link action when no valid fallback exists", () => {
    const primaryEvent = MODIFIER_CASES[1].event;

    expect(resolveCanvasDropAction(primaryEvent, undefined)).toBe("link-source");
    expect(
      resolveCanvasDropAction(primaryEvent, {
        none: "inherit",
        primary: "invalid-saved-action",
      }),
    ).toBe("link-source");
  });
});

describe("settings merging", () => {
  it("adds the default touch action to existing settings", () => {
    const merged = mergeSettings({ defaultFolder: "Inbox" });

    expect(merged.touchDropAction).toBe("link-source");
  });

  it("drops the removed protected-folder setting from legacy data", () => {
    const merged = mergeSettings({
      protectedFolders: ["Capture"],
    } as unknown as Partial<typeof DEFAULT_SETTINGS>);

    expect(Object.hasOwn(merged, "protectedFolders")).toBe(false);
  });

  it("fills nested binding defaults without mutating defaults or loaded data", () => {
    const defaultsSnapshot = {
      ...DEFAULT_SETTINGS,
      canvasBindings: { ...DEFAULT_SETTINGS.canvasBindings },
      markdownBindings: { ...DEFAULT_SETTINGS.markdownBindings },
    };
    const loaded = {
      ...DEFAULT_SETTINGS,
      defaultFolder: "Inbox",
      canvasBindings: {
        ...DEFAULT_SETTINGS.canvasBindings,
        primary: "none" as const,
      },
      markdownBindings: {
        ...DEFAULT_SETTINGS.markdownBindings,
        "primary+shift": "none" as const,
      },
    };
    Reflect.deleteProperty(loaded.canvasBindings, "shift");
    Reflect.deleteProperty(loaded.markdownBindings, "alt");
    const loadedSnapshot = {
      ...loaded,
      canvasBindings: { ...loaded.canvasBindings },
      markdownBindings: { ...loaded.markdownBindings },
    };

    const merged = mergeSettings(loaded);

    expect(merged.defaultFolder).toBe("Inbox");
    expect(merged.canvasBindings.primary).toBe("none");
    expect(merged.canvasBindings.shift).toBe(
      DEFAULT_SETTINGS.canvasBindings.shift,
    );
    expect(merged.markdownBindings["primary+shift"]).toBe("none");
    expect(merged.markdownBindings.alt).toBe(
      DEFAULT_SETTINGS.markdownBindings.alt,
    );
    expect(DEFAULT_SETTINGS).toEqual(defaultsSnapshot);
    expect(loaded).toEqual(loadedSnapshot);
    expect(merged.canvasBindings).not.toBe(DEFAULT_SETTINGS.canvasBindings);
    expect(merged.canvasBindings).not.toBe(loaded.canvasBindings);
    expect(merged.markdownBindings).not.toBe(DEFAULT_SETTINGS.markdownBindings);
    expect(merged.markdownBindings).not.toBe(loaded.markdownBindings);

    merged.canvasBindings.none = "none";
    merged.markdownBindings.none = "none";
    expect(DEFAULT_SETTINGS.canvasBindings.none).toBe("link-source");
    expect(DEFAULT_SETTINGS.markdownBindings.none).toBe("embed-source");
    expect(loaded.canvasBindings.none).toBe("link-source");
    expect(loaded.markdownBindings.none).toBe("embed-source");
  });
});

describe("Markdown action resolution", () => {
  it("uses the non-destructive defaults and inherits from none", () => {
    expect(
      resolveMarkdownDropAction(
        { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
        DEFAULT_SETTINGS.markdownBindings,
      ),
    ).toBe("embed-source");
    expect(
      resolveMarkdownDropAction(
        { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        DEFAULT_SETTINGS.markdownBindings,
      ),
    ).toBe("move");
    expect(
      resolveMarkdownDropAction(
        { ctrlKey: false, metaKey: false, shiftKey: true, altKey: false },
        DEFAULT_SETTINGS.markdownBindings,
      ),
    ).toBe("embed-source");
  });

  it("falls back to embed when saved Markdown bindings are invalid", () => {
    expect(
      resolveMarkdownDropAction(
        { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        { none: "inherit", primary: "link-source" },
      ),
    ).toBe("embed-source");
  });

  it("migrates the unused legacy Markdown defaults", () => {
    const merged = mergeSettings({
      markdownBindings: {
        none: "move",
        primary: "link-source",
        "primary+shift": "embed-source",
      } as unknown as typeof DEFAULT_SETTINGS.markdownBindings,
    });

    expect(merged.markdownBindings.none).toBe("embed-source");
    expect(merged.markdownBindings.primary).toBe("move");
    expect(merged.markdownBindings["primary+shift"]).toBe("inherit");
  });
});
