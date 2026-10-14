import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';

export type PageTransitionMode = 'curl' | 'expand';
const storageKey = 'recipebook:page-animation';

/** A device preference, independent of account and cookbook data. */
@Service()
export class PageTransitionPreferencesService {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly selection = signal<PageTransitionMode>(this.read());
  readonly mode = this.selection.asReadonly();
  readonly options = [
    { value: 'curl', label: 'Page curl' },
    { value: 'expand', label: 'Expand' },
  ];

  choose(value: string): void {
    if (value !== 'curl' && value !== 'expand') return;
    this.selection.set(value);
    try {
      this.window?.localStorage.setItem(storageKey, value);
    } catch {
      /* Keep the preference for this session when storage is unavailable. */
    }
  }

  private read(): PageTransitionMode {
    try {
      return this.window?.localStorage.getItem(storageKey) === 'expand' ? 'expand' : 'curl';
    } catch {
      return 'curl';
    }
  }
}
