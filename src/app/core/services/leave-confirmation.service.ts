import { Service, signal } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';

export interface ConfirmBeforeLeaving {
  canLeave(): boolean | Promise<boolean>;
}
export const confirmBeforeLeaving: CanDeactivateFn<ConfirmBeforeLeaving> = (component) =>
  component.canLeave();

export interface ConfirmationLabels {
  title: string;
  confirm: string;
  cancel: string;
  /** Destructive confirmations use the danger button style. */
  destructive: boolean;
}
const discardLabels: ConfirmationLabels = {
  title: 'Discard changes?',
  confirm: 'Discard',
  cancel: 'Keep',
  destructive: true,
};

/** One shared confirmation dialog: leaving unsaved work by default, other questions by label. */
@Service()
export class LeaveConfirmationService {
  readonly message = signal('');
  readonly labels = signal<ConfirmationLabels>(discardLabels);
  private resolve?: (leave: boolean) => void;
  private pending?: Promise<boolean>;

  confirm(
    message: string,
    labels?: Omit<ConfirmationLabels, 'destructive'> & { destructive?: boolean },
  ): Promise<boolean> {
    if (this.pending) return this.pending;
    this.labels.set(labels ? { destructive: false, ...labels } : discardLabels);
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
