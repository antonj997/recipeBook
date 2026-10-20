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
  viewChild,
} from '@angular/core';
import { StepTimerService } from '../../core/services/step-timer.service';
import {
  formatCountdown,
  isStepTimerSeconds,
  maxStepTimerSeconds,
  type StepTimerTarget,
} from '../../core/models/step-timer';
import { MinuteRulerComponent } from './minute-ruler';
import { IconComponent } from './icon';

@Component({
  selector: 'app-step-timer',
  imports: [MinuteRulerComponent, IconComponent],
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
          [timeline]="state().started"
          [totalSeconds]="state().duration"
          [elapsedSeconds]="passed()"
          [overdue]="state().done"
          [identity]="target().key"
          [label]="'Timer duration for step ' + (target().index + 1)"
          (durationChange)="setDuration($event)"
        />
      </div>
      <div class="timer-actions">
        <button
          type="button"
          class="timer-minute"
          [disabled]="disabled() || state().remaining <= 1"
          [attr.aria-label]="'Subtract one minute from step ' + (target().index + 1) + ' timer'"
          title="Subtract one minute"
          (click)="adjust(-1)"
        >
          <app-icon name="minus" />
        </button>
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
        <button
          type="button"
          class="timer-minute"
          [disabled]="disabled() || state().remaining >= maximum"
          [attr.aria-label]="'Add one minute to step ' + (target().index + 1) + ' timer'"
          title="Add one minute"
          (click)="adjust(1)"
        >
          <app-icon name="plus" />
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
  private readonly ruler = viewChild(MinuteRulerComponent);
  protected readonly state = computed(() => this.timers.state(this.target()));
  protected readonly display = computed(() => {
    const state = this.state();
    return formatCountdown(state.done ? state.elapsed : state.remaining);
  });
  protected readonly maximum = maxStepTimerSeconds;
  protected readonly passed = computed(() => {
    const state = this.state();
    return state.started ? Math.max(0, state.duration - state.remaining) + state.elapsed : 0;
  });
  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  protected readonly invalid = signal(false);
  private editTarget = '';
  private initialDraft = '';
  private digitDraft?: string;
  private nativeEdit?: { start: number; end: number; data: string; inputType: string };
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
    this.ruler()?.stopMotion();
    if (!this.editing()) {
      this.nativeEdit = undefined;
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
    const inserting = entry.inputType === 'insertText';
    const backward = entry.inputType === 'deleteContentBackward';
    const forward = entry.inputType === 'deleteContentForward';
    if (!inserting && !backward && !forward) return;
    const field = event.target as HTMLInputElement;
    const change = {
      start: field.selectionStart ?? 0,
      end: field.selectionEnd ?? field.value.length,
      data: inserting ? (entry.data ?? '') : '',
      inputType: entry.inputType,
    };
    if (!entry.cancelable) {
      this.nativeEdit = change;
      return;
    }
    event.preventDefault();
    if (inserting && !/^\d+$/.test(change.data)) return;
    this.applyDigitEdit(field, change);
  }

  protected edit(event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = field.value.trim();
    const inputType = (event as InputEvent).inputType;
    const pasted = !inputType || inputType === 'insertFromPaste' || inputType === 'insertFromDrop';
    const nativeEdit = this.nativeEdit;
    this.nativeEdit = undefined;
    if (!pasted) {
      // Native edits act on the formatted display, not the raw minutes digits.
      // Replay their selection against the raw draft instead of stripping hours separators.
      this.applyDigitEdit(
        field,
        nativeEdit ?? changedRange(this.draft(), value, event as InputEvent, field.selectionStart),
      );
      return;
    }
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

  private applyDigitEdit(
    field: HTMLInputElement,
    change: { start: number; end: number; data: string; inputType: string },
  ): void {
    const value = this.draft();
    const digits = this.digitDraft ?? durationDigits(value);
    const displayDigits = value.replace(/\D/g, '');
    const selectedAll = change.start === 0 && change.end === value.length;
    const atEnd = change.start === value.length && change.end === value.length;
    const editHours = value.split(':').length === 3 && !selectedAll && !atEnd;
    const source = editHours ? displayDigits : digits;
    const padding = editHours ? 0 : displayDigits.length - digits.length;
    const position = (offset: number) =>
      Math.max(0, value.slice(0, offset).replace(/\D/g, '').length - padding);
    let start = selectedAll ? 0 : position(change.start);
    let end = selectedAll ? source.length : position(change.end);
    if (start === end) {
      if (change.inputType === 'deleteContentBackward') start = Math.max(0, start - 1);
      if (change.inputType === 'deleteContentForward') end = Math.min(source.length, end + 1);
    }
    const inserted = change.data.replace(/\D/g, '');
    const edited = source.slice(0, start) + inserted + source.slice(end);
    const next = editHours ? durationDigits(maskHoursDigits(edited)) : edited;
    if (next.length > 7) {
      field.value = value;
      return;
    }
    this.digitDraft = next;
    const masked = maskDigits(next);
    this.draft.set(masked);
    this.invalid.set(false);
    field.value = masked;
    const caretDigits = Math.max(
      0,
      start + inserted.length + masked.replace(/\D/g, '').length - edited.length,
    );
    let caret = 0;
    for (let count = 0; caret < masked.length && count < caretDigits; caret++)
      if (/\d/.test(masked[caret])) count++;
    if (masked[caret] === ':') caret++;
    field.setSelectionRange(caret, caret);
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
    this.ruler()?.stopMotion();
    if (this.disabled() || this.completed() || !this.commitEdit()) return;
    this.timers.start(this.target());
  }

  protected stop(): void {
    this.ruler()?.stopMotion();
    if (this.disabled() || this.completed()) return;
    this.cancelEdit();
    this.state().done ? this.timers.reset(this.target()) : this.timers.pause(this.target());
  }

  protected reset(): void {
    this.ruler()?.stopMotion();
    if (this.disabled() || this.completed()) return;
    this.cancelEdit();
    this.timers.reset(this.target());
  }

  protected adjust(minutes: -1 | 1): void {
    this.ruler()?.stopMotion();
    if (this.disabled() || this.completed() || !this.commitEdit()) return;
    this.timers.adjust(this.target(), minutes);
  }

  protected setDuration(seconds: number): void {
    if (this.disabled() || this.completed()) return;
    this.cancelEdit();
    this.timers.setDuration(this.target(), seconds);
  }
}

/** Keep the raw growing minutes segment while displaying canonical hours and minutes. */
function maskDigits(digits: string): string {
  if (!digits) return '';
  const value = digits.padStart(4, '0');
  const minutes = Number(value.slice(0, -2));
  const seconds = value.slice(-2);
  const hours = Math.floor(minutes / 60);
  return hours
    ? String(hours).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0') + ':' + seconds
    : String(minutes).padStart(2, '0') + ':' + seconds;
}

/** Convert explicit hours to raw minutes without normalizing invalid seconds. */
function durationDigits(value: string): string {
  const parts = value.split(':');
  return parts.length === 3
    ? String(Number(parts[0]) * 60 + Number(parts[1])) + parts[2]
    : value.replace(/\D/g, '');
}

function maskHoursDigits(digits: string): string {
  const value = digits.padStart(5, '0');
  return value.slice(0, -4) + ':' + value.slice(-4, -2) + ':' + value.slice(-2);
}

/** Find an edit when a keyboard sends input without a preceding beforeinput. */
function changedRange(
  previous: string,
  value: string,
  event: InputEvent,
  selection: number | null,
) {
  const caret = selection ?? value.length;
  if (event.data && event.inputType.startsWith('insert')) {
    const start = caret - event.data.length;
    const end = start + previous.length - value.length + event.data.length;
    if (start >= 0 && previous.slice(0, start) + event.data + previous.slice(end) === value)
      return { start, end, data: event.data, inputType: event.inputType };
  }
  if (
    previous.length - value.length === 1 &&
    previous.slice(0, caret) + previous.slice(caret + 1) === value &&
    (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward')
  ) {
    const start = caret + (event.inputType === 'deleteContentBackward' ? 1 : 0);
    return { start, end: start, data: '', inputType: event.inputType };
  }
  let start = 0;
  while (start < previous.length && start < value.length && previous[start] === value[start])
    start++;
  let end = previous.length;
  let insertedEnd = value.length;
  while (end > start && insertedEnd > start && previous[end - 1] === value[insertedEnd - 1]) {
    end--;
    insertedEnd--;
  }
  return { start, end, data: value.slice(start, insertedEnd), inputType: 'insertReplacementText' };
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
