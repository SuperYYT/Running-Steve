import * as THREE from 'three';
import { makeSkinBox } from './skinUvs';

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
  private static phantomTex: THREE.Texture | null = null;
  private static phantomLoad: Promise<void> | null = null;

  /** 加载幻翼皮肤（用户提供的 phantom.tga → public/textures/phantom.png） */
  static loadPhantomSkin(url = 'textures/phantom.png'): Promise<void> {
    if (Obstacle.phantomTex) return Promise.resolve();
    if (Obstacle.phantomLoad) return Obstacle.phantomLoad;
    const loader = new THREE.TextureLoader();
    Obstacle.phantomLoad = loader
      .loadAsync(url)
      .then((tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        Obstacle.phantomTex = tex;
      })
      .catch(() => {
        Obstacle.phantomLoad = null;
      });
    return Obstacle.phantomLoad;
  }

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
    // 幻翼：皮肤就绪后重建，保证贴图生效
    if (kind === 'seagull' && Obstacle.phantomTex && !this.built.has('seagull')) {
      // first build below
    } else if (kind === 'seagull' && !Obstacle.phantomTex) {
      void Obstacle.loadPhantomSkin().then(() => {
        if (this.builtKind !== 'seagull') return;
        const old = this.built.get('seagull');
        if (old) {
          this.group.remove(old);
          this.built.delete('seagull');
          this.builtKind = null;
        }
        this.showKind('seagull');
      });
    }
    let visual = this.built.get(kind);
    if (!visual) {
      visual = this.buildMesh(kind);
      this.built.set(kind, visual);
      this.group.add(visual);
    }
    visual.visible = true;
    this.builtKind = kind;
    this.wings = [];
    if (kind === 'seagull') {
      visual.traverse((obj) => {
        if (obj.userData.flapper) this.wings.push(obj);
      });
    }
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
    // ── Phantom: Bedrock phantom.geo.json + phantom.tga (64×64)
    return this.buildPhantom();
  }

  /** Rebuild from official-ish Bedrock geometry (phantom.geo.json). */
  private buildPhantom(): THREE.Group {
    const root = new THREE.Group();
    const tex = Obstacle.phantomTex;
    if (!tex) {
      // brief gray stand-in until skin loads (showKind rebuilds after)
      const stub = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.25, 0.8),
        Obstacle.matFor('#3d4f9a'),
      );
      stub.position.y = 2.05;
      root.add(stub);
      return root;
    }

    // geo px → world (16px = 1). Body cube origin[-3,23,-8] size[5,3,9] → center
    const bodyCx = -3 + 5 / 2;
    const bodyCy = 23 + 3 / 2;
    const bodyCz = -8 + 9 / 2;
    const FLIGHT_Y = 2.05;
    const px = (n: number) => n / 16;
    const place = (origin: number[], size: number[]) => {
      const cx = origin[0] + size[0] / 2;
      const cy = origin[1] + size[1] / 2;
      const cz = origin[2] + size[2] / 2;
      // face +Z toward player (geo faces -Z)
      return new THREE.Vector3(-px(cx - bodyCx), px(cy - bodyCy) + FLIGHT_Y, -px(cz - bodyCz));
    };

    const addCube = (
      parent: THREE.Object3D,
      origin: number[],
      size: number[],
      uv: number[],
    ) => {
      const mesh = makeSkinBox(tex, size[0], size[1], size[2], uv[0], uv[1]);
      mesh.position.copy(place(origin, size));
      parent.add(mesh);
    };

    const bonePivot = (p: number[]) =>
      new THREE.Vector3(-px(p[0] - bodyCx), px(p[1] - bodyCy) + FLIGHT_Y, -px(p[2] - bodyCz));

    // body
    addCube(root, [-3, 23, -8], [5, 3, 9], [0, 8]);

    // head (bone rot X 11.5° at pivot 0,23,-7)
    const headBone = new THREE.Group();
    headBone.position.copy(bonePivot([0, 23, -7]));
    headBone.rotation.x = (-11.5 * Math.PI) / 180;
    root.add(headBone);
    {
      const mesh = makeSkinBox(tex, 7, 3, 5, 0, 0);
      const local = place([-4, 22, -12], [7, 3, 5]).sub(bonePivot([0, 23, -7]));
      mesh.position.copy(local);
      headBone.add(mesh);
      // Minecraft-style green eyes on the face (front = toward player after map)
      const eyeMat = new THREE.MeshBasicMaterial({ color: '#39e07a' });
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), eyeMat);
        eye.position.set(
          local.x + sx * 0.18,
          local.y + 0.02,
          local.z + 0.22,
        );
        headBone.add(eye);
      }
    }

    // tail + tip
    addCube(root, [-2, 24, 1], [3, 2, 6], [3, 20]);
    addCube(root, [-1, 24.5, 7], [1, 1, 6], [4, 29]);

    // wings (flap on Z roll) + tips as children
    for (const side of [1, -1]) {
      const pivot = side === 1 ? [2, 26, -8] : [-3, 26, -8];
      const wing = new THREE.Group();
      wing.position.copy(bonePivot(pivot));
      wing.userData.flapper = true;
      wing.userData.side = side;
      root.add(wing);

      const innerOrigin = side === 1 ? [2, 24, -8] : [-9, 24, -8];
      const inner = makeSkinBox(tex, 6, 2, 9, 23, 12);
      inner.position.copy(place(innerOrigin, [6, 2, 9]).sub(bonePivot(pivot)));
      wing.add(inner);

      const tipPivot = side === 1 ? [8, 26, -8] : [-9, 24, -8];
      const tip = new THREE.Group();
      tip.position.copy(bonePivot(tipPivot).sub(bonePivot(pivot)));
      tip.userData.flapper = true;
      tip.userData.side = side * 0.35;
      wing.add(tip);
      const tipOrigin = side === 1 ? [8, 25, -8] : [-22, 25, -8];
      const tipMesh = makeSkinBox(tex, 13, 1, 9, 16, 24);
      tipMesh.position.copy(place(tipOrigin, [13, 1, 9]).sub(bonePivot(tipPivot)));
      tip.add(tipMesh);
    }

    // place() already maps head toward +Z (player / chase cam). Do not flip Y.
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
