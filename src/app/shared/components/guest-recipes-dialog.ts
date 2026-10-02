import { Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { GuestRecipesService } from '../../core/services/guest-recipes.service';

@Component({
  selector: 'app-guest-recipes-dialog',
  template: `<dialog
    #dialog
    aria-labelledby="guest-heading"
    aria-describedby="guest-copy"
    (cancel)="$event.preventDefault()"
    (close)="reopen()"
    [attr.aria-busy]="guest.busy() || guest.checking() ? 'true' : null"
  >
    <h2 id="guest-heading">
      {{ deleting() ? 'Delete device recipes?' : 'Recipes on this device' }}
    </h2>
    <div id="guest-copy">
      @if (guest.checking()) {
        <p role="status">Checking recipes saved without an account…</p>
      } @else {
        <p>
          {{ guest.recipes() }} {{ guest.recipes() === 1 ? 'recipe' : 'recipes' }} and
          {{ guest.categories() }}
          {{ guest.categories() === 1 ? 'category were' : 'categories were' }} saved while signed
          out.
        </p>
        @if (deleting()) {
          <p>
            Delete these recipes, their photos and categories from this device? This cannot be
            undone. Recipes already in your account are kept.
          </p>
        } @else {
          <p>
            Add them to {{ guest.auth.user()?.email || 'your account' }}, or delete them from this
            device before continuing.
          </p>
          <p>
            Adding keeps ingredients, photos and categories. The recipes become part of your account
            and are removed from the signed-out collection after they are safely saved.
          </p>
        }
      }
    </div>
    @if (guest.error()) {
      <p class="error" role="alert">{{ guest.error() }}</p>
    }
    @if (guest.busy()) {
      <p role="status">
        {{ guest.busy() === 'add' ? 'Adding recipes…' : 'Deleting device recipes…' }}
      </p>
    }
    <div class="actions">
      @if (deleting()) {
        <button type="button" (click)="deleting.set(false)" [disabled]="blocked()">Go back</button>
        <button
          type="button"
          class="delete-button"
          (click)="guest.choose('delete')"
          [disabled]="blocked()"
        >
          Delete device recipes
        </button>
      } @else {
        <button
          type="button"
          class="primary"
          autofocus
          (click)="guest.choose('add')"
          [disabled]="blocked() || !hasRecords()"
        >
          Add recipes to account
        </button>
        <button
          type="button"
          class="delete-button"
          (click)="deleting.set(true)"
          [disabled]="blocked() || !hasRecords()"
        >
          Delete device recipes
        </button>
      }
    </div>
    @if (guest.error() && !hasRecords()) {
      <button type="button" (click)="guest.refresh()" [disabled]="blocked()">Try again</button>
    }
  </dialog>`,
  styles: `
    dialog {
      width: min(520px, calc(100vw - 32px));
      max-height: calc(100dvh - 32px);
      overflow: auto;
      padding: 28px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-surface);
      color: var(--color-ink);
    }
    dialog::backdrop {
      background: #14141355;
      backdrop-filter: blur(4px);
    }
    p {
      color: var(--color-muted);
      overflow-wrap: anywhere;
    }
    .error {
      color: var(--color-danger);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 24px;
    }
    .actions button {
      flex: 1 1 180px;
    }
    @media (max-width: 400px) {
      dialog {
        padding: 24px;
      }
    }
  `,
})
export class GuestRecipesDialogComponent {
  readonly guest = inject(GuestRecipesService);
  readonly deleting = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private previousFocus: HTMLElement | null = null;

  constructor() {
    let version = this.guest.auth.accountVersion();
    effect(() => {
      const next = this.guest.auth.accountVersion();
      if (next !== version || !this.guest.required()) {
        version = next;
        this.deleting.set(false);
      }
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.guest.required() && !dialog.open) {
        this.previousFocus =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
      } else if (!this.guest.required() && dialog.open) {
        dialog.close();
        if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
      }
    });
  }

  blocked(): boolean {
    return !!this.guest.busy() || this.guest.checking() || this.guest.auth.busy();
  }
  hasRecords(): boolean {
    return this.guest.recipes() > 0 || this.guest.categories() > 0;
  }
  reopen(): void {
    // An accidental close never bypasses the mandatory choice, including browser navigation.
    if (this.guest.required()) this.dialog()?.nativeElement.showModal();
  }
}
