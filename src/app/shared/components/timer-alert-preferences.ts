import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { TimerPushService } from '../../core/services/timer-push.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { IconComponent } from './icon';

@Component({
  selector: 'app-timer-alert-preferences',
  imports: [IconComponent],
  host: { '[hidden]': 'hidden()' },
  template: `
    <div class="timer-alert-preference" [class.is-contextual]="contextual()">
      <div class="alert-copy">
        <span class="alert-label">Background timer alerts</span>
        <p role="status" aria-live="polite" [class.alert-error]="alerts.status() === 'error'">
          {{ alerts.message() }}
        </p>
      </div>
      @if (contextual()) {
        <button
          type="button"
          class="dismiss-alerts"
          aria-label="Keep timer alerts off"
          (click)="dismiss()"
        >
          <app-icon name="close" />
        </button>
      }
      <div class="alert-actions">
        @if (alerts.enabled()) {
          <button type="button" (click)="alerts.disable()" [disabled]="alerts.busy()">
            {{ alerts.busy() ? 'Please wait…' : 'Turn off alerts' }}
          </button>
        } @else {
          <button type="button" (click)="alerts.enable()" [disabled]="!alerts.canEnable()">
            {{ alerts.busy() ? 'Enabling…' : 'Enable alerts' }}
          </button>
        }
        @if (alerts.status() === 'pending' || alerts.status() === 'error') {
          <button
            type="button"
            class="retry-alerts"
            (click)="alerts.retry()"
            [disabled]="alerts.busy()"
          >
            Retry
          </button>
        }
      </div>
    </div>
  `,
  styleUrl: './timer-alert-preferences.scss',
})
export class TimerAlertPreferencesComponent {
  readonly contextual = input(false);
  readonly alerts = inject(TimerPushService);
  private readonly auth = inject(SupabaseService);
  private readonly storageKey = computed(
    () =>
      'recipebook:timer-alert-reminder-dismissed:' +
      JSON.stringify([this.auth.cacheScope, this.auth.user()?.id ?? 'device']),
  );
  private readonly dismissed = linkedSignal(() => {
    this.auth.accountVersion();
    const key = this.storageKey();
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  });
  protected readonly hidden = computed(
    () => this.contextual() && (this.alerts.enabled() || this.dismissed()),
  );

  protected dismiss(): void {
    if (!this.contextual()) return;
    try {
      localStorage.setItem(this.storageKey(), 'true');
    } catch {
      // Keep the current reminder dismissed even if device storage is unavailable.
    }
    this.dismissed.set(true);
  }
}
