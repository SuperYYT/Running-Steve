import * as THREE from 'three';

const LANE_X = [-2.2, 0, 2.2] as const;
const DASH_SPACING = 5.5;
const DASH_COUNT_PER_LANE = 40;
const DASH_WRAP = DASH_SPACING * DASH_COUNT_PER_LANE;

export type TrackPiece = {
  group: THREE.Group;
  z: number;
  span: number;
};

/**
 * Minecraft overworld coastal path: grass banks, dirt/stone path, oak trees,
 * village hut, beacon tower. World scrolls toward +Z past a fixed player.
 */
export class Track {
  readonly group = new THREE.Group();
  private readonly segments: TrackPiece[] = [];
  private readonly decorPool: THREE.Group[] = [];
  private readonly dashPool: THREE.Mesh[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private scroll = 0;
  private segmentLength = 40;

  constructor() {
    this.buildEnvironment();
    for (let i = 0; i < 6; i += 1) {
      this.spawnSegment(-i * this.segmentLength);
    }
    this.buildDecor();
    // 双点光池：夜间照亮最近路灯附近
    for (let i = 0; i < 2; i += 1) {
      const light = new THREE.PointLight('#ffd28a', 18, 14, 2);
      light.visible = false;
      this.lampLights.push(light);
      this.group.add(light);
    }
  }

  update(delta: number, speed: number): number {
    const dz = speed * delta;
    this.scroll += dz;
    this.syncClock += delta;
    for (const seg of this.segments) {
      seg.z += dz;
      seg.group.position.z = seg.z;
      if (seg.z > this.segmentLength) {
        seg.z -= this.segments.length * this.segmentLength;
        this.recycleSegment(seg);
      }
    }
    for (const decor of this.decorPool) {
      decor.position.z += dz;
      if (decor.position.z > 18) {
        decor.position.z -= 48 + (decor.userData.span as number);
      }
    }
    for (const dash of this.dashPool) {
      dash.position.z += dz;
      if (dash.position.z > 12) {
        dash.position.z -= DASH_WRAP;
      }
    }
    if (this.night) this.syncLampLights();
    return dz;
  }

  get distance(): number {
    return this.scroll;
  }

  stabilizeVisuals(): void {
    // dashes stay put for reduced-motion screenshots
  }

  setNight(night: boolean): void {
    this.night = night;
    for (const decor of this.decorPool) {
      const dayFlame = decor.userData.dayFlame as THREE.Object3D | undefined;
      const nightLamp = decor.userData.nightLamp as THREE.Object3D | undefined;
      const nightArm = decor.userData.nightArm as THREE.Object3D | undefined;
      const glow = decor.userData.nightGlow as THREE.Object3D | undefined;
      if (dayFlame) dayFlame.visible = !night;
      if (nightLamp) nightLamp.visible = night;
      if (nightArm) nightArm.visible = night;
      if (glow) glow.visible = night;
    }
    for (const light of this.lampLights) light.visible = night;
    this.syncLampLights();
  }

  /** 池化点光吸附最近路灯；节流，避免每帧分配 */
  syncLampLights(force = false): void {
    if (!this.night || this.lampLights.length === 0) return;
    const now = this.syncClock;
    if (!force && now - this.lastLightSync < 0.2) return;
    this.lastLightSync = now;
    let best0: THREE.Object3D | null = null;
    let best1: THREE.Object3D | null = null;
    let d0 = Infinity;
    let d1 = Infinity;
    for (const decor of this.decorPool) {
      if (!decor.userData.nightLamp) continue;
      const d = Math.abs(decor.position.z);
      if (d < d0) {
        d1 = d0;
        best1 = best0;
        d0 = d;
        best0 = decor;
      } else if (d < d1) {
        d1 = d;
        best1 = decor;
      }
    }
    const pair: Array<THREE.Object3D | null> = [best0, best1];
    for (let i = 0; i < this.lampLights.length; i += 1) {
      const light = this.lampLights[i];
      const src = pair[i];
      if (!src) {
        light.visible = false;
        continue;
      }
      light.visible = true;
      light.position.set(src.position.x, 1.7, src.position.z);
    }
  }

  private readonly lampLights: THREE.PointLight[] = [];
  private night = false;
  private syncClock = 0;
  private lastLightSync = -1;
  private readonly matKeyCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly glowGeo = new THREE.CircleGeometry(1.6, 20);
  private readonly lampBoxGeo = new THREE.BoxGeometry(0.5, 0.4, 0.5);
  private readonly lampArmGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08);
  private readonly glowMat = new THREE.MeshBasicMaterial({
    color: '#ffcc66',
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  dispose(): void {
    for (const geo of this.geometries) geo.dispose();
    for (const mat of this.materials) mat.dispose();
  }

  private buildEnvironment(): void {
    // Water (MC water)
    const ocean = this.mesh(
      new THREE.PlaneGeometry(200, 200),
      this.mat('#3f76e4', 0.2, 0.1, '#1a4080', 0.25),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.15, -40);
    this.group.add(ocean);

    // Grass banks (slight Y gap vs dirt strip avoids z-fight)
    for (const side of [-1, 1]) {
      const grass = this.mesh(new THREE.BoxGeometry(6, 0.35, 220), this.mat('#5d9c3e', 0.9, 0));
      grass.position.set(side * 7.2, 0.08, -40);
      grass.receiveShadow = true;
      this.group.add(grass);
      const dirt = this.mesh(new THREE.BoxGeometry(6.02, 0.18, 220), this.mat('#8b5a2b', 0.9, 0));
      dirt.position.set(side * 7.2, -0.18, -40);
      dirt.receiveShadow = false;
      this.group.add(dirt);
    }

    // Path blocks (dirt path / gravel road)
    const road = this.mesh(new THREE.BoxGeometry(7.2, 0.12, 220), this.mat('#a08050', 0.9, 0));
    road.position.set(0, 0.05, -40);
    road.receiveShadow = true;
    this.group.add(road);

    // Stone brick lane markers — scroll with the world like road paint
    const dashMat = this.mat('#7a7a7a', 0.8, 0.05);
    const dashGeo = new THREE.BoxGeometry(0.12, 0.03, 1.2);
    this.geometries.push(dashGeo);
    for (let i = 0; i < DASH_COUNT_PER_LANE; i += 1) {
      for (const x of [-1.1, 1.1]) {
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.receiveShadow = true;
        dash.position.set(x, 0.13, -i * DASH_SPACING + 8);
        this.dashPool.push(dash);
        this.group.add(dash);
      }
    }
  }

  private buildDecor(): void {
    for (let i = 0; i < 14; i += 1) {
      const decor = this.makeLandmark(i % 3);
      const span = 36;
      decor.userData.span = span;
      decor.position.set(i % 2 === 0 ? -9.8 : 9.8, 0, -i * 3.5);
      this.decorPool.push(decor);
      this.group.add(decor);
    }
  }

  private makeLandmark(kind: number): THREE.Group {
    const g = new THREE.Group();
    if (kind === 0) {
      // Oak tree
      const trunk = this.mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), this.mat('#6b4f2a', 0.9, 0));
      trunk.position.y = 1.2;
      g.add(trunk);
      const leaf = this.mat('#3d7a28', 0.9, 0);
      const canopy = [
        [0, 2.6, 0, 1.8],
        [0.6, 2.3, 0.4, 1.1],
        [-0.6, 2.4, -0.3, 1.1],
        [0.2, 3.2, -0.2, 1.0],
      ] as const;
      for (const [x, y, z, s] of canopy) {
        const cube = this.mesh(new THREE.BoxGeometry(s, s * 0.7, s), leaf);
        cube.position.set(x, y, z);
        g.add(cube);
      }
    } else if (kind === 1) {
      // Day: campfire torch · Night: street lamp
      const log = this.mesh(new THREE.BoxGeometry(0.7, 0.25, 0.7), this.mat('#6b4f2a', 0.9, 0));
      log.position.y = 0.12;
      g.add(log);
      const stick = this.mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), this.mat('#6b4f2a', 0.9, 0));
      stick.position.y = 0.7;
      g.add(stick);
      const dayFlame = this.mesh(
        new THREE.BoxGeometry(0.35, 0.35, 0.35),
        this.mat('#ff9a00', 0.5, 0, '#ff6a00', 0.8),
      );
      dayFlame.position.y = 0.4;
      g.add(dayFlame);
      const lamp = this.mesh(
        this.lampBoxGeo,
        this.mat('#ffe9a0', 0.4, 0.05, '#ffcc55', 2.2),
      );
      lamp.position.set(0, 1.55, 0);
      lamp.visible = false;
      g.add(lamp);
      const lampArm = this.mesh(this.lampArmGeo, this.mat('#5a5a5a', 0.7, 0.1));
      lampArm.position.set(0, 1.25, 0);
      lampArm.visible = false;
      g.add(lampArm);
      // 路面光斑（假光，夜间可读）
      const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(0, 0.04, 0.3);
      glow.visible = false;
      glow.renderOrder = 2;
      g.add(glow);
      g.userData.dayFlame = dayFlame;
      g.userData.nightLamp = lamp;
      g.userData.nightArm = lampArm;
      g.userData.nightGlow = glow;
    } else {
      // Beacon tower (stone bricks + glowing core)
      const tower = this.mesh(new THREE.BoxGeometry(1.2, 4.2, 1.2), this.mat('#7a7a7a', 0.8, 0.05));
      tower.position.y = 2.1;
      g.add(tower);
      const cap = this.mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), this.mat('#9a9a9a', 0.7, 0.1));
      cap.position.y = 4.35;
      g.add(cap);
      const core = this.mesh(
        new THREE.BoxGeometry(0.55, 0.55, 0.55),
        this.mat('#4aedd9', 0.3, 0.2, '#2ec4b6', 0.9),
      );
      core.position.y = 3.7;
      g.add(core);
    }
    return g;
  }

  private spawnSegment(z: number): void {
    const segGroup = new THREE.Group();
    segGroup.position.z = z;
    this.group.add(segGroup);
    this.segments.push({ group: segGroup, z, span: this.segmentLength });
  }

  private recycleSegment(seg: TrackPiece): void {
    seg.group.position.z = seg.z;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private mat(
    color: string,
    roughness: number,
    metalness: number,
    emissive?: string,
    emissiveIntensity = 0,
  ): THREE.MeshStandardMaterial {
    const key = `${color}|${roughness}|${metalness}|${emissive ?? ''}|${emissiveIntensity}`;
    const hit = this.matKeyCache.get(key);
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive: emissive ?? '#000000',
      emissiveIntensity,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.matKeyCache.set(key, m);
    this.materials.push(m);
    return m;
  }
}

export { LANE_X };
