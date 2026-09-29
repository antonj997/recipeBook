import { Service, signal } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';

export interface ConfirmBeforeLeaving {
  canLeave(): boolean | Promise<boolean>;
}
export const confirmBeforeLeaving: CanDeactivateFn<ConfirmBeforeLeaving> = (component) =>
  component.canLeave();

@Service()
export class LeaveConfirmationService {
  readonly message = signal('');
  private resolve?: (leave: boolean) => void;
  private pending?: Promise<boolean>;

  confirm(message: string): Promise<boolean> {
    if (this.pending) return this.pending;
    this.message.set(message);
    this.pending = new Promise((resolve) => (this.resolve = resolve));
    return this.pending;
  }
  answer(leave: boolean): void {
    this.message.set('');
    this.resolve?.(leave);
    this.pending = undefined;
    this.resolve = undefined;
  }
}
