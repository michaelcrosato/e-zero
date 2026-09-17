/**
 * Typed handles for every element the game drives.
 *
 * Resolved once at startup and asserted non-null, so a mismatch between the
 * markup and the code fails loudly at boot instead of silently no-op-ing
 * somewhere deep in the render loop.
 */

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`E-Zero: required element #${id} is missing from the document.`);
  return node as T;
}

export const el = {
  app: required('app'),
  stage: required('stage'),
  screen: required<HTMLCanvasElement>('screen'),
  minimap: required<HTMLCanvasElement>('minimap'),

  hud: required('hud'),
  positionValue: required('positionValue'),
  fieldStatus: required('fieldStatus'),
  powerValue: required('powerValue'),
  powerFill: required('powerFill'),
  lapLabel: required('lapLabel'),
  lapSplit: required('lapSplit'),
  clockLabel: required('clockLabel'),
  clock: required('clock'),
  bestTime: required('bestTime'),
  lapClock: required('lapClock'),
  distanceLabel: required('distanceLabel'),
  speedValue: required('speedValue'),
  boostState: required('boostState'),
  boostLabel: required('boostLabel'),
  boostMeter: required('boostMeter'),
  boostCallout: required('boostCallout'),
  driveHint: required('driveHint'),
  raceMessage: required('raceMessage'),
  countdown: required('countdown'),
  progressFill: required('progressFill'),
  damageFlash: required('damageFlash'),

  titleOverlay: required('titleOverlay'),
  startButton: required<HTMLButtonElement>('startButton'),

  pauseOverlay: required('pauseOverlay'),
  pauseButton: required<HTMLButtonElement>('pauseButton'),
  resumeButton: required<HTMLButtonElement>('resumeButton'),
  restartPause: required<HTMLButtonElement>('restartPause'),
  quitPause: required<HTMLButtonElement>('quitPause'),

  resultOverlay: required('resultOverlay'),
  resultEyebrow: required('resultEyebrow'),
  resultTitle: required('resultTitle'),
  resultTime: required('resultTime'),
  resultSpeed: required('resultSpeed'),
  resultPower: required('resultPower'),
  recordTag: required('recordTag'),
  retryButton: required<HTMLButtonElement>('retryButton'),
  menuButton: required<HTMLButtonElement>('menuButton'),

  finishDock: required('finishDock'),
  dockPlace: required('dockPlace'),
  dockTime: required('dockTime'),
  dockNote: required('dockNote'),
  continueButton: required<HTMLButtonElement>('continueButton'),
  exitButton: required<HTMLButtonElement>('exitButton'),

  freeControls: required('freeControls'),
  autoButton: required<HTMLButtonElement>('autoButton'),
  freeExitButton: required<HTMLButtonElement>('freeExitButton'),

  cinemaTag: required('cinemaTag'),
  loading: required('loading'),
  announcer: required('announcer'),

  soundButton: required<HTMLButtonElement>('soundButton'),
  soundLabel: required('soundLabel'),
  raceMusic: required<HTMLAudioElement>('raceMusic'),
} as const;

/** The boost touch button, which also lights up while boosting. */
export const boostTouchButton = document.querySelector<HTMLElement>('[data-control="boost"]');

/** All touch control buttons. */
export const touchButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-control]'));
