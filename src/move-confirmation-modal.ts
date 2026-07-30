import { Modal, Setting, type App } from "obsidian";

export class MoveConfirmationModal extends Modal {
  private settled = false;
  private resolveResult: ((confirmed: boolean) => void) | undefined;

  constructor(app: App, private readonly blockCount: number) {
    super(app);
  }

  openAndConfirm(): Promise<boolean> {
    const result = new Promise<boolean>((resolve) => {
      this.resolveResult = resolve;
    });
    this.open();
    return result;
  }

  onOpen(): void {
    this.modalEl.addClass("dragdrop-move-confirmation-modal");
    this.titleEl.setText("Confirm move");
    const subject = this.blockCount === 1 ? "This block" : "One or more selected blocks";
    this.contentEl.createEl("p", {
      text: `${subject} already has a block ID and may already be referenced by other notes. Moving it will break those references. Continue?`,
    });

    let moveButton: HTMLButtonElement | undefined;
    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => this.finish(false));
      })
      .addButton((button) => {
        moveButton = button.buttonEl;
        button.setButtonText("Move").setCta().onClick(() => this.finish(true));
      });
    moveButton?.focus();
  }

  onClose(): void {
    if (!this.settled) this.resolveResult?.(false);
    this.contentEl.empty();
  }

  private finish(confirmed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveResult?.(confirmed);
    this.close();
  }
}
