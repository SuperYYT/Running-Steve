import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { FishPickup } from '../entities/FishPickup';
import { laneX, Obstacle, OBSTACLE_DEFS, type ObstacleKind } from '../entities/Obstacle';
import { SteveRunner } from '../entities/SteveRunner';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { makeColliderFromCenter, overlaps, playerCollider } from '../systems/CollisionSystem';
import { DebugTools } from '../systems/DebugTools';
import { Hitstop, ShakeRig, squash, TweenManager } from '../systems/Feel';
import { Hud } from '../systems/Hud';
import { PickupBurst, type BurstKind } from '../systems/PickupBurst';
import { Track } from '../systems/Track';
import { createSeededRandom } from '../utils/random';

type GameState = 'title' | 'playing' | 'paused' | 'gameover';

const BEST_KEY = 'steve-runner-best';
const MAX_OBSTACLES = 24;
const MAX_FISH = 48;
const GRAVITY = 28;
const JUMP_V = 10.5;
const GROUND_Y = 0;
const DUCK_DURATION = 0.55;
const FISH_HALF = new THREE.Vector3(0.35, 0.3, 0.35);

export type GameHooks = {
  onRunEnd?: (run: {
    distance: number;
    maxCombo: number;
    durationMs: number;
    cookies: number;
    cakes: number;
    failReason: string;
  }) => void;
  onReturnHome?: () => void;
  onRunStart?: () => void;
};

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
  private readonly input = new InputController();
  private readonly player = new SteveRunner();
  private readonly track = new Track();
  private readonly obstacles: Obstacle[] = [];
  private readonly fish: FishPickup[] = [];
  private readonly bursts = new PickupBurst();
  private readonly audio = new AudioSystem();
  private readonly hud = new Hud();
  private readonly cameraRig = new CameraRig(this.camera);
  private readonly tweens = new TweenManager();
  private readonly shake = new ShakeRig();
  private readonly hitstop = new Hitstop();
  private readonly debugTools = new DebugTools();
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private readonly tuning = {
    baseSpeed: 12,
    maxSpeed: 22,
    speedRampPerMeter: 0.012,
    cameraLag: 0.22,
    exposure: 1.08,
    maxDpr: 2,
    laneCooldown: 0.12,
  };

  private frame = 0;
  private state: GameState = 'title';
  private elapsed = 0;
  private runTime = 0;
  private distance = 0;
  private combo = 1;
  private comboTimer = 0;
  private pickupStreak = 0;
  private runMaxCombo = 0;
  private runCookies = 0;
  private runCakes = 0;
  private best = 0;
  private lane = 0;
  private laneVisual = 0;
  private laneCooldown = 0;
  private y = GROUND_Y;
  private vy = 0;
  private airborne = false;
  private ducking = false;
  private duckAmount = 0;
  private duckTimer = 0;
  private lean = 0;
  private speed = 0;
  private nextSpawnZ = -34;
  private readonly obstacleCenter = new THREE.Vector3();
  private rng = createSeededRandom(1);
  private pausedForScreenshot = false;
  private reducedMotion = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: GameHooks = {},
  ) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;

    for (let i = 0; i < MAX_OBSTACLES; i += 1) {
      const o = new Obstacle();
      this.obstacles.push(o);
      this.scene.add(o.group);
    }
    for (let i = 0; i < MAX_FISH; i += 1) {
      const f = new FishPickup();
      this.fish.push(f);
      this.scene.add(f.group);
    }
    this.scene.add(this.bursts.group);

    this.createScene();
    void this.player.loadSkin('textures/steve.png');
    void FishPickup.loadTextures('textures/');
    this.best = this.loadBest();
    this.hud.showTitle(this.best);
    this.cameraRig.snapTo(this.player.group.position);
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.installTestHooks();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    for (const o of this.obstacles) o.dispose();
    for (const f of this.fish) f.dispose();
    this.bursts.dispose();
    this.player.dispose();
    this.track.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }
    if (!this.reducedMotion) this.elapsed += delta;

    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);

    const intents = this.input.read(delta);

    if (this.state === 'title' && intents.startPressed) {
      this.beginRun();
    } else if (this.state === 'gameover' && intents.homePressed) {
      this.returnHome();
    } else if (this.state === 'gameover' && (intents.restartPressed || intents.startPressed)) {
      this.beginRun();
    } else if (this.state === 'playing' && intents.pausePressed) {
      this.state = 'paused';
      this.hud.showPaused();
      this.audio.ui();
    } else if (this.state === 'paused' && (intents.pausePressed || intents.startPressed)) {
      this.state = 'playing';
      this.hud.showPlaying();
      this.audio.ui();
    } else if (this.state === 'paused' && intents.homePressed) {
      this.returnHome();
    } else if (this.state === 'paused' && intents.restartPressed) {
      this.beginRun();
    }

    const timeScale = this.hitstop.tick(delta);
    this.audio.setDuck(this.hitstop.timeScale < 1 ? 0.55 : 1);
    const gameDelta = delta * timeScale;

    if (this.state === 'playing') {
      this.runTime += gameDelta;
      this.speed = Math.min(
        this.tuning.maxSpeed,
        this.tuning.baseSpeed + this.distance * this.tuning.speedRampPerMeter,
      );
      this.distance += this.speed * gameDelta;

      this.updatePlayer(gameDelta, intents);
      this.updateWorld(gameDelta, elapsed);
      this.checkCollisions();
      this.updateCombo(gameDelta);
    } else if (this.state === 'gameover') {
      // keep scenery settled
    }

    // Feedback always uses real delta
    this.tweens.update(delta);
    this.bursts.update(delta, this.state === 'playing' ? this.speed * gameDelta : 0);
    this.cameraRig.update(delta, this.player.group.position, this.tuning.cameraLag, this.lean);
    this.shake.update(delta, this.camera);
    this.hud.update(this.distance, this.combo, this.best, this.speed);
    this.publishDiagnostics();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private createScene(): void {
    this.scene.background = new THREE.Color('#87d4ef');
    this.scene.fog = new THREE.Fog('#87d4ef', 28, 70);

    const hemi = new THREE.HemisphereLight('#fff6df', '#c4a574', 1.55);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff1bf', 2.4);
    sun.position.set(-6, 12, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -8;
    this.scene.add(sun);
    // Keep shadow frustum near the player
    sun.target.position.set(0, 0, -6);
    this.scene.add(sun.target);

    this.scene.add(this.track.group);
    this.scene.add(this.player.group);
    this.player.group.position.set(0, GROUND_Y, 0);
    this.player.group.rotation.y = Math.PI; // face -Z travel direction... actually model faces -Z already
    this.player.group.rotation.y = 0;
  }

  private updatePlayer(gameDelta: number, intents: ReturnType<InputController['read']>): void {
    this.laneCooldown = Math.max(0, this.laneCooldown - gameDelta);
    if (this.laneCooldown <= 0) {
      if (intents.leftPressed && this.lane > -1) {
        this.lane -= 1;
        this.laneCooldown = this.tuning.laneCooldown;
        this.audio.lane();
        this.lean = -1;
      } else if (intents.rightPressed && this.lane < 1) {
        this.lane += 1;
        this.laneCooldown = this.tuning.laneCooldown;
        this.audio.lane();
        this.lean = 1;
      }
    }

    if (intents.jumpPressed && !this.airborne && !this.ducking) {
      this.vy = JUMP_V;
      this.airborne = true;
      this.audio.jump();
      squash(this.player.visual, this.tweens, 1.12, 0.16);
    }

    // One-shot duck (like jump): press starts a short timed sneak, cannot hold forever
    if (intents.duckPressed && !this.airborne && this.duckTimer <= 0) {
      this.duckTimer = DUCK_DURATION;
      this.audio.duckSfx();
      squash(this.player.visual, this.tweens, 0.88, 0.14);
    }
    if (this.duckTimer > 0) {
      this.duckTimer = Math.max(0, this.duckTimer - gameDelta);
    }
    this.ducking = this.duckTimer > 0 && !this.airborne;
    const duckTarget = this.ducking ? 1 : 0;
    this.duckAmount += (duckTarget - this.duckAmount) * Math.min(1, gameDelta * 14);

    if (this.airborne) {
      this.vy -= GRAVITY * gameDelta;
      this.y += this.vy * gameDelta;
      if (this.y <= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.airborne = false;
        this.audio.land();
        squash(this.player.visual, this.tweens, 0.9, 0.16);
        this.shake.addTrauma(0.12);
      }
      this.player.setJumpPose(1 - Math.min(1, Math.abs(this.vy) / JUMP_V));
    } else {
      this.player.resetScale();
      this.y = GROUND_Y;
    }

    // Smooth lane + lean (softer so the chase cam doesn't jolt)
    const targetX = laneX(this.lane);
    const xFactor = 1 - Math.exp(-gameDelta / 0.12);
    this.laneVisual += (targetX - this.laneVisual) * xFactor;
    this.lean *= Math.exp(-gameDelta / 0.18);

    this.player.group.position.set(this.laneVisual, this.y, 0);
    this.player.setLean(this.lean * 0.22);
    this.player.setDuck(this.duckAmount);
    this.player.update(gameDelta, this.reducedMotion ? 0 : this.elapsed, this.speed, this.airborne);
  }

  private updateWorld(gameDelta: number, elapsed: number): void {
    const scrollZ = this.speed * gameDelta;
    this.track.update(gameDelta, this.speed);

    this.nextSpawnZ += scrollZ;
    // Keep the road filled out to ~50 units ahead of the player.
    while (this.nextSpawnZ > -50) {
      this.spawnPattern(this.nextSpawnZ);
      this.nextSpawnZ -= this.spawnGap();
    }

    for (const o of this.obstacles) {
      o.update(gameDelta, elapsed, scrollZ);
      if (o.active && o.group.position.z > 12) o.recycle();
    }
    for (const f of this.fish) {
      f.update(gameDelta, elapsed, scrollZ);
      if ((f.active || f.group.visible) && f.group.position.z > 12) f.recycle();
    }
  }

  private spawnGap(): number {
    const progress = this.distance;
    const base = progress < 200 ? 14 : progress < 500 ? 11 : 9;
    return base + this.rng() * 4;
  }

  private spawnPattern(z: number): void {
    const progress = this.distance;
    const roll = this.rng();
    const lanes = [-1, 0, 1];
    const primary = lanes[Math.floor(this.rng() * 3)];
    const secondaryOptions = lanes.filter((l) => l !== primary);
    const secondary = secondaryOptions[Math.floor(this.rng() * 2)];

    const pickKind = (): ObstacleKind => {
      const r = this.rng();
      if (progress < 120) return r < 0.5 ? 'crate' : 'sandcastle';
      if (r < 0.3) return 'crate';
      if (r < 0.55) return 'sandcastle';
      if (r < 0.75) return 'driftwood';
      return 'seagull';
    };

    // Safety window: ground pickups
    if (roll < 0.12) {
      this.spawnFishLine(primary, z, this.rng() < 0.12 ? 'gold' : 'fish', 'ground');
      return;
    }

    // Single obstacle + riskier pickup placement
    if (roll < 0.55 || progress < 150) {
      const kind = pickKind();
      this.spawnObstacle(kind, primary, z);
      const placeRoll = this.rng();
      if (placeRoll < 0.35) {
        // above obstacle — must jump
        this.spawnFishLine(primary, z + 0.4, this.rng() < 0.15 ? 'gold' : 'fish', 'jump');
      } else if (placeRoll < 0.55) {
        this.spawnFishLine(secondary, z + 1.5, this.rng() < 0.1 ? 'gold' : 'fish', 'ground');
      } else if (placeRoll < 0.7) {
        this.spawnFishLine(secondary, z + 1.2, this.rng() < 0.12 ? 'gold' : 'fish', 'duck');
      } else {
        this.spawnFishLine(secondary, z + 1.5, this.rng() < 0.1 ? 'gold' : 'fish', 'ground');
      }
      return;
    }

    // Two obstacles + mixed risk
    const kindA = pickKind();
    this.spawnObstacle(kindA, primary, z);
    const kindB = progress > 350 ? pickKind() : this.rng() < 0.5 ? 'sandcastle' : 'driftwood';
    this.spawnObstacle(kindB, secondary, z + this.rng() * 1.2);
    const safe = lanes.find((l) => l !== primary && l !== secondary) ?? 0;
    const risk = this.rng();
    if (risk < 0.3) {
      this.spawnFishLine(primary, z + 0.2, 'fish', 'jump');
    } else if (risk < 0.5) {
      this.spawnFishLine(safe, z + 0.8, 'fish', 'duck');
    } else {
      this.spawnFishLine(safe, z + 0.5, 'fish', 'ground');
    }
    // rare phantom-under reward
    if (progress > 200 && this.rng() < 0.12) {
      this.spawnObstacle('seagull', safe, z + 2.2);
      this.spawnFishLine(safe, z + 2.2, 'gold', 'duck');
    }
  }

  private spawnObstacle(kind: ObstacleKind, lane: number, z: number): void {
    const o = this.obstacles.find((item) => !item.active);
    if (!o) return;
    o.spawn(kind, lane, z);
  }

  private spawnFishLine(
    lane: number,
    z: number,
    kind: 'fish' | 'gold',
    placement: 'ground' | 'jump' | 'duck' = 'ground',
  ): void {
    const count = kind === 'gold' ? 1 : 3;
    const spacing = 1.55;
    for (let i = 0; i < count; i += 1) {
      const f = this.fish.find((item) => !item.active && !item.group.visible);
      if (!f) return;
      const t = count === 1 ? 0.5 : i / (count - 1);
      let height = 0.55 + Math.sin(t * Math.PI) * 0.22;
      if (kind === 'gold') height = Math.max(height, 0.85);
      if (placement === 'jump') height = 1.35 + Math.sin(t * Math.PI) * 0.35;
      if (placement === 'duck') height = 0.35;
      f.spawn(kind, lane, z - i * spacing, height);
    }
  }

  private checkCollisions(): void {
    const pCol = playerCollider(this.laneVisual, this.y, this.ducking, this.airborne);

    for (const o of this.obstacles) {
      if (!o.active) continue;
      const def = OBSTACLE_DEFS[o.kind];
      o.fillWorldCenter(this.obstacleCenter);
      const oCol = makeColliderFromCenter(this.obstacleCenter, def.half);
      // Prefer lane-based early out but still allow slight x overlap
      if (overlaps(pCol, oCol)) {
        this.crash(def.failHint);
        return;
      }
    }

    for (const f of this.fish) {
      if (!f.active) continue;
      const fCol = makeColliderFromCenter(f.group.position, FISH_HALF);
      if (overlaps(pCol, fCol)) {
        const at = f.group.position;
        f.collect();
        this.collectFish(f.kind, f.value, at);
      }
    }
  }

  private collectFish(kind: 'fish' | 'gold', _value: number, at: THREE.Vector3): void {
    // Consecutive pickups: +1 combo each (no pickup score)
    this.pickupStreak += 1;
    this.comboTimer = 1.4;
    this.combo = this.pickupStreak;
    if (this.combo > this.runMaxCombo) this.runMaxCombo = this.combo;
    if (kind === 'gold') this.runCakes += 1;
    else this.runCookies += 1;
    this.audio.pickup(this.combo, kind === 'gold');
    this.hud.flashPickup();
    if (this.combo > 1) this.hud.flashCombo(this.combo);
    this.shake.addTrauma(kind === 'gold' ? 0.03 : 0.02);
    const burstKind: BurstKind = kind === 'gold' ? 'cake' : 'cookie';
    if (!this.reducedMotion) this.bursts.spawn(at, burstKind);
    if (kind === 'gold') {
      this.hud.flashJackpot(this.combo);
    } else {
      this.hud.flashScorePop(this.combo);
    }
  }

  private updateCombo(gameDelta: number): void {
    if (this.comboTimer <= 0) return;
    this.comboTimer -= gameDelta;
    if (this.comboTimer <= 0) {
      this.pickupStreak = 0;
      this.combo = 1;
    }
  }

  private crash(reason: string): void {
    if (this.state !== 'playing') return;
    this.state = 'gameover';
    this.hitstop.trigger(90, 0.05);
    this.shake.addTrauma(0.7);
    this.cameraRig.punchFov(8);
    this.audio.crash();
    this.hud.flashCrash();
    squash(this.player.visual, this.tweens, 0.75, 0.35);
    this.flashOverlay();
    if (this.distance > this.best) {
      this.best = Math.floor(this.distance);
      this.saveBest(this.best);
    }
    this.hud.showGameOver(this.distance, this.runMaxCombo, this.best, reason);
    this.hooks.onRunEnd?.({
      distance: Math.floor(this.distance),
      maxCombo: this.runMaxCombo,
      durationMs: Math.floor(this.runTime * 1000),
      cookies: this.runCookies,
      cakes: this.runCakes,
      failReason: reason,
    });
  }

  private flashOverlay(): void {
    const el = document.querySelector<HTMLElement>('#flash-overlay');
    if (!el) return;
    el.animate([{ opacity: 0.75 }, { opacity: 0 }], { duration: 110, easing: 'ease-out' });
  }

  private beginRun(): void {
    this.resetRun();
    this.state = 'playing';
    this.hud.showPlaying();
    this.audio.ui();
    this.hooks.onRunStart?.();
  }

  private returnHome(): void {
    this.resetRun();
    this.state = 'title';
    this.hud.showTitle(this.best);
    this.audio.ui();
    this.hooks.onReturnHome?.();
  }

  private resetRun(): void {
    this.distance = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.pickupStreak = 0;
    this.runMaxCombo = 0;
    this.runCookies = 0;
    this.runCakes = 0;
    this.runTime = 0;
    this.lane = 0;
    this.laneVisual = 0;
    this.laneCooldown = 0;
    this.y = GROUND_Y;
    this.vy = 0;
    this.airborne = false;
    this.ducking = false;
    this.duckAmount = 0;
    this.duckTimer = 0;
    this.lean = 0;
    this.speed = this.tuning.baseSpeed;
    this.nextSpawnZ = -34;
    this.hitstop.reset();
    this.shake.reset();
    this.tweens.clear();
    this.player.group.position.set(0, GROUND_Y, 0);
    this.player.resetScale();
    this.player.stabilizeVisuals();
    for (const o of this.obstacles) o.recycle();
    for (const f of this.fish) f.recycle();
    this.bursts.reset();

    // Deterministic opening: teach fish + first soft obstacle
    this.spawnFishLine(0, -8, 'fish');
    this.spawnFishLine(0, -14, 'fish');
    this.spawnObstacle('crate', -1, -28);
    this.spawnFishLine(1, -27, 'fish');

    this.cameraRig.snapTo(this.player.group.position);
  }

  private loadBest(): number {
    try {
      return Number(localStorage.getItem(BEST_KEY) ?? '0') || 0;
    } catch {
      return 0;
    }
  }

  private saveBest(value: number): void {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch {
      // ignore
    }
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
        this.bursts.setSeed(value + 91);
      },
      addPickups: (n: number) => {
        for (let i = 0; i < n; i += 1) {
          this.collectFish('fish', 1, this.player.group.position);
        }
        return {
          combo: this.combo,
          streak: this.pickupStreak,
          maxCombo: this.runMaxCombo,
        };
      },
      setState: (name: string) => {
        if (name === 'title') {
          this.state = 'title';
          this.resetRun();
          this.hud.showTitle(this.best);
        } else if (name === 'active-play') {
          this.resetRun();
          this.state = 'playing';
          this.hud.showPlaying();
          // Advance a bit so the frame shows real play
          for (let i = 0; i < 45; i += 1) {
            this.update(1 / 60, i / 60);
          }
        } else if (name === 'gameover' || name === 'complete') {
          this.resetRun();
          this.state = 'playing';
          this.crash('木箱 — 跳过去或换道');
        } else {
          throw new Error(`Unknown test state: ${name}`);
        }
        this.render();
        this.publishDiagnostics();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
        if (enabled) {
          this.player.stabilizeVisuals();
          for (const o of this.obstacles) o.stabilizeVisuals();
          for (const f of this.fish) f.stabilizeVisuals();
          this.track.stabilizeVisuals();
        }
        this.render();
        this.publishDiagnostics();
      },
      hideDebugUi: (hidden: boolean) => {
        this.debugTools.setHidden(hidden);
      },
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      state: this.state,
      score: 0,
      distance: this.distance,
      combo: this.combo,
      best: this.best,
      complete: this.state === 'gameover',
      player: {
        position: {
          x: this.player.group.position.x,
          y: this.player.group.position.y,
          z: this.player.group.position.z,
        },
        lane: this.lane,
        airborne: this.airborne,
        ducking: this.ducking,
        speed: this.speed,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr),
      },
    };
  }
}
