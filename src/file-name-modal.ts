import { Modal, requireApiVersion, Setting, TextComponent } from "obsidian";

export type FileNameDecision =
  | { type: "create"; name: string }
  | { type: "skip" }
  | { type: "cancel-remaining" };

export class FileNameModal extends Modal {
  private settled = false;
  private resolveDecision: ((decision: FileNameDecision) => void) | undefined;
  private input: TextComponent | undefined;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly initialName: string,
    private readonly description: string,
    private readonly validate: (name: string) => string | null,
  ) {
    super(app);
  }

  openAndGetDecision(): Promise<FileNameDecision> {
    const result = new Promise<FileNameDecision>((resolve) => {
      this.resolveDecision = resolve;
    });
    this.open();
    return result;
  }

  onOpen(): void {
    this.modalEl.addClass("dragdrop-file-name-modal");
    this.titleEl.setText("Name note");

    let validationSetting: Setting;
    new Setting(this.contentEl)
      .setName("File name")
      .setDesc(this.description)
      .addText((text) => {
        this.input = text;
        text
          .setPlaceholder("Enter a file name")
          .setValue(this.initialName)
          .onChange(() => validationSetting.setDesc(""));
        text.inputEl.setAttr("aria-label", "File name");
      });

    validationSetting = new Setting(this.contentEl).setClass("dragdrop-validation");

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("Create")
          .setCta()
          .onClick(() => {
            const name = this.input?.getValue().trim() ?? "";
            const error = this.validate(name);
            if (error) {
              validationSetting.setDesc(error);
              this.input?.inputEl.focus();
              return;
            }
            this.finish({ type: "create", name });
          }),
      )
      .addButton((button) =>
        button.setButtonText("Skip current").onClick(() => {
          this.finish({ type: "skip" });
        }),
      )
      .addButton((button) => {
        button.setButtonText("Cancel remaining");
        if (requireApiVersion("1.13.0")) button.setDestructive();
        else button.buttonEl.addClass("mod-warning");
        button.onClick(() => {
          this.finish({ type: "cancel-remaining" });
        });
      });

    this.input?.inputEl.focus();
    this.input?.inputEl.select();
  }

  onClose(): void {
    if (!this.settled) this.resolveDecision?.({ type: "skip" });
    this.contentEl.empty();
  }

  private finish(decision: FileNameDecision): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveDecision?.(decision);
    this.close();
  }
}
