import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { StepTimerService } from '../../core/services/step-timer.service';
import {
  formatCountdown,
  isStepTimerSeconds,
  maxStepTimerSeconds,
  type StepTimerTarget,
} from '../../core/models/step-timer';
import { IconComponent } from './icon';

@Component({
  selector: 'app-step-timer',
  imports: [IconComponent],
  host: { '[hidden]': 'completed()' },
  styleUrl: './step-timer.scss',
  template: `
    <div
      class="timer-controls"
      role="group"
      [attr.aria-label]="'Timer for step ' + (target().index + 1)"
    >
      <div class="step-timer" [class.is-running]="state().running" [class.is-done]="state().done">
        <button
          type="button"
          class="timer-adjust"
          [disabled]="disabled() || state().remaining <= 1"
          [attr.aria-label]="'Subtract one minute from step ' + (target().index + 1) + ' timer'"
          (pointerdown)="beginHold($event, -1)"
          (lostpointercapture)="endHold($event)"
          (contextmenu)="$event.preventDefault()"
          (click)="adjust($event, -1)"
        >
          <app-icon name="minus" />
        </button>
        <span class="timer-face" role="timer" aria-live="off">
          <app-icon name="clock" />
          <input
            type="text"
            class="timer-input"
            autocomplete="off"
            spellcheck="false"
            maxlength="16"
            [disabled]="disabled()"
            [value]="editing() ? draft() : format(state().remaining)"
            [attr.aria-label]="
              'Time remaining for step ' + (target().index + 1) + '. Edit timer duration'
            "
            [attr.aria-invalid]="invalid()"
            [attr.aria-describedby]="editing() ? 'timer-help-' + target().index : null"
            (focus)="beginEdit()"
            (input)="edit($event)"
            (blur)="commitEdit()"
            (keydown.enter)="acceptEdit($event)"
            (keydown.escape)="cancelEdit($event)"
          />
        </span>
        <button
          type="button"
          class="timer-adjust"
          [disabled]="disabled() || state().remaining >= maximum"
          [attr.aria-label]="'Add one minute to step ' + (target().index + 1) + ' timer'"
          (pointerdown)="beginHold($event, 1)"
          (lostpointercapture)="endHold($event)"
          (contextmenu)="$event.preventDefault()"
          (click)="adjust($event, 1)"
        >
          <app-icon name="plus" />
        </button>
      </div>
      <div class="timer-actions">
        <button
          type="button"
          class="timer-action"
          [disabled]="disabled()"
          [attr.aria-label]="action() + ' timer for step ' + (target().index + 1)"
          (click)="toggle()"
        >
          {{ action() }}
        </button>
        @if (state().started && !state().running && !state().done) {
          <button
            type="button"
            class="timer-adjust"
            [disabled]="disabled()"
            [attr.aria-label]="'Reset timer for step ' + (target().index + 1)"
            (click)="reset()"
          >
            <app-icon name="reset" />
          </button>
        }
      </div>
    </div>
    @if (editing()) {
      <p
        class="timer-hint"
        [id]="'timer-help-' + target().index"
        [attr.role]="invalid() ? 'alert' : null"
      >
        {{
          invalid()
            ? 'Enter a time from 0:01 to 168:00:00.'
            : 'Minutes, M:SS or H:MM:SS. Enter to set.'
        }}
      </p>
    }
    @if (state().done) {
      <p class="timer-done" role="status">Timer finished</p>
    }
  `,
})
export class StepTimerComponent {
  readonly target = input.required<StepTimerTarget>();
  readonly completed = input(false);
  readonly disabled = input(false);
  protected readonly timers = inject(StepTimerService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  protected readonly state = computed(() => this.timers.state(this.target()));
  protected readonly action = computed(() => {
    const state = this.state();
    return state.running ? 'Pause' : state.done ? 'Restart' : state.started ? 'Resume' : 'Start';
  });
  protected readonly format = formatCountdown;
  protected readonly maximum = maxStepTimerSeconds;
  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  protected readonly invalid = signal(false);
  private editTarget = '';
  private initialDraft = '';
  private held?: {
    pointerId: number;
    button: HTMLElement;
    targetKey: string;
    minutes: -1 | 1;
    startedAt: number;
  };
  private holdTimeout?: ReturnType<typeof setTimeout>;
  private suppressClick?: EventTarget | null;

  constructor() {
    const release = (event: PointerEvent) => this.endHold(event);
    const blur = () => this.stopHold();
    const visibility = () => {
      if (this.document.hidden) this.stopHold();
    };
    this.document.addEventListener('pointerup', release, true);
    this.document.addEventListener('pointercancel', release, true);
    this.document.addEventListener('visibilitychange', visibility);
    this.document.defaultView?.addEventListener('blur', blur);
    effect(() => {
      const key = this.target().key;
      const unavailable = this.completed() || this.disabled();
      untracked(() => {
        if (unavailable || (this.held && this.held.targetKey !== key)) this.stopHold();
        if (unavailable || (this.editing() && this.editTarget !== key)) this.cancelEdit();
        if (this.completed() && this.element.nativeElement.contains(this.document.activeElement))
          this.element.nativeElement
            .closest('.cooking-step')
            ?.querySelector<HTMLInputElement>('input[type=checkbox]')
            ?.focus({ preventScroll: true });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.stopHold();
      this.document.removeEventListener('pointerup', release, true);
      this.document.removeEventListener('pointercancel', release, true);
      this.document.removeEventListener('visibilitychange', visibility);
      this.document.defaultView?.removeEventListener('blur', blur);
    });
  }

  protected beginEdit(): void {
    if (this.editing()) return;
    this.stopHold();
    this.editTarget = this.target().key;
    this.initialDraft = formatCountdown(this.state().remaining);
    this.draft.set(this.initialDraft);
    this.invalid.set(false);
    this.editing.set(true);
  }

  protected edit(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    this.invalid.set(false);
  }

  protected commitEdit(): boolean {
    if (!this.editing()) return true;
    if (this.completed() || this.disabled() || this.editTarget !== this.target().key) {
      this.cancelEdit();
      return false;
    }
    if (this.draft() === this.initialDraft) {
      this.cancelEdit();
      return true;
    }
    const seconds = parseDuration(this.draft());
    this.invalid.set(seconds === undefined);
    if (seconds === undefined) return false;
    this.timers.setDuration(this.target(), seconds);
    this.editing.set(false);
    return true;
  }

  protected acceptEdit(event: Event): void {
    event.preventDefault();
    if (this.commitEdit()) (event.target as HTMLInputElement).blur();
  }

  protected cancelEdit(event?: Event): void {
    event?.preventDefault();
    this.invalid.set(false);
    this.editing.set(false);
    if (event) (event.target as HTMLInputElement).blur();
  }

  protected toggle(): void {
    if (this.disabled() || this.completed() || !this.commitEdit()) return;
    this.state().running ? this.timers.pause(this.target()) : this.timers.start(this.target());
  }

  protected reset(): void {
    if (this.disabled() || this.completed()) return;
    this.stopHold();
    this.cancelEdit();
    this.timers.reset(this.target());
  }

  protected adjust(event: MouseEvent, minutes: -1 | 1): void {
    // Pointer presses already applied their first minute; native keyboard clicks have detail 0.
    if (event.detail > 0 && this.suppressClick === event.currentTarget) {
      this.suppressClick = undefined;
      return;
    }
    if (this.commitEdit() && this.canAdjust(minutes)) this.timers.adjust(this.target(), minutes);
  }

  protected beginHold(event: PointerEvent, minutes: -1 | 1): void {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      !this.commitEdit() ||
      !this.canAdjust(minutes)
    )
      return;
    this.stopHold();
    const button = event.currentTarget as HTMLElement;
    this.suppressClick = button;
    this.timers.adjust(this.target(), minutes);
    this.held = {
      pointerId: event.pointerId,
      button,
      targetKey: this.target().key,
      minutes,
      startedAt: Date.now(),
    };
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Document release/cancel listeners also cover browsers without pointer capture.
    }
    this.holdTimeout = setTimeout(() => this.repeat(), 450);
  }

  protected endHold(event: PointerEvent): void {
    if (this.held?.pointerId === event.pointerId) this.stopHold();
  }

  private canAdjust(minutes: -1 | 1): boolean {
    return (
      !this.disabled() &&
      !this.completed() &&
      (minutes === 1 ? this.state().remaining < this.maximum : this.state().remaining > 1)
    );
  }

  private repeat(): void {
    const held = this.held;
    if (
      !held ||
      this.document.hidden ||
      held.targetKey !== this.target().key ||
      !this.canAdjust(held.minutes)
    ) {
      this.stopHold();
      return;
    }
    this.timers.adjust(this.target(), held.minutes);
    this.holdTimeout = setTimeout(
      () => this.repeat(),
      Date.now() - held.startedAt >= 1500 ? 150 : 300,
    );
  }

  private stopHold(): void {
    clearTimeout(this.holdTimeout);
    this.holdTimeout = undefined;
    const held = this.held;
    this.held = undefined;
    if (held?.button.hasPointerCapture?.(held.pointerId))
      held.button.releasePointerCapture(held.pointerId);
  }
}

/** A bare number means minutes; colon notation follows the countdown display. */
function parseDuration(text: string): number | undefined {
  const value = text.trim();
  let seconds: number;
  if (/^\d+(?:[.,]\d+)?$/.test(value)) {
    seconds = Math.round(Number(value.replace(',', '.')) * 60);
  } else if (/^\d+:\d{2}(?::\d{2})?$/.test(value)) {
    const parts = value.split(':').map(Number);
    if (parts.at(-1)! >= 60 || (parts.length === 3 && parts[1] >= 60)) return;
    seconds =
      parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  } else return;
  return isStepTimerSeconds(seconds) ? seconds : undefined;
}
