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
    lastOffset: number;
    active: boolean;
  };
  private hold?: ReturnType<typeof setTimeout>;
  private frame?: number;
  private lastFrame = 0;
  private readonly moveListener = (event: PointerEvent) => this.move(event);
  private readonly upListener = (event: PointerEvent) => this.end(event);
  private readonly cancelListener = () => this.cancel();
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
    const element = event.currentTarget as HTMLElement;
    const bounds = element.getBoundingClientRect();
    this.gesture = {
      id: event.pointerId,
      element,
      x: event.clientX,
      y: event.clientY,
      clientX: event.clientX,
      left: bounds.left,
      width: bounds.width,
      lastOffset: 0,
      active: false,
    };
    this.document.addEventListener('pointermove', this.moveListener);
    this.document.addEventListener('pointerup', this.upListener);
    this.document.addEventListener('pointercancel', this.cancelListener);
    this.document.addEventListener('scroll', this.cancelListener, true);
    this.document.addEventListener('visibilitychange', this.visibilityListener);
    this.document.defaultView?.addEventListener('blur', this.cancelListener);
    this.hold = setTimeout(() => this.activate(), 350);
  }

  private activate(): void {
    const gesture = this.gesture;
    if (!gesture || this.disabled() || this.document.hidden) return;
    gesture.active = true;
    this.dragging.set(true);
    this.position.set(this.currentMinute());
    try {
      gesture.element.setPointerCapture(gesture.id);
    } catch {
      /* Document listeners cover capture support. */
    }
    this.point(gesture.clientX);
    this.lastFrame = 0;
    this.frame = requestAnimationFrame((time) => this.advance(time));
  }

  private move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = Math.abs(event.clientX - gesture.x);
    const dy = Math.abs(event.clientY - gesture.y);
    if (!gesture.active && dy > 10 && dy > dx) {
      this.cancel();
      return;
    }
    gesture.clientX = event.clientX;
    if (!gesture.active && dx > 6) {
      clearTimeout(this.hold);
      this.activate();
    } else if (gesture.active) this.point(event.clientX);
  }

  private point(clientX: number): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const offset = (clientX - gesture.left - gesture.width / 2) / pitch;
    this.setPosition((this.position() ?? this.currentMinute()) + offset - gesture.lastOffset);
    gesture.lastOffset = offset;
  }

  private advance(time: number): void {
    const gesture = this.gesture;
    if (!gesture?.active) return;
    const dt = this.lastFrame ? Math.min(50, time - this.lastFrame) / 1000 : 0;
    this.lastFrame = time;
    const normalized = (gesture.clientX - gesture.left) / gesture.width;
    const edge =
      normalized < 0.2
        ? Math.max(-1, (normalized - 0.2) / 0.2)
        : normalized > 0.8
          ? Math.min(1, (normalized - 0.8) / 0.2)
          : 0;
    if (edge)
      this.setPosition(
        (this.position() ?? this.currentMinute()) + Math.sign(edge) * (1 + 23 * edge * edge) * dt,
      );
    this.frame = requestAnimationFrame((next) => this.advance(next));
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
