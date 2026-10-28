// Slow motion (test) stretches every animation on this device so motion can be judged on a phone.
const storageKey = 'recipebook:slow-motion:v1';
const slowFactor = 5;
let scale = read() ? slowFactor : 1;

export function slowMotion(): boolean {
  return scale !== 1;
}

/** A duration for script timers that wait on CSS motion, stretched like the CSS tokens. */
export function motionMs(milliseconds: number): number {
  return milliseconds * scale;
}

/** Copies the device choice onto the root element, where `--motion-scale` multiplies the tokens. */
export function applyMotionScale(): void {
  apply(read());
}

export function setSlowMotion(on: boolean): void {
  try {
    if (on) localStorage.setItem(storageKey, '1');
    else localStorage.removeItem(storageKey);
  } catch {
    // The choice still applies until the page reloads.
  }
  apply(on);
}

function apply(on: boolean): void {
  scale = on ? slowFactor : 1;
  const root = document.documentElement.style;
  if (on) root.setProperty('--motion-scale', String(slowFactor));
  else root.removeProperty('--motion-scale');
}

function read(): boolean {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}
