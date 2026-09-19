import { vec, type Vec3 } from '../core/vector';

export interface VehicleBody {
  readonly scale: Vec3;
  readonly hover: number;
  /** All mounts use the same lateral / forward / height coordinates as the mesh. */
  readonly pilotEye: Vec3;
  readonly rearCamera: Vec3;
  readonly leftCamera: Vec3;
  readonly rightCamera: Vec3;
}

export interface VehicleModel {
  readonly id: string;
  readonly name: string;
  readonly classic: VehicleBody;
  readonly skyline: VehicleBody;
}

/** Mounts sit inside the raised glass canopy, rather than at the nose or chase target. */
export const interceptor: VehicleModel = {
  id: 'interceptor',
  name: 'E-01 INTERCEPTOR',
  classic: {
    scale: vec(0.72, 0.7, 0.85),
    hover: 3.4,
    pilotEye: vec(0, 5, 11.5),
    rearCamera: vec(0, -25, 12),
    leftCamera: vec(-21, 4, 9),
    rightCamera: vec(21, 4, 9),
  },
  skyline: {
    scale: vec(1, 1, 1),
    hover: 4,
    pilotEye: vec(0, 8, 15),
    rearCamera: vec(0, -30, 14),
    leftCamera: vec(-22, 6, 12),
    rightCamera: vec(22, 6, 12),
  },
};

/** Future vehicle selection changes this model; camera code has no model-specific offsets. */
export const vehicle = { model: interceptor };
