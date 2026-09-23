import type * as THREE from 'three';

export type Easing = (t: number) => number;

export const easeInQuad: Easing = (t) => t * t;
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface ActiveTween {
  elapsed: number;
  duration: number;
  easing: Easing;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

export class TweenManager {
  private readonly tweens: ActiveTween[] = [];

  tween(
    durationSec: number,
    onUpdate: (value: number) => void,
    easing: Easing = easeOutCubic,
    onComplete?: () => void,
  ): void {
    this.tweens.push({ elapsed: 0, duration: durationSec, easing, onUpdate, onComplete });
  }

  update(delta: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const t = this.tweens[i];
      t.elapsed += delta;
      const k = Math.min(t.elapsed / t.duration, 1);
      t.onUpdate(t.easing(k));
      if (t.elapsed >= t.duration) {
        t.onComplete?.();
        this.tweens.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.tweens.length = 0;
  }
}

const TRAUMA_MAX = 1;
const TRAUMA_DECAY = 1.4;
const MAX_OFFSET = 0.45;
const MAX_ROLL = 0.08;

function pseudoNoise(t: number, seed: number): number {
  const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export class ShakeRig {
  private trauma = 0;
  private time = 0;

  addTrauma(amount: number): void {
    this.trauma = Math.min(TRAUMA_MAX, this.trauma + amount);
  }

  update(delta: number, camera: THREE.PerspectiveCamera): void {
    this.time += delta;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * delta);
    if (this.trauma <= 0) return;
    const shake = this.trauma * this.trauma;
    const freq = this.time * 32;
    camera.position.x += MAX_OFFSET * shake * pseudoNoise(freq, 1);
    camera.position.y += MAX_OFFSET * shake * pseudoNoise(freq, 2);
    camera.rotation.z += MAX_ROLL * shake * pseudoNoise(freq, 3);
  }

  reset(): void {
    this.trauma = 0;
    this.time = 0;
  }
}

export class Hitstop {
  private hitstopRemaining = 0;
  timeScale = 1;

  trigger(durationMs: number, scale = 0.05): void {
    this.hitstopRemaining = Math.max(this.hitstopRemaining, durationMs / 1000);
    this.timeScale = scale;
  }

  /** Returns gameplay scale and consumes real delta against remaining freeze. */
  tick(realDelta: number): number {
    if (this.hitstopRemaining > 0) {
      this.hitstopRemaining -= realDelta;
      if (this.hitstopRemaining <= 0) this.timeScale = 1;
    }
    return this.timeScale;
  }

  reset(): void {
    this.hitstopRemaining = 0;
    this.timeScale = 1;
  }
}

export function squash(target: THREE.Object3D, tweens: TweenManager, squashY = 0.85, durationSec = 0.18): void {
  const startXZ = 1 / Math.sqrt(squashY);
  tweens.tween(
    durationSec,
    (t) => {
      const y = squashY + (1 - squashY) * t;
      const xz = startXZ + (1 - startXZ) * t;
      target.scale.set(xz, y, xz);
    },
    easeOutBack,
    () => {
      target.scale.set(1, 1, 1);
    },
  );
}
