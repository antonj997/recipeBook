import { Directive, signal } from '@angular/core';

// Native scrolling stays in control; pointer input only changes the card's visual surface.
@Directive({
  selector: '[appCardTilt]',
  host: {
    '[style.--tilt-x]': 'x() + "deg"',
    '[style.--tilt-y]': 'y() + "deg"',
    '(pointermove)': 'move($event)',
    '(pointerleave)': 'reset()',
    '(pointercancel)': 'reset()',
    '(blur)': 'reset()',
  },
})
export class CardTiltDirective {
  readonly x = signal(0);
  readonly y = signal(0);
  move(event: PointerEvent): void {
    if (
      event.pointerType !== 'mouse' ||
      !matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches
    )
      return;
    const card = event.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    this.x.set(-3 * (((event.clientY - rect.top) / rect.height) * 2 - 1));
    this.y.set(4 * (((event.clientX - rect.left) / rect.width) * 2 - 1));
  }
  reset(): void {
    this.x.set(0);
    this.y.set(0);
  }
}
