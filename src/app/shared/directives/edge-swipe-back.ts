import { DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';
import { motionMs } from '../../core/motion';

const edge = 24;
const threshold = 0.35;
const flick = 0.5; // pixels per millisecond

/**
 * Swipe in from the left edge to go back. The page follows the finger, shrinking a little
 * toward the card it came from; past a third of the width or with a quick flick it goes back,
 * and the closing transition starts from where the page was let go. Otherwise it springs back.
 */
@Directive({ selector: '[appEdgeSwipeBack]', host: { '(pointerdown)': 'down($event)' } })
export class EdgeSwipeBackDirective {
  /** Only where the system has no back swipe of its own, such as an iPhone Home Screen app. */
  readonly enabled = input(false, { alias: 'edgeSwipeEnabled' });
  readonly swipeBack = output<void>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private gesture?: {
    id: number;
    x: number;
    y: number;
    width: number;
    active: boolean;
    samples: { x: number; at: number }[];
  };
  private readonly move = (event: PointerEvent) => this.track(event);
  private readonly up = (event: PointerEvent) => this.release(event);
  private readonly cancel = () => this.settle();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopListening());
  }

  protected down(event: PointerEvent): void {
    if (!this.enabled() || this.gesture || event.pointerType !== 'touch' || !event.isPrimary)
      return;
    const box = this.element.getBoundingClientRect();
    if (event.clientX - box.left > edge) return;
    this.gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: box.width || 1,
      active: false,
      samples: [{ x: event.clientX, at: performance.now() }],
    };
    document.addEventListener('pointermove', this.move, { passive: false });
    document.addEventListener('pointerup', this.up);
    document.addEventListener('pointercancel', this.cancel);
  }

  private track(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.active) {
      // Vertical movement is scrolling; leave it to the page.
      if (Math.abs(dy) > 10 && Math.abs(dy) > dx) return this.settle();
      if (dx < 8) return;
      if (dx < Math.abs(dy) * 1.2) return this.settle();
      gesture.active = true;
      try {
        this.element.setPointerCapture(event.pointerId);
      } catch {
        /* Document listeners still follow the finger. */
      }
    }
    event.preventDefault();
    const at = performance.now();
    gesture.samples = [
      ...gesture.samples.filter((sample) => at - sample.at <= 100),
      { x: event.clientX, at },
    ];
    this.paint(Math.max(0, dx) / gesture.width);
  }

  private release(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!gesture.active) return this.settle();
    const progress = (event.clientX - gesture.x) / gesture.width;
    const first = gesture.samples[0]!;
    const last = gesture.samples.at(-1)!;
    const velocity = last.at > first.at ? (last.x - first.x) / (last.at - first.at) : 0;
    if (progress > threshold || velocity > flick) {
      // Keep the page where it is: the closing transition captures it from here.
      this.stopListening();
      this.gesture = undefined;
      this.swipeBack.emit();
      return;
    }
    this.settle();
  }

  private paint(progress: number): void {
    const amount = Math.min(1, progress);
    const style = this.element.style;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Shrinking about the centre while sliding by half the shrink keeps the right edge in place:
    // the page never overflows the viewport, which would abort the closing transition.
    style.transformOrigin = 'center 30%';
    style.transform = reduced
      ? `scale(${1 - amount * 0.3})`
      : `translateX(${amount * 15}%) scale(${1 - amount * 0.3})`;
    style.borderRadius = `${amount * 16}px`;
    style.overflow = 'clip';
  }

  /** Springs the page back into place and forgets the gesture. */
  private settle(): void {
    this.stopListening();
    const active = this.gesture?.active;
    this.gesture = undefined;
    const style = this.element.style;
    const clear = () => {
      for (const property of ['transform', 'transform-origin', 'border-radius', 'overflow'])
        style.removeProperty(property);
    };
    if (
      !active ||
      typeof this.element.animate !== 'function' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return clear();
    const from = style.transform;
    clear();
    const easing =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--motion-spring-snappy')
        .trim() || 'ease-out';
    this.element.animate([{ transform: from }, { transform: 'none' }], {
      duration: motionMs(280),
      easing,
    });
  }

  private stopListening(): void {
    document.removeEventListener('pointermove', this.move);
    document.removeEventListener('pointerup', this.up);
    document.removeEventListener('pointercancel', this.cancel);
  }
}
