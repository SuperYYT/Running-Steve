import * as THREE from 'three';
import { makeSkinBox } from './skinUvs';

/**
 * Minecraft Steve. Feet at origin, faces -Z.
 *
 * Proportions (16 px = 1 block):
 *   legs 4×12×4 · body 8×12×4 · arms 4×12×4 (split upper/lower for elbow) · head 8×8×8
 *
 * Sneak matches the official pose: strong forward pitch, head held up,
 * elbows out with forearms folded in front, body compact over the feet.
 */
export class SteveRunner {
  readonly group = new THREE.Group();
  readonly visual = new THREE.Group();

  private readonly bodyGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private foreL = new THREE.Group();
  private foreR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private skin: THREE.Texture | null = null;
  private runPhase = 0;
  private duckAmount = 0;

  constructor() {
    this.group.add(this.visual);
    this.visual.scale.setScalar(1.1);
    this.bodyGroup.position.set(0, LEG, 0);
    this.visual.add(this.bodyGroup);
  }

  async loadSkin(url = 'textures/steve.png'): Promise<void> {
    const loader = new THREE.TextureLoader();
    const tex = await loader.loadAsync(url);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    this.skin = tex;
    this.buildSteve();
  }

  setLean(lean: number): void {
    this.visual.rotation.z = lean * 0.28;
  }

  setDuck(duck: number): void {
    this.duckAmount = duck;
  }

  setJumpPose(_t: number): void {
    this.armL.rotation.set(-0.5, 0, 0.2);
    this.armR.rotation.set(-0.5, 0, -0.2);
    this.foreL.rotation.x = -0.3;
    this.foreR.rotation.x = -0.3;
    this.legL.rotation.x = 0.55;
    this.legR.rotation.x = -0.35;
    this.bodyGroup.rotation.x = 0.15;
    this.bodyGroup.position.y = LEG;
    this.headGroup.rotation.x = 0;
    this.headGroup.position.y = HEAD_Y;
  }

  resetScale(): void {
    this.visual.scale.setScalar(1.1);
    this.visual.rotation.set(0, 0, 0);
    this.bodyGroup.scale.set(1, 1, 1);
    this.bodyGroup.rotation.set(0, 0, 0);
    this.bodyGroup.position.set(0, LEG, 0);
    this.headGroup.position.set(0, HEAD_Y, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0.1);
    this.armR.rotation.set(0, 0, -0.1);
    this.foreL.rotation.set(0, 0, 0);
    this.foreR.rotation.set(0, 0, 0);
    this.duckAmount = 0;
  }

  update(delta: number, elapsed: number, speed: number, airborne: boolean): void {
    if (!this.skin) return;

    const duck = this.duckAmount;

    if (airborne) {
      this.headGroup.rotation.x = Math.sin(elapsed * 2) * 0.02;
      this.setJumpPose(0.5);
      return;
    }

    const rate = 8 + speed * 0.55;
    this.runPhase += delta * rate;
    const swing = Math.sin(this.runPhase);
    const swing2 = Math.sin(this.runPhase + Math.PI);
    const runAmp = 1 - duck;

    // Chase cam sees Steve's BACK. He runs toward -Z, so sneak leans
    // FORWARD into travel (negative X rot). Arms stay STRAIGHT.
    // Deep drop so head-top stays under the phantom (band starts 1.75).
    const hip = LEG * (1 - duck * 0.55);
    const bob = Math.abs(Math.cos(this.runPhase)) * 0.03 * runAmp;
    this.bodyGroup.position.y = hip + bob;
    this.bodyGroup.rotation.x =
      -duck * 0.5 - 0.08 * runAmp - Math.min(0.05, speed * 0.002);

    this.headGroup.position.y = HEAD_Y - duck * 0.18;
    this.headGroup.rotation.x = duck * 0.38;

    // Legs: run swing; sneak keeps them under the body
    this.legL.rotation.x = swing * 0.8 * runAmp + duck * 0.12;
    this.legR.rotation.x = swing2 * 0.8 * runAmp + duck * 0.12;

    // Straight arms — hang with the torso lean, light run swing only
    this.armL.rotation.x = swing2 * 0.55 * runAmp;
    this.armR.rotation.x = swing * 0.55 * runAmp;
    this.armL.rotation.z = 0.1;
    this.armR.rotation.z = -0.1;
    this.foreL.rotation.x = 0;
    this.foreR.rotation.x = 0;
  }

