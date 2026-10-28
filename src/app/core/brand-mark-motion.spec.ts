import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { swingHeaderMark, tipRecipebookMark } from './brand-mark-motion';

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

  describe('header mark', () => {
    const angle = (frame: Keyframe) =>
      Number(/rotate\((-?[\d.]+)deg\)/.exec(String(frame['transform']))?.[1] ?? 0);
    function mark() {
      const element = document.createElement('img');
      const animation = { playState: 'running', reverse: vi.fn() } as unknown as Animation;
      element.animate = vi.fn(() => animation);
      return { element, animation };
    }

    it('tips the R onto its spine, balancing on its corner before the fall', () => {
      const { element } = mark();
      swingHeaderMark(element, true);
      const [frames, options] = vi.mocked(element.animate).mock.calls[0]! as [
        Keyframe[],
        KeyframeAnimationOptions,
      ];
      // It pivots on the corner it lands on, and ends exactly where the static book sits.
      expect(frames.every((frame) => frame['transformOrigin'] === '0% 100%')).toBe(true);
      expect(angle(frames[0]!)).toBe(0);
      expect(frames.at(-1)!['transform']).toBe('translateX(100%) rotate(-90deg) scale(1, 1)');
      // Near the tipping point (35-50 degrees) for a while before it falls.
      const balancing = frames.filter((frame) => angle(frame) <= -35 && angle(frame) >= -50);
      expect(balancing.length).toBeGreaterThanOrEqual(2);
      const span = balancing.at(-1)!.offset! - balancing[0]!.offset!;
      expect(span).toBeGreaterThanOrEqual(0.2);
      // The fall lands as the header finishes compacting, then a short squash shows the weight.
      const landing = frames.find((frame) => angle(frame) === -90)!;
      expect(landing.offset! * Number(options.duration)).toBeCloseTo(420, -1);
      expect(frames.some((frame) => /scale\(0\.\d+, /.test(String(frame['transform'])))).toBe(true);
    });

    it('stands the book back up as an R when the header expands', () => {
      const { element } = mark();
      swingHeaderMark(element, false);
      const [frames] = vi.mocked(element.animate).mock.calls[0]! as [Keyframe[]];
      expect(angle(frames[0]!)).toBe(-90);
      expect(angle(frames.at(-1)!)).toBe(0);
    });

    it('turns a swing that is still running around instead of jumping to the other pose', () => {
      const { element, animation } = mark();
      const tip = swingHeaderMark(element, true);
      expect(swingHeaderMark(element, false, tip)).toBe(animation);
      expect(animation.reverse).toHaveBeenCalledOnce();
      expect(element.animate).toHaveBeenCalledOnce();
    });

    it('switches at once under Reduce Motion', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      const { element } = mark();
      expect(swingHeaderMark(element, true)).toBeUndefined();
      expect(element.animate).not.toHaveBeenCalled();
    });
  });
});
