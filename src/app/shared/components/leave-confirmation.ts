import { Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { LeaveConfirmationService } from '../../core/services/leave-confirmation.service';

@Component({
  selector: 'app-leave-confirmation',
  template: `<dialog
    #dialog
    aria-labelledby="leave-heading"
    aria-describedby="leave-copy"
    (cancel)="cancel($event)"
  >
    <h2 id="leave-heading">Discard changes?</h2>
    <p id="leave-copy">{{ confirmation.message() }}</p>
    <div class="actions">
      <button type="button" autofocus (click)="confirmation.answer(false)">Keep</button>
      <button type="button" class="delete-button" (click)="confirmation.answer(true)">
        Discard
      </button>
    </div>
  </dialog>`,
  styles: `
    dialog {
      width: min(440px, calc(100vw - 32px));
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
    dialog[open] {
      animation: confirm-in 180ms var(--ease-out);
    }
    p {
      color: var(--color-muted);
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 28px;
    }
    .actions button {
      flex: 1;
    }
    @keyframes confirm-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    @media (max-width: 400px) {
      dialog {
        padding: 24px;
      }
      .actions {
        gap: 8px;
      }
    }
  `,
})
export class LeaveConfirmationComponent {
  readonly confirmation = inject(LeaveConfirmationService);
  private dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (this.confirmation.message()) {
        if (dialog && !dialog.open) dialog.showModal();
      } else if (dialog?.open) dialog.close();
    });
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.confirmation.answer(false);
  }
}
