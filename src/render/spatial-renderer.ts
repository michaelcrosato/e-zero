import {
  add,
  cross,
  dot,
  normalize,
  offset,
  scale,
  sub,
  vec,
  type Frame3,
  type Vec3,
} from '../core/vector';
import { clamp } from '../core/math';
import { online, remoteCraft } from '../online/state';
import { rivals } from '../sim/rivals';
import { boostFX, camera, game, player } from '../sim/state';
import { sampleSpatial } from '../track/spatial';
import { skylineLaneAt, skylineWidthAt, GRID_COLUMNS } from '../track/launch';
import { el } from '../ui/dom';
import { surface } from './surface';
import { craftMesh, environmentMesh, flameMesh, roadMesh } from './spatial-mesh';

interface BufferMesh {
  buffer: WebGLBuffer;
  count: number;
}
interface Renderer {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  position: number;
  color: number;
  uniforms: Record<string, WebGLUniformLocation>;
  road: BufferMesh;
  environment: BufferMesh;
  craft: BufferMesh;
  flame: BufferMesh;
  skyProgram: WebGLProgram;
  skyPosition: number;
  skyUniforms: Record<string, WebGLUniformLocation>;
  sky: WebGLBuffer;
}

export const spatialView = {
  ready: false,
  lost: false,
  reason: '',
  eye: vec(),
  forward: vec(1),
  right: vec(0, 1),
  up: vec(0, 0, 1),
  fov: 1.05,
  drawnCraft: 0,
};
const graphics = { renderer: null as Renderer | null, attempted: false };

