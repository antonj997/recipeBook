import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipePhotoWarmupService } from './recipe-photo-warmup.service';

describe('bounded recipe photo preparation', () => {
  const original = document.createElement.bind(document);
  const images: { image: HTMLImageElement; resolve: () => void; reject: () => void }[] = [];
  beforeEach(() => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = original(tag);
      if (tag === 'img') {
        const image = element as HTMLImageElement;
        let resolve!: () => void;
        let reject!: () => void;
        image.decode = () =>
          new Promise<void>((yes, no) => {
            resolve = yes;
            reject = () => no(new Error('decode failed'));
          });
        Object.defineProperty(image, 'naturalWidth', { value: 1200 });
        Object.defineProperty(image, 'naturalHeight', { value: 900, configurable: true });
        images.push({ image, resolve: () => resolve(), reject: () => reject() });
      }
      return element;
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    images.length = 0;
  });

  it('deduplicates concurrent decoding and reuses a prepared image', async () => {
    const cache = TestBed.inject(RecipePhotoWarmupService);
    const first = cache.prepare('data:image/jpeg;base64,one');
    const second = cache.prepare('data:image/jpeg;base64,one');
    expect(images).toHaveLength(1);
    images[0].resolve();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(await cache.prepare('data:image/jpeg;base64,one')).toBe(true);
    expect(images).toHaveLength(1);
  });
  it('retains at most three images and evicts the least recently used', async () => {
    const cache = TestBed.inject(RecipePhotoWarmupService);
    for (const value of ['one', 'two', 'three']) {
      const done = cache.prepare(value);
      images.at(-1)!.resolve();
      await done;
    }
    await cache.prepare('one');
    const fourth = cache.prepare('four');
    images[3].resolve();
    await fourth;
    expect(images[1].image.hasAttribute('src')).toBe(false);
    expect(images[0].image.hasAttribute('src')).toBe(true);
    const retry = cache.prepare('two');
    images[4].resolve();
    await retry;
    expect(images).toHaveLength(5);
  });
  it('allows retry after a decoder failure', async () => {
    const cache = TestBed.inject(RecipePhotoWarmupService);
    const failed = cache.prepare('one');
    images[0].reject();
    expect(await failed).toBe(false);
    const retry = cache.prepare('one');
    images[1].resolve();
    expect(await retry).toBe(true);
  });
  it('releases images on clear, and a late decoder cannot repopulate it', async () => {
    const cache = TestBed.inject(RecipePhotoWarmupService);
    const old = cache.prepare('one');
    cache.clear();
    images[0].resolve();
    expect(await old).toBe(false);
    expect(images[0].image.hasAttribute('src')).toBe(false);
    const fresh = cache.prepare('one');
    images[1].resolve();
    expect(await fresh).toBe(true);
  });
  it('does not retain oversized decoded images', async () => {
    const cache = TestBed.inject(RecipePhotoWarmupService);
    const pending = cache.prepare('oversized');
    Object.defineProperty(images[0].image, 'naturalHeight', { value: 9000, configurable: true });
    images[0].resolve();
    expect(await pending).toBe(false);
    expect(images[0].image.hasAttribute('src')).toBe(false);
  });
  it('only prepares the latest settled carousel neighbours after rapid scrubbing', async () => {
    vi.useFakeTimers();
    const cache = TestBed.inject(RecipePhotoWarmupService);
    cache.schedule(['one', 'two', 'three']);
    await vi.advanceTimersByTimeAsync(60);
    cache.schedule(['four', undefined, 'five']);
    await vi.advanceTimersByTimeAsync(99);
    expect(images).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(images.map(({ image }) => image.getAttribute('src'))).toEqual(['four', 'five']);
    images.forEach((entry) => entry.resolve());
  });
  it('cancels scheduled account photos when the cache is cleared', async () => {
    vi.useFakeTimers();
    const cache = TestBed.inject(RecipePhotoWarmupService);
    cache.schedule(['private-photo']);
    cache.clear();
    await vi.advanceTimersByTimeAsync(200);
    expect(images).toHaveLength(0);
  });
  it('does no work for a recipe without a photo', async () => {
    expect(await TestBed.inject(RecipePhotoWarmupService).prepare('')).toBe(false);
    expect(images).toHaveLength(0);
  });
});
