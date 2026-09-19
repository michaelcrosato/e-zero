import './view.css';
import { syncModeUI } from '../game/flow';
import {
  drivingView,
  isViewMode,
  viewModes,
  viewNames,
  type ViewMode,
} from '../render/driving-view';
import { sparkParticles, boostFX, held, touch } from '../sim/state';
import { announce } from './announce';
import { el } from './dom';

const VIEW_KEY = 'e-zero-driving-view';

function setView(mode: ViewMode, announceChange = true): void {
  drivingView.mode = mode;
  drivingView.lookYaw = 0;
  held.delete('KeyQ');
  held.delete('KeyE');
  touch.lookLeft = touch.lookRight = false;
  // These coordinates belong to the previous projection.
  sparkParticles.length = 0;
  boostFX.particles.length = 0;
  el.viewSelect.value = mode;
  el.cameraButton.textContent = viewNames[mode].toUpperCase() + ' · V';
  el.cameraButton.setAttribute('aria-label', `Camera: ${viewNames[mode]}. Change view (V)`);
  el.app.dataset.view = mode;
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* Session preference still works. */
  }
  syncModeUI();
  if (announceChange)
    announce(
      `${viewNames[mode]} view.${mode === 'chase' ? '' : ' Hold Q or E to look left or right.'}`,
    );
}

export function cycleView(): void {
  setView(viewModes[(viewModes.indexOf(drivingView.mode) + 1) % viewModes.length]);
}

export function bindView(): void {
  let initial: ViewMode = 'chase';
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (isViewMode(saved)) initial = saved;
  } catch {
    /* Storage is optional. */
  }
  setView(initial, false);
  el.viewSelect.addEventListener('change', () => {
    if (isViewMode(el.viewSelect.value)) setView(el.viewSelect.value);
  });
  el.cameraButton.addEventListener('click', cycleView);
}
