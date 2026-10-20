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
import {
  TimerRulerPreferencesService,
  type TimerRulerMode,
} from '../../core/services/timer-ruler-preferences.service';

const pitch = 18;
const maximum = maxClockSeconds / 60;
const cycleLength = maximum + 1;
const inset = 16;
// Ruler-specific tuning: one swipe stays precise; rapid same-direction swipes build speed.
const flingImpulseLimit = 32; // minute ticks per second
const coastSpeedLimit = 48;
const coastFriction = 700; // milliseconds for velocity to decay by a factor of e
const coastSettleSpeed = 0.65;
const flywheelWindow = 300;

/** A cyclic duration picker and a fixed, full-duration countdown strip. */
@Component({
  selector: 'app-minute-ruler',
  styleUrl: './minute-ruler.scss',
  template: `
    <div class="ruler-stage" [class.is-timeline]="timeline()">
      <div
        class="timer-progress"
        [attr.role]="timeline() ? 'progressbar' : null"
        [attr.aria-hidden]="timeline() ? null : true"
        [inert]="!timeline()"
        [attr.aria-label]="label()"
        aria-valuemin="0"
        [attr.aria-valuemax]="totalSeconds()"
        [attr.aria-valuenow]="progressRemaining()"
        [attr.aria-valuetext]="progressText()"
      >
        <div class="progress-ticks" aria-hidden="true">
          @for (tick of progressTicks(); track tick) {
            <span class="progress-tick" [class.is-remaining]="tick < remainingTicks()"></span>
          }
        </div>
      </div>
      <div
        class="minute-ruler"
        [attr.role]="timeline() ? null : 'slider'"
        [attr.aria-hidden]="timeline() ? true : null"
        [inert]="timeline()"
        [tabIndex]="locked() ? -1 : 0"
        [attr.aria-label]="label()"
        aria-valuemin="0"
        [attr.aria-valuemax]="maximum"
        [attr.aria-valuenow]="minute()"
        [attr.aria-valuetext]="valueText()"
        [attr.aria-disabled]="locked()"
        [class.is-dragging]="dragging()"
        (pointerdown)="begin($event)"
        (lostpointercapture)="captureLost()"
        (keydown)="key($event)"
        (contextmenu)="$event.preventDefault()"
        (wheel)="wheel($event)"
        (blur)="wheelRemainder = 0"
        title="Drag to adjust; tap to stop. Use arrow keys for one minute, Page Up/Down for ten. Scroll when focused."
      >
        <div class="ruler-viewport" aria-hidden="true">
          <div class="ruler-ticks" [style.transform]="offset()">
            @for (tick of ticks(); track tick) {
              <span
                class="ruler-tick"
                [class.is-major]="tickMinute(tick) % 5 === 0"
                [attr.data-minute]="tickMinute(tick)"
                [style.left.px]="tick * pitch"
              >
                @if (tickMinute(tick) % 5 === 0) {
                  <span class="ruler-number">{{ tickMinute(tick) }}</span>
                }
              </span>
            }
          </div>
        </div>
        <span class="ruler-marker" [style.transform]="markerTransform()" aria-hidden="true"></span>
      </div>
    </div>
  `,
})
export class MinuteRulerComponent {
  readonly seconds = input.required<number>();
  readonly disabled = input(false);
  readonly timeline = input(false);
  readonly elapsedSeconds = input(0);
  readonly totalSeconds = input(0);
  readonly identity = input('');
  readonly label = input('Timer duration');
  readonly durationChange = output<number>();
  protected readonly maximum = maximum;
  protected readonly pitch = pitch;
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(TimerRulerPreferencesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly width = signal(360);
  private readonly progressWidth = signal(360);
  private readonly position = signal<number | undefined>(undefined);
  private readonly cycle = signal(0);
  private readonly anchor = signal<number | undefined>(undefined);
  protected readonly locked = computed(() => this.disabled() || this.timeline());
  // Geometry depends only on width; each tick covers an equal share of the full duration.
  protected readonly progressTicks = computed(() =>
    Array.from(
      { length: Math.max(12, Math.min(80, Math.floor((this.progressWidth() - 4) / 6))) },
      (_, i) => i,
    ),
  );
  protected readonly progressRemaining = computed(() =>
    Math.max(0, this.totalSeconds() - this.elapsedSeconds()),
  );
  protected readonly remainingTicks = computed(() =>
    this.totalSeconds() > 0
      ? Math.ceil(
          Math.min(1, this.progressRemaining() / this.totalSeconds()) * this.progressTicks().length,
        )
      : 0,
  );
  protected readonly progressText = computed(() => formatCountdown(this.progressRemaining()));
  protected readonly dragging = signal(false);
  protected wheelRemainder = 0;
  protected readonly minute = computed(() =>
    this.tickMinute(Math.round(this.position() ?? this.currentMinute())),
  );
  protected readonly valueText = computed(() => formatCountdown(this.minute() * 60));
  private readonly visiblePosition = computed(() => this.position() ?? this.idlePosition());
  private readonly windowStart = computed(() => {
    const visible = this.visiblePosition();
    const anchor = this.preferences.mode() === 'swipe' ? this.width() / 2 : this.anchor();
    return anchor === undefined
      ? this.defaultWindowStart(visible)
      : visible - (anchor - inset) / pitch;
  });
  protected readonly ticks = computed(() =>
    Array.from(
      { length: Math.ceil(this.width() / pitch) + 2 },
      (_, i) => Math.floor(this.windowStart()) + i,
    ),
  );
  protected readonly offset = computed(() => {
    const offset = inset - this.windowStart() * pitch;
    return 'translateX(' + Math.round(offset * 1000) / 1000 + 'px)';
  });
  protected readonly markerTransform = computed(
    () => 'translateX(' + this.x(this.visiblePosition()) + 'px)',
  );
  private gesture?: {
    id: number;
    element: HTMLElement;
    x: number;
    y: number;
    clientX: number;
    position: number;
    left: number;
    width: number;
    active: boolean;
    mode: TimerRulerMode;
    mouse: boolean;
    sampleX: number;
    sampleAt: number;
    velocity: number;
    carry: number;
    carryAt: number;
  };
  private hold?: ReturnType<typeof setTimeout>;
  private frame?: number;
  private lastFrame = 0;
  private lastIdentity?: string;
  private lastTimeline?: boolean;
  private lastMode?: TimerRulerMode;
  private coasting = false;
  private coastSpeed = 0;
  private coastAt = 0;
  private motionPreference?: MediaQueryList;
  private readonly motionListener = () => {
    if (this.motionPreference?.matches) this.cancel();
  };
  private readonly interruptListener = (event: PointerEvent) => {
    if (!this.coasting) return;
    // Let begin() distinguish stopping the coast from picking a new tick or starting a drag.
    if (
      event.button === 0 &&
      event.isPrimary !== false &&
      this.host.nativeElement.contains(event.target as Node)
    )
      return;
    this.cancel();
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
      const mode = this.preferences.mode();
      untracked(() => {
        const changed = this.lastIdentity !== identity;
        if (
          changed ||
          unavailable ||
          timeline !== this.lastTimeline ||
          mode !== this.lastMode ||
          this.gesture ||
          this.coasting
        )
          this.cancel();
        if (changed) {
          this.cycle.set(0);
          this.anchor.set(undefined);
        }
        this.lastIdentity = identity;
        this.lastTimeline = timeline;
        this.lastMode = mode;
      });
    });
    const destroy = inject(DestroyRef);
    let observer: ResizeObserver | undefined;
    afterNextRender(() => {
      const element = this.host.nativeElement;
      const measure = () => {
        const fullWidth = element.getBoundingClientRect().width || 360;
        const pickerWidth =
          element.querySelector<HTMLElement>('.minute-ruler')?.clientWidth || fullWidth;
        this.progressWidth.set(fullWidth);
        if (pickerWidth !== this.width()) {
          this.cancel();
          this.anchor.set(undefined);
          this.width.set(pickerWidth);
        }
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver((entries) => {
          // The stage animates vertically; only a real width change affects ruler geometry.
          const width = entries[0]?.contentRect.width;
          if (width && width !== this.progressWidth()) measure();
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
  stopMotion(resetView = false): void {
    this.cancel();
    if (resetView) this.anchor.set(undefined);
  }

  protected begin(event: PointerEvent): void {
    if (this.locked() || event.button !== 0 || event.isPrimary === false) return;
    const now = performance.now();
    const mode = this.preferences.mode();
    const from = this.position() ?? this.idlePosition();
    const carry =
      mode === 'swipe' && event.pointerType === 'touch'
        ? this.coastSpeed * Math.exp(-(now - this.coastAt) / coastFriction)
        : 0;
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
      position: from,
      left: bounds.left,
      width: bounds.width,
      active: false,
      mode,
      mouse: event.pointerType === 'mouse',
      sampleX: event.clientX,
      sampleAt: now,
      velocity: 0,
      carry,
      carryAt: now,
    };
    if (mode === 'swipe') this.position.set(from);
    else this.pointAt(event.clientX, false);
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
    if (mode === 'edge' && !this.gesture.mouse) this.hold = setTimeout(() => this.activate(), 350);
  }

  private activate(): void {
    const gesture = this.gesture;
    if (!gesture || gesture.active || this.locked() || this.document.hidden) return;
    gesture.active = true;
    this.dragging.set(true);
    this.setPosition(this.position() ?? this.idlePosition());
    this.driveEdge();
  }

  private move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    event.preventDefault();
    const now = performance.now();
    const elapsed = now - gesture.sampleAt;
    if (elapsed > 0)
      gesture.velocity =
        ((event.clientX - gesture.sampleX) / elapsed) * (gesture.mode === 'swipe' ? -1 : 1);
    if (gesture.velocity && Math.sign(gesture.velocity) !== Math.sign(gesture.carry))
      gesture.carry = 0;
    gesture.sampleX = event.clientX;
    gesture.sampleAt = now;
    gesture.clientX = event.clientX;
    // Swipe moves the scale beneath the center; Edge hold moves the selection with contact.
    this.pointAt(event.clientX, gesture.active);
    if (!gesture.active && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) {
      clearTimeout(this.hold);
      this.activate();
    }
    if (gesture.active) this.driveEdge();
  }

  private pointAt(clientX: number, commit: boolean): void {
    const gesture = this.gesture;
    if (!gesture) return;
    if (gesture.mode === 'swipe') {
      const position = gesture.position - (clientX - gesture.x) / pitch;
      if (commit) this.setPosition(position);
      else this.position.set(position);
      return;
    }
    const window = this.windowStart();
    const anchor = Math.max(inset, Math.min(gesture.width - inset, clientX - gesture.left));
    this.anchor.set(anchor);
    const position = window + (anchor - inset) / pitch;
    if (commit) this.setPosition(position);
    else this.position.set(position);
  }

  private edgeSpeed(): number {
    const gesture = this.gesture;
    if (!gesture || gesture.mouse || gesture.mode !== 'edge') return 0;
    const x = gesture.clientX - gesture.left;
    const edge = gesture.width * 0.2;
    const amount =
      x < edge
        ? (x - edge) / edge
        : x > gesture.width - edge
          ? (x - gesture.width + edge) / edge
          : 0;
    const penetration = Math.max(-1, Math.min(1, amount));
    return Math.sign(penetration) * 24 * penetration ** 2;
  }

  private driveEdge(): void {
    if (!this.edgeSpeed()) {
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
      this.lastFrame = 0;
    } else if (this.frame === undefined) {
      this.lastFrame = 0;
      this.frame = requestAnimationFrame((time) => this.advance(time));
    }
  }

  private advance(time: number): void {
    this.frame = undefined;
    const gesture = this.gesture;
    if (!gesture?.active) return;
    const speed = this.edgeSpeed();
    if (!speed) return;
    const dt = this.lastFrame ? Math.min(50, time - this.lastFrame) / 1000 : 0;
    this.lastFrame = time;
    this.setPosition((this.position() ?? this.idlePosition()) + speed * dt);
    if (this.gesture === gesture) this.frame = requestAnimationFrame((next) => this.advance(next));
  }

  private end(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    if (gesture.mode === 'swipe' && !gesture.active) {
      // Taps only arrest motion. Keep even a typed partial minute exactly unchanged.
      this.cancel();
      return;
    }
    this.pointAt(event.clientX, true);
    const velocity =
      gesture.active && !gesture.mouse && performance.now() - gesture.sampleAt < 120
        ? gesture.velocity
        : 0;
    const from = this.position() ?? this.idlePosition();
    const reducedMotion = this.document.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const coast = gesture.mode === 'swipe' && Math.abs(velocity) >= 0.35 && !reducedMotion;
    if (gesture.mode === 'edge') this.anchor.set(this.x(Math.round(from)));
    const now = performance.now();
    const carry =
      now - gesture.carryAt <= flywheelWindow && Math.sign(velocity) === Math.sign(gesture.carry)
        ? gesture.carry * Math.exp(-(now - gesture.carryAt) / coastFriction)
        : 0;
    const speed =
      Math.sign(velocity) * Math.min(flingImpulseLimit, (Math.abs(velocity) * 1000) / pitch);
    this.cancel();
    if (coast) this.coast(from, speed + carry);
  }

  protected captureLost(): void {
    // Releasing our capture after pointerup must not cancel the new coast.
    if (this.gesture) this.cancel();
  }

  private coast(from: number, velocity: number): void {
    const speed = Math.max(-coastSpeedLimit, Math.min(coastSpeedLimit, velocity));
    const duration = Math.min(3200, Math.log(Math.abs(speed) / coastSettleSpeed) * coastFriction);
    const started = performance.now();
    this.watchMotion();
    this.coasting = true;
    this.coastSpeed = speed;
    this.coastAt = started;
    this.dragging.set(true);
    this.position.set(from);
    this.document.addEventListener('pointerdown', this.interruptListener, true);
    this.watchInterruption();
    const advance = (time: number) => {
      if (!this.coasting) return;
      // Solve friction from wall time, so 60/120 Hz displays and dropped frames agree.
      const elapsed = Math.min(duration, Math.max(0, time - started));
      const position =
        from + ((speed * coastFriction) / 1000) * (1 - Math.exp(-elapsed / coastFriction));
      this.setPosition(elapsed === duration ? Math.round(position) : position);
      if (!this.coasting) return;
      if (elapsed === duration) this.cancel();
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
    this.coastSpeed = 0;
    this.coastAt = 0;
    this.motionPreference?.removeEventListener('change', this.motionListener);
    this.motionPreference = undefined;
    this.document.removeEventListener('pointerdown', this.interruptListener, true);
    this.wheelRemainder = 0;
    this.frame = undefined;
    const position = this.position();
    if (position !== undefined) this.cycle.set(Math.floor(Math.round(position) / cycleLength));
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
    this.anchor.set(undefined);
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
    this.anchor.set(undefined);
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
    this.position.set(value);
    if (this.minute() * 60 !== this.seconds()) this.durationChange.emit(this.minute() * 60);
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
  private defaultWindowStart(position: number): number {
    const capacity = Math.max(1, (this.width() - inset * 2) / pitch);
    return position < 0 ? position : Math.max(0, position - capacity / 2);
  }
  private idlePosition(): number {
    return this.currentMinute() + this.cycle() * cycleLength;
  }
  private currentMinute(): number {
    return Math.min(maximum, Math.max(0, Math.round(this.seconds() / 60)));
  }
}
