import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

/** Short native page turns; navigation and storage remain independent of motion. */
@Service()
export class PageTurnService {
  private readonly document = inject(DOCUMENT);
  private active?: ViewTransition;

  start({ transition, from, to }: ViewTransitionInfo): void {
    this.cancel();
    const previous = this.path(from);
    const next = this.path(to);
    const reducedMotion = this.document.defaultView?.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const changingAccount = this.document.getElementById('main-content')?.inert;

    if (previous === next || reducedMotion || changingAccount) {
      transition.skipTransition();
      return;
    }

    const returning =
      next === '/' ||
      previous === '/settings' ||
      (previous === next + '/edit' && next !== '/recipes/new');
    this.active = transition;
    this.document.documentElement.setAttribute('data-book-turn', returning ? 'back' : 'forward');
    const clear = () => {
      // An interrupted turn must not clear the next navigation's direction.
      if (this.active !== transition) return;
      this.active = undefined;
      this.document.documentElement.removeAttribute('data-book-turn');
    };
    void transition.finished.then(clear, clear);
  }

  cancel(): void {
    this.active?.skipTransition();
    this.active = undefined;
    this.document.documentElement.removeAttribute('data-book-turn');
  }

  private path(snapshot: ActivatedRouteSnapshot): string {
    const segments: string[] = [];
    let route: ActivatedRouteSnapshot | null = snapshot;
    while (route) {
      segments.push(...route.url.map((segment) => segment.path));
      route = route.firstChild;
    }
    return '/' + segments.join('/');
  }
}
