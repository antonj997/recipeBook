import { Injectable, signal } from '@angular/core';
export interface FeedbackAction {
  label: string;
  pendingLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  run: () => Promise<void>;
}
// Ephemeral feedback; data restoration belongs to the caller's account-bound action.
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  message = signal('');
  action = signal<FeedbackAction | null>(null);
  busy = signal(false);
  private timeout?: ReturnType<typeof setTimeout>;
  show(message: string, action: FeedbackAction | null = null): void {
    clearTimeout(this.timeout);
    this.message.set(message);
    this.action.set(action);
    this.busy.set(false);
    this.timeout = setTimeout(() => this.dismiss(), action ? 6000 : 5000);
  }
  async runAction(): Promise<void> {
    const action = this.action();
    if (!action || this.busy()) return;
    clearTimeout(this.timeout);
    this.busy.set(true);
    try {
      await action.run();
      if (this.action() === action) {
        if (action.successMessage) this.show(action.successMessage);
        else this.dismiss();
      }
    } catch {
      if (this.action() === action)
        this.show(action.errorMessage ?? 'Could not complete that action. Try again.', action);
    } finally {
      if (this.action() === action) this.busy.set(false);
    }
  }
  dismiss(): void {
    clearTimeout(this.timeout);
    this.message.set('');
    this.action.set(null);
    this.busy.set(false);
  }
}
