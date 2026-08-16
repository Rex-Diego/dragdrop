import { describe, expect, it } from "vitest";
import { settingsTextForLanguage } from "../src/settings-i18n";

describe("settings localization", () => {
  it.each(["zh", "zh-CN", "zh-TW"])('uses Chinese text for "%s"', (language) => {
    const text = settingsTextForLanguage(language);

    expect(text.headingCoreBehavior).toBe("核心行为");
    expect(text.cancelDropAction).toBe("取消本次拖放");
    expect(text.selectionMenuTimeoutName).toBe("文字选区菜单自动消失秒数");
    expect(text.selectionMenuTimeoutDescription).toContain("-1");
    expect(text.blockMenuDescription).not.toContain("转换");
  });

  it("falls back to clear English labels", () => {
    const text = settingsTextForLanguage("fr");

    expect(text.cancelDropAction).toBe("Cancel this drop");
    expect(text.sameMarkdownScope).toBe("Drop within the same Markdown file");
    expect(text.selectionMenuTimeoutName).toBe("Text selection menu timeout");
    expect(text.blockMenuDescription).not.toContain("Convert");
  });
});
