import { offset, vec, type Frame3, type Vec3 } from '../core/vector';
import { mod } from '../core/math';
import { skylinePads as pads, skylineRepair as repair } from '../track/course';
import { skylineWidthAt as widthAt, skylineDividerAt, GRID_COLUMNS } from '../track/launch';
import { sampleSpatial, skyline } from '../track/spatial';

type Color = readonly [number, number, number];
export class Mesh {
  values: number[] = [];
  triangle(a: Vec3, b: Vec3, c: Vec3, color: Color): void {
    for (const p of [a, b, c]) this.values.push(p.x, p.y, p.z, ...color);
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color): void {
    this.triangle(a, b, c, color);
    this.triangle(a, c, d, color);
  }
  box(x: number, y: number, z: number, w: number, d: number, h: number, color: Color): void {
    const p = [
      vec(x - w, y - d, z),
      vec(x + w, y - d, z),
      vec(x + w, y + d, z),
      vec(x - w, y + d, z),
      vec(x - w, y - d, z + h),
      vec(x + w, y - d, z + h),
      vec(x + w, y + d, z + h),
      vec(x - w, y + d, z + h),
    ];
    this.quad(p[4], p[5], p[6], p[7], color);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const shade = i % 2 ? 0.52 : 0.74;
      this.quad(p[i], p[j], p[j + 4], p[i + 4], [
        color[0] * shade,
        color[1] * shade,
        color[2] * shade,
      ]);
    }
    this.quad(p[3], p[2], p[1], p[0], [color[0] * 0.35, color[1] * 0.35, color[2] * 0.35]);
  }
  data(): Float32Array {
    return new Float32Array(this.values);
  }
}

function ribbon(
  mesh: Mesh,
  a: Frame3,
  b: Frame3,
  leftA: number,
  rightA: number,
  leftB: number,
  rightB: number,
  height: number,
  color: Color,
): void {
  mesh.quad(
    offset(a, leftA, height),
    offset(a, rightA, height),
    offset(b, rightB, height),
    offset(b, leftB, height),
    color,
  );
}

/** Static depth-tested ribbon. Markings, walls and supports share the same 3D frame. */
export function roadMesh(): Float32Array {
  const total = skyline.length;
  const mesh = new Mesh();
  const count = Math.ceil(total / 22);
  for (let i = 0; i < count; i++) {
    const s = (i * total) / count;
    const next = ((i + 1) * total) / count;
    const a = sampleSpatial(s);
    const b = sampleSpatial(next);
    const wa = widthAt(s);
    const wb = widthAt(next);
    const shade = Math.floor(s / 110) % 2 ? 0.17 : 0.195;
    ribbon(mesh, a, b, -wa, wa, -wb, wb, 0, [shade, shade + 0.055, shade + 0.1]);
    ribbon(mesh, a, b, -wa, wa, -wb, wb, -12, [0.04, 0.065, 0.12]);
    for (const side of [-1, 1]) {
      const x = side * wa;
      const nx = side * wb;
      mesh.quad(
        offset(a, x, -12),
        offset(b, nx, -12),
        offset(b, nx, 15),
        offset(a, x, 15),
        [0.09, 0.18, 0.26],
      );
      ribbon(
        mesh,
        a,
        b,
        x - 4,
        x + 4,
        nx - 4,
        nx + 4,
        15,
        side === 1 ? [0.28, 0.95, 0.91] : [0.93, 0.38, 0.72],
      );
    }
    if (Math.floor(s / 95) % 2 === 0) {
      for (let divider = 0; divider < GRID_COLUMNS - 1; divider++) {
        const line = skylineDividerAt(s, divider);
        const nextLine = skylineDividerAt(next, divider);
        if (line.opacity === 0 && nextLine.opacity === 0) continue;
        ribbon(
          mesh,
          a,
          b,
          line.x - 1.5 * line.opacity,
          line.x + 1.5 * line.opacity,
          nextLine.x - 1.5 * nextLine.opacity,
          nextLine.x + 1.5 * nextLine.opacity,
          0.6,
          [0.55, 0.7, 0.76],
        );
      }
    }
    for (const pad of pads) {
      const ds = mod(s - pad.s + total / 2, total) - total / 2;
      if (Math.abs(ds) < pad.len / 2)
        ribbon(mesh, a, b, pad.x - 24, pad.x + 24, pad.x - 24, pad.x + 24, 1, [0.14, 0.8, 1]);
    }
    if (s > repair.s && s < repair.s + repair.len)
      ribbon(mesh, a, b, -wa + 14, -wa + 64, -wb + 14, -wb + 64, 1, [1, 0.22, 0.58]);
    if (s < 24) {
      for (let j = 0; j < 12; j++)
        ribbon(
          mesh,
          a,
          b,
          -wa + (j * wa) / 6,
          -wa + ((j + 1) * wa) / 6,
          -wb + (j * wb) / 6,
          -wb + ((j + 1) * wb) / 6,
          1,
          j % 2 ? [0.06, 0.08, 0.12] : [0.9, 0.98, 1],
        );
    }
    if (i % 28 === 0 && a.up.z > 0.8 && a.z > 150) {
      const p = offset(a, 0, -16);
      mesh.box(p.x, p.y, 0, 11, 11, p.z, [0.1, 0.17, 0.24]);
    }
  }
  // Luminous start gantry follows the track plane instead of world vertical.
  const start = sampleSpatial(0);
  const half = widthAt(0) + 12;
  for (const side of [-1, 1]) {
    const x = side * half;
    mesh.quad(
      offset(start, x - 4, 0),
      offset(start, x + 4, 0),
      offset(start, x + 4, 115),
      offset(start, x - 4, 115),
      [0.4, 0.9, 0.82],
    );
  }
  mesh.quad(
    offset(start, -half, 105),
    offset(start, half, 105),
    offset(start, half, 120),
    offset(start, -half, 120),
    [0.75, 1, 0.35],
  );
  return mesh.data();
}

