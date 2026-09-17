/**
 * Craft liveries.
 *
 * Pure data with no canvas dependency, so the simulation can assign colours to
 * rivals without pulling in sprite generation.
 */

export interface ShipPalette {
  body: string;
  mid: string;
  dark: string;
  light: string;
  glass: string;
  accent: string;
}

/** Hues used to generate the rest of the grid beyond the four hand-picked liveries. */
const GENERATED_HUES = [8, 25, 54, 84, 153, 180, 205, 229, 266, 296, 322, 345];

export const shipPalettes: ShipPalette[] = [
  {
    body: '#d3edff',
    mid: '#438aca',
    dark: '#1d3565',
    light: '#91f5ff',
    glass: '#123456',
    accent: '#ed6894',
  },
  {
    body: '#eed2ff',
    mid: '#ba68ca',
    dark: '#512454',
    light: '#ff95e0',
    glass: '#372153',
    accent: '#ffce88',
  },
  {
    body: '#b4ffdf',
    mid: '#35b8a2',
    dark: '#185264',
    light: '#8ffff0',
    glass: '#183851',
    accent: '#f5e98f',
  },
  {
    body: '#ffeeb1',
    mid: '#df9b44',
    dark: '#6d3c41',
    light: '#ffffc4',
    glass: '#394159',
    accent: '#ff8175',
  },
  ...GENERATED_HUES.map((hue) => ({
    body: `hsl(${hue} 86% 82%)`,
    mid: `hsl(${hue} 62% 52%)`,
    dark: `hsl(${hue} 48% 25%)`,
    light: `hsl(${hue} 95% 89%)`,
    glass: '#172c4b',
    accent: `hsl(${(hue + 155) % 360} 90% 76%)`,
  })),
];
