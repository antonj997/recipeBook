import { DestroyRef, inject, Service, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/** The page shown before the current one, so a back control can return to where you came from. */
@Service()
export class NavigationHistoryService {
  private readonly previous = signal<string | null>(null);
  /** Path of the previous page (no query or fragment); null on the first page. */
  readonly previousPath = this.previous.asReadonly();
  private current: string | null = null;

  constructor() {
    const subscription = inject(Router).events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      this.previous.set(this.current);
      this.current = event.urlAfterRedirects.split(/[?#]/)[0];
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
