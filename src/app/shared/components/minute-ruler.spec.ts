import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MinuteRulerComponent } from './minute-ruler';
import {
  TimerRulerPreferencesService,
  type TimerRulerMode,
} from '../../core/services/timer-ruler-preferences.service';

describe('minute ruler gestures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    TestBed.configureTestingModule({ imports: [MinuteRulerComponent] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.removeItem('recipebook:timer-ruler-mode:v1');
  });
  function setup(seconds = 1800, mode: TimerRulerMode = 'swipe') {
    TestBed.inject(TimerRulerPreferencesService).setMode(mode);
    const view = TestBed.createComponent(MinuteRulerComponent);
    view.componentRef.setInput('seconds', seconds);
    view.detectChanges();
    const slider = (view.nativeElement as HTMLElement).querySelector<HTMLElement>('[role=slider]')!;
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 360 } as DOMRect);
    const changes: number[] = [];
    view.componentInstance.durationChange.subscribe((value) => {
      changes.push(value);
      view.componentRef.setInput('seconds', value);
    });
    return { view, slider, changes };
  }
  function pointer(
    element: HTMLElement | Document,
    type: string,
    x: number,
    y = 20,
    id = 1,
    pointerType = 'touch',
  ) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperties(event, {
      pointerId: { value: id },
      isPrimary: { value: true },
      pointerType: { value: pointerType },
    });
    element.dispatchEvent(event);
    return event;
  }
  async function fling(f: ReturnType<typeof setup>, end = 300) {
    pointer(f.slider, 'pointerdown', 180);
    await vi.advanceTimersByTimeAsync(40);
    pointer(document, 'pointermove', end);
    await vi.advanceTimersByTimeAsync(20);
    pointer(document, 'pointerup', end);
  }
  function trackOffset(f: ReturnType<typeof setup>): number {
    f.view.detectChanges();
    const track = (f.view.nativeElement as HTMLElement).querySelector<HTMLElement>('.ruler-ticks')!;
    return Number(track.style.transform.match(/translateX\(([\d.-]+)px\)/)?.[1]);
  }
  async function coastDistance(f: ReturnType<typeof setup>, milliseconds = 160): Promise<number> {
    const before = trackOffset(f);
    await vi.advanceTimersByTimeAsync(milliseconds);
    return trackOffset(f) - before;
  }
  it.each([0, 60, 1800, 3600])('keeps swipe selection centered at %i seconds', (seconds) => {
    const f = setup(seconds);
    expect(markerX(f)).toBeCloseTo(180, 1);
  });
  it.each([-54, 54])(
    'slides the scale with the finger and coasts in that direction (%i px)',
    async (distance) => {
      const f = setup();
      const before = trackOffset(f);
      pointer(f.slider, 'pointerdown', 100);
      f.view.detectChanges();
      expect(trackOffset(f)).toBe(before);
      expect(markerX(f)).toBeCloseTo(180, 1);
      await vi.advanceTimersByTimeAsync(40);
      pointer(document, 'pointermove', 100 + distance);
      f.view.detectChanges();
      expect(trackOffset(f) - before).toBeCloseTo(distance, 1);
      expect(markerX(f)).toBeCloseTo(180, 1);
      expect(f.changes.at(-1)).toBe((30 - distance / 18) * 60);
      await vi.advanceTimersByTimeAsync(20);
      pointer(document, 'pointerup', 100 + distance);
      expect((await coastDistance(f)) * Math.sign(distance)).toBeGreaterThan(0);
      expect(markerX(f)).toBeCloseTo(180, 1);
      await vi.advanceTimersByTimeAsync(4000);
      f.view.detectChanges();
      const selected = f.slider.getAttribute('aria-valuenow');
      const tick = (f.view.nativeElement as HTMLElement).querySelector<HTMLElement>(
        '[data-minute="' + selected + '"]',
      )!;
      expect(Number.parseFloat(tick.style.left) + trackOffset(f)).toBeCloseTo(180, 1);
      expect(markerX(f)).toBeCloseTo(180, 1);
    },
  );
  it('wraps a swipe through zero without moving the center selection marker', async () => {
    const f = setup(0);
    pointer(f.slider, 'pointerdown', 180);
    await vi.advanceTimersByTimeAsync(500);
    pointer(document, 'pointermove', 216);
    pointer(document, 'pointerup', 216);
    f.view.detectChanges();
    expect(f.changes.at(-1)).toBe(59 * 60);
    expect(markerX(f)).toBeCloseTo(180, 1);
    pointer(f.slider, 'pointerdown', 200);
    await vi.advanceTimersByTimeAsync(500);
    pointer(document, 'pointermove', 146);
    pointer(document, 'pointerup', 146);
    f.view.detectChanges();
    expect(f.changes.at(-1)).toBe(60);
    expect(markerX(f)).toBeCloseTo(180, 1);
  });
  it('coasts longer with progressively smaller movement and settles on a whole minute', async () => {
    const f = setup(600);
    await fling(f);
    const early = Math.abs(await coastDistance(f));
    await vi.advanceTimersByTimeAsync(1000);
    const later = Math.abs(await coastDistance(f));
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(0);
    expect(later).toBeLessThan(early);
    await vi.advanceTimersByTimeAsync(2500);
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(count);
    expect(f.changes.every((value) => value >= 0 && value <= 3600 && value % 60 === 0)).toBe(true);
    const scroll = new Event('touchmove', { cancelable: true });
    document.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });
  it('builds speed with successive fast swipes in the same direction', async () => {
    const f = setup();
    await fling(f);
    const first = Math.abs(await coastDistance(f));
    await fling(f);
    const boosted = Math.abs(await coastDistance(f));
    expect(boosted).toBeGreaterThan(first * 1.15);
  });
  it('caps repeated swipe speed and always comes to rest', async () => {
    const f = setup();
    for (let i = 0; i < 8; i++) {
      await fling(f);
      await vi.advanceTimersByTimeAsync(40);
    }
    const distance = Math.abs(await coastDistance(f, 160));
    // At most 48 minute ticks/second, regardless of how many swipes are combined.
    expect(distance).toBeLessThanOrEqual(48 * 18 * 0.16 + 1);
    expect(distance).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(4000);
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.changes).toHaveLength(count);
  });
  it('discards carried momentum on a reverse swipe or a tap to stop', async () => {
    const f = setup();
    await fling(f, 60);
    const freshReverse = Math.abs(await coastDistance(f));
    f.view.componentInstance.stopMotion();
    await fling(f);
    await vi.advanceTimersByTimeAsync(100);
    await fling(f, 60);
    const reversed = Math.abs(await coastDistance(f));
    expect(Math.abs(reversed - freshReverse)).toBeLessThan(18);
    pointer(f.slider, 'pointerdown', 180);
    await vi.advanceTimersByTimeAsync(50);
    pointer(document, 'pointerup', 180);
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.changes).toHaveLength(count);
    await fling(f, 60);
    expect(Math.abs(Math.abs(await coastDistance(f)) - freshReverse)).toBeLessThan(18);
  });
  it.each([
    [1800, 300, 90],
    [1800, 300, 270],
    [1800, 60, 90],
    [1800, 60, 270],
    [60, 300, 270],
    [3540, 60, 90],
  ])(
    'stops on the centered tick when tapped mid-coast (%i s, swipe %i, tap %i)',
    async (seconds, end, tap) => {
      const f = setup(seconds);
      await fling(f, end);
      await vi.advanceTimersByTimeAsync(130);
      const before = trackOffset(f);
      const selected = f.slider.getAttribute('aria-valuenow');
      pointer(f.slider, 'pointerdown', tap);
      expect(trackOffset(f)).toBeCloseTo(before, 2);
      await vi.advanceTimersByTimeAsync(50);
      pointer(document, 'pointerup', tap);
      expect(f.changes.at(-1)).toBe(Number(selected) * 60);
      expect(Math.abs(trackOffset(f) - before)).toBeLessThanOrEqual(9.001);
      expect(markerX(f)).toBeCloseTo(180, 1);
      const settled = trackOffset(f),
        count = f.changes.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(trackOffset(f)).toBe(settled);
      expect(f.changes).toHaveLength(count);
    },
  );
  it('lets a mouse stop the coast without selecting the clicked side tick', async () => {
    const f = setup();
    await fling(f);
    await vi.advanceTimersByTimeAsync(130);
    trackOffset(f);
    const selected = f.slider.getAttribute('aria-valuenow');
    pointer(f.slider, 'pointerdown', 270, 20, 2, 'mouse');
    pointer(document, 'pointerup', 270, 20, 2, 'mouse');
    expect(f.changes.at(-1)).toBe(Number(selected) * 60);
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.changes).toHaveLength(count);
  });
  it('never starts edge scrolling in swipe mode, even when held at the edge', async () => {
    const f = setup();
    pointer(f.slider, 'pointerdown', 180);
    pointer(document, 'pointermove', 350);
    const offset = trackOffset(f),
      count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(trackOffset(f)).toBe(offset);
    expect(f.changes).toHaveLength(count);
    pointer(document, 'pointerup', 350);
  });
  it('stops immediately on release in edge mode without adding swipe momentum', async () => {
    const f = setup(1800, 'edge');
    await fling(f);
    const offset = trackOffset(f),
      count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(trackOffset(f)).toBe(offset);
    expect(f.changes).toHaveLength(count);
  });
  it('cancels both kinds of motion immediately when the test mode changes', async () => {
    const f = setup(),
      preferences = TestBed.inject(TimerRulerPreferencesService);
    await fling(f);
    await vi.advanceTimersByTimeAsync(100);
    preferences.setMode('edge');
    f.view.detectChanges();
    let count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.changes).toHaveLength(count);
    pointer(f.slider, 'pointerdown', 180);
    pointer(document, 'pointermove', 350);
    await vi.advanceTimersByTimeAsync(400);
    preferences.setMode('swipe');
    f.view.detectChanges();
    count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.changes).toHaveLength(count);
    pointer(document, 'pointerup', 350);
  });
  it.each(['control', 'pointerdown', 'scroll', 'blur', 'hidden', 'destroy', 'identity'])(
    'interrupts momentum on %s',
    async (reason) => {
      const f = setup();
      await fling(f);
      await vi.advanceTimersByTimeAsync(100);
      expect(f.changes.at(-1)).toBeLessThan(1800);
      if (reason === 'control') f.view.componentInstance.stopMotion();
      else if (reason === 'destroy') f.view.destroy();
      else if (reason === 'identity') {
        f.view.componentRef.setInput('identity', 'another-step');
        f.view.detectChanges();
      } else if (reason === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
      } else (reason === 'blur' ? window : document).dispatchEvent(new Event(reason));
      const count = f.changes.length;
      await vi.advanceTimersByTimeAsync(1500);
      expect(f.changes).toHaveLength(count);
    },
  );
  it('does not add momentum to a slow drag or reduced-motion gesture', async () => {
    const f = setup();
    pointer(f.slider, 'pointerdown', 180);
    await vi.advanceTimersByTimeAsync(500);
    pointer(document, 'pointermove', 200);
    pointer(document, 'pointerup', 200);
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(count);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    await fling(f);
    const reducedCount = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(reducedCount);
  });
  it('stops a coast immediately when reduced motion is enabled', async () => {
    const media = new EventTarget();
    Object.assign(media, { matches: false });
    vi.stubGlobal('matchMedia', () => media);
    const f = setup();
    await fling(f);
    await vi.advanceTimersByTimeAsync(100);
    Object.assign(media, { matches: true });
    media.dispatchEvent(new Event('change'));
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(count);
  });
  it.each([60, 510, 1800])(
    'keeps %i seconds unchanged when tapped on either side in swipe mode',
    async (seconds) => {
      const f = setup(seconds);
      for (const x of [90, 270]) {
        pointer(f.slider, 'pointerdown', x);
        pointer(document, 'pointerup', x);
        expect(f.changes).toEqual([]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(f.changes).toEqual([]);
      }
    },
  );
  it('keeps the one-minute marker near the left in edge mode', () => {
    const f = setup(60, 'edge');
    const marker = (f.view.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.ruler-marker',
    )!;
    const x = Number(marker.style.transform.match(/translateX\(([\d.-]+)px\)/)?.[1]);
    expect(x).toBeGreaterThan(10);
    expect(x).toBeLessThan(80);
    pointer(f.slider, 'pointerdown', 70);
    pointer(document, 'pointerup', 70);
    expect(f.changes.at(-1)).toBe(180);
  });
  it('lets a mouse slide the scale beneath the fixed marker without needing a hold', () => {
    const f = setup();
    for (const [type, x] of [
      ['pointerdown', 180],
      ['pointermove', 234],
      ['pointerup', 234],
    ] as const) {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: 20,
      });
      Object.defineProperties(event, {
        pointerId: { value: 3 },
        pointerType: { value: 'mouse' },
        isPrimary: { value: true },
      });
      (type === 'pointerdown' ? f.slider : document).dispatchEvent(event);
    }
    expect(f.changes.at(-1)).toBe(27 * 60);
  });
  it('uses the mouse wheel only when focused and leaves browser zoom alone', () => {
    const f = setup();
    const wheel = () => new WheelEvent('wheel', { deltaY: -80, bubbles: true, cancelable: true });
    f.slider.dispatchEvent(wheel());
    expect(f.changes).toEqual([]);
    f.slider.focus();
    const focused = wheel();
    f.slider.dispatchEvent(focused);
    expect(focused.defaultPrevented).toBe(true);
    expect(f.changes.at(-1)).toBe(32 * 60);
    const zoom = new WheelEvent('wheel', {
      deltaY: -80,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    f.slider.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(false);
    expect(f.changes.at(-1)).toBe(32 * 60);
  });
  it.each([1, 60, 300, 3600])(
    'fits all %i seconds into a bounded strip without time labels',
    (seconds) => {
      const f = setup(seconds),
        root = f.view.nativeElement as HTMLElement;
      f.view.componentRef.setInput('timeline', true);
      f.view.componentRef.setInput('totalSeconds', seconds);
      f.view.detectChanges();
      const progress = root.querySelector<HTMLElement>('[role=progressbar]');
      expect(progress).not.toBeNull();
      expect(progress!.getAttribute('aria-valuemax')).toBe(String(seconds));
      expect(progress!.getAttribute('aria-valuenow')).toBe(String(seconds));
      const ticks = root.querySelectorAll('.progress-tick');
      expect(ticks.length).toBeGreaterThanOrEqual(40);
      expect(ticks.length).toBeLessThanOrEqual(80);
      expect(root.querySelectorAll('.is-remaining')).toHaveLength(ticks.length);
      expect(root.querySelector('.ruler-number')).toBeNull();
      expect(root.querySelector('.ruler-marker')).toBeNull();
      expect(root.querySelector('[role=slider]')).toBeNull();
      expect(f.changes).toEqual([]);
    },
  );
  it('drains the orange ticks from right to left and reuses the full timeline', () => {
    const f = setup(1800),
      root = f.view.nativeElement as HTMLElement;
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('totalSeconds', 1800);
    f.view.detectChanges();
    const ticks = Array.from(root.querySelectorAll('.progress-tick'));
    f.view.componentRef.setInput('elapsedSeconds', 900);
    f.view.detectChanges();
    expect(root.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('900');
    expect(root.querySelectorAll('.is-remaining')).toHaveLength(Math.ceil(ticks.length / 2));
    expect(ticks[0].classList.contains('is-remaining')).toBe(true);
    expect(ticks.at(-1)!.classList.contains('is-remaining')).toBe(false);
    expect(root.querySelector('.progress-tick')).toBe(ticks[0]);
    f.view.componentRef.setInput('elapsedSeconds', 1830);
    f.view.detectChanges();
    expect(root.querySelectorAll('.is-remaining')).toHaveLength(0);
    expect(root.querySelectorAll('.progress-tick')).toHaveLength(ticks.length);
    expect(root.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('0');
    expect(f.changes).toEqual([]);
  });
  it('updates the timeline proportion when the running duration changes', () => {
    const f = setup(60),
      root = f.view.nativeElement as HTMLElement;
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('totalSeconds', 120);
    f.view.componentRef.setInput('elapsedSeconds', 60);
    f.view.detectChanges();
    const count = root.querySelectorAll('.progress-tick').length;
    expect(root.querySelectorAll('.is-remaining')).toHaveLength(Math.ceil(count / 2));
    f.view.componentRef.setInput('totalSeconds', 240);
    f.view.detectChanges();
    expect(root.querySelectorAll('.is-remaining')).toHaveLength(Math.ceil(count * 0.75));
    expect(root.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('180');
  });
  it('restores the minute picker on reset and keeps elapsed view read-only', () => {
    const f = setup(),
      root = f.view.nativeElement as HTMLElement;
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('totalSeconds', 1800);
    f.view.detectChanges();
    const progress = root.querySelector<HTMLElement>('[role=progressbar]')!;
    pointer(progress, 'pointerdown', 220);
    pointer(document, 'pointermove', 300);
    pointer(document, 'pointerup', 300);
    progress.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(f.changes).toEqual([]);
    f.view.componentRef.setInput('timeline', false);
    f.view.detectChanges();
    expect(root.querySelector('[role=progressbar]')).toBeNull();
    expect(root.querySelector('[role=slider]')).not.toBeNull();
    expect(root.querySelector('[data-minute]')).not.toBeNull();
  });
  it('owns a drag from the center and blocks page scrolling until release', async () => {
    const f = setup();
    expect(pointer(f.slider, 'pointerdown', 180).defaultPrevented).toBe(true);
    expect(pointer(document, 'pointermove', 220, 70).defaultPrevented).toBe(true);
    for (const type of ['touchmove', 'wheel']) {
      const scroll = new Event(type, { cancelable: true });
      document.dispatchEvent(scroll);
      expect(scroll.defaultPrevented).toBe(true);
    }
    await vi.advanceTimersByTimeAsync(1100);
    expect(f.changes.at(-1)).toBeLessThan(30 * 60);
    pointer(document, 'pointerup', 220, 70);
    for (const type of ['touchmove', 'wheel']) {
      const scroll = new Event(type, { cancelable: true });
      document.dispatchEvent(scroll);
      expect(scroll.defaultPrevented).toBe(false);
    }
  });
  function markerX(f: ReturnType<typeof setup>): number {
    return Number(
      (f.view.nativeElement as HTMLElement)
        .querySelector<HTMLElement>('.ruler-marker')!
        .style.transform.match(/translateX\(([\d.-]+)px\)/)?.[1],
    );
  }
  function rulerWindow(f: ReturnType<typeof setup>): string {
    const root = f.view.nativeElement as HTMLElement;
    return (
      root.querySelector<HTMLElement>('.ruler-ticks')!.style.transform +
      ':' +
      root.querySelector<HTMLElement>('.ruler-tick')!.dataset['minute']
    );
  }
  it('follows the thumb while the scale stays still throughout the middle area', async () => {
    const f = setup(1800, 'edge');
    f.view.detectChanges();
    const initial = rulerWindow(f);
    pointer(f.slider, 'pointerdown', 126);
    await vi.advanceTimersByTimeAsync(400);
    f.view.detectChanges();
    expect(markerX(f)).toBeCloseTo(126, 1);
    expect(rulerWindow(f)).toBe(initial);
    for (const x of [180, 234]) {
      pointer(document, 'pointermove', x);
      f.view.detectChanges();
      expect(markerX(f)).toBeCloseTo(x, 1);
      expect(rulerWindow(f)).toBe(initial);
      const count = f.changes.length;
      await vi.advanceTimersByTimeAsync(1000);
      f.view.detectChanges();
      expect(f.changes).toHaveLength(count);
      expect(rulerWindow(f)).toBe(initial);
    }
    expect(f.changes.at(-1)).toBe(33 * 60);
  });
  it.each([90, 180, 270])(
    'starts anywhere and scrolls only in the edge zone (start %i)',
    async (start) => {
      const f = setup(1800, 'edge');
      pointer(f.slider, 'pointerdown', start);
      pointer(document, 'pointermove', 330);
      await vi.advanceTimersByTimeAsync(400);
      f.view.detectChanges();
      const before = f.changes.at(-1)!;
      const window = rulerWindow(f);
      await vi.advanceTimersByTimeAsync(1000);
      f.view.detectChanges();
      const delta = (f.changes.at(-1)! - before + 3660) % 3660;
      expect(delta).toBeGreaterThanOrEqual(7 * 60);
      expect(delta).toBeLessThanOrEqual(9 * 60);
      expect(markerX(f)).toBeCloseTo(330, 1);
      expect(rulerWindow(f)).not.toBe(window);
      pointer(document, 'pointermove', 180);
      f.view.detectChanges();
      const middle = rulerWindow(f),
        count = f.changes.length;
      await vi.advanceTimersByTimeAsync(1000);
      f.view.detectChanges();
      expect(f.changes).toHaveLength(count);
      expect(rulerWindow(f)).toBe(middle);
      expect(markerX(f)).toBeCloseTo(180, 1);
    },
  );
  it('selects the tick under a dragged thumb instead of keeping a fixed center marker', () => {
    const f = setup(1800, 'edge');
    pointer(f.slider, 'pointerdown', 90);
    pointer(document, 'pointermove', 100);
    f.view.detectChanges();
    expect(f.changes.at(-1)).toBe(26 * 60);
    expect(markerX(f)).toBeCloseTo(100, 1);
    pointer(document, 'pointerup', 100);
    f.view.detectChanges();
    expect(markerX(f)).toBeCloseTo(108, 1);
  });
  it('accelerates toward the edge and stops drifting when held in the middle', async () => {
    const f = setup(1800, 'edge');
    pointer(f.slider, 'pointerdown', 300);
    await vi.advanceTimersByTimeAsync(400);
    const first = f.changes.at(-1)!;
    await vi.advanceTimersByTimeAsync(1000);
    const slow = (f.changes.at(-1)! - first + 3660) % 3660;
    pointer(document, 'pointermove', 358);
    const next = f.changes.at(-1)!;
    await vi.advanceTimersByTimeAsync(1000);
    const fast = (f.changes.at(-1)! - next + 3660) % 3660;
    expect(fast).toBeGreaterThan(slow);
    pointer(document, 'pointermove', 180);
    f.view.detectChanges();
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(count);
    pointer(document, 'pointerup', 180);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(count);
  });
  it.each(['pointercancel', 'scroll', 'blur'])('cancels a held gesture on %s', async (event) => {
    const f = setup(1800, 'edge');
    pointer(f.slider, 'pointerdown', 350);
    await vi.advanceTimersByTimeAsync(500);
    (event === 'blur' ? window : document).dispatchEvent(new Event(event));
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(count);
  });
  it('stops on an account/step identity change, disabled state and destruction', async () => {
    const f = setup(1800, 'edge');
    for (const input of ['identity', 'disabled']) {
      pointer(f.slider, 'pointerdown', 350);
      await vi.advanceTimersByTimeAsync(500);
      f.view.componentRef.setInput(input, input === 'identity' ? 'other-step' : true);
      f.view.detectChanges();
      const count = f.changes.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(f.changes).toHaveLength(count);
    }
    f.view.componentRef.setInput('disabled', false);
    f.view.detectChanges();
    pointer(f.slider, 'pointerdown', 350);
    await vi.advanceTimersByTimeAsync(500);
    f.view.destroy();
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.changes).toHaveLength(count);
  });
  it('preserves remaining seconds when keyboard or wheel adds a minute', () => {
    const f = setup(510);
    f.slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(f.changes.at(-1)).toBe(570);
    f.slider.focus();
    f.slider.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }),
    );
    expect(f.changes.at(-1)).toBe(630);
  });
  it('loops from sixty to zero and back using the keyboard', () => {
    const f = setup(3600);
    f.slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(f.changes.at(-1)).toBe(0);
    f.slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(f.changes.at(-1)).toBe(3600);
    f.slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(f.changes.at(-1)).toBe(0);
  });
  it('retains a continuous edge-mode mouse drag after wrapping through zero', () => {
    const f = setup(3540, 'edge');
    const mouse = (type: string, x: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: 20,
      });
      Object.defineProperties(event, {
        pointerId: { value: 3 },
        pointerType: { value: 'mouse' },
        isPrimary: { value: true },
      });
      (type === 'pointerdown' ? f.slider : document).dispatchEvent(event);
    };
    mouse('pointerdown', 180);
    mouse('pointermove', 216);
    mouse('pointerup', 216);
    expect(f.changes.at(-1)).toBe(0);
    mouse('pointerdown', 216);
    mouse('pointermove', 234);
    mouse('pointerup', 234);
    expect(f.changes.at(-1)).toBe(60);
    mouse('pointerdown', 234);
    mouse('pointermove', 198);
    mouse('pointerup', 198);
    expect(f.changes.at(-1)).toBe(3600);
  });
  it('shows a small label every five minutes, including sixty followed by zero', () => {
    const f = setup(3600),
      root = f.view.nativeElement as HTMLElement;
    const ticks = Array.from(root.querySelectorAll<HTMLElement>('.ruler-tick'));
    const labels = Array.from(root.querySelectorAll('.ruler-number')).map((e) =>
      e.textContent?.trim(),
    );
    expect(labels).toContain('60');
    expect(labels).toContain('0');
    const sixty = ticks.findIndex((t) => t.dataset['minute'] === '60');
    expect(sixty).toBeGreaterThanOrEqual(0);
    expect(ticks[sixty + 1]?.dataset['minute']).toBe('0');
    expect(labels.every((label) => Number(label) % 5 === 0)).toBe(true);
  });
});
