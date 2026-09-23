import * as THREE from 'three';
import { laneX } from './Obstacle';

export type FishKind = 'fish' | 'gold';

/**
 * Minecraft item pickups: cookie (common) / cake (jackpot).
 * Rendered as billboard sprites from item textures.
 */
export class FishPickup {
  readonly group = new THREE.Group();
  kind: FishKind = 'fish';
  lane = 0;
  active = false;
  value = 1;
  private readonly sprite: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private restY = 0.7;
  private phase = 0;
  private static sharedGeo: THREE.PlaneGeometry | null = null;
  private static textures: { fish?: THREE.Texture; gold?: THREE.Texture } = {};
  private static texturePromise: Promise<void> | null = null;

  constructor() {
    if (!FishPickup.sharedGeo) {
      FishPickup.sharedGeo = new THREE.PlaneGeometry(0.45, 0.45);
    }
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.sprite = new THREE.Mesh(FishPickup.sharedGeo, this.mat);
    this.group.add(this.sprite);
    this.group.visible = false;
  }

  static async loadTextures(base = 'textures/'): Promise<void> {
    if (FishPickup.texturePromise) return FishPickup.texturePromise;
    const loader = new THREE.TextureLoader();
    FishPickup.texturePromise = (async () => {
      const [fish, gold] = await Promise.all([
        loader.loadAsync(base + 'cookie.png'),
        loader.loadAsync(base + 'cake.png'),
      ]);
      for (const tex of [fish, gold]) {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
      }
      FishPickup.textures = { fish, gold };
    })();
    return FishPickup.texturePromise;
  }

  spawn(kind: FishKind, lane: number, z: number, height = 0.7): void {
    this.kind = kind;
    this.lane = lane;
    this.active = true;
    this.value = kind === 'gold' ? 5 : 1;
    this.phase = lane * 1.7 + z * 0.1;
    this.restY = height;
    this.group.visible = true;
    this.group.position.set(laneX(lane), height, z);
    this.group.scale.set(1, 1, 1);
    this.mat.map = FishPickup.textures[kind === 'gold' ? 'gold' : 'fish'] ?? null;
    this.mat.opacity = 1;
    this.mat.needsUpdate = true;
  }

  update(_delta: number, elapsed: number, scrollZ: number): void {
    if (!this.active) return;
    this.group.position.z += scrollZ;
    this.group.rotation.y = Math.sin(elapsed * 2 + this.phase) * 0.35;
    this.group.position.y = this.restY + Math.sin(elapsed * 3 + this.phase) * 0.1;
  }

  collect(): void {
    this.active = false;
    this.group.visible = false;
  }

  recycle(): void {
    this.active = false;
    this.group.visible = false;
    this.group.position.z = -200;
  }

  stabilizeVisuals(): void {
    this.group.rotation.set(0, 0, 0);
    this.group.position.y = this.restY;
  }

  dispose(): void {
    this.mat.dispose();
  }
}
