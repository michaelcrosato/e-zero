import { KMH, RACE_LAPS } from '../config/constants';
import { vehicle } from '../config/vehicles';
import { vec, type Vec3 } from '../core/vector';
import { player } from '../sim/state';
import { BASE } from '../track/layout';
import { courseLength } from '../track/course';
import { cameraFeeds, displayCanvas, updateCameraFeeds } from './camera-feeds';
import { drivingView, pilotView } from './driving-view';
import { surface } from './surface';

const mirror = displayCanvas(576, 164);
const sentry = displayCanvas(720, 260);
const instruments = displayCanvas(480, 220);
const wheel = displayCanvas(440, 280);
const hologram = displayCanvas(440, 200);
const panelState = { frame: -1 };
const compactCockpit = (): boolean => surface.w / surface.h < 0.9;

interface Vertex extends Vec3 {
  u: number;
  v: number;
}
interface Pixel {
  x: number;
  y: number;
}

/** Interior coordinates are relative to the pilot's eye: x right, y forward, z up.
 * Only head yaw changes this projection. Turning the vehicle rotates cabin and pilot together. */
function turn(p: Vec3, u = 0, v = 0): Vertex {
  const cs = Math.cos(drivingView.lookYaw);
  const sn = Math.sin(drivingView.lookYaw);
  // Fit cabin trim to the display while keeping the world camera at the same vehicle mount.
  const aspect = surface.w / surface.h;
  const vertical = Math.max(1, 0.9 / aspect);
  const x = p.x * vertical * Math.min(1, aspect / 1.7);
  return { x: x * cs - p.y * sn, y: x * sn + p.y * cs, z: p.z * vertical, u, v };
}
function project(p: Vec3): Pixel {
  const focal = surface.h / (2 * Math.tan(pilotView.fov / 2));
  return { x: surface.w / 2 + (p.x * focal) / p.y, y: surface.h / 2 - (p.z * focal) / p.y };
}

/** Clip at the eye instead of dropping a whole window frame as it crosses the edge of vision. */
function clip(points: Vertex[]): Vertex[] {
  const result: Vertex[] = [];
  let a = points[points.length - 1];
  for (const b of points) {
    if (a.y >= 0.2 !== b.y >= 0.2) {
      const t = (0.2 - a.y) / (b.y - a.y);
      result.push({
        x: a.x + (b.x - a.x) * t,
        y: 0.2,
        z: a.z + (b.z - a.z) * t,
        u: a.u + (b.u - a.u) * t,
        v: a.v + (b.v - a.v) * t,
      });
    }
    if (b.y >= 0.2) result.push(b);
    a = b;
  }
  return result;
}

function path(points: Pixel[]): void {
  const ctx = surface.ctx;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}
function face(points: Vec3[], color: string, edge?: string): void {
  const visible = clip(points.map((p) => turn(p)));
  if (visible.length < 3) return;
  const ctx = surface.ctx;
  path(visible.map(project));
  ctx.fillStyle = color;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function textureTriangle(canvas: HTMLCanvasElement, triangle: Vertex[]): void {
  const points = clip(triangle);
  const ctx = surface.ctx;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[0], points[i], points[i + 1]];
    const [p, q, r] = [project(a), project(b), project(c)];
    if (
      Math.max(p.x, q.x, r.x) < 0 ||
      Math.min(p.x, q.x, r.x) > surface.w ||
      Math.max(p.y, q.y, r.y) < 0 ||
      Math.min(p.y, q.y, r.y) > surface.h
    )
      continue;
    const det = (b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v);
    if (Math.abs(det) < 1e-8) continue;
    const aa = ((q.x - p.x) * (c.v - a.v) - (r.x - p.x) * (b.v - a.v)) / det;
    const bb = ((q.y - p.y) * (c.v - a.v) - (r.y - p.y) * (b.v - a.v)) / det;
    const cc = ((r.x - p.x) * (b.u - a.u) - (q.x - p.x) * (c.u - a.u)) / det;
    const dd = ((r.y - p.y) * (b.u - a.u) - (q.y - p.y) * (c.u - a.u)) / det;
    ctx.save();
    // Half a pixel of overlap prevents antialiasing cracks between adjacent texture triangles.
    const cx = (p.x + q.x + r.x) / 3,
      cy = (p.y + q.y + r.y) / 3;
    path(
      [p, q, r].map((point) => {
        const dx = point.x - cx,
          dy = point.y - cy;
        const k = 0.5 / Math.max(0.1, Math.hypot(dx, dy));
        return { x: point.x + dx * k, y: point.y + dy * k };
      }),
    );
    ctx.clip();
    ctx.transform(aa, bb, cc, dd, p.x - aa * a.u - cc * a.v, p.y - bb * a.u - dd * a.v);
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }
}

