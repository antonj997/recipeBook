import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

// Scoped to a recipe view: the browser releases the lock when hidden or closed.
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
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
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
    .awake-control {
      margin-top: 24px;
    }
    button {
      gap: 12px;
      border: 0;
      padding: 4px 0;
      background: transparent;
      min-height: 44px;
    }
    button:hover:not(:disabled) {
      background: transparent;
      color: var(--color-ink);
    }
    .switch-track {
      width: 46px;
      height: 28px;
      padding: 3px;
      border: 1px solid var(--color-control-border);
      border-radius: 20px;
      background: var(--color-surface);
      transition: background 220ms var(--ease-out);
    }
    .switch-thumb {
      display: block;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-ink);
      transition:
        transform 250ms var(--ease-out),
        background 220ms;
    }
    .is-on .switch-track {
      background: var(--color-green);
      border-color: var(--color-green);
    }
    .is-on .switch-thumb {
      transform: translateX(18px);
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
    @media (hover: hover) {
      button:hover .switch-track {
        border-color: var(--color-ink);
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
  readonly supported = window.isSecureContext && 'wakeLock' in navigator;
  readonly requested = signal(false);
  readonly active = signal(false);
  readonly enabled = computed(() => this.requested() && this.active());
  readonly busy = signal(false);
  readonly notice = signal('');
  private lock?: WakeLockSentinel;
  private generation = 0;
  private destroyed = false;

  constructor() {
    const visibility = () => {
      if (document.visibilityState === 'visible' && this.requested()) void this.acquire();
    };
    document.addEventListener('visibilitychange', visibility);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.requested.set(false);
      this.generation++;
      document.removeEventListener('visibilitychange', visibility);
      void this.lock?.release().catch(() => undefined);
    });
  }

  async toggle(): Promise<void> {
    if (this.busy()) return;
    if (this.requested()) {
      this.requested.set(false);
      this.generation++;
      this.notice.set('');
      this.active.set(false);
      await this.lock?.release().catch(() => undefined);
      this.lock = undefined;
    } else {
      this.requested.set(true);
      await this.acquire();
    }
  }

  private async acquire(): Promise<void> {
    if (this.destroyed || this.busy() || (this.lock && !this.lock.released)) return;
    const generation = ++this.generation;
    this.busy.set(true);
    this.notice.set('');
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (this.destroyed || !this.requested() || generation !== this.generation) {
        await lock.release();
        return;
      }
      this.lock = lock;
      this.active.set(true);
      lock.addEventListener('release', () => {
        if (this.lock !== lock) return;
        this.active.set(false);
        this.lock = undefined;
        if (document.visibilityState === 'visible' && this.requested() && !this.destroyed)
          this.notice.set('Screen lock was released. Switch off and on to try again.');
      });
    } catch {
      if (!this.destroyed && generation === this.generation) {
        this.requested.set(false);
        this.active.set(false);
        this.notice.set(
          'Could not keep the screen on. Check your device’s battery-saving settings.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
