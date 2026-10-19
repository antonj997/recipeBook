import { DOCUMENT } from '@angular/common';
import {
  Component,
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
  type StepTimerTarget,
} from '../../core/models/step-timer';
import { MinuteRulerComponent } from './minute-ruler';

@Component({
  selector: 'app-step-timer',
  imports: [MinuteRulerComponent],
  host: { '[hidden]': 'completed()' },
  styleUrl: './step-timer.scss',
  template: `
    <div
      class="timer-controls"
      role="group"
      [attr.aria-label]="'Timer for step ' + (target().index + 1)"
    >
      <div class="step-timer" [class.is-running]="state().running" [class.is-done]="state().done">
        <span class="timer-face" role="timer" aria-live="off">
          <input
            type="text"
            inputmode="numeric"
            class="timer-input"
            [class.is-overdue]="state().done && !editing()"
            autocomplete="off"
            spellcheck="false"
            maxlength="16"
            [disabled]="disabled()"
            [value]="editing() ? draft() : display()"
            [attr.aria-label]="
              (state().done ? 'Time overdue' : 'Time remaining') +
              ' for step ' +
              (target().index + 1) +
              '. Edit timer duration'
            "
            [attr.aria-invalid]="invalid()"
            [attr.aria-describedby]="editing() ? 'timer-help-' + target().index : null"
            (focus)="beginEdit($event)"
            (pointerup)="selectValue($event)"
            (mouseup)="$event.preventDefault()"
            (beforeinput)="maskInput($event)"
            (input)="edit($event)"
            (blur)="commitEdit()"
            (keydown.enter)="acceptEdit($event)"
            (keydown.escape)="cancelEdit($event)"
          />
        </span>
        <app-minute-ruler
          [seconds]="state().done ? target().seconds : state().remaining"
          [disabled]="disabled() || completed()"
          [identity]="target().key"
          [label]="'Timer duration for step ' + (target().index + 1)"
          (durationChange)="setDuration($event)"
        />
      </div>
      <div class="timer-actions">
        <button
          type="button"
          class="timer-action timer-start"
          [disabled]="disabled() || state().running"
          [attr.aria-label]="'Start timer for step ' + (target().index + 1)"
          (click)="start()"
        >
          Start
        </button>
        <button
          type="button"
          class="timer-action"
          [disabled]="disabled() || (!state().running && !state().done)"
          [attr.aria-label]="'Stop timer for step ' + (target().index + 1)"
          (click)="stop()"
        >
          Stop
        </button>
        <button
          type="button"
          class="timer-action"
          [disabled]="disabled()"
          [attr.aria-label]="'Reset timer for step ' + (target().index + 1)"
          (click)="reset()"
        >
          Reset
        </button>
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
            : 'Type minutes and seconds. 6000 = 1 hour. Enter to set.'
        }}
      </p>
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
  protected readonly display = computed(() => {
    const state = this.state();
    return formatCountdown(state.done ? state.elapsed : state.remaining);
  });
  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  protected readonly invalid = signal(false);
  private editTarget = '';
  private initialDraft = '';
  private digitDraft?: string;
  constructor() {
    effect(() => {
      const key = this.target().key;
      const unavailable = this.completed() || this.disabled();
      untracked(() => {
        if (unavailable || (this.editing() && this.editTarget !== key)) this.cancelEdit();
        if (this.completed() && this.element.nativeElement.contains(this.document.activeElement))
          this.element.nativeElement
            .closest('.cooking-step')
            ?.querySelector<HTMLInputElement>('input[type=checkbox]')
            ?.focus({ preventScroll: true });
      });
    });
  }

  protected beginEdit(event: Event): void {
    if (!this.editing()) {
      this.editTarget = this.target().key;
      const seconds = this.state().done ? this.target().seconds : this.state().remaining;
      this.digitDraft = String(Math.floor(seconds / 60)) + String(seconds % 60).padStart(2, '0');
      this.initialDraft = maskDigits(this.digitDraft);
      this.draft.set(this.initialDraft);
      this.invalid.set(false);
      this.editing.set(true);
    }
    const field = event.target as HTMLInputElement;
    field.value = this.draft();
    field.select();
  }

  protected selectValue(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  protected maskInput(event: Event): void {
    const entry = event as InputEvent;
    if (!entry.cancelable) return;
    const inserting = entry.inputType === 'insertText';
    const backward = entry.inputType === 'deleteContentBackward';
    const forward = entry.inputType === 'deleteContentForward';
    if (!inserting && !backward && !forward) return;
    event.preventDefault();
    if (inserting && !/^\d+$/.test(entry.data ?? '')) return;
    const field = event.target as HTMLInputElement;
    const digits = this.digitDraft ?? field.value.replace(/\D/g, '');
    const padding = field.value.replace(/\D/g, '').length - digits.length;
    const digitPosition = (position: number) =>
      Math.max(0, field.value.slice(0, position).replace(/\D/g, '').length - padding);
    let start = digitPosition(field.selectionStart ?? 0);
    let end = digitPosition(field.selectionEnd ?? field.value.length);
    if (start === end) {
      if (backward) start = Math.max(0, start - 1);
      if (forward) end = Math.min(digits.length, end + 1);
    }
    const inserted = inserting ? entry.data! : '';
    const next = digits.slice(0, start) + inserted + digits.slice(end);
    if (next.length > 7) return;
    this.digitDraft = next;
    const value = maskDigits(next);
    this.draft.set(value);
    this.invalid.set(false);
    field.value = value;
    const position = start + inserted.length + Math.max(0, 4 - next.length);
    let caret = 0;
    for (let count = 0; caret < value.length && count < position; caret++)
      if (/\d/.test(value[caret])) count++;
    if (value[caret] === ':') caret++;
    field.setSelectionRange(caret, caret);
  }

  protected edit(event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = field.value.trim();
    const inputType = (event as InputEvent).inputType;
    const pasted = !inputType || inputType === 'insertFromPaste' || inputType === 'insertFromDrop';
    if (pasted && /^\d+(?::\d{0,2}){1,2}$/.test(value)) {
      // A complete colon-formatted paste also accepts an explicit hours segment.
      this.digitDraft = undefined;
      this.draft.set(value);
    } else {
      this.digitDraft = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      this.draft.set(maskDigits(this.digitDraft));
    }
    field.value = this.draft();
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

  protected start(): void {
    if (this.disabled() || this.completed() || !this.commitEdit()) return;
    this.timers.start(this.target());
  }

  protected stop(): void {
    if (this.disabled() || this.completed()) return;
    this.cancelEdit();
    this.state().done ? this.timers.reset(this.target()) : this.timers.pause(this.target());
  }

  protected reset(): void {
    if (this.disabled() || this.completed()) return;
    this.cancelEdit();
    this.timers.reset(this.target());
  }

  protected setDuration(seconds: number): void {
    if (this.disabled() || this.completed()) return;
    this.cancelEdit();
    this.timers.setDuration(this.target(), seconds);
  }
}

/** Numeric entry has a growing minutes segment and a two-digit seconds segment. */
function maskDigits(digits: string): string {
  if (!digits) return '';
  const value = digits.padStart(4, '0');
  return value.slice(0, -2) + ':' + value.slice(-2);
}

function parseDuration(text: string): number | undefined {
  const value = text.trim();
  let seconds: number;
  if (/^\d+:\d{2}(?::\d{2})?$/.test(value)) {
    const parts = value.split(':').map(Number);
    if (parts.at(-1)! >= 60 || (parts.length === 3 && parts[1] >= 60)) return;
    seconds =
      parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  } else return;
  return isStepTimerSeconds(seconds) ? seconds : undefined;
}
