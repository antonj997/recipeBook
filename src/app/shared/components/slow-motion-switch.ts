import { Component, signal } from '@angular/core';
import { setSlowMotion, slowMotion } from '../../core/motion';

/** Device-only test switch: every animation runs five times slower so it can be judged. */
@Component({
  selector: 'app-slow-motion-switch',
  template: `
    <button type="button" role="switch" [attr.aria-checked]="on()" (click)="toggle()">
      <span class="track" aria-hidden="true"><span class="thumb"></span></span>
      Slow motion (test)
    </button>
    <p class="hint">Plays every animation five times slower on this device.</p>
  `,
  styles: `
    :host {
      display: block;
      margin-block: 18px;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-height: 44px;
      padding: 4px 0;
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
      margin: 4px 0 0;
      color: var(--color-muted);
      font-size: 0.875rem;
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
