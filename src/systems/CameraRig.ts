import * as THREE from 'three';

export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly baseOffset = new THREE.Vector3(0, 4.0, 6.8);
  private baseFov = 48;
  private fovPunch = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  snapTo(target: THREE.Vector3): void {
    this.desiredPosition.copy(target).add(this.baseOffset);
    this.desiredPosition.x = target.x * 0.28;
    this.camera.position.copy(this.desiredPosition);
    this.lookTarget.set(target.x * 0.22, 1.1, -5.5);
    this.camera.lookAt(this.lookTarget);
    this.applyFov();
  }

  update(delta: number, target: THREE.Vector3, lag: number, lean: number): void {
    // Follow less of the lane x so quick lane snaps don't whip the camera
    this.desiredPosition.set(
      target.x * 0.28,
      this.baseOffset.y + target.y * 0.18,
      this.baseOffset.z,
    );
    // Keep a little horizontal trail but damp harder than before
    const factor = 1 - Math.exp(-delta / Math.max(0.001, lag));
    const lookFactor = 1 - Math.exp(-delta / Math.max(0.001, lag * 1.35));
    this.camera.position.x += (this.desiredPosition.x - this.camera.position.x) * factor;
    this.camera.position.y += (this.desiredPosition.y - this.camera.position.y) * factor;
    this.camera.position.z += (this.desiredPosition.z - this.camera.position.z) * factor;

    const lookX = target.x * 0.22;
    const lookY = 1.05 + target.y * 0.12;
    this.lookTarget.x += (lookX - this.lookTarget.x) * lookFactor;
    this.lookTarget.y += (lookY - this.lookTarget.y) * lookFactor;
    this.lookTarget.z = -5.5;
    this.camera.lookAt(this.lookTarget);
    // Very light bank — heavy roll reads as bounce when changing lanes
    this.camera.rotation.z += lean * 0.012;
    this.updateFov(delta);
  }

  punchFov(degrees: number): void {
    this.fovPunch = Math.min(10, this.fovPunch + degrees);
    this.applyFov();
  }

  private updateFov(delta: number): void {
    if (this.fovPunch <= 0.001) return;
    this.fovPunch *= Math.exp(-delta / 0.2);
    if (this.fovPunch < 0.001) this.fovPunch = 0;
    this.applyFov();
  }

  private applyFov(): void {
    this.camera.fov = this.baseFov + this.fovPunch;
    this.camera.updateProjectionMatrix();
  }
}
