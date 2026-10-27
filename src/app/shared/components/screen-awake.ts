import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { WakeLockService } from '../../core/services/wake-lock.service';

// Scoped to a recipe view; the shared lock also serves focus mode and returns after hiding.
@Component({
  selector: 'app-screen-awake',
  template: `
    @if (supported) {
      <div class="awake-control">
        <button
          type="button"
          role="switch"
          [attr.aria-checked]="enabled()"
          [disabled]="busy()"
          [class.is-on]="enabled()"
          (click)="toggle()"
        >
          <span class="switch-track" aria-hidden="true">
            <span class="switch-thumb"></span>
          </span>
          <span>Keep screen on</span>
        </button>
        @if (notice()) {
          <p role="status">{{ notice() }}</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    button {
      gap: 12px;
      font-size: inherit;
      border: 0;
      padding: 4px 0;
      background: transparent;
      min-height: 44px;
    }
    button:active:not(:disabled) {
      transform: none;
    }
    button:hover:not(:disabled) {
      background: transparent;
      color: var(--color-ink);
    }
    .switch-track {
      display: block;
      flex: 0 0 auto;
      width: 48px;
      height: 28px;
      padding: 3px;
      border: 1px solid var(--color-control-border);
      border-radius: 8px;
      background: var(--color-surface);
      transition:
        background var(--motion-control) var(--ease-out),
        border-color var(--motion-control) var(--ease-out);
    }
    .switch-thumb {
      display: block;
      width: 20px;
      height: 20px;
      border-radius: 5px;
      background: var(--color-ink);
      transition:
        transform var(--motion-control) var(--ease-out),
        background var(--motion-control) var(--ease-out);
    }
    .is-on .switch-track {
      background: var(--color-green);
      border-color: var(--color-control-border);
    }
    .is-on .switch-thumb {
      transform: translateX(20px);
      background: var(--color-surface);
    }
    button:disabled {
      opacity: 0.65;
    }
    p {
      margin: 4px 0 0;
      color: var(--color-muted);
      font-size: 0.875rem;
      max-width: 50ch;
    }
    @media (max-width: 360px) {
      button {
        gap: 8px;
      }
    }
    @media (hover: hover) {
      button:hover .switch-track {
        border-color: color-mix(in srgb, var(--color-control-border) 75%, var(--color-ink));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .switch-track,
      .switch-thumb {
        transition: none;
      }
    }
  `,
})
export class ScreenAwakeComponent {
  private readonly wake = inject(WakeLockService);
  readonly supported = this.wake.supported;
  readonly requested = computed(() => this.wake.wants('toggle'));
  readonly enabled = computed(() => this.requested() && this.wake.held());
  readonly busy = signal(false);
  private readonly refused = signal(false);
  readonly notice = computed(() =>
    this.refused()
      ? 'Could not keep the screen on. Check your device’s battery-saving settings.'
      : this.requested() && this.wake.lostWhileVisible()
        ? 'Screen lock was released. Switch off and on to try again.'
        : '',
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => void this.wake.release('toggle'));
  }

  async toggle(): Promise<void> {
    if (this.busy()) return;
    this.refused.set(false);
    if (this.requested()) {
      await this.wake.release('toggle');
      return;
    }
    this.busy.set(true);
    try {
      this.refused.set(!(await this.wake.acquire('toggle')));
    } finally {
      this.busy.set(false);
    }
  }
}
