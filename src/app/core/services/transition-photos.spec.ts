import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareTransitionPhotos } from './transition-photos';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('photo transition readiness', () => {
  const originalAnimations = Object.getOwnPropertyDescriptor(document, 'getAnimations');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 16),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalAnimations) Object.defineProperty(document, 'getAnimations', originalAnimations);
    else Reflect.deleteProperty(document, 'getAnimations');
  });

  function fixture(complete = false) {
    const decoded = deferred();
    const finished = deferred();
    const image = document.createElement('img');
    image.decode = vi.fn(() =>
      decoded.promise.then(() => {
        complete = true;
      }),
    );
    Object.defineProperty(image, 'complete', { get: () => complete });
    Object.defineProperty(image, 'naturalWidth', { get: () => (complete ? 1024 : 0) });
    return { image, decoded, finished };
  }

  it('resolves readiness only after decoding and two rendering opportunities', async () => {
    const f = fixture();
    const done = prepareTransitionPhotos([f.image], { finished: f.finished.promise });
    await vi.advanceTimersByTimeAsync(0);
    f.decoded.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(40);
    expect(await done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns false when cancelled while decoding', async () => {
    const f = fixture();
    const done = prepareTransitionPhotos([f.image], { finished: f.finished.promise });
    await vi.advanceTimersByTimeAsync(0);
    f.finished.resolve();
    await vi.advanceTimersByTimeAsync(40);
    f.decoded.resolve();
    expect(await done).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not stall navigation on a broken image', async () => {
    const f = fixture();
    const done = prepareTransitionPhotos([f.image], { finished: f.finished.promise });
    f.decoded.reject(new Error('Broken image'));
    await vi.advanceTimersByTimeAsync(40);
    expect(await done).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stalled decoder instead of freezing the page indefinitely', async () => {
    const f = fixture();
    const done = prepareTransitionPhotos([f.image], { finished: f.finished.promise });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await done).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('decodes cached complete photos too, before handing over to the live image', async () => {
    const f = fixture(true);
    const done = prepareTransitionPhotos([f.image], { finished: f.finished.promise });
    expect(f.image.decode).toHaveBeenCalledOnce();
    let ready = false;
    void done.then(() => {
      ready = true;
    });
    f.decoded.resolve();
    await vi.advanceTimersByTimeAsync(16);
    // A requestAnimationFrame callback runs BEFORE paint, not after it.
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(16);
    expect(await done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('makes the selected lazy photo eager without waiting for offscreen cookbook images', async () => {
    const f = fixture();
    f.image.loading = 'lazy';
    const done = prepareTransitionPhotos([f.image], { finished: f.finished.promise });
    expect(f.image.loading).toBe('eager');
    f.decoded.resolve();
    await vi.advanceTimersByTimeAsync(40);
    await done;
  });

  it('cancels the pending paint opportunity if navigation ends between frames', async () => {
    const f = fixture(true);
    const done = prepareTransitionPhotos([f.image], { finished: f.finished.promise });
    f.decoded.resolve();
    await vi.advanceTimersByTimeAsync(16);
    f.finished.resolve();
    expect(await done).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does no animation or decoding work for a no-photo route', async () => {
    const f = fixture();
    await prepareTransitionPhotos([], { finished: f.finished.promise });
    expect(f.image.decode).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('never enumerates native animations after route elements have been removed', async () => {
    const f = fixture(true);
    document.getAnimations = () => {
      throw new Error('Unsafe native animation enumeration');
    };
    const done = prepareTransitionPhotos([f.image], { finished: f.finished.promise });
    void done.catch(() => undefined);
    f.decoded.resolve();
    await vi.advanceTimersByTimeAsync(40);
    await expect(done).resolves.toBe(true);
  });
});
