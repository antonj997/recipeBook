import { prepareTransitionPhotos } from './transition-photos';
import { expansionOrigin, titleLayout, visibleCorners } from './recipe-transition-layout';
import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';
import type { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

export type RecipeTransitionPart =
  | 'surface'
  | 'image'
  | 'title'
  | 'time'
  | 'categories'
  | 'controls'
  | 'navigation'
  | 'description'
  | 'card-description'
  | 'reading';

/** One native shared-recipe transition; no recipe DOM is copied or stored. */
@Service()
export class PageTransitionService {
  private readonly document = inject(DOCUMENT);
  readonly openingRecipe = signal(false);
  private titleFontFrom = 0;
  private morphRecipeId: string | null = null;
  private returningToLibrary = false;
  private expandOrigin?: HTMLElement;
  private readonly titleWords = new Map<HTMLElement, Map<HTMLElement, string>>();
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
    this.applyLayout(this.readLayout(element), 'to');
    if (part === 'surface' && recipeId === this.morphRecipeId && this.returningToLibrary)
      this.expandOrigin = element;
    this.namePart(element);
    return () => {
      this.clearTitleWords(element);
      this.parts.delete(element);
      if (this.expandOrigin === element) this.expandOrigin = undefined;
      if (previousName) element.style.setProperty('view-transition-name', previousName);
      else element.style.removeProperty('view-transition-name');
    };
  }

  private readLayout(element: HTMLElement) {
    const participant = this.parts.get(element);
    const window = this.document.defaultView;
    if (!window || participant?.recipeId !== this.morphRecipeId) return null;
    const part = participant.part;
    return {
      part,
      title: part === 'title' ? titleLayout(element, window) : null,
      corners:
        part === 'surface' || part === 'image'
          ? visibleCorners(
              element,
              part === 'image',
              window,
              this.document.getElementById('main-content'),
            )
          : null,
    };
  }

  private applyLayout(
    layout: ReturnType<PageTransitionService['readLayout']>,
    end: 'from' | 'to',
  ): void {
    if (!layout) return;
    const style = this.document.documentElement.style;
    if (layout.corners !== null) {
      style.setProperty('--book-' + layout.part + '-corners-' + end, layout.corners);
      if (end === 'from')
        style.setProperty('--book-' + layout.part + '-corners-to', layout.corners);
    }
    if (!layout.title) return;
    const { width, height, font } = layout.title;
    if (end === 'from') this.titleFontFrom = font;
    style.setProperty('--book-title-width-' + end, width + 'px');
    style.setProperty('--book-title-height-' + end, height + 'px');
    if (end === 'from') {
      style.setProperty('--book-title-width-to', width + 'px');
      style.setProperty('--book-title-height-to', height + 'px');
    }
    style.setProperty('--book-title-old-scale', String(font / (this.titleFontFrom || font)));
    style.setProperty('--book-title-new-scale', String((this.titleFontFrom || font) / font));
  }

  private measureExpandOrigin(element: HTMLElement): void {
    const window = this.document.defaultView;
    if (!window) return;
    const root = this.document.documentElement;
    const origin = expansionOrigin(element, window, root.clientWidth, this.returningToLibrary);
    if (origin.stripInset) {
      root.setAttribute('data-expand-list', '');
      root.style.setProperty('--book-list-strip-inset', origin.stripInset);
    }
    if (origin.color) root.style.setProperty('--book-expand-color', origin.color);
    root.style.setProperty('--book-expand-inset', origin.inset);
  }

  private namePart(element: HTMLElement): void {
    const participant = this.parts.get(element);
    if (!participant) return;
    if (participant.part === 'title') {
      this.clearTitleWords(element);
      if (participant.recipeId === this.morphRecipeId) this.nameTitleWords(element);
    }
    if (participant.recipeId === this.morphRecipeId)
      element.style.setProperty('view-transition-name', 'book-recipe-' + participant.part);
    else if (participant.previousName)
      element.style.setProperty('view-transition-name', participant.previousName);
    else element.style.removeProperty('view-transition-name');
  }

  private nameTitleWords(title: HTMLElement): void {
    // Older View Transition implementations retain the whole-title crossfade fallback.
    if (typeof CSS === 'undefined' || !CSS.supports('view-transition-class: book-title-word'))
      return;
    const words = title.querySelectorAll<HTMLElement>('[data-title-word]');
    if (!words.length || words.length > 48) return;
    const frame = title.getBoundingClientRect();
    const names = new Map<HTMLElement, string>();
    // Batch every word's bounds before assigning snapshot names; avoid a style flush per word.
    const visible = [...words].filter((word) => {
      const bounds = word.getBoundingClientRect();
      return bounds.top >= frame.top - 1 && bounds.bottom <= frame.bottom + 1;
    });
    for (const word of visible) {
      names.set(word, word.style.getPropertyValue('view-transition-name'));
      word.style.setProperty(
        'view-transition-name',
        'book-title-word-' + word.getAttribute('data-title-word'),
      );
    }
    this.titleWords.set(title, names);
  }

  private clearTitleWords(title: HTMLElement): void {
    const names = this.titleWords.get(title);
    if (!names) return;
    for (const [word, previous] of names) {
      if (previous) word.style.setProperty('view-transition-name', previous);
      else word.style.removeProperty('view-transition-name');
    }
    this.titleWords.delete(title);
  }
  private active?: ViewTransition;
  private release?: () => void;

  start({ transition, from, to }: ViewTransitionInfo): void {
    // A replacement owns the next snapshot immediately. Old promise callbacks cannot clear it.
    if (this.active) {
      this.active.skipTransition();
      this.finish(this.active);
    }
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
    this.openingRecipe.set(/^\/recipes\/[^/]+$/.test(next));
    this.expand(
      transition,
      previous,
      next,
      window,
      previous === '/' ? to : next === '/' ? from : null,
    );
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
    const sourcePhoto = [...this.parts].find(
      ([, part]) => part.recipeId === this.morphRecipeId && part.part === 'image',
    )?.[0] as HTMLImageElement | undefined;
    if (sourcePhoto?.tagName === 'IMG' && sourcePhoto.complete && sourcePhoto.naturalWidth)
      root.setAttribute('data-book-photo-source', '');
    this.returningToLibrary = next === '/';
    this.expandOrigin = [...this.parts].find(
      ([, part]) => part.recipeId === this.morphRecipeId && part.part === 'surface',
    )?.[0];
    if (this.expandOrigin) this.measureExpandOrigin(this.expandOrigin);
    const layouts = [...this.parts.keys()].map((element) => this.readLayout(element));
    for (const layout of layouts) this.applyLayout(layout, 'from');
    for (const element of this.parts.keys()) this.namePart(element);
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
      this.titleFontFrom = 0;
      this.openingRecipe.set(false);
      this.returningToLibrary = false;
      this.expandOrigin = undefined;
      root.style.removeProperty('--book-expand-color');
      root.style.removeProperty('--book-expand-inset');
      root.style.removeProperty('--book-list-strip-inset');
      for (const element of this.parts.keys()) this.namePart(element);
      for (const part of ['surface', 'image'])
        for (const end of ['from', 'to'])
          root.style.removeProperty('--book-' + part + '-corners-' + end);
      for (const property of [
        'width-from',
        'height-from',
        'width-to',
        'height-to',
        'old-scale',
        'new-scale',
      ])
        root.style.removeProperty('--book-title-' + property);
      for (const attribute of [
        'data-page-transition',
        'data-recipe-morph',
        'data-expand-back',
        'data-expand-list',
        'data-book-photo-source',
        'data-book-photo-ready',
        'data-book-photo-preparing',
      ])
        root.removeAttribute(attribute);
    };
    const clear = () => this.finish(transition);
    void transition.ready.then(
      () => {
        if (this.active !== transition) return;
        const photos = [...this.parts]
          .filter(
            ([element, part]) =>
              part.recipeId === this.morphRecipeId &&
              part.part === 'image' &&
              element.tagName === 'IMG',
          )
          .map(([element]) => element as HTMLImageElement);
        if (photos.length) {
          // Avoid getAnimations(): Safari can crash sorting animations whose route
          // elements were just removed. CSS pauses only the snapshot pseudo-elements.
          root.setAttribute('data-book-photo-preparing', '');
          void prepareTransitionPhotos(photos, transition)
            .then((ready) => {
              // Never replace the source mid-flight. The decoded target only blends in
              // at landing, with the opaque source still underneath until finished.
              if (this.active !== transition) return;
              if (ready) root.setAttribute('data-book-photo-ready', '');
              root.removeAttribute('data-book-photo-preparing');
            })
            .catch(() => {
              if (this.active === transition) this.cancel();
            });
        }
        // The carousel/list restores its position before capture. Read the landing bounds afterwards.
        if (this.active !== transition || !this.returningToLibrary || !this.morphRecipeId) return;
        if (!this.expandOrigin || !this.parts.has(this.expandOrigin)) {
          // A filter or deletion can remove the destination. Finish normally before painting a false target.
          this.cancel();
          return;
        }
        this.measureExpandOrigin(this.expandOrigin);
      },
      () => undefined,
    );
    void transition.finished.then(clear, clear);
  }

  /** Skipping still runs the route update. Keep snapshot CSS until the browser has finished. */
  cancel(): void {
    this.active?.skipTransition();
  }

  private finish(transition: ViewTransition): void {
    if (this.active !== transition) return;
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
