import { DestroyRef, Directive, ElementRef, inject, input, signal } from '@angular/core';

/** The one row whose action is showing; opening another closes it, as in system lists. */
let openRow: SwipeRevealDirective | null = null;

/**
 * Swipe a row left to slide its content aside and reveal an action button behind it, the way
 * system lists reveal Delete. Its content carries `.swipe-content` and moves by `--swipe-offset`;
 * the button sits behind it. A drag never counts as a tap on the row, a tap on an open row closes
 * it, and vertical drags are left to scrolling. Keyboard users reach the button with Tab; the
 * stylesheet slides the content aside while the button has focus.
 */
@Directive({
  selector: '[appSwipeReveal]',
  exportAs: 'appSwipeReveal',
  host: {
    '[class.is-open]': 'open()',
    '[class.is-dragging]': 'dragging()',
    '[style.--swipe-offset]': "offset() + 'px'",
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up()',
    '(pointercancel)': 'cancel()',
  },
})
export class SwipeRevealDirective {
  /** How far the content slides: the action's width plus the gap beside it. */
  readonly revealWidth = input(104);
  readonly open = signal(false);
  readonly dragging = signal(false);
  readonly offset = signal(0);
  private start?: { x: number; y: number; base: number };
  private horizontal: boolean | null = null;
  private suppressClick = false;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const click = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest('button')) {
        this.suppressClick = false;
        this.close();
        return;
      }
      if (!this.suppressClick) return;
      this.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // Capture runs before the row's own link, so a drag or a closing tap never opens it.
    host.addEventListener('click', click, true);
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('click', click, true);
      if (openRow === this) openRow = null;
    });
  }

  down(event: PointerEvent): void {
    this.suppressClick = false;
    if (event.button > 0 || (event.target as Element | null)?.closest('button')) return;
    this.start = {
      x: event.clientX,
      y: event.clientY,
      base: this.open() ? -this.revealWidth() : 0,
    };
    this.horizontal = null;
  }

  move(event: PointerEvent): void {
    const start = this.start;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (this.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      this.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!this.horizontal) {
        this.start = undefined;
        return;
      }
      this.dragging.set(true);
      try {
        (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
      } catch {
        /* Capture only keeps the drag when the finger leaves the row. */
      }
    }
    this.offset.set(Math.min(0, Math.max(-this.revealWidth(), start.base + dx)));
  }

  up(): void {
    if (!this.start && !this.dragging()) return;
    const dragged = this.horizontal === true;
    this.start = undefined;
    this.dragging.set(false);
    if (dragged) {
      this.suppressClick = true;
      this.setOpen(this.offset() < -this.revealWidth() / 2);
    } else if (this.open()) {
      this.suppressClick = true;
      this.setOpen(false);
    }
  }

  cancel(): void {
    this.start = undefined;
    this.dragging.set(false);
    this.setOpen(this.open());
  }

  close(): void {
    this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    this.open.set(open);
    this.offset.set(open ? -this.revealWidth() : 0);
    if (open) {
      if (openRow && openRow !== this) openRow.close();
      openRow = this;
    } else if (openRow === this) openRow = null;
  }
}
