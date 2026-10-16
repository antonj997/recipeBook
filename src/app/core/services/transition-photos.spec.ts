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
    image.decode = () => decoded.promise;
    Object.defineProperty(image, 'complete', { value: complete });
    Object.defineProperty(image, 'naturalWidth', { value: complete ? 1024 : 0 });
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
    const unrelated = {
      effect: { pseudoElement: null },
      playState: 'running',
      pause() {
        this.playState = 'paused';
      },
      play() {
        this.playState = 'running';
      },
    };
    document.getAnimations = () => [animation, unrelated] as unknown as Animation[];
    return { image, decoded, finished, animation, unrelated };
  }

  it('holds native snapshots until the destination photo decodes and gets a paint frame', async () => {
    const f = fixture();
    const done = prepareTransitionPhotos(document, [f.image], { finished: f.finished.promise });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.animation.playState).toBe('paused');
    expect(f.unrelated.playState).toBe('running');
    f.decoded.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.animation.playState).toBe('paused');
    await vi.advanceTimersByTimeAsync(40);
    await done;
    expect(f.animation.playState).toBe('running');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart a transition that was cancelled while decoding', async () => {
    const f = fixture();
    const done = prepareTransitionPhotos(document, [f.image], { finished: f.finished.promise });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.animation.playState).toBe('paused');
    f.animation.playState = 'idle';
    f.finished.resolve();
    await vi.advanceTimersByTimeAsync(40);
    f.decoded.resolve();
    await done;
    expect(f.animation.playState).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not stall navigation on a broken image', async () => {
    const f = fixture();
    const done = prepareTransitionPhotos(document, [f.image], { finished: f.finished.promise });
    expect(f.animation.playState).toBe('paused');
    f.decoded.reject(new Error('Broken image'));
    await vi.advanceTimersByTimeAsync(40);
    await done;
    expect(f.animation.playState).toBe('running');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stalled decoder instead of freezing the page indefinitely', async () => {
    const f = fixture();
    const done = prepareTransitionPhotos(document, [f.image], { finished: f.finished.promise });
    expect(f.animation.playState).toBe('paused');
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(f.animation.playState).toBe('running');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not pause unrelated or already paused animations', async () => {
    const f = fixture();
    f.animation.playState = 'paused';
    const done = prepareTransitionPhotos(document, [f.image], { finished: f.finished.promise });
    f.decoded.resolve();
    await vi.advanceTimersByTimeAsync(40);
    await done;
    expect(f.animation.playState).toBe('paused');
    expect(f.unrelated.playState).toBe('running');
  });

  it('leaves ready photos and no-photo routes on the normal animation path', async () => {
    const f = fixture(true);
    await prepareTransitionPhotos(document, [f.image], { finished: f.finished.promise });
    await prepareTransitionPhotos(document, [], { finished: f.finished.promise });
    expect(f.animation.playState).toBe('running');
    expect(vi.getTimerCount()).toBe(0);
  });
});
