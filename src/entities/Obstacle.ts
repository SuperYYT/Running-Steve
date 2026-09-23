import * as THREE from 'three';

export type ObstacleKind = 'crate' | 'sandcastle' | 'driftwood' | 'seagull';

export type ObstacleDef = {
  kind: ObstacleKind;
  half: THREE.Vector3;
  centerY: number;
  needsDuck: boolean;
  jumpable: boolean;
  failHint: string;
};

/** Minecraft-themed obstacle roles (keys keep Game spawn logic stable). */
export const OBSTACLE_DEFS: Record<ObstacleKind, ObstacleDef> = {
  crate: {
    kind: 'crate',
    half: new THREE.Vector3(0.45, 0.4, 0.4),
    centerY: 0.4,
    needsDuck: false,
    jumpable: true,
    failHint: '橡木箱子 — 跳过去或换道',
  },
  sandcastle: {
    kind: 'sandcastle',
    half: new THREE.Vector3(0.4, 0.35, 0.35),
    centerY: 0.35,
    needsDuck: false,
    jumpable: true,
    failHint: '沙块堆 — 跳过去',
  },
  driftwood: {
    kind: 'driftwood',
    half: new THREE.Vector3(0.55, 0.25, 0.3),
    centerY: 0.25,
    needsDuck: false,
    jumpable: true,
    failHint: '橡木原木 — 跳过去或换道',
  },
  seagull: {
    kind: 'seagull',
    half: new THREE.Vector3(0.6, 0.28, 0.4),
    centerY: 2.05,
    needsDuck: true,
    jumpable: false,
    failHint: '低飞幻翼 — 蹲下或换道',
  },
};

export class Obstacle {
  readonly group = new THREE.Group();
  kind: ObstacleKind = 'crate';
  lane = 0;
  active = false;
  private readonly built = new Map<ObstacleKind, THREE.Group>();
  private wings: THREE.Object3D[] = [];
  private builtKind: ObstacleKind | null = null;
  private flap = 0;
  private static readonly matCache = new Map<string, THREE.MeshStandardMaterial>();

  constructor() {
    this.group.visible = false;
  }

  spawn(kind: ObstacleKind, lane: number, z: number): void {
    this.kind = kind;
    this.lane = lane;
    this.active = true;
    this.group.visible = true;
    this.group.position.set(laneX(lane), 0, z);
    this.group.rotation.set(0, 0, 0);
    this.flap = 0;
    this.showKind(kind);
  }

  get def(): ObstacleDef {
    return OBSTACLE_DEFS[this.kind];
  }

  /** Fills `out` — avoids per-frame Vector3 allocation in collision checks. */
  fillWorldCenter(out: THREE.Vector3): THREE.Vector3 {
    const def = this.def;
    out.set(
      this.group.position.x,
      def.centerY + (this.kind === 'seagull' ? Math.sin(this.flap) * 0.06 : 0),
      this.group.position.z,
    );
    return out;
  }

  update(_delta: number, elapsed: number, scrollZ: number): void {
    if (!this.active) return;
    this.group.position.z += scrollZ;
    if (this.kind === 'seagull') {
      this.flap = elapsed * 8;
      const swing = 0.15 + Math.sin(this.flap) * 0.35;
      for (const wing of this.wings) {
        wing.rotation.z = (wing.userData.side as number) * swing;
      }
      this.group.position.y = Math.sin(elapsed * 2.2) * 0.05;
    }
  }

  recycle(): void {
    this.active = false;
    this.group.visible = false;
    this.group.position.z = -200;
  }

  stabilizeVisuals(): void {
    if (this.kind === 'seagull') {
      for (const wing of this.wings) {
        wing.rotation.z = (wing.userData.side as number) * 0.4;
      }
    }
  }