/** Subdivision keeps the touchscreen perspective stable during a glance (no DOM sliding overlay). */
function panel(
  canvas: HTMLCanvasElement,
  left: number,
  right: number,
  depth: number,
  top: number,
  bottom: number,
): void {
  const cols = 8,
    rows = 4;
  const vertex = (u: number, v: number): Vertex =>
    turn(
      vec(left + (right - left) * u, depth, top + (bottom - top) * v),
      u * canvas.width,
      v * canvas.height,
    );
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const a = vertex(x / cols, y / rows),
        b = vertex((x + 1) / cols, y / rows);
      const c = vertex((x + 1) / cols, (y + 1) / rows),
        d = vertex(x / cols, (y + 1) / rows);
      textureTriangle(canvas, [a, b, c]);
      textureTriangle(canvas, [a, c, d]);
    }
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 14,
  color = '#9fbcc8',
): void {
  ctx.font = `500 ${size}px 'Courier New', monospace`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function refreshPanels(): void {
  const rear = mirror.ctx;
  rear.fillStyle = '#050c12';
  rear.fillRect(0, 0, 576, 164);
  rear.strokeStyle = '#678994';
  rear.lineWidth = 3;
  rear.strokeRect(2, 2, 572, 160);
  // A rear-view mirror preserves the vehicle's left/right relationship.
  rear.save();
  rear.translate(564, 0);
  rear.scale(-1, 1);
  rear.drawImage(cameraFeeds.rear.canvas, 0, 10, 552, 118);
  rear.restore();
  label(rear, 'REAR VIEW', 16, 150, 15, '#cef5ef');
  label(rear, '● LIVE', 486, 150, 14, '#8af8cc');

  const ctx = sentry.ctx;
  ctx.fillStyle = '#070f19';
  ctx.fillRect(0, 0, 720, 260);
  ctx.strokeStyle = '#48636d';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 716, 256);
  label(ctx, 'E / VISION', 18, 28, 18, '#d3f7f3');
  label(
    ctx,
    compactCockpit() ? `POWER ${Math.ceil(player.power)}%` : '360° TRAFFIC',
    518,
    28,
    18,
    '#a4e8d4',
  );
  const leftAlert = cameraFeeds.contacts.some(
    (c) => c.lateral < -10 && (c.approaching || c.alongside),
  );
  const rightAlert = cameraFeeds.contacts.some(
    (c) => c.lateral > 10 && (c.approaching || c.alongside),
  );
  for (const [side, x, feed, alert] of [
    ['LEFT', 16, cameraFeeds.left, leftAlert],
    ['RIGHT', 494, cameraFeeds.right, rightAlert],
  ] as const) {
    ctx.drawImage(feed.canvas, x, 49, 210, 139);
    ctx.strokeStyle = alert ? '#ffc16b' : '#304958';
    ctx.lineWidth = alert ? 3 : 1;
    ctx.strokeRect(x, 49, 210, 139);
    label(ctx, `${side} CAMERA`, x, 210, 14, '#d4e9ed');
    label(
      ctx,
      alert ? '◀ VEHICLE NEAR ▶' : 'LIVE · MONITORING',
      x,
      238,
      13,
      alert ? '#ffc16b' : '#71a3ad',
    );
  }
  // A Tesla-style plan view shows actual relative positions, plus closure arrows.
  ctx.save();
  ctx.beginPath();
  ctx.rect(248, 44, 224, 201);
  ctx.clip();
  const road = ctx.createLinearGradient(0, 45, 0, 245);
  road.addColorStop(0, '#122838');
  road.addColorStop(1, '#09121c');
  ctx.fillStyle = road;
  ctx.fillRect(248, 44, 224, 201);
  ctx.strokeStyle = '#45616d';
  ctx.setLineDash([10, 9]);
  ctx.lineWidth = 1;
  for (const x of [283, 333, 387, 437]) {
    ctx.beginPath();
    ctx.moveTo(x, 45);
    ctx.lineTo(x, 245);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const contact of cameraFeeds.contacts) {
    const x = 360 + contact.lateral * 0.48;
    const y = 138 - contact.ahead * 0.3;
    ctx.fillStyle = contact.alongside || contact.approaching ? '#ffc16b' : '#789cad';
    ctx.fillRect(x - 7, y - 10, 14, 20);
    ctx.fillStyle = '#0d202d';
    ctx.fillRect(x - 4, y - 4, 8, 7);
    if (contact.approaching) {
      ctx.strokeStyle = '#ffc16b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 17);
      ctx.lineTo(x, y - 22);
      ctx.lineTo(x + 4, y - 17);
      ctx.stroke();
    }
  }
  ctx.shadowColor = '#87fff1';
  ctx.shadowBlur = 13;
  ctx.fillStyle = '#c6fff0';
  ctx.beginPath();
  ctx.moveTo(350, 151);
  ctx.lineTo(350, 127);
  ctx.lineTo(360, 118);
  ctx.lineTo(370, 127);
  ctx.lineTo(370, 151);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#126066';
  ctx.fillRect(355, 130, 10, 10);
  ctx.restore();
  label(ctx, 'YOU', 347, 238, 12, '#b9fff0');

  const dash = instruments.ctx;
  dash.fillStyle = '#0b141e';
  dash.fillRect(0, 0, 480, 220);
  dash.strokeStyle = '#314b58';
  dash.lineWidth = 3;
  dash.strokeRect(2, 2, 476, 216);
  label(dash, vehicle.model.name, 24, 34, 17, '#b1d6dc');
  label(dash, 'POWER RESERVE', 24, 78, 14);
  label(
    dash,
    `${Math.ceil(player.power)}%`,
    328,
    79,
    30,
    player.power < 25 ? '#ffad94' : '#c6fff0',
  );
  for (let i = 0; i < 24; i++) {
    dash.fillStyle =
      i < player.power * 0.24 ? (player.power < 25 ? '#ffad94' : '#8fe9d5') : '#26333f';
    dash.fillRect(25 + i * 18, 99, 12, 17);
  }
  label(
    dash,
    player.boosting ? 'HYPER DRIVE / ACTIVE' : 'MAGNETIC DRIVE / ONLINE',
    24,
    153,
    17,
    '#87d8f0',
  );
  label(
    dash,
    `LAP ${Math.min(RACE_LAPS, Math.floor(player.s / courseLength()) + 1)} / ${RACE_LAPS}`,
    24,
    190,
    17,
    '#ecf7f4',
  );
  label(dash, 'E—01', 357, 190, 17, '#688e9c');
}

