import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tipRecipebookMark } from './brand-mark-motion';

describe('book logo motion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('settles to the static book if the animation engine never finishes', async () => {
    const mark = document.createElement('img');
    const cancel = vi.fn();
    mark.animate = vi.fn(
      () => ({ finished: new Promise(() => undefined), cancel }) as unknown as Animation,
    );
    const motion = tipRecipebookMark(mark);
    await vi.advanceTimersByTimeAsync(650);
    await motion.finished;
    expect(mark.style.transform).toBe('rotate(-90deg)');
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases a removed loader without leaving animation timers behind', async () => {
    const mark = document.createElement('img');
    const cancel = vi.fn();
    mark.animate = vi.fn(
      () => ({ finished: new Promise(() => undefined), cancel }) as unknown as Animation,
    );
    const motion = tipRecipebookMark(mark);
    motion.cancel();
    motion.cancel();
    await motion.finished;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for the vector image to decode before starting its first moving frame', async () => {
    const mark = document.createElement('img');
    let decoded!: () => void;
    mark.decode = () =>
      new Promise<void>((resolve) => {
        decoded = resolve;
      });
    mark.animate = vi.fn(
      () => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation,
    );
    const motion = tipRecipebookMark(mark);
    await vi.advanceTimersByTimeAsync(100);
    expect(mark.animate).not.toHaveBeenCalled();
    decoded();
    await motion.finished;
    expect(mark.animate).toHaveBeenCalledOnce();
    expect(mark.style.transform).toBe('rotate(-90deg)');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start a late image animation after its loading view has been removed', async () => {
    const mark = document.createElement('img');
    let decoded!: () => void;
    mark.decode = () =>
      new Promise<void>((resolve) => {
        decoded = resolve;
      });
    mark.animate = vi.fn(
      () => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation,
    );
    const motion = tipRecipebookMark(mark);
    motion.cancel();
    decoded();
    await motion.finished;
    await Promise.resolve();
    expect(mark.animate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses a static book with no delay or movement for reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const mark = document.createElement('img');
    mark.animate = vi.fn();
    await tipRecipebookMark(mark).finished;
    expect(mark.style.transform).toBe('rotate(-90deg)');
    expect(mark.animate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
