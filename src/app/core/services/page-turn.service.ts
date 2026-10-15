import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';
import { PAGE_CURL_DURATION, pageCurl } from './page-curl';
import { PageTransitionPreferencesService } from './page-transition-preferences.service';

export type RecipeTransitionPart = 'surface' | 'image' | 'title' | 'time' | 'categories';

/** Native curl or shared-recipe expansion; no recipe DOM is copied or stored. */
@Service()
export class PageTurnService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(PageTransitionPreferencesService);
  private morphRecipeId: string | null = null;
  private returningToLibrary = false;
  private expandOrigin?: HTMLElement;
  private readonly parts = new Map<
    HTMLElement,
    {
      recipeId: string;
      part: RecipeTransitionPart;
      previousName: string;
    }
  >();

  registerPart(element: HTMLElement, recipeId: string, part: RecipeTransitionPart): () => void {
    const previousName = element.style.getPropertyValue('view-transition-name');
    this.parts.set(element, { recipeId, part, previousName });
    this.captureCorners(element, 'to');
    if (part === 'surface' && recipeId === this.morphRecipeId && this.returningToLibrary)
      this.expandOrigin = element;
    this.namePart(element);
    return () => {
      this.parts.delete(element);
      if (this.expandOrigin === element) this.expandOrigin = undefined;
      if (previousName) element.style.setProperty('view-transition-name', previousName);
      else element.style.removeProperty('view-transition-name');
    };
  }

  /** Native snapshots lose ancestor clipping, so preserve only the corners touching a clipped edge. */
  private captureCorners(element: HTMLElement, end: 'from' | 'to'): void {
    const participant = this.parts.get(element);
    const window = this.document.defaultView;
    if (
      !window ||
      !participant ||
      participant.recipeId !== this.morphRecipeId ||
      !['surface', 'image'].includes(participant.part)
    )
      return;
    const properties = [
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomRightRadius',
      'borderBottomLeftRadius',
    ] as const;
    const style = window.getComputedStyle(element);
    const corners = properties.map((property) => style[property]);
    const bounds = this.layoutBounds(element);
    const touches = (a: number, b: number) => Math.abs(a - b) < 1;
    let parent = participant.part === 'image' ? element.parentElement : null;
    const boundary = this.document.getElementById('main-content');
    while (parent && parent !== boundary) {
      const style = window.getComputedStyle(parent);
      if (
        ['hidden', 'clip'].includes(style.overflowX) ||
        ['hidden', 'clip'].includes(style.overflowY)
      ) {
        const outer = this.layoutBounds(parent);
        const borders = [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ].map((width) => parseFloat(width) || 0);
        const edge = {
          top: outer.top + borders[0],
          right: outer.right - borders[1],
          bottom: outer.bottom - borders[2],
          left: outer.left + borders[3],
        };
        const matches = [
          touches(bounds.top, edge.top) && touches(bounds.left, edge.left),
          touches(bounds.top, edge.top) && touches(bounds.right, edge.right),
          touches(bounds.bottom, edge.bottom) && touches(bounds.right, edge.right),
          touches(bounds.bottom, edge.bottom) && touches(bounds.left, edge.left),
        ];
        properties.forEach((property, index) => {
          const inset = Math.max(borders[index], borders[(index + 3) % 4]);
          const radius = Math.max(0, parseFloat(style[property]) - inset);
          if (matches[index] && radius > parseFloat(corners[index])) corners[index] = radius + 'px';
        });
      }
      parent = parent.parentElement;
    }
    const root = this.document.documentElement.style;
    root.setProperty('--book-' + participant.part + '-corners-' + end, corners.join(' '));
    if (end === 'from')
      root.setProperty('--book-' + participant.part + '-corners-to', corners.join(' '));
  }

  /** Compare layout edges before perspective tilt; projected bounding boxes distort corner alignment. */
  private layoutBounds(element: HTMLElement) {
    let left = 0;
    let top = 0;
    let offset: HTMLElement | null = element;
    while (offset) {
      left += offset.offsetLeft;
      top += offset.offsetTop;
      offset = offset.offsetParent as HTMLElement | null;
      if (offset) {
        left += offset.clientLeft;
        top += offset.clientTop;
      }
    }
    return { left, top, right: left + element.offsetWidth, bottom: top + element.offsetHeight };
  }

  /** Measure where the recipe color opens while shared layers stay independent. */
  private measureExpandOrigin(element: HTMLElement): void {
    const window = this.document.defaultView;
    if (!window) return;
    const root = this.document.documentElement;
    const bounds = element.getBoundingClientRect();
    const colorSource =
      element.querySelector<HTMLElement>('.index-image') ??
      element.closest<HTMLElement>('.recipe-intro') ??
      element;
    const color = window.getComputedStyle(colorSource).backgroundColor;
    // List rows fill from their visible color strip before the page starts expanding.
    const strip = !this.returningToLibrary
      ? element.querySelector<HTMLElement>('.index-color')
      : null;
    if (strip) {
      const edge = strip.getBoundingClientRect();
      root.setAttribute('data-expand-list', '');
      root.style.setProperty(
        '--book-list-strip-inset',
        Math.max(0, edge.top) +
          'px ' +
          Math.max(0, root.clientWidth - edge.right) +
          'px ' +
          Math.max(0, window.innerHeight - edge.bottom) +
          'px ' +
          Math.max(0, edge.left) +
          'px',
      );
    }
    if (color) root.style.setProperty('--book-expand-color', color);
    const clamp = (value: number, limit: number) => Math.max(0, Math.min(limit, value));
    const left = clamp(bounds.left, root.clientWidth);
    const right = clamp(bounds.right, root.clientWidth);
    const top = clamp(bounds.top, window.innerHeight);
    const bottom = clamp(bounds.bottom, window.innerHeight);
    root.style.setProperty(
      '--book-expand-origin',
      (left + right) / 2 + 'px ' + (top + bottom) / 2 + 'px',
    );
    root.style.setProperty(
      '--book-expand-inset',
      top +
        'px ' +
        (root.clientWidth - right) +
        'px ' +
        (window.innerHeight - bottom) +
        'px ' +
        left +
        'px',
    );
  }

  private namePart(element: HTMLElement): void {
    const participant = this.parts.get(element);
    if (!participant) return;
    if (participant.recipeId === this.morphRecipeId)
      element.style.setProperty('view-transition-name', 'book-recipe-' + participant.part);
    else if (participant.previousName)
      element.style.setProperty('view-transition-name', participant.previousName);
    else element.style.removeProperty('view-transition-name');
  }
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

    if (this.preferences.mode() === 'expand') {
      this.expand(
        transition,
        previous,
        next,
        window,
        previous === '/' ? to : next === '/' ? from : null,
      );
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
    const properties = [
      '--book-turn-top',
      '--book-turn-clip',
      '--book-turn-reveal',
      '--book-turn-fold',
      '--book-turn-fold-width',
      '--book-turn-fold-length',
    ];
    let frame = 0;
    this.active = transition;
    this.release = () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', cancel);
      this.document.removeEventListener('visibilitychange', hidden);
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

  private expand(
    transition: ViewTransition,
    previous: string,
    next: string,
    window: Window,
    recipeRoute: ActivatedRouteSnapshot | null,
  ): void {
    const root = this.document.documentElement;
    while (recipeRoute?.firstChild) recipeRoute = recipeRoute.firstChild;
    const id =
      recipeRoute?.routeConfig?.path === 'recipes/:id' ? recipeRoute.paramMap.get('id') : null;
    this.morphRecipeId =
      id && [...this.parts.values()].some((part) => part.recipeId === id) ? id : null;
    this.returningToLibrary = next === '/';
    this.expandOrigin = [...this.parts].find(
      ([, part]) => part.recipeId === this.morphRecipeId && part.part === 'surface',
    )?.[0];
    if (this.expandOrigin) this.measureExpandOrigin(this.expandOrigin);
    for (const element of this.parts.keys()) {
      this.captureCorners(element, 'from');
      this.namePart(element);
    }
    root.setAttribute('data-page-transition', 'expand');
    if (this.morphRecipeId) root.setAttribute('data-recipe-morph', '');
    if (next === '/' || previous === '/settings') root.setAttribute('data-expand-back', '');
    this.active = transition;
    const cancel = () => this.cancel();
    const hidden = () => {
      if (this.document.hidden) this.cancel();
    };
    window.addEventListener('resize', cancel, { passive: true });
    this.document.addEventListener('visibilitychange', hidden);
    this.release = () => {
      window.removeEventListener('resize', cancel);
      this.document.removeEventListener('visibilitychange', hidden);
      this.morphRecipeId = null;
      this.returningToLibrary = false;
      this.expandOrigin = undefined;
      root.style.removeProperty('--book-expand-color');
      root.style.removeProperty('--book-expand-origin');
      root.style.removeProperty('--book-expand-inset');
      root.style.removeProperty('--book-list-strip-inset');
      for (const element of this.parts.keys()) this.namePart(element);
      for (const part of ['surface', 'image'])
        for (const end of ['from', 'to'])
          root.style.removeProperty('--book-' + part + '-corners-' + end);
      for (const attribute of [
        'data-page-transition',
        'data-recipe-morph',
        'data-expand-back',
        'data-expand-list',
      ])
        root.removeAttribute(attribute);
    };
    const clear = () => {
      if (this.active !== transition) return;
      this.release?.();
      this.release = undefined;
      this.active = undefined;
    };
    void transition.ready.then(() => {
      // The carousel/list restores its position before capture. Read the landing bounds afterwards.
      if (this.active !== transition || !this.returningToLibrary || !this.morphRecipeId) return;
      if (!this.expandOrigin || !this.parts.has(this.expandOrigin)) {
        // A filter or deletion can remove the destination. Finish normally before painting a false target.
        this.cancel();
        return;
      }
      this.measureExpandOrigin(this.expandOrigin);
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
