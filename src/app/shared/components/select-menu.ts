import {
  Component,
  ElementRef,
  computed,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
  OnDestroy,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconComponent } from './icon';

export interface SelectMenuOption {
  value: string;
  label: string;
  action?: boolean;
}

// A select-only combobox. Native popover supplies the top layer and light dismissal.
@Component({
  selector: 'app-select-menu',
  imports: [IconComponent],
  templateUrl: './select-menu.html',
  styleUrl: './select-menu.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectMenuComponent), multi: true },
  ],
  host: {
    '[class.heading-menu]': "variant() === 'heading'",
    '(window:resize)': 'close()',
    '(window:scroll)': 'close()',
  },
})
export class SelectMenuComponent implements ControlValueAccessor, OnDestroy {
  menuId = input.required<string>();
  controlId = input('');
  label = input.required<string>();
  describedBy = input<string | null>(null);
  options = input.required<SelectMenuOption[]>();
  value = input('');
  valueType = input<'string' | 'number'>('string');
  variant = input<'field' | 'heading'>('field');
  disabled = input(false);
  valueChange = output<string>();
  open = signal(false);
  activeIndex = signal(0);
  left = signal(0);
  top = signal(0);
  width = signal(220);
  private formBound = signal(false);
  private formValue = signal('');
  private formDisabled = signal(false);
  currentValue = computed(() => (this.formBound() ? this.formValue() : this.value()));
  currentLabel = computed(
    () =>
      this.options().find((option) => option.value === this.currentValue())?.label ??
      this.currentValue(),
  );
  isDisabled = computed(() => this.disabled() || this.formDisabled());
  trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  panel = viewChild<ElementRef<HTMLDivElement>>('panel');
  private renderFrame = 0;
  private typed = '';
  private typedAt = 0;
  private changed: (value: string | number) => void = () => {};
  private touched: () => void = () => {};

  writeValue(value: unknown): void {
    this.formBound.set(true);
    this.formValue.set(typeof value === 'string' || typeof value === 'number' ? String(value) : '');
  }
  registerOnChange(fn: (value: string | number) => void): void {
    this.changed = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
    if (disabled) this.close();
  }
  onBlur(): void {
    this.touched();
  }
  beforeToggle(event: Event): void {
    const opening = (event as ToggleEvent).newState === 'open';
    this.open.set(opening);
    if (opening) {
      this.activeIndex.set(
        Math.max(
          0,
          this.options().findIndex((option) => option.value === this.currentValue()),
        ),
      );
      this.position();
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = requestAnimationFrame(() => {
        this.renderFrame = 0;
        this.revealActive();
      });
    } else this.touched();
  }
  private position(): void {
    const rect = this.trigger()?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(220, rect.width), window.innerWidth - 32);
    const height = Math.min(this.options().length * 44 + 16, 320, window.innerHeight - 32);
    this.width.set(width);
    this.left.set(Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)));
    this.top.set(
      rect.bottom + height + 8 <= window.innerHeight - 16
        ? rect.bottom + 8
        : Math.max(16, rect.top - height - 8),
    );
  }
  private show(): void {
    if (!this.isDisabled() && !this.open()) this.panel()?.nativeElement.showPopover();
  }
  close(): void {
    if (this.open()) this.panel()?.nativeElement.hidePopover();
  }
  choose(index: number, returnFocus = true): void {
    const option = this.options()[index];
    if (!option || this.isDisabled()) return;
    if (this.formBound()) this.formValue.set(option.value);
    this.changed(this.valueType() === 'number' ? Number(option.value) : option.value);
    this.valueChange.emit(option.value);
    this.close();
    if (returnFocus) this.trigger()?.nativeElement.focus({ preventScroll: true });
  }
  onKeydown(event: KeyboardEvent): void {
    if (this.isDisabled() || event.ctrlKey || event.metaKey) return;
    const wasOpen = this.open();
    const last = this.options().length - 1;
    if (last < 0) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.show();
        if (wasOpen)
          this.activeIndex.set(
            Math.max(0, Math.min(last, this.activeIndex() + (event.key === 'ArrowDown' ? 1 : -1))),
          );
        break;
      case 'Home':
      case 'End':
        event.preventDefault();
        this.show();
        this.activeIndex.set(event.key === 'Home' ? 0 : last);
        break;
      case 'Enter':
      case ' ':
        if (!wasOpen) return; // The native button toggles the popover when closed.
        event.preventDefault();
        this.choose(this.activeIndex());
        return;
      case 'Escape':
        if (wasOpen) {
          event.preventDefault();
          this.close();
        }
        return;
      case 'Tab':
        if (wasOpen) this.choose(this.activeIndex(), false);
        return;
      default: {
        if (event.key.length !== 1 || event.altKey) return;
        event.preventDefault();
        this.show();
        const now = performance.now();
        this.typed = now - this.typedAt > 700 ? event.key : this.typed + event.key;
        this.typedAt = now;
        const repeated = [...this.typed].every(
          (char) => char.toLowerCase() === event.key.toLowerCase(),
        );
        const query = repeated ? event.key : this.typed;
        const options = this.options();
        const start = repeated ? this.activeIndex() + 1 : 0;
        for (let i = 0; i < options.length; i++) {
          const index = (start + i) % options.length;
          if (options[index].label.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())) {
            this.activeIndex.set(index);
            break;
          }
        }
      }
    }
    this.revealActive();
  }
  private revealActive(): void {
    const panel = this.panel()?.nativeElement;
    const option = panel?.querySelector<HTMLElement>('[data-option="' + this.activeIndex() + '"]');
    if (!panel || !option) return;
    if (option.offsetTop < panel.scrollTop) panel.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > panel.scrollTop + panel.clientHeight)
      panel.scrollTop = option.offsetTop + option.offsetHeight - panel.clientHeight;
  }
  ngOnDestroy(): void {
    cancelAnimationFrame(this.renderFrame);
  }
}
