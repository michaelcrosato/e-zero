/**
 * Procedurally drawn sprites.
 *
 * Every pixel here is generated at load time onto offscreen canvases; the build
 * ships no image assets. The craft sprite is the rear three-quarter view used at
 * distance, and is also the source for the tinted boost ghost trails.
 */
import { TAU } from '../config/constants';
import { shipPalettes, type ShipPalette } from './palettes';

export { shipPalettes };
export type { ShipPalette };

export type Point2 = readonly [number, number];

/** Fills a closed polygon. Used by both the sprite builder and the 3D craft. */
export function polygon(
  c: CanvasRenderingContext2D,
  pts: ReadonlyArray<Point2>,
  color: string,
): void {
  c.fillStyle = color;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.closePath();
  c.fill();
}

function createSurface(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('E-Zero: 2D canvas context unavailable for a sprite.');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function buildShipSprite(p: ShipPalette, index: number): HTMLCanvasElement {
  const [c, s] = createSurface(100, 72);
  // Outline, then the two side pods, then the hull, canopy and thruster housings.
  polygon(
    s,
    [
      [4, 48],
      [11, 26],
      [30, 23],
      [39, 9],
      [61, 9],
      [70, 23],
      [89, 26],
      [96, 48],
      [89, 59],
      [64, 60],
      [60, 65],
      [40, 65],
      [36, 60],
      [11, 59],
    ],
    '#10162d',
  );
  polygon(
    s,
    [
      [7, 47],
      [14, 27],
      [28, 26],
      [34, 47],
      [31, 57],
      [12, 55],
    ],
    p.mid,
  );
  polygon(
    s,
    [
      [66, 47],
      [72, 26],
      [86, 27],
      [93, 47],
      [88, 55],
      [69, 57],
    ],
    p.mid,
  );
  polygon(
    s,
    [
      [14, 27],
      [22, 24],
      [29, 27],
      [34, 48],
      [26, 48],
      [22, 33],
      [12, 43],
    ],
    p.body,
  );
  polygon(
    s,
    [
      [72, 27],
      [80, 24],
      [86, 28],
      [91, 45],
      [81, 34],
      [77, 48],
      [67, 48],
    ],
    p.body,
  );
  polygon(
    s,
    [
      [27, 42],
      [39, 12],
      [61, 12],
      [73, 42],
      [64, 57],
      [36, 57],
    ],
    p.mid,
  );
  polygon(
    s,
    [
      [39, 13],
      [48, 8],
      [55, 9],
      [63, 18],
      [69, 40],
      [58, 49],
      [40, 48],
      [32, 39],
    ],
    p.body,
  );
  polygon(
    s,
    [
      [43, 16],
      [56, 16],
      [63, 34],
      [60, 42],
      [41, 42],
      [38, 34],
    ],
    p.dark,
  );
  polygon(
    s,
    [
      [45, 18],
      [55, 18],
      [59, 30],
      [42, 30],
    ],
    p.glass,
  );
  polygon(
    s,
    [
      [45, 18],
      [54, 18],
      [55, 21],
      [44, 24],
    ],
    p.light,
  );
  polygon(
    s,
    [
      [41, 33],
      [61, 33],
      [59, 38],
      [43, 38],
    ],
    p.mid,
  );
  polygon(
    s,
    [
      [35, 44],
      [44, 49],
      [58, 49],
      [66, 44],
      [62, 58],
      [37, 58],
    ],
    p.dark,
  );

  s.fillStyle = p.light;
  s.fillRect(38, 45, 7, 2);
  s.fillRect(56, 45, 7, 2);
  s.fillStyle = p.dark;
  s.fillRect(12, 46, 18, 8);
  s.fillRect(71, 46, 17, 8);
  s.fillStyle = '#08162e';
  s.fillRect(15, 48, 13, 6);
  s.fillRect(73, 48, 12, 6);
  s.fillStyle = p.accent;
  s.fillRect(14, 46, 14, 3);
  s.fillRect(73, 46, 13, 3);
  s.fillStyle = p.light;
  s.fillRect(11, 37, 5, 3);
  s.fillRect(85, 37, 5, 3);
  s.fillRect(20, 31, 3, 8);
  s.fillRect(78, 31, 3, 8);
  s.fillRect(47, 44, 7, 2);
  s.fillStyle = '#f7faff';
  s.fillRect(34, 27, 3, 10);
  s.fillRect(62, 26, 3, 7);
  s.fillRect(17, 26, 7, 2);
  s.fillRect(77, 26, 6, 2);
  s.fillStyle = p.mid;
  s.fillRect(43, 57, 15, 4);
  s.fillStyle = p.light;
  s.fillRect(46, 59, 9, 2);

  s.fillStyle = '#172039';
  s.font = 'bold 7px monospace';
  s.fillText('0' + (index + 1), 46, 47);
  return c;
}

function buildSphereSprite(pink: boolean): HTMLCanvasElement {
  const [c, g] = createSurface(40, 40);
  const disk = (x: number, y: number, r: number, color: string): void => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  // Concentric offset disks read as a lit sphere at any on-screen size.
  disk(20, 20, 18, '#17263e');
  disk(19, 18, 16, pink ? '#a24c82' : '#6d92b1');
  disk(17, 15, 13, pink ? '#ec91c2' : '#badce8');
  disk(15, 12, 9, pink ? '#ffcee8' : '#e2f6f6');
  disk(13, 10, 4, '#ffffff');
  g.fillStyle = pink ? '#bd659d' : '#87b8cd';
  g.fillRect(24, 22, 8, 4);
  return c;
}

/** One sprite per livery. */
export const shipSprites: HTMLCanvasElement[] = shipPalettes.map(buildShipSprite);

/** Rail spheres: standard and the pink markers every fourth socket. */
export const sphereSprites: HTMLCanvasElement[] = [false, true].map(buildSphereSprite);

/** Flat-tinted silhouettes of the craft, stacked as a boost trail. */
export const boostGhosts: HTMLCanvasElement[] = ['#83f5ff', '#ff8ede'].map((color) => {
  const [c, g] = createSurface(100, 72);
  g.drawImage(shipSprites[0], 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, 100, 72);
  return c;
});

/** Screen-edge boost wash. Rebuilt whenever the internal resolution changes. */
export const boostEdge = document.createElement('canvas');

export function rebuildBoostEdge(w: number, h: number): void {
  boostEdge.width = w;
  boostEdge.height = h;
  const g = boostEdge.getContext('2d');
  if (!g) return;
  const left = g.createLinearGradient(0, 0, w * 0.3, 0);
  left.addColorStop(0, '#36d9ff64');
  left.addColorStop(0.32, '#3de9ff1d');
  left.addColorStop(1, '#38e5ff00');
  g.fillStyle = left;
  g.fillRect(0, 0, w * 0.3, h);

  const right = g.createLinearGradient(w, 0, w * 0.7, 0);
  right.addColorStop(0, '#d354f552');
  right.addColorStop(0.32, '#80aaff1c');
  right.addColorStop(1, '#63c8ff00');
  g.fillStyle = right;
  g.fillRect(w * 0.7, 0, w * 0.3, h);

  const bottom = g.createLinearGradient(0, h, 0, h * 0.66);
  bottom.addColorStop(0, '#4ccfff39');
  bottom.addColorStop(1, '#50cfff00');
  g.fillStyle = bottom;
  g.fillRect(0, h * 0.66, w, h * 0.34);
}
