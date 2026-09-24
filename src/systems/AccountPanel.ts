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
    this.showBoard('distance');
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
    this.renderBoard('#board-runs', data.runs, '局');
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
    if (!this.runToken) await this.beginRunToken();
    if (!this.runToken) {
      this.setAuthStatus('成绩登记失败，请重试');
      return;
    }
    const token = this.runToken;
    const result = await submitScore({ ...run, runToken: token });
    if (!result) {
      this.setAuthStatus('网络异常，成绩未同步');
      return;
    }
    if (!result.ok) {
      const map: Record<string, string> = {
        too_many_requests: '提交过快，稍后再试',
        implausible_run: '成绩未通过校验',
        invalid_run_token: '本局已结束或未登记',
      };
      this.setAuthStatus(map[result.error] ?? '成绩同步失败');
      return;
    }
    this.runToken = '';
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

    // 排行榜标签 — 只显示选中榜（每榜前 10）
    document.querySelectorAll<HTMLButtonElement>('.board-tabs [data-board]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        stop(e);
        const key = btn.dataset.board as 'distance' | 'combo' | 'runs' | undefined;
        if (!key) return;
        this.showBoard(key);
      });
    });

    this.bindDrag();
  }

  private showBoard(key: 'distance' | 'combo' | 'runs'): void {
    document.querySelectorAll('.board-tabs [data-board]').forEach((b) => {
      b.classList.toggle('is-active', (b as HTMLElement).dataset.board === key);
    });
    document.querySelectorAll<HTMLElement>('[data-board-panel]').forEach((panel) => {
      const on = panel.dataset.boardPanel === key;
      panel.hidden = !on;
      panel.style.display = on ? '' : 'none';
    });
  }

  /** 账号条可拖动，位置存 localStorage */
  private bindDrag(): void {
    const bar = document.querySelector<HTMLElement>('#account-bar');
    const handle = document.querySelector<HTMLElement>('#account-toggle');
    if (!bar || !handle) return;

    // restore
    try {
      const raw = localStorage.getItem('rs-account-pos');
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        bar.style.left = `${p.x}px`;
        bar.style.top = `${p.y}px`;
        bar.style.right = 'auto';
      }
    } catch {
      // ignore
    }

    let dragging = false;
    let moved = false;
    let ox = 0;
    let oy = 0;

    const onDown = (e: PointerEvent) => {
      // 拖动手柄：整条标题区可拖；点右侧箭头仍切换展开
      const t = e.target as HTMLElement | null;
      if (t?.closest('.chev')) return;
      dragging = true;
      moved = false;
      const rect = bar.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      bar.classList.add('is-dragging');
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      moved = true;
      const maxX = window.innerWidth - bar.offsetWidth;
      const maxY = window.innerHeight - 40;
      const x = Math.min(Math.max(0, e.clientX - ox), Math.max(0, maxX));
      const y = Math.min(Math.max(0, e.clientY - oy), Math.max(0, maxY));
      bar.style.left = `${x}px`;
      bar.style.top = `${y}px`;
      bar.style.right = 'auto';
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('is-dragging');
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        const rect = bar.getBoundingClientRect();
        try {
          localStorage.setItem(
            'rs-account-pos',
            JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }),
          );
        } catch {
          // ignore
        }
      }
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);

    // 轻点展开/收起（拖动超过阈值则不切换）
    handle.addEventListener('click', (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
        return;
      }
      const body = document.querySelector<HTMLElement>('#account-body');
      if (!body) return;
      const open = body.hidden;
      body.hidden = !open;
      bar.dataset.open = open ? '1' : '0';
    });
  }

  private renderAuth(): void {
    const guest = document.querySelector<HTMLElement>('#auth-guest');
    const userBox = document.querySelector<HTMLElement>('#auth-user');
    const nameEl = document.querySelector<HTMLElement>('#auth-username');
    const chip = document.querySelector<HTMLElement>('#account-chip-label');
    if (!guest || !userBox || !nameEl) return;
    if (this.user) {
      guest.hidden = true;
      userBox.hidden = false;
      nameEl.textContent = this.user.username;
      if (chip) chip.textContent = this.user.username;
    } else {
      guest.hidden = false;
      userBox.hidden = true;
      if (chip) chip.textContent = '未登录';
    }
  }

  private renderPersonalBest(): void {
    const text = !this.user
      ? '登录后同步最佳成绩'
      : `最佳 ${this.user.bestDistance}m · 连击 ×${this.user.bestCombo} · ${this.user.runCount} 局`;
    const a = document.querySelector<HTMLElement>('#auth-best');
    const b = document.querySelector<HTMLElement>('#auth-best-user');
    if (a && !this.user) a.textContent = text;
    if (b && this.user) b.textContent = text;
  }

  private renderBoard(selector: string, rows: LeaderRow[], unit: string): void {
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) return;
    const top = rows.slice(0, 10);
    if (!top.length) {
      root.innerHTML = '<li class="board-empty">暂无记录</li>';
      return;
    }
    root.innerHTML = top
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
