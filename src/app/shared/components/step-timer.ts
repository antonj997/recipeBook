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
  maxClockSeconds,
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
            [disabled]="locked()"
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
          [disabled]="locked()"
          [timeline]="state().running || state().done"
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
          [disabled]="locked() || state().remaining <= 0"
          [attr.aria-label]="'Subtract one minute from step ' + (target().index + 1) + ' timer'"
          title="Subtract one minute"
          (click)="adjust(-1)"
        >
          <app-icon name="minus" />
        </button>
        <button
          type="button"
          class="timer-action timer-start"
          [disabled]="disabled() || state().running || (!state().done && state().remaining === 0)"
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
          [disabled]="locked() || state().remaining >= maximum"
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
            ? 'Enter a time from 00:00 to 60:00.'
            : 'Type minutes and seconds. 3000 = 30 minutes. Enter to set.'
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
  protected readonly maximum = maxClockSeconds;
  protected readonly locked = computed(
    () => this.disabled() || this.completed() || this.state().running || this.state().done,
  );
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
      const unavailable = this.locked();
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
    if (this.locked()) return;
    this.ruler()?.stopMotion(true);
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
      // Keep colon-formatted paste intact so unsupported formats report an error.
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
    const digits = this.digitDraft ?? value.replace(/\D/g, '');
    const displayDigits = value.replace(/\D/g, '');
    const selectedAll = change.start === 0 && change.end === value.length;
    const source = digits;
    const padding = displayDigits.length - digits.length;
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
    const next = edited;
    if (next.length > 4) {
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
    if (this.locked() || this.editTarget !== this.target().key) {
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
    this.ruler()?.stopMotion(true);
    if (this.disabled() || this.completed()) return;
    this.cancelEdit();
    this.timers.reset(this.target());
  }

  protected adjust(minutes: -1 | 1): void {
    this.ruler()?.stopMotion(true);
    if (this.locked() || !this.commitEdit()) return;
    this.timers.adjust(this.target(), minutes);
  }

  protected setDuration(seconds: number): void {
    if (this.locked()) return;
    this.cancelEdit();
    this.timers.setDuration(this.target(), seconds);
  }
}

/** Numeric typing keeps the last two digits as seconds. */
function maskDigits(digits: string): string {
  if (!digits) return '';
  const value = digits.padStart(4, '0');
  return String(Number(value.slice(0, -2))).padStart(2, '0') + ':' + value.slice(-2);
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
  if (!/^\d{1,2}:\d{2}$/.test(value)) return;
  const [minutes, seconds] = value.split(':').map(Number);
  const total = minutes * 60 + seconds;
  return seconds < 60 && total <= maxClockSeconds ? total : undefined;
}