function drawWheel(): void {
  const ctx = wheel.ctx;
  ctx.clearRect(0, 0, 440, 280);
  ctx.save();
  ctx.translate(220, 140);
  ctx.rotate(player.steer * 0.48);
  ctx.beginPath();
  ctx.moveTo(-158, -58);
  ctx.bezierCurveTo(-125, -121, 125, -121, 158, -58);
  ctx.bezierCurveTo(185, 0, 165, 61, 101, 82);
  ctx.lineTo(-101, 82);
  ctx.bezierCurveTo(-165, 61, -185, 0, -158, -58);
  ctx.closePath();
  ctx.strokeStyle = '#01080e';
  ctx.lineWidth = 48;
  ctx.stroke();
  ctx.strokeStyle = '#516778';
  ctx.lineWidth = 40;
  ctx.stroke();
  ctx.strokeStyle = '#142432';
  ctx.lineWidth = 32;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-149, -8);
  ctx.lineTo(-64, 19);
  ctx.lineTo(64, 19);
  ctx.lineTo(149, -8);
  ctx.strokeStyle = '#5b6d77';
  ctx.lineWidth = 25;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 33);
  ctx.lineTo(0, 77);
  ctx.strokeStyle = '#223643';
  ctx.lineWidth = 36;
  ctx.stroke();
  ctx.fillStyle = '#0a151f';
  ctx.strokeStyle = '#78909b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-68, -24, 136, 75, 14);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  label(ctx, 'E—ZERO', 0, 10, 19, '#deffed');
  label(ctx, 'FLIGHT SYSTEMS', 0, 31, 9, '#91a9b4');
  ctx.fillStyle = '#9affdc';
  ctx.fillRect(-5, -102, 10, 22);
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#7ac8d4';
    ctx.fillRect(side * 105 - 10, -9, 20, 3);
    ctx.fillStyle = '#3d5465';
    ctx.fillRect(side * 106 - 8, 6, 16, 8);
  }
  ctx.restore();
  if (compactCockpit()) panel(wheel.canvas, -3.3, 3.3, 7.5, -3.1, -4.4);
  else panel(wheel.canvas, -2.2, 2.2, 7.5, -2.0, -4.8);
}

