import { el } from './dom';

/** Sends a message to the screen-reader live region. */
export function announce(text: string): void {
  el.announcer.textContent = text;
}
