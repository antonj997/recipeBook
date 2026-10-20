import { Service, signal } from '@angular/core';

export type TimerRulerMode = 'swipe' | 'edge';
const storageKey = 'recipebook:timer-ruler-mode:v1';

/** Temporary device-only setting for comparing two independent ruler gestures. */
@Service()
export class TimerRulerPreferencesService {
  private readonly value = signal<TimerRulerMode>(readMode());
  readonly mode = this.value.asReadonly();

  setMode(mode: TimerRulerMode): void {
    this.value.set(mode);
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      // The current session still switches when device storage is unavailable.
    }
  }
}

function readMode(): TimerRulerMode {
  try {
    return localStorage.getItem(storageKey) === 'edge' ? 'edge' : 'swipe';
  } catch {
    return 'swipe';
  }
}
