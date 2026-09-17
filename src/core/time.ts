/** Formats seconds as MM:SS.cc, the format used by every clock in the HUD. */
export function formatTime(t: number): string {
  const cs = Math.floor(t * 100);
  return (
    String(Math.floor(cs / 6000)).padStart(2, '0') +
    ':' +
    String(Math.floor(cs / 100) % 60).padStart(2, '0') +
    '.' +
    String(cs % 100).padStart(2, '0')
  );
}
