import type { LeaderRow, RunSummary, SessionUser } from './AccountApi';
import { fetchLeaderboard, fetchMe, loginHref, logout, submitScore } from './AccountApi';

export class AccountPanel {
  private user: SessionUser | null = null;

  constructor() {
    void this.refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.get('authError')) {
      this.setAuthStatus('登录失败，请重试');
      params.delete('authError');
      const q = params.toString();
      window.history.replaceState({}, '', q ? `/?${q}` : '/');
    }
    this.bind();
    void this.reloadLeaderboard();
  }

  async refresh(): Promise<void> {
    this.user = await fetchMe();
    this.renderAuth();
    this.renderPersonalBest();
  }

  async reloadLeaderboard(): Promise<void> {
    const board = document.querySelector<HTMLElement>('#leaderboard');
    if (!board) return;
    const data = await fetchLeaderboard();
    if (!data) {
      board.dataset.state = 'error';
      return;
    }
    board.dataset.state = 'ready';
    this.renderBoard('#board-distance', data.distance, 'm');
    this.renderBoard('#board-score', data.score, '分');
  }

  async submitRun(run: RunSummary): Promise<void> {
    if (!this.user) {
      this.setAuthStatus('登录 MineBBS 后成绩可上榜');
      return;
    }
    const result = await submitScore(run);
    if (!result) {
      this.setAuthStatus('成绩同步失败');
      return;
    }
    this.user = {
      ...this.user,
      bestDistance: result.bestDistance,
      bestScore: result.bestScore,
      lastDistance: run.distance,
      lastScore: run.score,
      runCount: this.user.runCount + 1,
      maxCombo: Math.max(this.user.maxCombo, run.maxCombo || 0),
    };
    this.renderPersonalBest();
    if (result.improved.distance || result.improved.score) {
      this.setAuthStatus('新纪录已上榜！');
      void this.reloadLeaderboard();
    }
  }

  private bind(): void {
    document.querySelector<HTMLAnchorElement>('#login-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = loginHref();
    });
    document.querySelector<HTMLButtonElement>('#logout-button')?.addEventListener('click', () => {
      void (async () => {
        await logout();
        this.user = null;
        this.renderAuth();
        this.renderPersonalBest();
        this.setAuthStatus('已退出登录');
      })();
    });
  }

  private renderAuth(): void {
    const guest = document.querySelector<HTMLElement>('#auth-guest');
    const userBox = document.querySelector<HTMLElement>('#auth-user');
    const nameEl = document.querySelector<HTMLElement>('#auth-username');
    if (!guest || !userBox || !nameEl) return;
    if (this.user) {
      guest.hidden = true;
      userBox.hidden = false;
      nameEl.textContent = this.user.username;
    } else {
      guest.hidden = false;
      userBox.hidden = true;
    }
  }

  private renderPersonalBest(): void {
    const el = document.querySelector<HTMLElement>('#auth-best');
    if (!el) return;
    if (!this.user) {
      el.textContent = '登录后同步最佳成绩';
      return;
    }
    el.textContent = `最佳 ${this.user.bestDistance}m / ${this.user.bestScore}分 · ${this.user.runCount} 局`;
  }

  private renderBoard(selector: string, rows: LeaderRow[], unit: string): void {
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) return;
    if (!rows.length) {
      root.innerHTML = '<li class="board-empty">暂无记录</li>';
      return;
    }
    root.innerHTML = rows
      .map((r) => {
        const name = escapeHtml(r.username);
        return `<li><span class="rank">${r.rank}</span><span class="name">${name}</span><span class="val">${r.value}${unit}</span></li>`;
      })
      .join('');
  }

  private setAuthStatus(text: string): void {
    const el = document.querySelector<HTMLElement>('#auth-status');
    if (el) el.textContent = text;
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
