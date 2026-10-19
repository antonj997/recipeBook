import { Component, ElementRef, computed, inject, input } from '@angular/core';
import { StepTimerService } from '../../core/services/step-timer.service';
import {
  formatCountdown,
  maxStepTimerSeconds,
  type StepTimerTarget,
} from '../../core/models/step-timer';
import { IconComponent } from './icon';

@Component({
  selector: 'app-step-timer',
  imports: [IconComponent],
  host: { '[hidden]': 'completed() && !state().started' },
  styleUrl: './step-timer.scss',
  template: `
    <div
      class="step-timer"
      [class.is-running]="state().running"
      [class.is-done]="state().done"
      role="group"
      [attr.aria-label]="'Timer for step ' + (target().index + 1)"
    >
      <button
        type="button"
        class="timer-adjust"
        [disabled]="disabled() || state().remaining <= 60"
        [attr.aria-label]="'Subtract one minute from step ' + (target().index + 1) + ' timer'"
        (click)="timers.adjust(target(), -1)"
      >
        <app-icon name="minus" />
      </button>
      <span class="timer-face"
        ><app-icon name="clock" />
        <span
          role="timer"
          aria-live="off"
          [attr.aria-label]="'Time remaining for step ' + (target().index + 1)"
          >{{ format(state().remaining) }}</span
        >
      </span>
      <button
        type="button"
        class="timer-adjust"
        [disabled]="disabled() || state().remaining >= maximum"
        [attr.aria-label]="'Add one minute to step ' + (target().index + 1) + ' timer'"
        (click)="timers.adjust(target(), 1)"
      >
        <app-icon name="plus" />
      </button>
      <button
        type="button"
        class="timer-action"
        [disabled]="disabled()"
        (click)="toggle()"
        [attr.aria-label]="
          (state().running
            ? 'Pause'
            : state().done
              ? 'Restart'
              : state().started
                ? 'Resume'
                : 'Start') +
          ' timer for step ' +
          (target().index + 1)
        "
      >
        {{
          state().running
            ? 'Pause'
            : state().done
              ? 'Restart'
              : state().started
                ? 'Resume'
                : 'Start'
        }}
      </button>
      @if (state().started && !state().running && !state().done) {
        <button
          type="button"
          class="timer-adjust"
          (click)="reset()"
          [attr.aria-label]="'Reset timer for step ' + (target().index + 1)"
        >
          <app-icon name="reset" />
        </button>
      }
    </div>
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
  protected readonly state = computed(() => this.timers.state(this.target()));
  protected readonly format = formatCountdown;
  protected readonly maximum = maxStepTimerSeconds;
  protected toggle(): void {
    this.state().running ? this.timers.pause(this.target()) : this.timers.start(this.target());
  }
  protected reset(): void {
    this.timers.reset(this.target());
    if (this.completed())
      this.element.nativeElement
        .closest('.cooking-step')
        ?.querySelector<HTMLInputElement>('input[type=checkbox]')
        ?.focus({ preventScroll: true });
  }
}
