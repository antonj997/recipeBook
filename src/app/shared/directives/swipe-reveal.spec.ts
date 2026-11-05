import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwipeRevealDirective } from './swipe-reveal';

@Component({
  imports: [SwipeRevealDirective],
  template: `
    @for (id of ['a', 'b']; track id) {
      <li appSwipeReveal [attr.data-id]="id">
        <button type="button" (click)="actions = actions + 1">Stop</button>
        <a class="swipe-content" href="#" (click)="$event.preventDefault(); opens = opens + 1"
          >Row</a
        >
      </li>
    }
  `,
})
class HostComponent {
  opens = 0;
  actions = 0;
}

function pointer(target: EventTarget, type: string, x: number, y = 100) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: 3 }, pointerType: { value: 'touch' } });
  target.dispatchEvent(event);
}
function drag(target: EventTarget, from: number, to: number, dy = 0) {
  pointer(target, 'pointerdown', from);
  for (let step = 1; step <= 4; step++)
    pointer(target, 'pointermove', from + ((to - from) * step) / 4, 100 + (dy * step) / 4);
  pointer(target, 'pointerup', to, 100 + dy);
}

describe('swipe reveal', () => {
  afterEach(() => TestBed.resetTestingModule());

  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const row = (id: string) => {
      fixture.detectChanges();
      return root.querySelector<HTMLElement>(`li[data-id="${id}"]`)!;
    };
    const content = (id: string) => row(id).querySelector<HTMLElement>('.swipe-content')!;
    const offset = (id: string) => row(id).style.getPropertyValue('--swipe-offset');
    return { fixture, row, content, offset };
  }

  it('slides the card left to reveal the action, and opens past half', () => {
    const { row, content, offset, fixture } = render();
    drag(content('a'), 300, 200);
    expect(row('a').classList.contains('is-open')).toBe(true);
    expect(offset('a')).toBe('-104px');
    // The drag never counts as opening the row.
    content('a').click();
    expect(fixture.componentInstance.opens).toBe(0);
  });

  it('snaps back when the drag is short or goes right', () => {
    const { row, content, offset } = render();
    drag(content('a'), 300, 260);
    expect(row('a').classList.contains('is-open')).toBe(false);
    expect(offset('a')).toBe('0px');
    drag(content('a'), 300, 380);
    expect(offset('a')).toBe('0px');
  });

  it('leaves vertical scrolling alone', () => {
    const { row, content } = render();
    drag(content('a'), 300, 240, 120);
    expect(row('a').classList.contains('is-open')).toBe(false);
  });

  it('closes on a tap of the open card instead of opening it, and one card opens at a time', () => {
    const { row, content, fixture } = render();
    drag(content('a'), 300, 180);
    drag(content('b'), 300, 180);
    expect(row('a').classList.contains('is-open')).toBe(false);
    expect(row('b').classList.contains('is-open')).toBe(true);
    pointer(content('b'), 'pointerdown', 200);
    pointer(content('b'), 'pointerup', 200);
    content('b').click();
    expect(row('b').classList.contains('is-open')).toBe(false);
    expect(fixture.componentInstance.opens).toBe(0);
    content('b').click();
    expect(fixture.componentInstance.opens).toBe(1);
  });

  it('can be dragged closed again', () => {
    const { row, content } = render();
    drag(content('a'), 300, 180);
    drag(content('a'), 200, 300);
    expect(row('a').classList.contains('is-open')).toBe(false);
  });

  it('closes when its action is used', () => {
    const { row, content } = render();
    drag(content('a'), 300, 180);
    row('a').querySelector('button')!.click();
    expect(row('a').classList.contains('is-open')).toBe(false);
  });
});
