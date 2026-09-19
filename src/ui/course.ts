import './course.css';
import { resetPlayer } from '../game/flow';
import { prepareSpatialRenderer } from '../render/spatial-renderer';
import { game, loadBest } from '../sim/state';
import { course, courseNames, isCourse, type CourseId } from '../track/course';
import { total } from '../track/spline';
import { el } from './dom';
import { refreshBest } from './hud';
import { resetRivals } from '../sim/rivals';

/** Also used when a guest receives the host's course selection. */
export function selectCourse(id: CourseId): boolean {
  if (id === 'skyline' && !prepareSpatialRenderer()) {
    el.courseNote.textContent = '3D graphics unavailable. Neon Harbor Classic is still playable.';
    el.courseSelect.value = course.id;
    return false;
  }
  course.id = id;
  resetRivals();
  el.courseSelect.value = id;
  game.best = loadBest();
  game.demoS = id === 'classic' ? total * 0.085 : 0;
  el.courseNote.textContent =
    id === 'skyline'
      ? '12 SECTIONS · 9-LANE START · HILLS, LOOPS & BANKING'
      : 'THE ORIGINAL FLAT CIRCUIT';
  el.courseLabel.textContent = courseNames[id];
  el.mapTitle.textContent = courseNames[id] + (id === 'skyline' ? ' / 02' : ' / 01');
  refreshBest();
  return true;
}

export function bindCourse(): void {
  const requested = new URL(location.href).searchParams.get('course');
  if (!selectCourse(isCourse(requested) ? requested : 'skyline')) {
    const reason = el.courseNote.textContent;
    selectCourse('classic');
    el.courseNote.textContent = reason;
  }
  el.courseSelect.addEventListener('change', () => {
    if (game.mode !== 'title' || !isCourse(el.courseSelect.value)) return;
    if (selectCourse(el.courseSelect.value)) resetPlayer();
    el.startButton.focus();
  });
}