  dispose(): void {
    for (const visual of this.built.values()) {
      visual.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
        }
      });
    }
    this.built.clear();
    this.builtKind = null;
    this.wings = [];
    // Shared materials live for the process; clear only if last owner.
  }

  private showKind(kind: ObstacleKind): void {
    if (this.builtKind === kind) return;
    if (this.builtKind) {
      const prev = this.built.get(this.builtKind);
      if (prev) prev.visible = false;
    }
    let visual = this.built.get(kind);
    if (!visual) {
      visual = this.buildMesh(kind);
      this.built.set(kind, visual);
      this.group.add(visual);
    }
    visual.visible = true;
    this.builtKind = kind;
    this.wings = kind === 'seagull' ? visual.children.filter((c) => c.userData.flapper) : [];
  }

  private buildMesh(kind: ObstacleKind): THREE.Group {
    const root = new THREE.Group();
    const box = (w: number, h: number, d: number, color: string): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Obstacle.matFor(color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    if (kind === 'crate') {
      const body = box(0.9, 0.8, 0.8, '#b8945f');
      body.position.y = 0.4;
      const edgeA = box(0.94, 0.08, 0.84, '#8b6914');
      edgeA.position.y = 0.08;
      const edgeB = box(0.94, 0.08, 0.84, '#8b6914');
      edgeB.position.y = 0.74;
      const band = box(0.92, 0.1, 0.15, '#c0c0c0');
      band.position.set(0, 0.4, 0);
      root.add(body, edgeA, edgeB, band);
      return root;
    }
    if (kind === 'sandcastle') {
      const base = box(0.8, 0.35, 0.7, '#e0c078');
      base.position.y = 0.18;
      const mid = box(0.5, 0.35, 0.5, '#dbb86a');
      mid.position.y = 0.5;
      const top = box(0.28, 0.28, 0.28, '#e8c878');
      top.position.y = 0.8;
      root.add(base, mid, top);
      return root;
    }
    if (kind === 'driftwood') {
      const log = box(1.1, 0.4, 0.4, '#6b4f2a');
      log.position.y = 0.2;
      const ring = box(0.08, 0.36, 0.36, '#c4a35a');
      ring.position.set(-0.5, 0.2, 0);
      const knot = box(0.2, 0.15, 0.15, '#5a4030');
      knot.position.set(0.15, 0.4, 0.05);
      root.add(log, ring, knot);
      return root;
    }
    // ── Phantom — flies high enough that sneak visuals never clip.
    const y = 2.05;
    const bone = '#c4b090';
    const membrane = '#3d4f9a';
    const membraneDark = '#2e3d7a';
    const flesh = '#8a6a4a';

    const torso = box(0.28, 0.18, 0.55, flesh);
    torso.position.set(0, y, 0.05);
    const head = box(0.24, 0.16, 0.28, bone);
    head.position.set(0, y + 0.02, -0.32);
    const snout = box(0.16, 0.1, 0.16, flesh);
    snout.position.set(0, y - 0.02, -0.48);
    root.add(torso, head, snout);
    for (const side of [-1, 1]) {
      const eye = box(0.06, 0.06, 0.04, '#39e07a');
      eye.position.set(side * 0.08, y + 0.05, -0.46);
      root.add(eye);
    }
    const tail = box(0.1, 0.08, 0.4, bone);
    tail.position.set(0, y - 0.02, 0.38);
    root.add(tail);

    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.12, y + 0.04, 0.05);
      wing.userData.flapper = true;
      wing.userData.side = side;

      const inner = box(0.7, 0.05, 0.45, membrane);
      inner.position.set(side * 0.4, 0, 0);
      wing.add(inner);

      const outer = box(0.7, 0.05, 0.35, membraneDark);
      outer.position.set(side * 0.95, 0, 0.1);
      outer.rotation.y = side * 0.35;
      wing.add(outer);

      const tip = box(0.4, 0.04, 0.22, membrane);
      tip.position.set(side * 1.35, 0, 0.25);
      tip.rotation.y = side * 0.55;
      wing.add(tip);

      const sparA = box(0.75, 0.06, 0.05, bone);
      sparA.position.set(side * 0.45, 0.03, -0.05);
      wing.add(sparA);
      const sparB = box(0.65, 0.05, 0.05, bone);
      sparB.position.set(side * 1.0, 0.03, 0.12);
      sparB.rotation.y = side * 0.4;
      wing.add(sparB);

      root.add(wing);
    }
    return root;
  }

  private static matFor(color: string): THREE.MeshStandardMaterial {
    let mat = Obstacle.matCache.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
      Obstacle.matCache.set(color, mat);
    }
    return mat;
  }
}

export function laneX(lane: number): number {
  return lane * 2.2;
}
