import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { StepTimerService } from '../../core/services/step-timer.service';
import { TimerAlertOfferService } from '../../core/services/timer-alert-offer.service';
import {
  formatCountdown,
  maxClockSeconds,
  type StepTimerTarget,
} from '../../core/models/step-timer';
import { MinuteRulerComponent } from './minute-ruler';
import { IconComponent } from './icon';
import { CheckboxMarkComponent } from './checkbox-mark';
import { TranslatePipe } from '../../core/i18n/i18n';

/**
 * A step timer at rest is one quiet row: play, the time and an edit button. Editing happens in
 * a small sheet with the minute wheel, where the time can also be kept for the recipe.
 */
@Component({
  selector: 'app-step-timer',
  imports: [MinuteRulerComponent, IconComponent, CheckboxMarkComponent, TranslatePipe],
  host: { '[hidden]': 'completed()', '[class.is-timing]': 'state().started' },
  styleUrl: './step-timer.scss',
  template: `
    <div class="timer-row" role="group" [attr.aria-label]="'Timer for step ' + step()">
      <button
        type="button"
        class="timer-toggle"
        [disabled]="disabled() || (!active() && !state().done && state().remaining === 0)"
        [attr.aria-label]="(active() ? 'Stop' : 'Start') + ' timer for step ' + step()"
        [title]="(active() ? 'Stop' : 'Start') + ' timer for step ' + step()"
        (click)="active() ? stop() : start()"
      >
        <app-icon [name]="active() ? 'pause' : 'play'" />
      </button>
      <span class="timer-time" role="timer" aria-live="off" [class.is-overdue]="state().done">{{
        display()
      }}</span>
      @if (active()) {
        <button
          type="button"
          class="timer-add"
          [disabled]="minuteLocked() || state().remaining >= maximum"
          [attr.aria-label]="'Add one minute to step ' + step() + ' timer'"
          (click)="adjust(1)"
        >
          +1 min
        </button>
      } @else {
        <button
          type="button"
          class="timer-edit"
          [disabled]="locked()"
          [attr.aria-label]="'Edit time for step ' + step()"
          [title]="'Edit time' | t"
          (click)="openSheet()"
        >
          <app-icon name="pencil" />
        </button>
      }
      @if (changed()) {
        <button
          type="button"
          class="timer-reset"
          [disabled]="disabled()"
          [attr.aria-label]="'Reset timer for step ' + step()"
          (click)="reset()"
        >
          Reset
        </button>
      }
    </div>
    @if (state().started) {
      <app-minute-ruler
        class="timer-strip"
        [timeline]="true"
        [seconds]="state().done ? target().seconds : state().remaining"
        [totalSeconds]="state().duration"
        [elapsedSeconds]="passed()"
        [identity]="target().key"
        [label]="'Time remaining for step ' + step()"
      />
    }
    <dialog
      #sheet
      class="timer-sheet"
      [class.is-rotated]="rotated()"
      [attr.aria-labelledby]="'timer-sheet-' + target().index"
      (cancel)="closeSheet($event)"
      (close)="sheetOpen.set(false)"
      (pointerdown)="backdropPressed = $event.target === $event.currentTarget"
      (click)="backdropClick($event)"
    >
      <!-- Focus lands on the heading so a tap does not open the keyboard. -->
      <h2 [id]="'timer-sheet-' + target().index" tabindex="-1" autofocus>
        Step {{ step() }} timer
      </h2>
      <div class="sheet-clock">
        <button
          type="button"
          class="timer-minute"
          [attr.aria-label]="'Subtract one minute' | t"
          [disabled]="sheetSeconds() <= 0"
          (click)="nudge(-1)"
        >
          <app-icon name="minus" />
        </button>
        <input
          type="text"
          inputmode="numeric"
          class="timer-input"
          autocomplete="off"
          spellcheck="false"
          maxlength="16"
          [disabled]="locked()"
          [value]="editing() ? draft() : sheetDisplay()"
          [attr.aria-label]="'Timer duration for step ' + step() + '. Type minutes and seconds'"
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
        <button
          type="button"
          class="timer-minute"
          [attr.aria-label]="'Add one minute' | t"
          [disabled]="sheetSeconds() >= maximum"
          (click)="nudge(1)"
        >
          <app-icon name="plus" />
        </button>
      </div>
      <p
        class="timer-hint"
        [id]="'timer-help-' + target().index"
        [attr.role]="invalid() ? 'alert' : null"
      >
        {{
          invalid()
            ? 'Enter a time from 00:00 to 60:00.'
            : editing()
              ? 'Type minutes and seconds. 3000 = 30 minutes. Enter to set.'
              : 'Drag the wheel or type a time.'
        }}
      </p>
      @if (sheetOpen()) {
        <app-minute-ruler
          #wheel
          [rotated]="rotated()"
          [seconds]="sheetSeconds()"
          [identity]="target().key"
          [label]="'Timer duration for step ' + step()"
          (durationChange)="pickDuration($event)"
        />
      }
      @if (savable()) {
        <label class="check-control save-default">
          <input type="checkbox" [checked]="keep()" (change)="keep.set(!keep())" />
          <app-checkbox-mark />
          <span>Always use this time for step {{ step() }}</span>
        </label>
      }
      <div class="sheet-actions">
        <button type="button" class="sheet-cancel" (click)="closeSheet()">Cancel</button>
        <button type="button" class="primary sheet-set" (click)="apply()">Set timer</button>
      </div>
    </dialog>
  `,
})
export class StepTimerComponent {
  readonly target = input.required<StepTimerTarget>();
  readonly completed = input(false);
  readonly disabled = input(false);
  readonly rotated = input(false);
  /** Whether the edited time can be kept as this step's time in the saved recipe. */
  readonly savable = input(false);
  readonly saveDuration = output<number>();
  protected readonly timers = inject(StepTimerService);
  private readonly alertOffer = inject(TimerAlertOfferService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly ruler = viewChild<MinuteRulerComponent>('wheel');
  private readonly sheet = viewChild<ElementRef<HTMLDialogElement>>('sheet');
  protected readonly step = computed(() => this.target().index + 1);
  protected readonly state = computed(() => this.timers.state(this.target()));
  protected readonly active = computed(
    () => this.state().running || (this.state().done && !this.state().paused),
  );
  protected readonly display = computed(() => {
    const state = this.state();
    return formatCountdown(state.done ? state.elapsed : state.remaining);
  });
  protected readonly changed = computed(
    () =>
      this.state().started ||
      this.state().remaining !== Math.min(this.target().seconds, maxClockSeconds),
  );
  protected readonly passed = computed(() => {
    const state = this.state();
    return state.started ? Math.max(0, state.duration - state.remaining) + state.elapsed : 0;
  });
  protected readonly maximum = maxClockSeconds;
  protected readonly locked = computed(() => this.disabled() || this.completed() || this.active());
  protected readonly minuteLocked = computed(
    () =>
      this.disabled() ||
      this.completed() ||
      (this.state().done && !this.state().paused) ||
      (this.state().running && this.state().remaining === 0),
  );
  protected readonly sheetOpen = signal(false);
  protected readonly sheetSeconds = signal(0);
  protected readonly sheetDisplay = computed(() => formatCountdown(this.sheetSeconds()));
  protected readonly keep = signal(false);
  protected backdropPressed = false;
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
        if (unavailable || (this.editing() && this.editTarget !== key)) {
          this.cancelEdit();
          this.closeSheet();
        }
        if (this.completed() && this.element.nativeElement.contains(this.document.activeElement))
          this.element.nativeElement
            .closest('.cooking-step')
            ?.querySelector<HTMLInputElement>('input[type=checkbox]')
            ?.focus({ preventScroll: true });
      });
    });
  }

  protected openSheet(): void {
    if (this.locked()) return;
    const state = this.state();
    this.sheetSeconds.set(state.done ? this.target().seconds : state.remaining);
    this.keep.set(false);
    this.invalid.set(false);
    this.editing.set(false);
    this.sheetOpen.set(true);
    const sheet = this.sheet()?.nativeElement;
    if (!sheet || sheet.open) return;
    if (typeof sheet.showModal === 'function') sheet.showModal();
    else sheet.setAttribute('open', '');
  }

  protected closeSheet(event?: Event): void {
    event?.preventDefault();
    this.ruler()?.stopMotion();
    this.cancelEdit();
    this.sheetOpen.set(false);
    const sheet = this.sheet()?.nativeElement;
    if (!sheet?.open) return;
    if (typeof sheet.close === 'function') sheet.close();
    else sheet.removeAttribute('open');
  }

  protected backdropClick(event: MouseEvent): void {
    if (this.backdropPressed && event.target === event.currentTarget) this.closeSheet();
    this.backdropPressed = false;
  }

  /** Set the sheet's time on the timer and, when asked, keep it for the recipe. */
  protected apply(): void {
    if (this.locked() || !this.commitEdit()) return;
    const seconds = this.sheetSeconds();
    this.timers.setDuration(this.target(), seconds);
    if (this.keep() && this.savable() && seconds > 0) this.saveDuration.emit(seconds);
    this.closeSheet();
  }

  protected nudge(minutes: -1 | 1): void {
    this.ruler()?.stopMotion();
    if (!this.commitEdit()) return;
    this.sheetSeconds.update((seconds) =>
      Math.max(0, Math.min(maxClockSeconds, seconds + minutes * 60)),
    );
  }

  protected pickDuration(seconds: number): void {
    this.cancelEdit();
    this.sheetSeconds.set(seconds);
  }

  protected beginEdit(event: Event): void {
    if (this.locked()) return;
    this.ruler()?.stopMotion();
    if (!this.editing()) {
      this.nativeEdit = undefined;
      this.editTarget = this.target().key;
      if (!this.sheetOpen()) this.openSheet();
      const seconds = this.sheetSeconds();
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
    this.sheetSeconds.set(seconds);
    this.editing.set(false);
    return true;
  }

  protected acceptEdit(event: Event): void {
    event.preventDefault();
    if (this.commitEdit()) this.apply();
  }

  protected cancelEdit(event?: Event): void {
    event?.preventDefault();
    this.invalid.set(false);
    this.editing.set(false);
    if (event) (event.target as HTMLInputElement).blur();
  }

  protected start(): void {
    this.ruler()?.stopMotion();
    if (this.disabled() || this.completed()) return;
    this.closeSheet();
    this.timers.start(this.target());
    this.alertOffer.offer();
  }

  protected stop(): void {
    if (this.disabled() || this.completed()) return;
    this.timers.pause(this.target());
  }

  // Recipe-wide reset also clears a pending text edit or an ongoing ruler fling.
  resetInteraction(): void {
    this.closeSheet();
  }

  protected reset(): void {
    if (this.disabled() || this.completed()) return;
    this.resetInteraction();
    this.timers.reset(this.target());
  }

  protected adjust(minutes: -1 | 1): void {
    if (this.minuteLocked()) return;
    this.timers.adjust(this.target(), minutes);
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
