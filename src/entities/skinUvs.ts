import * as THREE from 'three';

/**
 * Map a three.js BoxGeometry to Minecraft skin UVs (v64).
 *
 * Minecraft cuboid unwrap at skin origin (u, v), size (w, h, d) in px:
 *   row0:  top (u+d, v, w, d) · bottom (u+d+w, v, w, d)
 *   row1:  right (u, v+d, d, h) · front (u+d, v+d, w, h) · left (u+d+w, v+d, d, h) · back (u+d+w+d, v+d, w, h)
 *   "right"/"left" are the character's right/left when looking at the FRONT.
 *
 * Our runner faces -Z (camera chases from +Z). Therefore:
 *   character right = +X, character left = -X, front = -Z, back = +Z.
 *
 * BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
 */
export function setMinecraftBoxUVs(
  geometry: THREE.BoxGeometry,
  u: number,
  v: number,
  w: number,
  h: number,
  d: number,
  texSize = 64,
): void {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const texW = texSize;
  const texH = texSize;

  // Skin rects in pixels (x, y, w, h), y down from texture top
  const top: [number, number, number, number] = [u + d, v, w, d];
  const bottom: [number, number, number, number] = [u + d + w, v, w, d];
  const right: [number, number, number, number] = [u, v + d, d, h]; // character right
  const front: [number, number, number, number] = [u + d, v + d, w, h];
  const left: [number, number, number, number] = [u + d + w, v + d, d, h]; // character left
  const back: [number, number, number, number] = [u + d + w + d, v + d, w, h];

  // Facing -Z: +X is char-right, -X is char-left
  const faces: Array<[number, number, number, number]> = [
    right, // +X
    left, // -X
    top, // +Y
    bottom, // -Y
    back, // +Z
    front, // -Z
  ];

  const setFace = (faceIndex: number, rect: [number, number, number, number]) => {
    const [fx, fy, fw, fh] = rect;
    // GL UV: v=1 at texture top
    const u1 = fx / texW;
    const v1 = 1 - fy / texH;
    const u2 = (fx + fw) / texW;
    const v2 = 1 - (fy + fh) / texH;
    const base = faceIndex * 4;
    // three.js BoxGeometry verts per face: (0,1), (1,1), (0,0), (1,0)
    // = face top-left, top-right, bottom-left, bottom-right (viewed from outside)
    uv.setXY(base + 0, u1, v1);
    uv.setXY(base + 1, u2, v1);
    uv.setXY(base + 2, u1, v2);
    uv.setXY(base + 3, u2, v2);
  };

  for (let i = 0; i < 6; i += 1) setFace(i, faces[i]);
  uv.needsUpdate = true;
}

export function makeSkinBox(
  texture: THREE.Texture,
  pw: number,
  ph: number,
  pd: number,
  u: number,
  v: number,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(pw / 16, ph / 16, pd / 16);
  setMinecraftBoxUVs(geo, u, v, pw, ph, pd);
  // Lambert keeps skin colors flat/readable under sun (Standard washes arms orange)
  const mat = new THREE.MeshLambertMaterial({ map: texture });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