function drawHologram(): void {
  const ctx = hologram.ctx;
  ctx.clearRect(0, 0, 440, 200);
  const speed = String(Math.round((player.v / BASE) * KMH)).padStart(3, '0');
  ctx.textAlign = 'center';
  ctx.font = '300 94px Arial';
  // A faint offset reflection and restrained glow read as a projection on glass.
  ctx.fillStyle = '#8effe514';
  ctx.fillText(speed, 224, 109);
  ctx.shadowColor = '#5bffd1';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#c0ffe9de';
  ctx.fillText(speed, 220, 105);
  ctx.shadowBlur = 0;
  label(ctx, 'KM/H', 220, 135, 20, '#b0fbe1bd');
  label(ctx, player.boosting ? 'HYPER BOOST' : 'AUTO THROTTLE', 220, 168, 13, '#8ee6d69e');
  ctx.strokeStyle = '#b0ffe380';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    const x = 220 + side * 175;
    ctx.beginPath();
    ctx.moveTo(x, 49);
    ctx.lineTo(x, 139);
    ctx.lineTo(x - side * 24, 139);
    ctx.stroke();
  }
  ctx.fillStyle = '#b0ffe345';
  ctx.fillRect(143, 184, 154, 2);
  if (compactCockpit()) panel(hologram.canvas, -6, 6, 12, -0.15, -1.8);
  else panel(hologram.canvas, -2.6, 2.6, 12, -0.65, -3.0);
}

export function drawCockpit(): void {
  updateCameraFeeds();
  if (panelState.frame !== cameraFeeds.frame) {
    refreshPanels();
    panelState.frame = cameraFeeds.frame;
  }
  const ctx = surface.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  // The canopy has real side windows. These planes stay attached to the craft during a glance.
  face(
    [vec(-10, -12, 6.5), vec(10, -12, 6.5), vec(10, 11, 6.5), vec(-10, 11, 6.5)],
    '#08111c',
    '#3c535d',
  );
  for (const side of [-1, 1]) {
    const x = side * 10;
    face(
      [vec(x, -12, -3.4), vec(x, 10, -3.4), vec(x, 10, -30), vec(x, -12, -30)],
      '#101c29',
      '#435c69',
    );
    face([vec(x, -12, -3.3), vec(x, 9.5, -3.3), vec(x, 9.5, -3.15), vec(x, -12, -3.15)], '#75c8ca');
    face(
      [
        vec(x, 10, -3.5),
        vec(x - side * 0.5, 10, -3.5),
        vec(x - side * 2.1, 10, 6.5),
        vec(x - side * 1.6, 10, 6.5),
      ],
      '#142633',
      '#7396a0',
    );
    face(
      [vec(x, -6, -3.4), vec(x, -6.5, -3.4), vec(x, -6.5, 6.5), vec(x, -6, 6.5)],
      '#111e2b',
      '#45616c',
    );
    // Recessed illuminated door trim is visible only when looking out the window.
    face(
      [
        vec(x * 0.985, -3, -4.5),
        vec(x * 0.985, 4, -4.5),
        vec(x * 0.985, 4, -4.7),
        vec(x * 0.985, -3, -4.7),
      ],
      '#3d7b8d',
    );
  }
  face(
    [vec(-10, 10, -2.65), vec(10, 10, -2.65), vec(10, 6, -4), vec(-10, 6, -4)],
    '#203140',
    '#506b79',
  );
  face([vec(-10, 6, -4), vec(10, 6, -4), vec(10, 6, -30), vec(-10, 6, -30)], '#0c1622');
  face(
    [vec(-10, 10, -2.62), vec(10, 10, -2.62), vec(10, 10, -2.68), vec(-10, 10, -2.68)],
    '#81c7c8',
  );
  // Black glass instrument panels, physically below the windscreen's sight line.
  if (compactCockpit()) panel(sentry.canvas, -9, 9, 10.5, -2.2, -4.2);
  else {
    panel(instruments.canvas, -8.8, -3.0, 9.8, -2.9, -5.55);
    panel(sentry.canvas, 2.8, 9.1, 9.8, -2.9, -5.55);
  }
  // The mirror and HUD share the same head projection as the dashboard and pillars.
  if (compactCockpit()) panel(mirror.canvas, -5.2, 5.2, 11, 4.45, 3.5);
  else panel(mirror.canvas, -2.9, 2.9, 11, 4.45, 2.8);
  drawHologram();
  drawWheel();
  ctx.restore();
}