const VERTEX = `
attribute vec3 a_position;
attribute vec3 a_color;
uniform vec3 u_eye, u_viewForward, u_viewRight, u_viewUp;
uniform vec3 u_origin, u_right, u_forward, u_up, u_tint;
uniform float u_focal, u_aspect;
varying vec3 v_color;
varying float v_depth;
void main() {
  vec3 world = u_origin + u_right*a_position.x + u_forward*a_position.y + u_up*a_position.z;
  vec3 p = world-u_eye;
  float d = dot(p,u_viewForward);
  gl_Position = vec4(dot(p,u_viewRight)*u_focal/u_aspect, dot(p,u_viewUp)*u_focal,
    1.000889*d-16.007115, d);
  v_color = a_color*u_tint;
  v_depth = d;
}`;
const FRAGMENT = `
precision mediump float;
varying vec3 v_color;
varying float v_depth;
void main() {
  float fog = smoothstep(2500.0,15000.0,v_depth);
  gl_FragColor = vec4(mix(v_color,vec3(.22,.19,.32),fog*.85),1.0);
}`;
const SKY_VERTEX = `attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=a_position;gl_Position=vec4(a_position,0.9999,1.0);}`;
const SKY_FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform vec3 u_viewForward,u_viewRight,u_viewUp;
uniform float u_focal,u_aspect;
void main(){
  vec3 ray=normalize(u_viewForward+u_viewRight*v_uv.x*u_aspect/u_focal+u_viewUp*v_uv.y/u_focal);
  vec3 color=mix(vec3(.40,.27,.43),vec3(.022,.035,.09),smoothstep(0.0,.7,ray.z));
  color=mix(color,vec3(.03,.07,.13),(1.0-smoothstep(-.4,-.02,ray.z)));
  float sun=dot(ray,normalize(vec3(-.4,.7,.27)));
  color=mix(color,vec3(.98,.52,.70),smoothstep(.986,.989,sun));
  vec2 star=floor(vec2(atan(ray.y,ray.x)*400.0,ray.z*600.0));
  float noise=fract(sin(dot(star,vec2(12.9898,78.233)))*43758.5453);
  if(ray.z>.1 && noise>.997) color+=vec3(.25);
  gl_FragColor=vec4(color,1.0);
}`;

function program(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('Unable to create 3D program');
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to create 3D shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? '3D shader compilation failed');
    gl.attachShader(p, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? '3D shader linking failed');
  return p;
}
function uniforms(
  gl: WebGLRenderingContext,
  p: WebGLProgram,
  names: string[],
): Record<string, WebGLUniformLocation> {
  const result: Record<string, WebGLUniformLocation> = {};
  for (const name of names) {
    const location = gl.getUniformLocation(p, 'u_' + name);
    if (location === null) throw new Error('Missing 3D uniform ' + name);
    result[name] = location;
  }
  return result;
}
function buffer(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer {
  const b = gl.createBuffer();
  if (!b) throw new Error('Unable to create 3D buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return b;
}
function initialize(gl: WebGLRenderingContext): Renderer {
  const p = program(gl, VERTEX, FRAGMENT);
  const skyProgram = program(gl, SKY_VERTEX, SKY_FRAGMENT);
  const upload = (data: Float32Array): BufferMesh => ({
    buffer: buffer(gl, data),
    count: data.length / 6,
  });
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  return {
    gl,
    program: p,
    position: gl.getAttribLocation(p, 'a_position'),
    color: gl.getAttribLocation(p, 'a_color'),
    uniforms: uniforms(gl, p, [
      'eye',
      'viewForward',
      'viewRight',
      'viewUp',
      'origin',
      'right',
      'forward',
      'up',
      'tint',
      'focal',
      'aspect',
    ]),
    road: upload(roadMesh()),
    environment: upload(environmentMesh()),
    craft: upload(craftMesh()),
    flame: upload(flameMesh()),
    skyProgram,
    skyPosition: gl.getAttribLocation(skyProgram, 'a_position'),
    skyUniforms: uniforms(gl, skyProgram, [
      'viewForward',
      'viewRight',
      'viewUp',
      'focal',
      'aspect',
    ]),
    sky: buffer(gl, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])),
  };
}

export function prepareSpatialRenderer(): boolean {
  if (graphics.attempted) return spatialView.ready;
  graphics.attempted = true;
  const gl = el.spatialCanvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    powerPreference: 'default',
  });
  if (!gl) {
    spatialView.reason = '3D graphics are unavailable in this browser.';
    return false;
  }
  const restore = (): void => {
    try {
      graphics.renderer = initialize(gl);
      spatialView.ready = true;
      spatialView.lost = false;
      spatialView.reason = '';
    } catch (error) {
      spatialView.ready = false;
      spatialView.reason = error instanceof Error ? error.message : '3D graphics could not start';
    }
  };
  el.spatialCanvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    spatialView.lost = true;
    spatialView.ready = false;
  });
  el.spatialCanvas.addEventListener('webglcontextrestored', restore);
  restore();
  return spatialView.ready;
}

function solveSpatialCamera(demo: boolean): void {
  const s = demo ? game.demoS : player.s;
  const frame = sampleSpatial(s);
  const lateral = demo ? 0 : player.x;
  const blend = demo ? 0 : game.cameraBlend;
  const yaw = game.cameraYaw * blend;
  const forward = add(scale(frame.forward, Math.cos(yaw)), scale(frame.right, Math.sin(yaw)));
  const focus = offset(frame, lateral * (0.7 + 0.3 * blend), 12);
  spatialView.eye = add(
    focus,
    add(scale(forward, -132 - blend * 45), scale(frame.up, 64 - blend * 27)),
  );
  const target =
    blend > 0.05 ? offset(frame, lateral, 12) : offset(sampleSpatial(s + 105), lateral * 0.5, 5);
  spatialView.forward = normalize(sub(target, spatialView.eye));
  spatialView.right = normalize(cross(frame.up, spatialView.forward));
  spatialView.up = normalize(cross(spatialView.forward, spatialView.right));
  spatialView.fov = 1.05 + boostFX.amount * 0.12;
  camera.horizon = surface.h * 0.38;
}

function uniformVec(gl: WebGLRenderingContext, location: WebGLUniformLocation, p: Vec3): void {
  gl.uniform3f(location, p.x, p.y, p.z);
}
const TINTS = [vec(0.84, 0.96, 1), vec(1, 0.65, 0.94), vec(0.55, 1, 0.77), vec(1, 0.86, 0.45)];

export function drawSpatial(demo: boolean): void {
  const renderer = graphics.renderer;
  if (!renderer || !spatialView.ready) {
    surface.ctx.fillStyle = '#080e20';
    surface.ctx.fillRect(0, 0, surface.w, surface.h);
    surface.ctx.fillStyle = '#d5ff64';
    surface.ctx.font = '16px Arial';
    surface.ctx.textAlign = 'center';
    surface.ctx.fillText(
      spatialView.lost ? 'Restoring 3D graphics…' : spatialView.reason,
      surface.w / 2,
      surface.h / 2,
    );
    surface.ctx.textAlign = 'left';
    return;
  }
  solveSpatialCamera(demo);
  const { gl } = renderer;
  if (el.spatialCanvas.width !== surface.w || el.spatialCanvas.height !== surface.h) {
    el.spatialCanvas.width = surface.w;
    el.spatialCanvas.height = surface.h;
  }
  gl.viewport(0, 0, surface.w, surface.h);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const focal = 1 / Math.tan(spatialView.fov / 2);
  const view = (u: Record<string, WebGLUniformLocation>): void => {
    uniformVec(gl, u.viewForward, spatialView.forward);
    uniformVec(gl, u.viewRight, spatialView.right);
    uniformVec(gl, u.viewUp, spatialView.up);
    gl.uniform1f(u.focal, focal);
    gl.uniform1f(u.aspect, surface.w / surface.h);
  };
  gl.useProgram(renderer.skyProgram);
  view(renderer.skyUniforms);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.sky);
  gl.enableVertexAttribArray(renderer.skyPosition);
  gl.vertexAttribPointer(renderer.skyPosition, 2, gl.FLOAT, false, 0, 0);
  gl.depthMask(false);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.depthMask(true);
  gl.disableVertexAttribArray(renderer.skyPosition);
  gl.useProgram(renderer.program);
  const u = renderer.uniforms;
  view(u);
  uniformVec(gl, u.eye, spatialView.eye);
  gl.enableVertexAttribArray(renderer.position);
  gl.enableVertexAttribArray(renderer.color);
  const transform = (origin: Vec3, right: Vec3, forward: Vec3, up: Vec3, tint: Vec3): void => {
    uniformVec(gl, u.origin, origin);
    uniformVec(gl, u.right, right);
    uniformVec(gl, u.forward, forward);
    uniformVec(gl, u.up, up);
    uniformVec(gl, u.tint, tint);
  };
  const draw = (mesh: BufferMesh): void => {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.vertexAttribPointer(renderer.position, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(renderer.color, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  };
  transform(vec(), vec(1), vec(0, 1), vec(0, 0, 1), vec(1, 1, 1));
  draw(renderer.environment);
  draw(renderer.road);
  spatialView.drawnCraft = 0;
  const ship = (frame: Frame3, color: number, boosting: boolean, steer = 0): void => {
    if (
      dot(sub(frame, spatialView.eye), spatialView.forward) < -80 ||
      Math.hypot(
        frame.x - spatialView.eye.x,
        frame.y - spatialView.eye.y,
        frame.z - spatialView.eye.z,
      ) > 7000
    )
      return;
    const lean = steer * 0.09;
    const right = add(scale(frame.right, Math.cos(lean)), scale(frame.up, Math.sin(lean)));
    transform(
      offset(frame, 0, 4),
      right,
      frame.forward,
      cross(frame.forward, right),
      TINTS[color % 4],
    );
    draw(renderer.craft);
    transform(
      offset(frame, 0, 4),
      right,
      scale(frame.forward, boosting ? 1.5 : 1),
      frame.up,
      vec(1, 1, 1),
    );
    draw(renderer.flame);
    spatialView.drawnCraft++;
  };
  for (const r of online.racing ? remoteCraft : rivals) {
    const distance = demo && 'startS' in r ? game.demoS + r.startS : r.s;
    const lateral =
      demo && typeof r.id === 'number'
        ? skylineLaneAt(distance, (r.id - 1) % GRID_COLUMNS) * (skylineWidthAt(distance) - 24)
        : r.x;
    ship(sampleSpatial(distance, lateral), r.color, r.boosting);
  }
  ship(
    sampleSpatial(demo ? game.demoS : player.s, demo ? 0 : player.x),
    online.racing ? (online.racers.find((r) => r.id === online.id)?.slot ?? 0) : 0,
    player.boosting,
    player.steer,
  );
  gl.disableVertexAttribArray(renderer.position);
  gl.disableVertexAttribArray(renderer.color);
  surface.ctx.drawImage(el.spatialCanvas, 0, 0);
}

/** Rail sparks use the same 3D camera as the road and craft. */
export function projectSpatial(p: Vec3): { x: number; y: number } | null {
  const d = sub(p, spatialView.eye);
  const depth = dot(d, spatialView.forward);
  if (depth < 8) return null;
  const focal = surface.h / (2 * Math.tan(spatialView.fov / 2));
  return {
    x: clamp(surface.w / 2 + (dot(d, spatialView.right) * focal) / depth, -1000, surface.w + 1000),
    y: clamp(surface.h / 2 - (dot(d, spatialView.up) * focal) / depth, -1000, surface.h + 1000),
  };
}
