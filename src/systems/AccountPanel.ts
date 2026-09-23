import type { LeaderRow, RunSummary, SessionUser } from './AccountApi';
import {
  fetchLeaderboard,
  fetchMe,
  loginHref,
  logout,
  startRun,
  submitScore,
} from './AccountApi';

export class AccountPanel {
  private user: SessionUser | null = null;
  private runToken = '';

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
    this.renderBoard('#board-combo', data.combo, '');
  }

  async beginRunToken(): Promise<void> {
    this.runToken = '';
    if (!this.user) return;
    const started = await startRun();
    if (started) this.runToken = started.token;
  }

  async submitRun(run: Omit<RunSummary, 'runToken'>): Promise<void> {
    if (!this.user) {
      this.setAuthStatus('登录 MineBBS 后成绩可上榜');
      return;
    }
    if (!this.runToken) {
      this.setAuthStatus('本局未登记，成绩未上传');
      return;
    }
    const token = this.runToken;
    this.runToken = '';
    const result = await submitScore({ ...run, runToken: token });
    if (!result) {
      this.setAuthStatus('成绩同步失败或未通过校验');
      return;
    }
    this.user = {
      ...this.user,
      bestDistance: result.bestDistance,
      bestCombo: result.bestCombo,
      lastDistance: run.distance,
      lastCombo: run.maxCombo,
      runCount: this.user.runCount + 1,
    };
    this.renderPersonalBest();
    if (result.improved.distance || result.improved.combo) {
      this.setAuthStatus('新纪录已上榜！');
      void this.reloadLeaderboard();
    }
  }

  private bind(): void {
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.querySelector('#login-link')?.addEventListener('click', (e) => {
      stop(e);
      window.location.href = loginHref();
    });
    document.querySelector('#logout-button')?.addEventListener('click', (e) => {
      stop(e);
      void (async () => {
        await logout();
        this.user = null;
        this.runToken = '';
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
    el.textContent = `最佳 ${this.user.bestDistance}m · 连击 ×${this.user.bestCombo} · ${this.user.runCount} 局`;
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
        const suffix = unit ? `${r.value}${unit}` : `×${r.value}`;
        return `<li><span class="rank">${r.rank}</span><span class="name">${name}</span><span class="val">${suffix}</span></li>`;
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
