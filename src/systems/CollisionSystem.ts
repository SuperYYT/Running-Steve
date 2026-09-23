import * as THREE from 'three';

export type Collider = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
};

export function overlaps(a: Collider, b: Collider): boolean {
  return (
    Math.abs(a.x - b.x) < a.hx + b.hx &&
    Math.abs(a.y - b.y) < a.hy + b.hy &&
    Math.abs(a.z - b.z) < a.hz + b.hz
  );
}

/**
 * Steve visual is slightly scaled up. Sneak visual top ≈ 1.5,
 * standing visual top ≈ 2.2. Phantom occupies 1.75–2.35.
 */
export function playerCollider(
  x: number,
  y: number,
  ducking: boolean,
  airborne: boolean,
): Collider {
  const sneaking = ducking && !airborne;
  const hy = sneaking ? 0.62 : 1.1;
  const cy = y + hy;
  return { x, y: cy, z: 0, hx: 0.3, hy, hz: 0.32 };
}

export function makeColliderFromCenter(
  center: THREE.Vector3,
  half: THREE.Vector3,
): Collider {
  return {
    x: center.x,
    y: center.y,
    z: center.z,
    hx: half.x,
    hy: half.y,
    hz: half.z,
  };
}
