import { Directive, signal } from '@angular/core';

// Native scrolling stays in control; pointer input only changes the card's visual surface.
@Directive({
  selector: '[appCardTilt]',
  host: {
    '[style.--tilt-x]': 'x() + "deg"',
    '[style.--tilt-y]': 'y() + "deg"',
    '(pointerenter)': 'enter($event)',
    '(pointermove)': 'move($event)',
    '(pointerleave)': 'reset()',
    '(pointercancel)': 'reset()',
    '(blur)': 'reset()',
  },
})
export class CardTiltDirective {
  readonly x = signal(0);
  readonly y = signal(0);
  private bounds: DOMRect | null = null;

  enter(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      this.bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    }
  }

  move(event: PointerEvent): void {
    if (
      event.pointerType !== 'mouse' ||
      !matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
        .matches
    )
      return;
    // Keep pointer geometry stable while the surface rotates, avoiding feedback jitter.
    const rect = this.bounds;
    if (!rect) return;
    const horizontal = Math.max(
      -1,
      Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1),
    );
    const vertical = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    this.x.set(-6 * vertical);
    this.y.set(8 * horizontal);
  }
  reset(): void {
    this.bounds = null;
    this.x.set(0);
    this.y.set(0);
  }
}
