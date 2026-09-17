import { touch } from '../sim/state';
import { touchButtons } from './dom';

/** Releases every touch control. Used on blur, pause and mode changes. */
export function clearTouch(): void {
  for (const k of Object.keys(touch) as Array<keyof typeof touch>) touch[k] = false;
  for (const b of touchButtons) b.classList.remove('active');
}
