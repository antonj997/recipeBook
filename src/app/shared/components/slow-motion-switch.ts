import { Component, signal } from '@angular/core';
import { setSlowMotion, slowMotion } from '../../core/motion';

/** Device-only test switch: every animation runs five times slower so it can be judged. */
@Component({
  selector: 'app-slow-motion-switch',
  template: `
    <div class="copy">
      <span class="title" id="slow-motion-title">Slow motion</span>
      <p class="hint" id="slow-motion-note">
        Test: plays every animation five times slower on this device.
      </p>
    </div>
    <button
      type="button"
      role="switch"
      aria-labelledby="slow-motion-title"
      aria-describedby="slow-motion-note"
      [attr.aria-checked]="on()"
      (click)="toggle()"
    >
      <span class="track" aria-hidden="true"><span class="thumb"></span></span>
    </button>
  `,
  styles: `
    /* A row in the settings App card: label on the left, the switch on the right. */
    :host {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 60px;
      padding: 10px 16px;
    }
    .copy {
      flex: 1 1 auto;
      min-width: 0;
    }
    .title {
      color: var(--color-ink);
      font-size: 0.95rem;
      font-weight: 500;
    }
    button {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      min-height: 44px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--color-ink);
    }
    button:hover,
    button:active {
      background: transparent;
      transform: none;
    }
    .track {
      flex: 0 0 auto;
      width: 48px;
      height: 28px;
      padding: 3px;
      border: 1px solid var(--color-control-border);
      border-radius: 8px;
      background: var(--color-surface);
      transition: background var(--motion-control) var(--motion-ease-out);
    }
    .thumb {
      display: block;
      width: 20px;
      height: 20px;
      border-radius: 5px;
      background: var(--color-ink);
      transition:
        transform var(--motion-control) var(--motion-spring-snappy),
        background var(--motion-control) var(--motion-ease-out);
    }
    [aria-checked='true'] .track {
      background: var(--color-green);
    }
    [aria-checked='true'] .thumb {
      transform: translateX(20px);
      background: var(--color-surface);
    }
    .hint {
      margin: 2px 0 0;
      color: var(--color-muted);
      font-size: 0.8125rem;
      line-height: 1.45;
    }
    @media (prefers-reduced-motion: reduce) {
      .track,
      .thumb {
        transition: none;
      }
    }
  `,
})
export class SlowMotionSwitchComponent {
  protected readonly on = signal(slowMotion());

  protected toggle(): void {
    setSlowMotion(!this.on());
    this.on.set(slowMotion());
  }
}
