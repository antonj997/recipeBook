import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeSwipeBackDirective } from './edge-swipe-back';

@Component({
  imports: [EdgeSwipeBackDirective],
  template: `<article
    appEdgeSwipeBack
    [edgeSwipeEnabled]="enabled()"
    (swipeBack)="backs = backs + 1"
  >
    Recipe
  </article>`,
})
class HostComponent {
  readonly enabled = signal(true);
  backs = 0;
}

describe('edge swipe back', () => {
  let now: number;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const page = (fixture.nativeElement as HTMLElement).querySelector('article')!;
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 800,
    } as DOMRect);
    return { fixture, page, host: fixture.componentInstance };
  }
  function pointer(target: EventTarget, type: string, x: number, y = 300) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: 7 },
      pointerType: { value: 'touch' },
      isPrimary: { value: true },
    });
    target.dispatchEvent(event);
  }
  function swipe(page: HTMLElement, from: number, to: number, milliseconds = 300, dy = 0) {
    pointer(page, 'pointerdown', from);
    for (let step = 1; step <= 4; step++) {
      now += milliseconds / 4;
      pointer(page, 'pointermove', from + ((to - from) * step) / 4, 300 + (dy * step) / 4);
    }
    pointer(page, 'pointerup', to, 300 + dy);
  }

  it('goes back after a slow swipe from the edge past a third of the page', () => {
    const { page, host } = render();
    pointer(page, 'pointerdown', 10);
    now += 100;
    pointer(page, 'pointermove', 120);
    expect(page.style.transform).toContain('scale(');
    now += 400;
    pointer(page, 'pointermove', 160);
    pointer(page, 'pointerup', 160);
    expect(host.backs).toBe(1);
  });

  it('goes back after a quick flick even when it is short', () => {
    const { page, host } = render();
    swipe(page, 8, 90, 60);
    expect(host.backs).toBe(1);
  });

  it('springs back after a short, slow swipe', () => {
    const { page, host } = render();
    swipe(page, 8, 100, 900);
    expect(host.backs).toBe(0);
    expect(page.style.transform).toBe('');
  });

  it('ignores swipes that start away from the edge or move mostly vertically', () => {
    const { page, host } = render();
    swipe(page, 80, 300, 300);
    swipe(page, 8, 60, 300, 200);
    expect(host.backs).toBe(0);
    expect(page.style.transform).toBe('');
  });

  it('does nothing where the system already has a back swipe', () => {
    const { fixture, page, host } = render();
    host.enabled.set(false);
    fixture.detectChanges();
    swipe(page, 8, 300, 300);
    expect(host.backs).toBe(0);
  });

  it('keeps the page where it was let go, and springs it back when asked', () => {
    const { fixture, page, host } = render();
    swipe(page, 8, 300, 300);
    expect(host.backs).toBe(1);
    expect(page.style.transform).toContain('scale(');
    fixture.debugElement
      .query(By.directive(EdgeSwipeBackDirective))
      .injector.get(EdgeSwipeBackDirective)
      .reset();
    expect(page.style.transform).toBe('');
    expect(page.style.borderRadius).toBe('');
  });
});
