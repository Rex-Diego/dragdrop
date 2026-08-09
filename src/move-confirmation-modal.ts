import { Modal, Setting, type App } from "obsidian";

export type DestructiveBlockAction = "move" | "cut" | "delete";

export class MoveConfirmationModal extends Modal {
  private settled = false;
  private resolveResult: ((confirmed: boolean) => void) | undefined;

  constructor(
    app: App,
    private readonly blockCount: number,
    private readonly action: DestructiveBlockAction = "move",
  ) {
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
    this.titleEl.setText(`Confirm ${this.action}`);
    const subject = this.blockCount === 1 ? "This block" : "One or more selected blocks";
    const verb = this.action === "delete" ? "Deleting" : this.action === "cut" ? "Cutting" : "Moving";
    this.contentEl.createEl("p", {
      text: `${subject} already has a block ID and may already be referenced by other notes. ${verb} it may break those references. Continue?`,
    });

    let moveButton: HTMLButtonElement | undefined;
    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => this.finish(false));
      })
      .addButton((button) => {
        moveButton = button.buttonEl;
        button.setButtonText(this.action[0]?.toUpperCase() + this.action.slice(1)).setCta().onClick(() => this.finish(true));
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
