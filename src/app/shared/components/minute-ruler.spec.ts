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
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: id },
      isPrimary: { value: true },
      pointerType: { value: 'touch' },
    });
    element.dispatchEvent(event);
  }
  it('taps the exact minute tick without starting a hold loop', async () => {
    const f = setup();
    pointer(f.slider, 'pointerdown', 234);
    expect(f.changes).toEqual([]);
    pointer(document, 'pointerup', 234);
    expect(f.changes).toEqual([33 * 60]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toHaveLength(1);
  });
  it('does not change time when scrolling vertically over the ruler', async () => {
    const f = setup();
    pointer(f.slider, 'pointerdown', 234);
    pointer(document, 'pointermove', 236, 70);
    pointer(document, 'pointerup', 236, 70);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.changes).toEqual([]);
  });
  it('holds and accelerates more near the edge, then stops on release', async () => {
    const f = setup();
    pointer(f.slider, 'pointerdown', 300);
    await vi.advanceTimersByTimeAsync(1350);
    const first = f.changes.at(-1)!;
    pointer(document, 'pointermove', 358);
    const afterMove = f.changes.at(-1)!;
    await vi.advanceTimersByTimeAsync(1000);
    const second = f.changes.at(-1)!;
    expect(first).toBeGreaterThan(30 * 60);
    expect(second - afterMove).toBeGreaterThan(first - 37 * 60);
    pointer(document, 'pointerup', 358);
    const count = f.changes.length;
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
  it('supports keyboard stepping and clamps to one minute and seven days', () => {
    const f = setup(60);
    const key = (key: string) =>
      f.slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    key('ArrowLeft');
    expect(f.changes.at(-1)).toBe(60);
    key('ArrowRight');
    expect(f.changes.at(-1)).toBe(120);
    key('PageUp');
    expect(f.changes.at(-1)).toBe(720);
    key('End');
    expect(f.changes.at(-1)).toBe(604800);
    key('ArrowRight');
    expect(f.changes.at(-1)).toBe(604800);
    key('Home');
    expect(f.changes.at(-1)).toBe(60);
  });
});
