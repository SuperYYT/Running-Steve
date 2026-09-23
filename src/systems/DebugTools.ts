export class DebugTools {
  private panel: HTMLElement | null = null;

  constructor(private readonly onClose?: () => void) {
    // Keep a minimal debug affordance; real tuning lives in Game.tuning.
  }

  setHidden(hidden: boolean): void {
    if (this.panel) this.panel.style.display = hidden ? 'none' : '';
    document.body.dataset.debugHidden = hidden ? '1' : '0';
  }

  dispose(): void {
    this.panel?.remove();
    this.panel = null;
    this.onClose?.();
  }
}
