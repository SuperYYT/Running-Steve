import * as THREE from 'three';
import { createSeededRandom } from '../utils/random';

export type BurstKind = 'cookie' | 'cake';

type Shard = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Euler;
  life: number;
  maxLife: number;
  active: boolean;
  baseScale: THREE.Vector3;
};

type Ring = {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
};

const COOKIE_COLORS = ['#c68c3c', '#8b5a2b', '#f5d78e', '#5c3a1e', '#e0a84c'] as const;
const CAKE_COLORS = ['#fff5e6', '#f7c6d9', '#e8a0bf', '#d4a574', '#ffe08a'] as const;

const SHARD_COUNT = 36;
const RING_COUNT = 4;

/**
 * Pooled pickup burst: cookie/cake crumbs explode outward, plus a soft ring.
 * Minecraft blocky shards — no glow, short-lived, scrolls with the world.
 */
export class PickupBurst {
  readonly group = new THREE.Group();
  private readonly shards: Shard[] = [];
  private readonly rings: Ring[] = [];
  private readonly shardGeo: THREE.BoxGeometry;
  private readonly ringGeo: THREE.RingGeometry;
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private rng: () => number = createSeededRandom(7);

  constructor() {
    this.shardGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this.ringGeo = new THREE.RingGeometry(0.35, 0.48, 16);
    this.geometries.push(this.shardGeo, this.ringGeo);

    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(this.shardGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.shards.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Euler(),
        life: 0,
        maxLife: 1,
        active: false,
        baseScale: new THREE.Vector3(1, 1, 1),
      });
    }

    for (let i = 0; i < RING_COUNT; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.visible = false;
      mesh.rotation.x = -Math.PI / 2;
      this.group.add(mesh);
      this.rings.push({
        mesh,
        life: 0,
        maxLife: 1,
        active: false,
      });
    }
  }

  setSeed(seed: number): void {
    this.rng = createSeededRandom(seed);
  }

  spawn(position: THREE.Vector3, kind: BurstKind): void {
    const palette = kind === 'cake' ? CAKE_COLORS : COOKIE_COLORS;
    const shardTotal = kind === 'cake' ? 14 : 10;
    const speed = kind === 'cake' ? 3.6 : 2.8;
    let spawned = 0;

    for (const s of this.shards) {
      if (spawned >= shardTotal) break;
      if (s.active) continue;
      const angle = this.rng() * Math.PI * 2;
      const elev = (this.rng() - 0.35) * 1.1;
      const force = speed * (0.55 + this.rng() * 0.7);
      s.active = true;
      s.life = 0;
      s.maxLife = 0.28 + this.rng() * 0.18;
      s.vel.set(Math.cos(angle) * force, elev * force + 1.6, Math.sin(angle) * force * 0.7);
      s.spin.set(this.rng() * 8, this.rng() * 8, this.rng() * 8);
      s.mesh.visible = true;
      s.mesh.position.copy(position);
      const scale = (kind === 'cake' ? 1.15 : 0.9) * (0.7 + this.rng() * 0.7);
      s.baseScale.set(scale, scale * (0.6 + this.rng() * 0.8), scale);
      s.mesh.scale.copy(s.baseScale);
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(palette[Math.floor(this.rng() * palette.length)]);
      mat.opacity = 1;
      spawned += 1;
    }

    const ring = this.rings.find((r) => !r.active);
    if (ring) {
      ring.active = true;
      ring.life = 0;
      ring.maxLife = kind === 'cake' ? 0.32 : 0.26;
      ring.mesh.visible = true;
      ring.mesh.position.copy(position);
      ring.mesh.position.y = Math.max(0.15, position.y * 0.35);
      ring.mesh.scale.setScalar(kind === 'cake' ? 1.15 : 0.9);
      const mat = ring.mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(kind === 'cake' ? '#f7c6d9' : '#f5ba49');
      mat.opacity = 0.9;
    }
  }

  update(delta: number, scrollZ: number): void {
    for (const s of this.shards) {
      if (!s.active) continue;
      s.life += delta;
      const t = s.life / s.maxLife;
      if (t >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= 12 * delta;
      s.mesh.position.addScaledVector(s.vel, delta);
      s.mesh.position.z += scrollZ;
      s.mesh.rotation.x += s.spin.x * delta;
      s.mesh.rotation.y += s.spin.y * delta;
      s.mesh.rotation.z += s.spin.z * delta;
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 1 - t * t;
      const k = Math.max(0.2, 1 - t * 0.5);
      s.mesh.scale.set(s.baseScale.x * k, s.baseScale.y * k, s.baseScale.z * k);
    }

    for (const r of this.rings) {
      if (!r.active) continue;
      r.life += delta;
      const t = r.life / r.maxLife;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.position.z += scrollZ;
      r.mesh.scale.setScalar(0.4 + t * 1.8);
      const mat = r.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.9 * (1 - t);
    }
  }

  reset(): void {
    for (const s of this.shards) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const r of this.rings) {
      r.active = false;
      r.mesh.visible = false;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
