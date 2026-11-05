import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { msg, TranslatePipe } from '../../core/i18n/i18n';
import {
  normalizeUsername,
  SharingService,
  usernamePattern,
} from '../../core/services/sharing.service';

export type UsernameStatus = 'empty' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';
let nextId = 0;

/** A public username with its rule and a live availability check, 300 ms after the last key. */
@Component({
  selector: 'app-username-field',
  imports: [TranslatePipe],
  template: `
    <label [for]="id">{{ label() | t }}</label>
    <div class="username-input">
      <span aria-hidden="true">@</span>
      <input
        [id]="id"
        type="text"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        maxlength="25"
        [value]="value()"
        [attr.aria-invalid]="state() === 'invalid' || state() === 'taken'"
        [attr.aria-describedby]="id + '-status'"
        (input)="change($any($event.target).value)"
      />
    </div>
    <p
      class="username-status"
      [id]="id + '-status'"
      role="status"
      [class.is-ok]="state() === 'available'"
      [class.is-bad]="state() === 'invalid' || state() === 'taken' || state() === 'error'"
    >
      {{ message() | t }}
    </p>
  `,
  styles: `
    :host {
      display: grid;
      gap: 6px;
    }
    label {
      font-size: 0.85rem;
      font-weight: 600;
    }
    .username-input {
      display: flex;
      align-items: center;
      gap: 4px;
      border-bottom: 1px solid var(--color-control-border);
    }
    .username-input:focus-within {
      border-bottom-color: var(--color-ink);
    }
    .username-input span {
      color: var(--color-muted);
    }
    input {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      padding: 0;
      border: 0;
      background: transparent;
      font: inherit;
    }
    input:focus {
      outline: none;
    }
    .username-status {
      min-height: 1.4em;
      margin: 0;
      font-size: 0.8rem;
      color: var(--color-muted);
    }
    .is-ok {
      color: var(--color-ink);
    }
    .is-bad {
      color: var(--color-danger);
    }
  `,
})
export class UsernameFieldComponent implements OnInit {
  private readonly sharing = inject(SharingService);
  readonly id = 'username-' + nextId++;
  readonly label = input(msg('Username (shown to everyone)'));
  readonly value = model('');
  readonly status = output<UsernameStatus>();
  readonly state = signal<UsernameStatus>('empty');
  private readonly failure = signal('');
  readonly message = computed(() => {
    switch (this.state()) {
      case 'invalid':
        return msg('Use 3–24 letters a–z, numbers, dots or underscores.');
      case 'checking':
        return msg('Checking…');
      case 'available':
        return msg('Available');
      case 'taken':
        return msg('Taken');
      case 'error':
        return this.failure();
      default:
        return '';
    }
  });
  private timer?: ReturnType<typeof setTimeout>;
  private ticket = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  ngOnInit(): void {
    this.evaluate(this.value());
  }

  change(raw: string): void {
    this.value.set(raw);
    this.evaluate(raw);
  }

  private evaluate(raw: string): void {
    clearTimeout(this.timer);
    const ticket = ++this.ticket;
    const name = normalizeUsername(raw);
    if (!name) return this.set('empty');
    if (!usernamePattern.test(name)) return this.set('invalid');
    this.set('checking');
    this.timer = setTimeout(async () => {
      try {
        const free = await this.sharing.isUsernameAvailable(name);
        if (ticket === this.ticket) this.set(free ? 'available' : 'taken');
      } catch (error) {
        if (ticket !== this.ticket) return;
        this.failure.set(
          error instanceof Error ? error.message : msg('Something went wrong. Try again.'),
        );
        this.set('error');
      }
    }, 300);
  }

  private set(state: UsernameStatus): void {
    this.state.set(state);
    this.status.emit(state);
  }
}
