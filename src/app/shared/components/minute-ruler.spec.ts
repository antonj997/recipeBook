import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MinuteRulerComponent } from './minute-ruler';

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
  });
  function setup(seconds = 1800) {
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
  function pointer(element: HTMLElement | Document, type: string, x: number, y = 20, id = 1) {
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
      pointerType: { value: 'touch' },
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
  it('coasts after a fast swipe and settles within twenty additional ticks', async () => {
    const f = setup();
    await fling(f);
    const released = f.changes.at(-1) ?? 1800;
    await vi.advanceTimersByTimeAsync(160);
    expect(f.changes.at(-1)).toBeGreaterThan(released);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes.at(-1)! - released).toBeLessThanOrEqual(20 * 60);
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(count);
    const scroll = new Event('touchmove', { cancelable: true });
    document.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });
  it.each(['control', 'pointerdown', 'scroll', 'blur', 'hidden', 'destroy', 'identity'])(
    'interrupts momentum on %s',
    async (reason) => {
      const f = setup();
      await fling(f);
      await vi.advanceTimersByTimeAsync(100);
      expect(f.changes.at(-1)).toBeGreaterThan(1800);
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
  it('taps the exact minute tick without starting a hold loop', async () => {
    const f = setup();
    pointer(f.slider, 'pointerdown', 234);
    expect(f.changes).toEqual([]);
    pointer(document, 'pointerup', 234);
    expect(f.changes).toEqual([33 * 60]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(1);
  });
  it('keeps the one-minute marker near the left instead of centering the start', () => {
    const f = setup(60);
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
  it('lets a mouse scrub directly without needing a hold', () => {
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
    expect(f.changes.at(-1)).toBe(33 * 60);
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
  it('uses one-second divisions with five-second and ten-second ticks while timing', async () => {
    const f = setup(53),
      root = f.view.nativeElement as HTMLElement;
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('totalSeconds', 60);
    f.view.componentRef.setInput('elapsedSeconds', 7);
    f.view.detectChanges();
    await vi.advanceTimersByTimeAsync(600);
    f.view.detectChanges();
    const tick = (second: number) =>
      root.querySelector<HTMLElement>('[data-second="' + second + '"]')!;
    expect(tick(1).classList.contains('is-fine')).toBe(true);
    expect(tick(5).classList.contains('is-fine')).toBe(false);
    expect(tick(5).classList.contains('is-major')).toBe(false);
    expect(tick(10).classList.contains('is-major')).toBe(true);
    expect(tick(10).querySelector('.ruler-number')?.textContent?.trim()).toBe('10');
    expect(tick(60).querySelector('.ruler-number')?.textContent?.trim()).toBe('00');
    expect(
      Number.parseFloat(tick(5).style.left) - Number.parseFloat(tick(0).style.left),
    ).toBeCloseTo(18);
    expect(root.querySelectorAll('.is-elapsed')).toHaveLength(8);
    expect(tick(7).classList.contains('is-elapsed')).toBe(true);
    expect(tick(8).classList.contains('is-elapsed')).toBe(false);
    f.view.componentRef.setInput('elapsedSeconds', 11);
    f.view.detectChanges();
    expect(root.querySelectorAll('.is-elapsed')).toHaveLength(12);
    expect(f.changes).toEqual([]);
  });
  it('removes selection and end markers while timing and restores the minute scale on Stop', async () => {
    const f = setup(),
      root = f.view.nativeElement as HTMLElement;
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('totalSeconds', 1800);
    f.view.detectChanges();
    await vi.advanceTimersByTimeAsync(600);
    f.view.detectChanges();
    expect(root.querySelector('.ruler-marker')).toBeNull();
    expect(root.querySelector('.ruler-end')).toBeNull();
    expect(root.querySelectorAll('.is-fine').length).toBeGreaterThan(0);
    f.view.componentRef.setInput('overdue', true);
    f.view.detectChanges();
    expect(root.querySelector('.ruler-marker')).toBeNull();
    f.view.componentRef.setInput('timeline', false);
    f.view.detectChanges();
    expect(root.querySelector('.ruler-marker')).not.toBeNull();
    expect(root.querySelector('[data-second]')).toBeNull();
    expect(root.querySelector('.is-fine')).toBeNull();
    expect(root.querySelector('[data-minute]')).not.toBeNull();
  });
  it('keeps seconds rendering bounded and reuses ticks as a long timer advances', async () => {
    const f = setup(5),
      root = f.view.nativeElement as HTMLElement;
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('totalSeconds', 3600);
    f.view.componentRef.setInput('elapsedSeconds', 3595);
    f.view.detectChanges();
    await vi.advanceTimersByTimeAsync(600);
    f.view.detectChanges();
    const tick = root.querySelector('[data-second="3595"]');
    expect(tick).not.toBeNull();
    const offset = () =>
      Number(
        root
          .querySelector<HTMLElement>('.ruler-ticks')!
          .style.transform.match(/translateX\(([\d.-]+)px\)/)?.[1],
      );
    const before = offset();
    expect(root.querySelectorAll('.ruler-tick').length).toBeLessThan(150);
    f.view.componentRef.setInput('elapsedSeconds', 3596);
    f.view.detectChanges();
    expect(root.querySelector('[data-second="3595"]')).toBe(tick);
    expect(offset() - before).toBeCloseTo(-3.6, 2);
    expect(root.querySelector('.ruler-marker')).toBeNull();
  });
  it('replaces the track across scale changes and clock jumps without animating stale coordinates', async () => {
    const f = setup(1800),
      root = f.view.nativeElement as HTMLElement;
    const track = () => root.querySelector<HTMLElement>('.ruler-ticks')!;
    const idle = track();
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('elapsedSeconds', 1800);
    f.view.detectChanges();
    expect(track()).toBe(idle);
    await vi.advanceTimersByTimeAsync(600);
    f.view.detectChanges();
    const resumed = track();
    expect(resumed).not.toBe(idle);
    expect(root.querySelector('[data-second="1800"]')).not.toBeNull();
    f.view.componentRef.setInput('elapsedSeconds', 1801);
    f.view.detectChanges();
    expect(track()).toBe(resumed);
    f.view.componentRef.setInput('elapsedSeconds', 2400);
    f.view.detectChanges();
    const caughtUp = track();
    expect(caughtUp).not.toBe(resumed);
    expect(root.querySelector('[data-second="2400"]')).not.toBeNull();
    f.view.componentRef.setInput('timeline', false);
    f.view.detectChanges();
    expect(track()).not.toBe(caughtUp);
    expect(root.querySelector('[data-minute]')).not.toBeNull();
    expect(f.changes).toEqual([]);
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
    expect(f.changes.at(-1)).toBeGreaterThan(30 * 60);
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
    const f = setup();
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
      const f = setup();
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
    const f = setup();
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
    const f = setup();
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
    const f = setup();
    pointer(f.slider, 'pointerdown', 350);
    await vi.advanceTimersByTimeAsync(500);
    (event === 'blur' ? window : document).dispatchEvent(new Event(event));
    const count = f.changes.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(count);
  });
  it('stops on an account/step identity change, disabled state and destruction', async () => {
    const f = setup();
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
  it('retains a continuous mouse drag after wrapping through zero', () => {
    const f = setup(3540);
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
  it('swipes from the selected time to zero when starting, without changing the duration', async () => {
    const f = setup(1800),
      root = f.view.nativeElement as HTMLElement;
    const offset = root.querySelector<HTMLElement>('.ruler-ticks')!.style.transform;
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('disabled', true);
    f.view.componentRef.setInput('totalSeconds', 1800);
    f.view.detectChanges();
    expect(root.querySelector('.is-rewinding')).not.toBeNull();
    expect(root.querySelector<HTMLElement>('.ruler-ticks')!.style.transform).toBe(offset);
    await vi.advanceTimersByTimeAsync(200);
    f.view.detectChanges();
    expect(root.querySelector('.is-rewinding')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    f.view.detectChanges();
    expect(root.querySelector('.is-rewinding')).toBeNull();
    expect(f.changes).toEqual([]);
    f.view.componentRef.setInput('elapsedSeconds', 60);
    f.view.detectChanges();
    expect(root.querySelector('[data-second="60"]')?.classList.contains('is-elapsed')).toBe(true);
    pointer(f.slider, 'pointerdown', 230);
    pointer(document, 'pointerup', 230);
    f.slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(f.changes).toEqual([]);
  });
  it('preserves the start swipe while hiding the selection marker immediately', async () => {
    const f = setup(),
      root = f.view.nativeElement as HTMLElement;
    pointer(f.slider, 'pointerdown', 180);
    pointer(document, 'pointermove', 234);
    pointer(document, 'pointerup', 234);
    f.view.detectChanges();
    expect(markerX(f)).toBeCloseTo(234, 1);
    const offset = root.querySelector<HTMLElement>('.ruler-ticks')!.style.transform,
      count = f.changes.length;
    f.view.componentRef.setInput('timeline', true);
    f.view.componentRef.setInput('disabled', true);
    f.view.detectChanges();
    expect(root.querySelector('.ruler-marker')).toBeNull();
    expect(root.querySelector('.is-rewinding')).not.toBeNull();
    expect(root.querySelector<HTMLElement>('.ruler-ticks')!.style.transform).toBe(offset);
    await vi.advanceTimersByTimeAsync(600);
    f.view.detectChanges();
    expect(root.querySelector('.is-seconds')).not.toBeNull();
    expect(root.querySelector('.ruler-marker')).toBeNull();
    expect(f.changes).toHaveLength(count);
  });
  it('skips the start swipe with reduced motion and cancels it on reset', async () => {
    const f = setup();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    f.view.componentRef.setInput('timeline', true);
    f.view.detectChanges();
    expect((f.view.nativeElement as HTMLElement).querySelector('.is-rewinding')).toBeNull();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    f.view.componentRef.setInput('timeline', false);
    f.view.detectChanges();
    f.view.componentRef.setInput('timeline', true);
    f.view.detectChanges();
    expect((f.view.nativeElement as HTMLElement).querySelector('.is-rewinding')).not.toBeNull();
    f.view.componentRef.setInput('timeline', false);
    f.view.detectChanges();
    await vi.advanceTimersByTimeAsync(1000);
    f.view.detectChanges();
    expect((f.view.nativeElement as HTMLElement).querySelector('.is-rewinding')).toBeNull();
  });
});
