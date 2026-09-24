const CRASH_SFX_URL = 'audio/mariofail.mp3';
/** Keep fail sting clear but not harsh — Mario fail clips are often near full scale. */
const CRASH_VOLUME = 0.16;

export class AudioSystem {
  private context: AudioContext | null = null;
  private unlocked = false;
  private duck = 1;
  private crashBuffer: AudioBuffer | null = null;
  private crashSource: AudioBufferSourceNode | null = null;

  constructor() {
    const unlock = () => {
      void this.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    await this.context.resume();
    this.unlocked = true;
    void this.loadCrashSfx();
  }

  private async loadCrashSfx(): Promise<void> {
    if (!this.context || this.crashBuffer) return;
    try {
      const res = await fetch(CRASH_SFX_URL);
      if (!res.ok) return;
      const raw = await res.arrayBuffer();
      this.crashBuffer = await this.context.decodeAudioData(raw);
    } catch {
      // keep procedural fallback
    }
  }

  setDuck(value: number): void {
    this.duck = value;
  }

  pickup(combo = 1, gold = false): void {
    if (!this.context || this.context.state !== 'running') return;
    const pitchCombo = Math.min(combo, 16);
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    const base = gold ? 520 : 340;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base + pitchCombo * 18, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.9 + pitchCombo * 12, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07 * this.duck, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  jump(): void {
    this.blip(220, 420, 0.12, 'sine', 0.05);
  }

  land(): void {
    this.blip(140, 80, 0.08, 'triangle', 0.04);
  }

  lane(): void {
    this.blip(300, 360, 0.05, 'square', 0.02);
  }

  duckSfx(): void {
    this.blip(260, 180, 0.08, 'sine', 0.03);
  }

  crash(): void {
    if (!this.context || this.context.state !== 'running') return;
    void this.loadCrashSfx();
    if (this.crashBuffer) {
      this.stopCrashVoice();
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = this.crashBuffer;
      gain.gain.setValueAtTime(CRASH_VOLUME * this.duck, this.context.currentTime);
      source.connect(gain).connect(this.context.destination);
      source.onended = () => {
        if (this.crashSource === source) this.crashSource = null;
      };
      source.start();
      this.crashSource = source;
      return;
    }
    this.playProceduralCrash();
  }

  private stopCrashVoice(): void {
    try {
      this.crashSource?.stop();
    } catch {
      // already stopped
    }
    this.crashSource = null;
  }

  private playProceduralCrash(): void {
    if (!this.context || this.context.state !== 'running') return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
    gain.gain.setValueAtTime(0.1 * this.duck, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  }

  ui(): void {
    this.blip(500, 620, 0.06, 'sine', 0.03);
  }

  private blip(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    if (!this.context || this.context.state !== 'running') return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * this.duck, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.02);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  dispose(): void {
    this.stopCrashVoice();
    void this.context?.close();
    this.context = null;
    this.crashBuffer = null;
  }
}
