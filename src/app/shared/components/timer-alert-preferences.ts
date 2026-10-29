import { Component, inject } from '@angular/core';
import { TimerPushService } from '../../core/services/timer-push.service';
import { TranslatePipe } from '../../core/i18n/i18n';

/** Settings control for background timer alerts; recipes offer them once a timer starts. */
@Component({
  selector: 'app-timer-alert-preferences',
  imports: [TranslatePipe],
  template: `
    <div class="timer-alert-preference">
      <div class="alert-copy">
        <span class="alert-label">{{ 'Background timer alerts' | t }}</span>
        <p role="status" aria-live="polite" [class.alert-error]="alerts.status() === 'error'">
          {{ alerts.message() | t }}
        </p>
      </div>
      <div class="alert-actions">
        @if (alerts.enabled()) {
          <button type="button" (click)="alerts.disable()" [disabled]="alerts.busy()">
            {{ (alerts.busy() ? 'Please wait…' : 'Turn off alerts') | t }}
          </button>
        } @else {
          <button type="button" (click)="alerts.enable()" [disabled]="!alerts.canEnable()">
            {{ (alerts.busy() ? 'Enabling…' : 'Enable alerts') | t }}
          </button>
        }
        @if (alerts.status() === 'pending' || alerts.status() === 'error') {
          <button
            type="button"
            class="retry-alerts"
            (click)="alerts.retry()"
            [disabled]="alerts.busy()"
          >
            {{ 'Retry' | t }}
          </button>
        }
      </div>
    </div>
  `,
  styleUrl: './timer-alert-preferences.scss',
})
export class TimerAlertPreferencesComponent {
  readonly alerts = inject(TimerPushService);
}
