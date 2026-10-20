import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { formatCountdown, maxClockSeconds } from '../../core/models/step-timer';

const pitch = 18;
const maximum = maxClockSeconds / 60;
const cycleLength = maximum + 1;
const inset = 16;

/** A cyclic minute ruler. Gestures and the bounded start swipe share one frame owner. */
@Component({
  selector: 'app-minute-ruler',
  styleUrl: './minute-ruler.scss',
  template: `
    <div
      class="minute-ruler"
      role="slider"
      [tabIndex]="locked() ? -1 : 0"
      [attr.aria-label]="label()"
      aria-valuemin="0"
      [attr.aria-valuemax]="maximum"
      [attr.aria-valuenow]="minute()"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-disabled]="locked()"
      [class.is-dragging]="dragging() || rewinding()"
      [class.is-rewinding]="rewinding()"
      (pointerdown)="begin($event)"
      (lostpointercapture)="captureLost()"
      (keydown)="key($event)"
      (contextmenu)="$event.preventDefault()"
      (wheel)="wheel($event)"
      (blur)="wheelRemainder = 0"
      title="Drag to adjust. Use arrow keys for one minute, Page Up/Down for ten. Scroll when focused."
      [class.is-overdue]="overdue()"
    >
      <div class="ruler-viewport" aria-hidden="true">
        <div class="ruler-ticks" [style.transform]="offset()">
          @for (tick of ticks(); track $index) {
            <span
              class="ruler-tick"
              [class.is-major]="tickMinute(tick) % 5 === 0"
              [attr.data-minute]="tickMinute(tick)"
              [class.is-elapsed]="timeline() && tick >= 0 && tick * 60 <= elapsedSeconds()"
              [class.is-after-end]="
                timeline() && tick * 60 > totalSeconds() && tick * 60 > elapsedSeconds()
              "
              [style.left.px]="$index * pitch"
            >
              @if (tickMinute(tick) % 5 === 0) {
                <span class="ruler-number">{{ tickMinute(tick) }}</span>
              }
            </span>
          }
        </div>
      </div>
      <span
        class="ruler-marker"
        [class.is-timeline]="timeline() && !adjusting()"
        [class.is-overdue]="overdue()"
        [style.transform]="markerTransform()"
        aria-hidden="true"
      ></span>
      @if (timeline() && endVisible()) {
        <span class="ruler-end" [style.transform]="endTransform()" aria-hidden="true"></span>
      }
    </div>
  `,
})
export class MinuteRulerComponent {
  readonly seconds = input.required<number>();
  readonly disabled = input(false);
  readonly timeline = input(false);
  readonly elapsedSeconds = input(0);
  readonly totalSeconds = input(0);
  readonly overdue = input(false);
  readonly identity = input('');
  readonly label = input('Timer duration');
  readonly durationChange = output<number>();
  protected readonly maximum = maximum;
  protected readonly pitch = pitch;
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly width = signal(360);
  private readonly position = signal<number | undefined>(undefined);
  private readonly cycle = signal(0);
  private readonly introPosition = signal<number | undefined>(undefined);
  protected readonly locked = computed(() => this.disabled() || this.timeline());
  protected readonly rewinding = computed(() => this.introPosition() !== undefined);
  protected readonly dragging = signal(false);
  protected wheelRemainder = 0;
  protected readonly adjusting = computed(() => this.position() !== undefined);
  protected readonly minute = computed(() =>
    this.tickMinute(Math.round(this.position() ?? this.currentMinute())),
  );
  protected readonly valueText = computed(() => formatCountdown(this.minute() * 60));
  private readonly visiblePosition = computed(() => {
    const intro = this.introPosition();
    if (intro !== undefined) return intro;
    if (this.timeline()) return Math.max(0, this.elapsedSeconds() / 60);
    return this.position() ?? this.idlePosition();
  });
  private readonly windowStart = computed(() => {
    const visible = this.visiblePosition();
    const capacity = Math.max(1, (this.width() - inset * 2) / pitch);
    // Keep the initial zero near the left, while allowing the scale to repeat on either side.
    return visible < 0 ? visible : Math.max(0, visible - capacity / 2);
  });
  protected readonly ticks = computed(() =>
    Array.from({ length: 39 }, (_, i) => Math.floor(this.windowStart()) + i),
  );
  protected readonly offset = computed(
    () =>
      'translateX(' +
      (inset - (this.windowStart() - Math.floor(this.windowStart())) * pitch) +
      'px)',
  );
  protected readonly markerTransform = computed(
    () => 'translateX(' + this.x(this.visiblePosition()) + 'px)',
  );
  protected readonly endVisible = computed(
    () =>
      this.x(this.totalSeconds() / 60) >= inset &&
      this.x(this.totalSeconds() / 60) <= this.width() - inset,
  );
  protected readonly endTransform = computed(
    () => 'translateX(' + this.x(this.totalSeconds() / 60) + 'px)',
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
    mouse: boolean;
    startMinute: number;
    sampleX: number;
    sampleAt: number;
    velocity: number;
  };
  private hold?: ReturnType<typeof setTimeout>;
  private frame?: number;
  private lastFrame = 0;
  private lastIdentity?: string;
  private lastTimeline?: boolean;
  private coasting = false;
  private motionPreference?: MediaQueryList;
  private readonly motionListener = () => {
    if (this.motionPreference?.matches) this.cancel();
  };
  private readonly interruptListener = () => {
    if (this.coasting) this.cancel();
  };
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
      const identity = this.identity();
      const unavailable = this.disabled();
      const timeline = this.timeline();
      untracked(() => {
        const changed = this.lastIdentity !== identity;
        const starting = !changed && this.lastTimeline === false && timeline;
        const from = this.position() ?? this.idlePosition();
        if (
          changed ||
          unavailable ||
          timeline !== this.lastTimeline ||
          this.gesture ||
          this.coasting
        )
          this.cancel();
        if (changed) this.cycle.set(0);
        this.lastIdentity = identity;
        this.lastTimeline = timeline;
        if (starting) this.rewind(from);
      });
    });
    const destroy = inject(DestroyRef);
    let observer: ResizeObserver | undefined;
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.width.set(element.getBoundingClientRect().width || 360);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver((entries) => {
          const width = entries[0]?.contentRect.width;
          if (width && width !== this.width()) {
            this.cancel();
            this.width.set(width);
          }
        });
        observer.observe(element);
      }
    });
    destroy.onDestroy(() => {
      this.cancel();
      observer?.disconnect();
    });
  }

  /** Stop an in-flight gesture before an external timer control changes its value. */
  stopMotion(): void {
    this.cancel();
  }

  protected begin(event: PointerEvent): void {
    if (this.locked() || event.button !== 0 || event.isPrimary === false) return;
    this.cancel();
    event.preventDefault();
    const element = event.currentTarget as HTMLElement;
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0) return;
    this.width.set(bounds.width);
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
      mouse: event.pointerType === 'mouse',
      startMinute: this.idlePosition(),
      sampleX: event.clientX,
      sampleAt: performance.now(),
      velocity: 0,
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
    this.watchInterruption();
    if (!this.gesture.mouse) this.hold = setTimeout(() => this.activate(), 350);
  }

  private activate(): void {
    const gesture = this.gesture;
    if (!gesture || gesture.active || this.locked() || this.document.hidden) return;
    gesture.active = true;
    this.dragging.set(true);
    this.position.set(this.idlePosition());
    this.lastFrame = 0;
    if (!gesture.mouse) this.frame = requestAnimationFrame((time) => this.advance(time));
  }

  private move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    event.preventDefault();
    const now = performance.now();
    const elapsed = now - gesture.sampleAt;
    if (elapsed > 0) gesture.velocity = (event.clientX - gesture.sampleX) / elapsed;
    gesture.sampleX = event.clientX;
    gesture.sampleAt = now;
    gesture.clientX = event.clientX;
    // A drag controls speed, never jumps the value to the finger's starting tick.
    if (!gesture.active && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) {
      clearTimeout(this.hold);
      this.activate();
    }
    if (gesture.active && gesture.mouse)
      this.setPosition(gesture.startMinute + (event.clientX - gesture.x) / pitch);
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
    if (speed) this.setPosition((this.position() ?? this.idlePosition()) + speed * dt);
    if (this.gesture === gesture) this.frame = requestAnimationFrame((next) => this.advance(next));
  }

  private end(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!gesture.active) {
      const minute = Math.round(
        this.windowStart() + (event.clientX - gesture.left - inset) / pitch,
      );
      this.cycle.set(Math.floor(minute / cycleLength));
      this.durationChange.emit(this.tickMinute(minute) * 60);
    }
    const velocity =
      gesture.active && !gesture.mouse && performance.now() - gesture.sampleAt < 120
        ? gesture.velocity
        : 0;
    const from = this.position() ?? this.idlePosition();
    const reducedMotion = this.document.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    this.cancel();
    if (Math.abs(velocity) >= 0.35 && !reducedMotion) this.coast(from, velocity);
  }

  protected captureLost(): void {
    // Releasing our capture after pointerup must not cancel the new coast.
    if (this.gesture) this.cancel();
  }

  private coast(from: number, velocity: number): void {
    const speed = (Math.abs(velocity) * 1000) / pitch;
    const ticks = Math.min(20, Math.max(1, Math.round((speed * speed) / 60)));
    const target = Math.round(from) + Math.sign(velocity) * ticks;
    if (target === Math.round(from)) return;
    const duration = Math.min(1100, Math.max(650, ((2 * ticks) / speed) * 1000));
    const started = performance.now();
    this.watchMotion();
    this.coasting = true;
    this.dragging.set(true);
    this.position.set(from);
    this.document.addEventListener('pointerdown', this.interruptListener, true);
    this.watchInterruption();
    const advance = (time: number) => {
      if (!this.coasting) return;
      const progress = Math.min(1, Math.max(0, (time - started) / duration));
      this.setPosition(from + (target - from) * (1 - (1 - progress) ** 2));
      if (!this.coasting) return;
      if (progress === 1) this.cancel();
      else this.frame = requestAnimationFrame(advance);
    };
    this.frame = requestAnimationFrame(advance);
  }

  private rewind(from: number): void {
    if (
      this.document.hidden ||
      this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return;
    this.watchMotion();
    this.watchInterruption();
    this.introPosition.set(from);
    const started = performance.now();
    const advance = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - started) / 420));
      const target = this.elapsedSeconds() / 60;
      this.introPosition.set(from + (target - from) * (1 - (1 - progress) ** 3));
      if (progress === 1) this.cancel();
      else this.frame = requestAnimationFrame(advance);
    };
    this.frame = requestAnimationFrame(advance);
  }

  private watchMotion(): void {
    this.motionPreference = this.document.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    );
    this.motionPreference?.addEventListener('change', this.motionListener);
  }

  private watchInterruption(): void {
    this.document.addEventListener('scroll', this.cancelListener, true);
    this.document.addEventListener('visibilitychange', this.visibilityListener);
    this.document.defaultView?.addEventListener('blur', this.cancelListener);
  }

  protected cancel(): void {
    clearTimeout(this.hold);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    const gesture = this.gesture;
    this.gesture = undefined;
    this.coasting = false;
    this.motionPreference?.removeEventListener('change', this.motionListener);
    this.motionPreference = undefined;
    this.document.removeEventListener('pointerdown', this.interruptListener, true);
    this.wheelRemainder = 0;
    this.frame = undefined;
    const position = this.position();
    if (position !== undefined) this.cycle.set(Math.floor(Math.round(position) / cycleLength));
    this.position.set(undefined);
    this.introPosition.set(undefined);
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
    if (this.locked()) return;
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
        ? 0
        : event.key === 'End'
          ? maxClockSeconds
          : event.key in delta
            ? this.seconds() + delta[event.key] * 60
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    this.cancel();
    this.selectRelative(next);
  }

  protected wheel(event: WheelEvent): void {
    if (
      this.locked() ||
      this.gesture ||
      event.ctrlKey ||
      event.metaKey ||
      this.document.activeElement !== event.currentTarget
    )
      return;
    event.preventDefault();
    if (this.coasting) this.cancel();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.width() : 1;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    this.wheelRemainder += Math.max(-400, Math.min(400, -delta * unit));
    const minutes = Math.trunc(this.wheelRemainder / 40);
    if (!minutes) return;
    this.wheelRemainder -= minutes * 40;
    this.selectRelative(this.seconds() + minutes * 60);
  }

  private x(minute: number): number {
    return Math.round((inset + (minute - this.windowStart()) * pitch) * 1000) / 1000;
  }
  private setPosition(value: number): void {
    const before = this.minute();
    this.position.set(value);
    if (this.minute() !== before) this.durationChange.emit(this.minute() * 60);
  }
  protected tickMinute(tick: number): number {
    return ((tick % cycleLength) + cycleLength) % cycleLength;
  }
  private selectRelative(seconds: number): void {
    const minute = Math.floor(seconds / 60);
    const remainder = ((seconds % 60) + 60) % 60;
    this.cycle.update((cycle) => cycle + Math.floor(minute / cycleLength));
    this.durationChange.emit(Math.min(maxClockSeconds, this.tickMinute(minute) * 60 + remainder));
  }
  private idlePosition(): number {
    return this.currentMinute() + this.cycle() * cycleLength;
  }
  private currentMinute(): number {
    return Math.min(maximum, Math.max(0, Math.round(this.seconds() / 60)));
  }
}
