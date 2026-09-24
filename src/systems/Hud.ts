export class Hud {
  private readonly distanceValue = this.getElement('#distance-value');
  private readonly comboValue = this.getElement('#combo-value');
  private readonly bestValue = this.getElement('#best-value');
  private readonly speedValue = this.getElement('#speed-value');
  private readonly statusLine = this.getElement('#status-line');
  private readonly titlePanel = this.getElement('#title-panel');
  private readonly gameoverPanel = this.getElement('#gameover-panel');
  private readonly pausePanel = this.getElement('#pause-panel');
  private readonly failReason = this.getElement('#fail-reason');
  private readonly finalDistance = this.getElement('#final-distance');
  private readonly finalCombo = this.getElement('#final-combo');
  private readonly finalBest = this.getElement('#final-best');
  private readonly scorePop = this.getElement('#score-pop');
  private readonly jackpotOverlay = this.getElement('#jackpot-overlay');

  private setChromeVisible(home: boolean): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (app) app.dataset.screen = home ? 'home' : 'playing';
    const lb = document.querySelector<HTMLElement>('#leaderboard');
    if (lb) lb.hidden = !home;
    const account = document.querySelector<HTMLElement>('#account-bar');
    if (account) {
      account.dataset.screen = home ? 'home' : 'playing';
      if (!home) {
        const body = account.querySelector<HTMLElement>('#account-body');
        if (body) body.hidden = true;
        account.dataset.open = '0';
      }
    }
  }

  showTitle(best: number): void {
    this.bestValue.textContent = String(best);
    this.titlePanel.hidden = false;
    this.gameoverPanel.hidden = true;
    this.pausePanel.hidden = true;
    this.statusLine.textContent = '准备出发';
    this.setChromeVisible(true);
  }

  showPlaying(): void {
    this.titlePanel.hidden = true;
    this.gameoverPanel.hidden = true;
    this.pausePanel.hidden = true;
    this.statusLine.textContent = '全力奔跑';
    this.setChromeVisible(false);
  }

  showPaused(): void {
    this.pausePanel.hidden = false;
    this.setChromeVisible(false);
  }

  showGameOver(distance: number, maxCombo: number, best: number, reason: string): void {
    this.gameoverPanel.hidden = false;
    this.pausePanel.hidden = true;
    this.titlePanel.hidden = true;
    this.failReason.textContent = reason;
    this.finalDistance.textContent = `${Math.floor(distance)} m`;
    this.finalCombo.textContent = `×${Math.max(1, maxCombo)}`;
    this.finalBest.textContent = String(best);
    this.statusLine.textContent = '被击中了';
    this.setChromeVisible(false);
  }

  update(distance: number, combo: number, best: number, speed: number): void {
    this.distanceValue.textContent = String(Math.floor(distance));
    this.comboValue.textContent = `×${Math.max(1, combo)}`;
    this.bestValue.textContent = String(best);
    this.speedValue.textContent = speed.toFixed(1);
  }

  flashPickup(): void {
    this.comboValue.animate(
      [{ transform: 'scale(1.2)', color: '#f5ba49' }, { transform: 'scale(1)', color: '' }],
      { duration: 160, easing: 'ease-out' },
    );
    this.statusLine.animate(
      [
        { transform: 'translateY(0)', borderLeftColor: '#f5ba49' },
        { transform: 'translateY(-3px)', borderLeftColor: '#7ec8e3' },
        { transform: 'translateY(0)', borderLeftColor: '#f5ba49' },
      ],
      { duration: 220, easing: 'ease-out' },
    );
  }

  flashScorePop(combo: number): void {
    const el = this.scorePop;
    el.textContent = `连击 ×${combo}`;
    el.dataset.tier = 'cookie';
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 8px) scale(0.85)' },
        { opacity: 1, transform: 'translate(-50%, -6px) scale(1)', offset: 0.25 },
        { opacity: 0, transform: 'translate(-50%, -28px) scale(1.05)' },
      ],
      { duration: 520, easing: 'ease-out' },
    );
  }

  flashJackpot(combo: number): void {
    const pop = this.scorePop;
    pop.dataset.tier = 'cake';
    pop.textContent = `蛋糕 · 连击 ×${combo}`;
    pop.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 10px) scale(0.8)' },
        { opacity: 1, transform: 'translate(-50%, -8px) scale(1.12)', offset: 0.22 },
        { opacity: 0, transform: 'translate(-50%, -36px) scale(1)' },
      ],
      { duration: 720, easing: 'ease-out' },
    );
    this.jackpotOverlay.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], {
      duration: 560,
      easing: 'ease-out',
    });
  }

  flashCombo(combo: number): void {
    this.comboValue.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], {
      duration: 180,
      easing: 'ease-out',
    });
    this.statusLine.textContent = `连击 ×${combo}!`;
  }

  flashCrash(): void {
    this.statusLine.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], {
      duration: 320,
      easing: 'ease-in-out',
    });
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
