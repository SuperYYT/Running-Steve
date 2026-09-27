/**
 * Random-order BGM player for the home screen.
 * Uses HTMLAudioElement (simpler for long MP3s than Web Audio).
 */
const PLAYLIST = [
  { file: 'track01.mp3', title: '哈基米的夏天' },
  { file: 'track02.mp3', title: '基米的澎湖湾' },
  { file: 'track03.mp3', title: '太空曼波' },
  { file: 'track04.mp3', title: '印度哈基米' },
  { file: 'track05.mp3', title: '哈基米山歌' },
  { file: 'track06.mp3', title: '滑雪大冒险' },
  { file: 'track07.mp3', title: '来去曼波' },
  { file: 'track08.mp3', title: 'Sunshine 曼波' },
  { file: 'track09.mp3', title: '蓝莲哈' },
  { file: 'track10.mp3', title: 'Color-X' },
  { file: 'track11.mp3', title: 'Normal No More' },
  { file: 'track12.mp3', title: '舌尖上的基米' },
];

export class MusicPlayer {
  private readonly audio = new Audio();
  private order: number[] = [];
  private cursor = 0;
  private wantPlay = false;

  constructor() {
    this.audio.preload = 'metadata';
    this.audio.volume = 0.45;
    this.shuffle();
    this.audio.addEventListener('ended', () => this.next());
    this.bind();
    this.render();
  }

  private shuffle(): void {
    this.order = PLAYLIST.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.cursor = 0;
  }

  private async playIndex(i: number): Promise<void> {
    const t = PLAYLIST[i];
    this.audio.src = `audio/bgm/${t.file}`;
    try {
      await this.audio.play();
      this.wantPlay = true;
    } catch {
      this.wantPlay = true; // retry on next gesture
    }
    this.render();
  }

  next(): void {
    this.cursor += 1;
    if (this.cursor >= this.order.length) this.shuffle();
    void this.playIndex(this.order[this.cursor]);
  }

  private bind(): void {
    const stop = (e: Event) => {
      // keep window-level audio unlock working — only stop game start
      e.preventDefault();
      e.stopPropagation();
    };
    document.querySelector('#music-toggle')?.addEventListener('click', (e) => {
      stop(e);
      if (this.audio.paused) {
        if (!this.audio.src) void this.playIndex(this.order[this.cursor]);
        else void this.audio.play().catch(() => undefined);
      } else {
        this.audio.pause();
        this.wantPlay = false;
      }
      this.render();
    });
    document.querySelector('#music-next')?.addEventListener('click', (e) => {
      stop(e);
      this.next();
    });
    // Collapse / expand on mobile so it does not cover the leaderboard
    document.querySelector('#music-expand')?.addEventListener('click', (e) => {
      stop(e);
      document.querySelector('#music-player')?.classList.toggle('expanded');
    });

    // First user gesture starts music (browsers block autoplay)
    const kick = () => {
      if (this.audio.paused && this.wantPlay !== false) {
        void this.playIndex(this.order[this.cursor]);
      }
    };
    window.addEventListener('pointerdown', kick, { once: true, capture: true });
    window.addEventListener('keydown', kick, { once: true, capture: true });
  }

  setScreen(screen: string): void {
    const el = document.querySelector<HTMLElement>('#music-player');
    if (el) el.hidden = screen === 'playing' || screen === 'paused';
    if (screen === 'playing') this.audio.volume = 0.28;
    else this.audio.volume = 0.45;
    this.render();
  }

  private render(): void {
    const title = document.querySelector('#music-title');
    const btn = document.querySelector('#music-toggle');
    const i = this.order[this.cursor] ?? 0;
    if (title) title.textContent = PLAYLIST[i]?.title ?? '背景音乐';
    if (btn) {
      const playing = !this.audio.paused && !!this.audio.src;
      btn.textContent = playing ? '❚❚' : '▶';
      btn.setAttribute('aria-label', playing ? '暂停音乐' : '播放音乐');
    }
  }
}
