import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';
import { PAGE_CURL_DURATION, curlDisplacementMap, pageCurl } from './page-curl';

/** Native page snapshots with a corner curl; no recipe content is copied or stored. */
@Service()
export class PageTurnService {
  private readonly document = inject(DOCUMENT);
  private active?: ViewTransition;
  private release?: () => void;

  start({ transition, from, to }: ViewTransitionInfo): void {
    this.cancel();
    const previous = this.path(from);
    const next = this.path(to);
    const window = this.document.defaultView;
    if (
      !window ||
      previous === next ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      this.document.getElementById('main-content')?.inert
    ) {
      transition.skipTransition();
      return;
    }

    const filter = this.document.getElementById('book-page-curl');
    const image = this.document.getElementById('book-curl-image');
    const displacement = this.document.getElementById('book-curl-displacement');
    if (!filter || !image || !displacement) {
      transition.skipTransition();
      return;
    }

    const returning =
      next === '/' ||
      previous === '/settings' ||
      (previous === next + '/edit' && next !== '/recipes/new');
    const root = this.document.documentElement;
    const top = this.document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, window.innerHeight - top);
    const reference = (id: string) => new URL('#' + id, this.document.URL).href;
    // Absolute same-document references also work with the router's <base> element.
    const initial = pageCurl(width, height, 0);
    image.setAttribute('href', curlDisplacementMap(initial.nx, initial.ny));
    filter.setAttribute('width', String(width));
    filter.setAttribute('height', String(window.innerHeight));
    const properties = [
      '--book-turn-top',
      '--book-turn-clip',
      '--book-turn-reveal',
      '--book-turn-fold',
      '--book-turn-fold-width',
      '--book-turn-fold-length',
      '--book-turn-warp',
    ];
    let frame = 0;
    this.active = transition;
    this.release = () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', cancel);
      this.document.removeEventListener('visibilitychange', hidden);
      displacement.setAttribute('scale', '0');
      root.removeAttribute('data-book-turn');
      for (const property of properties) root.style.removeProperty(property);
    };
    const cancel = () => this.cancel();
    const hidden = () => {
      if (this.document.hidden) this.cancel();
    };
    window.addEventListener('resize', cancel, { passive: true });
    this.document.addEventListener('visibilitychange', hidden);
    root.setAttribute('data-book-turn', returning ? 'back' : 'forward');
    root.style.setProperty('--book-turn-top', top + 'px');
    root.style.setProperty('--book-turn-warp', 'url("' + reference('book-page-curl') + '")');

    const polygon = (points: number[][]) =>
      'polygon(' +
      points.map(([x, y]) => x.toFixed(2) + 'px ' + (y + top).toFixed(2) + 'px').join(',') +
      ')';
    const draw = (progress: number) => {
      const curl = pageCurl(width, height, progress);
      root.style.setProperty('--book-turn-clip', polygon(curl.clip));
      root.style.setProperty('--book-turn-reveal', polygon(curl.reveal));
      root.style.setProperty('--book-turn-fold-width', curl.foldWidth + 'px');
      root.style.setProperty('--book-turn-fold-length', curl.length + 'px');
      root.style.setProperty(
        '--book-turn-fold',
        'translate(' +
          curl.centerX +
          'px,' +
          (curl.centerY + top) +
          'px) rotate(' +
          curl.angle +
          'deg) translate(' +
          -curl.foldWidth * 0.8 +
          'px,' +
          -curl.length / 2 +
          'px)',
      );
      const size = Math.max(0.01, curl.radius * 16);
      image.setAttribute('x', String(curl.nx * curl.distance - size / 2));
      image.setAttribute('y', String(top + curl.ny * curl.distance - size / 2));
      image.setAttribute('width', String(size));
      image.setAttribute('height', String(size));
      displacement.setAttribute('scale', String(curl.radius * 2));
    };
    draw(returning ? 1 : 0);
    const clear = () => {
      if (this.active !== transition) return;
      this.release?.();
      this.release = undefined;
      this.active = undefined;
    };
    void transition.ready.then(() => {
      if (this.active !== transition) return;
      // Navigation has now changed the document URL; keep SVG references local.
      root.style.setProperty('--book-turn-warp', 'url("' + reference('book-page-curl') + '")');
      const started = window.performance.now();
      const tick = (now: number) => {
        if (this.active !== transition) return;
        const time = Math.min(1, Math.max(0, (now - started) / PAGE_CURL_DURATION));
        const eased = time * time * (3 - 2 * time);
        draw(returning ? 1 - eased : eased);
        if (time < 1) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }, clear);
    void transition.finished.then(clear, clear);
  }

  cancel(): void {
    if (!this.active) return;
    this.active.skipTransition();
    this.release?.();
    this.release = undefined;
    this.active = undefined;
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