/** Procedural harbour beneath the elevated circuit; no shared world RNG draws. */
export function environmentMesh(): Float32Array {
  const mesh = new Mesh();
  mesh.quad(
    vec(-25000, -25000, -6),
    vec(25000, -25000, -6),
    vec(25000, 25000, -6),
    vec(-25000, 25000, -6),
    [0.035, 0.07, 0.13],
  );
  for (let i = -16; i <= 16; i++) {
    const p = i * 700;
    mesh.quad(
      vec(p - 2, -12000, 0),
      vec(p + 2, -12000, 0),
      vec(p + 2, 16000, 0),
      vec(p - 2, 16000, 0),
      [0.07, 0.18, 0.23],
    );
    mesh.quad(
      vec(-12000, p - 2, 0),
      vec(16000, p - 2, 0),
      vec(16000, p + 2, 0),
      vec(-12000, p + 2, 0),
      [0.07, 0.18, 0.23],
    );
  }
  const bounds = skyline.frames.reduce(
    (b, p) => ({ x: Math.max(b.x, p.x), y: Math.max(b.y, p.y) }),
    { x: 0, y: 0 },
  );
  for (let i = 0; i < 48; i++) {
    const angle = (i * Math.PI * 2) / 48;
    const x = bounds.x / 2 + Math.cos(angle) * (bounds.x * 0.8 + 1200);
    const y = bounds.y / 2 + Math.sin(angle) * (bounds.y * 0.8 + 1200);
    const height = 180 + ((i * 173) % 670);
    mesh.box(x, y, 0, 90 + (i % 3) * 30, 90, height, [0.13, 0.17, 0.26]);
    mesh.box(x, y, height, 92 + (i % 3) * 30, 92, 5, i % 2 ? [0.36, 0.7, 0.8] : [0.64, 0.32, 0.66]);
    for (let z = 45; z < height; z += 85)
      mesh.box(x, y, z, 91 + (i % 3) * 30, 91, 3, [0.23, 0.42, 0.57]);
  }
  return mesh.data();
}

export function craftMesh(): Float32Array {
  const mesh = new Mesh();
  // Local coordinates are lateral / forward / height. Flat faces preserve the original pixel aesthetic.
  mesh.box(0, -4, 5, 8, 20, 6, [0.72, 0.88, 1]);
  for (const x of [-16, 16]) {
    mesh.box(x, -4, 3, 6, 24, 8, [0.8, 0.95, 1]);
    mesh.box(x, 1, 11.1, 2, 16, 1, [0.23, 0.52, 0.8]);
    mesh.box(x, -28, 5, 4, 1, 4, [0.6, 1, 1]);
  }
  mesh.triangle(vec(-8, 16, 11), vec(8, 16, 11), vec(0, 35, 7), [0.72, 0.88, 1]);
  mesh.box(0, 3, 11, 4, 10, 6, [0.035, 0.14, 0.23]);
  mesh.box(-3, 4, 17, 1, 7, 0.5, [0.45, 0.94, 1]);
  return mesh.data();
}

export function flameMesh(): Float32Array {
  const mesh = new Mesh();
  for (const x of [-16, 16]) {
    mesh.triangle(vec(x - 4, -29, 6), vec(x + 4, -29, 6), vec(x, -60, 6), [0.2, 0.85, 1]);
    mesh.triangle(vec(x, -29, 3), vec(x, -29, 9), vec(x, -60, 6), [0.8, 1, 1]);
  }
  return mesh.data();
}
