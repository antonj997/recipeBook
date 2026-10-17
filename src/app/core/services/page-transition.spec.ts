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
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
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

  it('retains one rendered source for the entire flight, even after destination decoding', async () => {
    const service = TestBed.inject(PageTransitionService);
    const source = photo(service, 'one', true);
    const run = start(service, 'one');
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(true);
    source.unregister();
    const target = photo(service, 'one', false);
    // Model the native API as unsafe during teardown; the service must not call it.
    document.getAnimations = () => {
      throw new Error('Unsafe native enumeration');
    };
    run.ready.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.hasAttribute('data-book-photo-preparing')).toBe(true);
    expect(document.documentElement.hasAttribute('data-book-photo-ready')).toBe(false);
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(true);
    target.decoded.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(document.documentElement.hasAttribute('data-book-photo-preparing')).toBe(false);
    expect(document.documentElement.hasAttribute('data-book-photo-ready')).toBe(true);
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(true);
    run.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.hasAttribute('data-page-transition')).toBe(false);
    expect(document.documentElement.hasAttribute('data-book-photo-preparing')).toBe(false);
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(false);
    expect(document.documentElement.hasAttribute('data-book-photo-ready')).toBe(false);
    target.unregister();
  });

  it('does not wait for unrelated lazy photos elsewhere in the cookbook', async () => {
    const service = TestBed.inject(PageTransitionService);
    const source = photo(service, 'one', true);
    const unrelated = photo(service, 'two', false);
    const run = start(service, 'one');
    source.unregister();
    const target = photo(service, 'one', true);
    target.decoded.resolve();
    document.getAnimations = () => [];
    run.ready.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    run.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    target.unregister();
    unrelated.unregister();
  });

  it('does not declare a stalled destination ready or let late decoding change a replacement', async () => {
    const service = TestBed.inject(PageTransitionService);
    const source = photo(service, 'one', true);
    const first = start(service, 'one');
    source.unregister();
    const target = photo(service, 'one', false);
    document.getAnimations = () => [];
    first.ready.resolve();
    await vi.advanceTimersByTimeAsync(2100);
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(true);
    expect(document.documentElement.hasAttribute('data-book-photo-ready')).toBe(false);
    target.unregister();
    const replacementSource = photo(service, 'two', true);
    const second = start(service, 'two');
    target.decoded.resolve();
    first.finished.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(document.documentElement.hasAttribute('data-book-photo-ready')).toBe(false);
    expect(document.documentElement.hasAttribute('data-book-photo-source')).toBe(true);
    second.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    replacementSource.unregister();
  });

  it('cannot let an old decoder resume the CSS pause owned by a replacement', async () => {
    const service = TestBed.inject(PageTransitionService);
    const oldSource = photo(service, 'one', true);
    const first = start(service, 'one');
    oldSource.unregister();
    const oldTarget = photo(service, 'one', false);
    first.ready.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.hasAttribute('data-book-photo-preparing')).toBe(true);
    const source = photo(service, 'two', true);
    const second = start(service, 'two');
    source.unregister();
    const target = photo(service, 'two', false);
    second.ready.resolve();
    await vi.advanceTimersByTimeAsync(0);
    oldTarget.decoded.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(document.documentElement.hasAttribute('data-book-photo-preparing')).toBe(true);
    expect(document.documentElement.hasAttribute('data-book-photo-ready')).toBe(false);
    first.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.documentElement.hasAttribute('data-book-photo-preparing')).toBe(true);
    target.decoded.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(document.documentElement.hasAttribute('data-book-photo-preparing')).toBe(false);
    expect(document.documentElement.hasAttribute('data-book-photo-ready')).toBe(true);
    second.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    oldTarget.unregister();
    target.unregister();
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
  it('keeps secondary recipe sections out of the shared snapshot layer tree', () => {
    const service = TestBed.inject(PageTransitionService);
    const source = photo(service, 'one', true);
    const run = start(service, 'one');
    const release = ['reading', 'navigation', 'controls', 'description'].map((part) => {
      const element = document.createElement('section');
      const unregister = service.registerPart(element, 'one', part as 'reading');
      expect(element.style.getPropertyValue('view-transition-name')).toBe('');
      return unregister;
    });
    run.finished.resolve();
    source.unregister();
    release.forEach((stop) => stop());
  });
  it('reveals metadata absent from the source row as live content only after landing', async () => {
    const service = TestBed.inject(PageTransitionService);
    const time = document.createElement('span');
    const releaseTime = service.registerPart(time, 'one', 'time');
    const run = start(service, 'one');
    const categories = document.createElement('div');
    const releaseCategories = service.registerPart(categories, 'one', 'categories');
    expect(time.style.getPropertyValue('view-transition-name')).toBe('book-recipe-time');
    expect(categories.style.getPropertyValue('view-transition-name')).toBe('');
    expect(service.isLivePart('categories')).toBe(true);
    expect(service.isLivePart('time')).toBe(false);
    run.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.openingRecipe()).toBe(false);
    releaseTime();
    releaseCategories();
  });
  it('does not restart a cancelled capture when the native ready promise arrives late', async () => {
    const service = TestBed.inject(PageTransitionService);
    const run = start(service, 'one');
    service.cancel();
    run.ready.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.phase()).toBe('cancelled');
    run.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.phase()).toBe('idle');
  });
  it('keeps cancellation authoritative if an old photo finishes before native cleanup', async () => {
    const service = TestBed.inject(PageTransitionService);
    const source = photo(service, 'one', true);
    const run = start(service, 'one');
    expect(service.phase()).toBe('capturing');
    source.unregister();
    const target = photo(service, 'one', false);
    run.ready.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.phase()).toBe('preparing');
    service.cancel();
    expect(service.phase()).toBe('cancelled');
    target.decoded.resolve();
    await vi.advanceTimersByTimeAsync(40);
    expect(service.phase()).toBe('cancelled');
    run.finished.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.phase()).toBe('idle');
    target.unregister();
  });
});
