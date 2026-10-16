import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageTransitionService } from './page-transition.service';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function route(path: string): ActivatedRouteSnapshot {
  return {
    url: path
      .split('/')
      .filter(Boolean)
      .map((path) => ({ path })),
    routeConfig: { path: path.startsWith('/recipes/') ? 'recipes/:id' : path },
    paramMap: { get: () => path.split('/').at(-1) },
  } as unknown as ActivatedRouteSnapshot;
}

describe('shared photo snapshot ownership', () => {
  const originalAnimations = Object.getOwnPropertyDescriptor(document, 'getAnimations');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 16),
    );
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalAnimations) Object.defineProperty(document, 'getAnimations', originalAnimations);
    else Reflect.deleteProperty(document, 'getAnimations');
    for (const attribute of [...document.documentElement.attributes])
      if (attribute.name.startsWith('data-'))
        document.documentElement.removeAttribute(attribute.name);
  });
  function photo(service: PageTransitionService, id: string, complete: boolean) {
    const image = document.createElement('img');
    const decoded = deferred();
    const state = { complete };
    Object.defineProperty(image, 'complete', { get: () => state.complete });
    Object.defineProperty(image, 'naturalWidth', { get: () => (state.complete ? 1024 : 0) });
    image.decode = () =>
      decoded.promise.then(() => {
        state.complete = true;
      });
    return { image, decoded, unregister: service.registerPart(image, id, 'image') };
  }
  function start(service: PageTransitionService, id: string) {
    const ready = deferred(),
      finished = deferred();
    const transition = {
      ready: ready.promise,
      finished: finished.promise,
      skipTransition() {},
    } as ViewTransition;
    service.start({ transition, from: route('/'), to: route('/recipes/' + id) });
    return { ready, finished };
  }

  it('keeps the rendered source until the selected destination photo can paint', async () => {
    const service = TestBed.inject(PageTransitionService);
    const source = photo(service, 'one', true);
    const run = start(service, 'one');
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(true);
    source.unregister();
    const target = photo(service, 'one', false);
    const animation = {
      effect: { pseudoElement: '::view-transition-group(book-recipe-image)' },
      playState: 'running',
      pause() {
        this.playState = 'paused';
      },
      play() {
        this.playState = 'running';
      },
    };
    document.getAnimations = () => [animation] as unknown as Animation[];
    run.ready.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(animation.playState).toBe('paused');
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(true);
    target.decoded.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(animation.playState).toBe('running');
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(false);
    run.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.hasAttribute('data-page-transition')).toBe(false);
    target.unregister();
  });

  it('does not wait for unrelated lazy photos elsewhere in the cookbook', async () => {
    const service = TestBed.inject(PageTransitionService);
    const source = photo(service, 'one', true);
    const unrelated = photo(service, 'two', false);
    const run = start(service, 'one');
    source.unregister();
    const target = photo(service, 'one', true);
    document.getAnimations = () => [];
    run.ready.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    run.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    target.unregister();
    unrelated.unregister();
  });

  it('cannot use a blank source image as its fallback', async () => {
    const service = TestBed.inject(PageTransitionService);
    const source = photo(service, 'one', false);
    const run = start(service, 'one');
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(false);
    run.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    source.unregister();
  });
});
