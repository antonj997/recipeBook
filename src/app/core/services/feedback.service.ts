import { Injectable, signal } from '@angular/core';
// Ephemeral UI feedback only; never touches recipe storage.
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  message = signal('');
  private timeout?: ReturnType<typeof setTimeout>;
  show(message: string): void {
    clearTimeout(this.timeout);
    this.message.set(message);
    this.timeout = setTimeout(() => this.dismiss(), 5000);
  }
  dismiss(): void {
    clearTimeout(this.timeout);
    this.message.set('');
  }
}