  stabilizeVisuals(): void {
    this.resetScale();
    // Mid-sneak freeze: back to camera, leaning into -Z, arms straight
    this.duckAmount = 1;
    this.bodyGroup.position.y = LEG * 0.45;
    this.bodyGroup.rotation.x = -0.5;
    this.headGroup.position.y = HEAD_Y - 0.18;
    this.headGroup.rotation.x = 0.38;
    this.legL.rotation.x = 0.12;
    this.legR.rotation.x = 0.12;
    this.armL.rotation.set(0, 0, 0.1);
    this.armR.rotation.set(0, 0, -0.1);
    this.foreL.rotation.x = 0;
    this.foreR.rotation.x = 0;
  }

  dispose(): void {
    this.skin?.dispose();
    this.visual.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }

  private buildSteve(): void {
    if (!this.skin) return;
    this.bodyGroup.clear();
    this.headGroup.clear();
    const tex = this.skin;

    // Head 8×8×8 @ (0,0)
    const head = makeSkinBox(tex, 8, 8, 8, 0, 0);
    this.headGroup.add(head);
    this.headGroup.position.set(0, HEAD_Y, 0);
    this.bodyGroup.add(this.headGroup);

    // Torso 8×12×4 @ (16,16)
    const body = makeSkinBox(tex, 8, 12, 4, 16, 16);
    body.position.set(0, BODY_MID, 0);
    this.bodyGroup.add(body);

    // Two-piece arms so the elbow can fold (upper 4×6×4 + lower 4×6×4)
    // Facing -Z ⇒ char right = +X. Right arm @ (40,16), left arm @ (32,48)
    this.armR = this.buildArm(tex, 40, 16, ARM_X);
    this.armL = this.buildArm(tex, 32, 48, -ARM_X);
    this.bodyGroup.add(this.armR, this.armL);
    this.foreR = this.armR.userData.fore as THREE.Group;
    this.foreL = this.armL.userData.fore as THREE.Group;

    // Legs 4×12×4
    const legRMesh = makeSkinBox(tex, 4, 12, 4, 0, 16);
    legRMesh.position.set(0, -LEG_MID, 0);
    this.legR = new THREE.Group();
    this.legR.position.set(LEG_X, 0, 0);
    this.legR.add(legRMesh);
    this.bodyGroup.add(this.legR);

    const legLMesh = makeSkinBox(tex, 4, 12, 4, 16, 48);
    legLMesh.position.set(0, -LEG_MID, 0);
    this.legL = new THREE.Group();
    this.legL.position.set(-LEG_X, 0, 0);
    this.legL.add(legLMesh);
    this.bodyGroup.add(this.legL);

    this.stabilizeVisuals();
  }

  private buildArm(
    tex: THREE.Texture,
    u: number,
    v: number,
    x: number,
  ): THREE.Group {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, SHOULDER_Y, 0);

    // Upper arm: top 6 px of the 12-px limb
    const upper = makeSkinBox(tex, 4, 6, 4, u, v);
    upper.position.set(0, -UPPER_MID, 0);
    shoulder.add(upper);

    // Forearm hangs from the elbow (end of upper)
    const fore = new THREE.Group();
    fore.position.set(0, -UPPER_LEN, 0);
    const lower = makeSkinBox(tex, 4, 6, 4, u, v + 6);
    lower.position.set(0, -LOWER_MID, 0);
    fore.add(lower);
    shoulder.add(fore);

    shoulder.userData.fore = fore;
    return shoulder;
  }
}

// 16 px = 1 block
const LEG = 12 / 16;
const LEG_MID = 6 / 16;
const BODY_MID = 6 / 16;
const UPPER_LEN = 6 / 16;
const UPPER_MID = 3 / 16;
const LOWER_MID = 3 / 16;
const SHOULDER_Y = 12 / 16;
const HEAD_Y = 16 / 16;
const ARM_X = 6 / 16;
const LEG_X = 2 / 16;
