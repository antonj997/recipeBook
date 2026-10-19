import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { formatCountdown, maxStepTimerSeconds } from '../../core/models/step-timer';

const pitch = 18;
const maximum = maxStepTimerSeconds / 60;

/** A bounded minute ruler. Only an active gesture owns document listeners or an animation frame. */
@Component({
  selector: 'app-minute-ruler',
  styleUrl: './minute-ruler.scss',
  template: `
    <div
      class="minute-ruler"
      role="slider"
      [tabIndex]="disabled() ? -1 : 0"
      [attr.aria-label]="label()"
      aria-valuemin="1"
      [attr.aria-valuemax]="maximum"
      [attr.aria-valuenow]="minute()"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-disabled]="disabled()"
      [class.is-dragging]="dragging()"
      (pointerdown)="begin($event)"
      (lostpointercapture)="cancel()"
      (keydown)="key($event)"
      (contextmenu)="$event.preventDefault()"
    >
      <div class="ruler-ticks" aria-hidden="true" [style.transform]="offset()">
        @for (offset of offsets; track offset) {
          <span
            class="ruler-tick"
            [class.is-major]="(minute() + offset) % 5 === 0"
            [class.is-current]="offset === 0"
            [style.visibility]="
              minute() + offset < 1 || minute() + offset > maximum ? 'hidden' : null
            "
          ></span>
        }
      </div>
      <span class="ruler-marker" aria-hidden="true"></span>
    </div>
  `,
})
export class MinuteRulerComponent {
  readonly seconds = input.required<number>();
  readonly disabled = input(false);
  readonly identity = input('');
  readonly label = input('Timer duration');
  readonly durationChange = output<number>();
  protected readonly maximum = maximum;
  protected readonly offsets = Array.from({ length: 39 }, (_, i) => i - 19);
  private readonly document = inject(DOCUMENT);
  private readonly position = signal<number | undefined>(undefined);
  protected readonly dragging = signal(false);
  protected readonly minute = computed(() => Math.round(this.position() ?? this.currentMinute()));
  protected readonly valueText = computed(() => formatCountdown(this.minute() * 60));
  protected readonly offset = computed(
    () =>
      'translateX(' + (-(this.position() ?? this.currentMinute()) + this.minute()) * pitch + 'px)',
  );
  private gesture?: {
    id: number;
    element: HTMLElement;
    x: number;
    y: number;
    clientX: number;
    left: number;
    width: number;
    active: boolean;
  };
  private hold?: ReturnType<typeof setTimeout>;
  private frame?: number;
  private lastFrame = 0;
  private readonly moveListener = (event: PointerEvent) => this.move(event);
  private readonly upListener = (event: PointerEvent) => this.end(event);
  private readonly cancelListener = () => this.cancel();
  private readonly preventScroll = (event: Event) => {
    if (this.gesture && event.cancelable) event.preventDefault();
  };
  private readonly visibilityListener = () => {
    if (this.document.hidden) this.cancel();
  };

  constructor() {
    effect(() => {
      this.identity();
      const unavailable = this.disabled();
      untracked(() => {
        if (unavailable || this.gesture) this.cancel();
      });
    });
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  protected begin(event: PointerEvent): void {
    if (this.disabled() || event.button !== 0 || event.isPrimary === false) return;
    this.cancel();
    event.preventDefault();
    const element = event.currentTarget as HTMLElement;
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0) return;
    element.focus({ preventScroll: true });
    this.gesture = {
      id: event.pointerId,
      element,
      x: event.clientX,
      y: event.clientY,
      clientX: event.clientX,
      left: bounds.left,
      width: bounds.width,
      active: false,
    };
    // Capture from the first contact so a drag can begin anywhere, including the center.
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* Document listeners are the fallback. */
    }
    this.document.addEventListener('pointermove', this.moveListener, { passive: false });
    this.document.addEventListener('touchmove', this.preventScroll, { passive: false });
    this.document.addEventListener('wheel', this.preventScroll, { passive: false });
    this.document.addEventListener('pointerup', this.upListener);
    this.document.addEventListener('pointercancel', this.cancelListener);
    this.document.addEventListener('scroll', this.cancelListener, true);
    this.document.addEventListener('visibilitychange', this.visibilityListener);
    this.document.defaultView?.addEventListener('blur', this.cancelListener);
    this.hold = setTimeout(() => this.activate(), 350);
  }

  private activate(): void {
    const gesture = this.gesture;
    if (!gesture || gesture.active || this.disabled() || this.document.hidden) return;
    gesture.active = true;
    this.dragging.set(true);
    this.position.set(this.currentMinute());
    this.lastFrame = 0;
    this.frame = requestAnimationFrame((time) => this.advance(time));
  }

  private move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    event.preventDefault();
    gesture.clientX = event.clientX;
    // A drag controls speed, never jumps the value to the finger's starting tick.
    if (!gesture.active && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) {
      clearTimeout(this.hold);
      this.activate();
    }
  }

  private advance(time: number): void {
    const gesture = this.gesture;
    if (!gesture?.active) return;
    const dt = this.lastFrame ? Math.min(50, time - this.lastFrame) / 1000 : 0;
    this.lastFrame = time;
    const distance = Math.max(
      -1,
      Math.min(1, (gesture.clientX - gesture.left - gesture.width / 2) / (gesture.width / 2)),
    );
    // A small center rest area prevents drift. Everywhere else responds continuously;
    // the edges reach 24 minutes per second, with a quadratic ramp for fine control.
    const speed =
      Math.abs(distance) < 0.04 ? 0 : Math.sign(distance) * (0.5 + 23.5 * distance * distance);
    if (speed) this.setPosition((this.position() ?? this.currentMinute()) + speed * dt);
    if (this.gesture === gesture) this.frame = requestAnimationFrame((next) => this.advance(next));
  }

  private end(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!gesture.active) {
      const minutes =
        this.currentMinute() +
        Math.round((event.clientX - gesture.left - gesture.width / 2) / pitch);
      this.durationChange.emit(this.clamp(minutes) * 60);
    }
    this.cancel();
  }

  protected cancel(): void {
    clearTimeout(this.hold);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    const gesture = this.gesture;
    this.gesture = undefined;
    this.frame = undefined;
    this.position.set(undefined);
    this.dragging.set(false);
    this.document.removeEventListener('pointermove', this.moveListener);
    this.document.removeEventListener('touchmove', this.preventScroll);
    this.document.removeEventListener('wheel', this.preventScroll);
    this.document.removeEventListener('pointerup', this.upListener);
    this.document.removeEventListener('pointercancel', this.cancelListener);
    this.document.removeEventListener('scroll', this.cancelListener, true);
    this.document.removeEventListener('visibilitychange', this.visibilityListener);
    this.document.defaultView?.removeEventListener('blur', this.cancelListener);
    if (gesture?.element.hasPointerCapture?.(gesture.id))
      gesture.element.releasePointerCapture(gesture.id);
  }

  protected key(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const delta: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 10,
      PageDown: -10,
    };
    const next =
      event.key === 'Home'
        ? 1
        : event.key === 'End'
          ? maximum
          : event.key in delta
            ? this.currentMinute() + delta[event.key]
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    this.durationChange.emit(this.clamp(next) * 60);
  }

  private setPosition(value: number): void {
    const before = this.minute();
    this.position.set(this.clamp(value));
    if (this.minute() !== before) this.durationChange.emit(this.minute() * 60);
  }
  private currentMinute(): number {
    return this.clamp(Math.round(this.seconds() / 60));
  }
  private clamp(value: number): number {
    return Math.min(maximum, Math.max(1, value));
  }
}
