/**
 * Entry point.
 *
 * Build order matters: the terrain bake and the sky generation draw from the
 * same deterministic stream, so they run here in a fixed sequence rather than
 * as import-time side effects, where module resolution order would decide it.
 */
import './style.css';

import { random } from './core/rng';
import { startLoop } from './core/loop';
import { installDiagnostics } from './diagnostics';
import { syncModeUI } from './game/flow';
import { drawMinimap } from './render/minimap';
import { render } from './render/renderer';
import { initSky } from './render/sky';
import { rebuildBoostEdge } from './render/sprites';
import { surface } from './render/surface';
import { initTerrain } from './track/terrain';
import { update } from './sim/update';
import { el } from './ui/dom';
import { refreshBest } from './ui/hud';
import { bindInput } from './ui/input';
import { bindOnline } from './ui/online';
import { bindViewport, resizeViewport } from './ui/viewport';

function boot(): void {
  // 1. World generation, in the order the deterministic stream expects.
  initTerrain(random);
  initSky(random);

  // 2. Resolution-dependent buffers.
  rebuildBoostEdge(surface.w, surface.h);

  // 3. Wire the DOM.
  bindViewport();
  bindInput();
  refreshBest();

  // 4. First frame.
  resizeViewport();
  syncModeUI();
  bindOnline();
  el.loading.classList.add('hidden');
  drawMinimap();
  render();

  // 5. Run.
  const loop = startLoop(update, render);
  installDiagnostics(loop);
}

boot();
