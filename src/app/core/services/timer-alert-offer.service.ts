import { inject, Service } from '@angular/core';
import { FeedbackService } from './feedback.service';
import { SupabaseService } from './supabase.service';
import { TimerPushService } from './timer-push.service';
import { t } from '../i18n/i18n';

// Shared with the reminder panel of earlier versions, so a dismissed reminder stays dismissed.
const offeredKey = 'recipebook:timer-alert-reminder-dismissed:';

/** Asks about background alerts when they first matter: right after a timer starts. */
@Service()
export class TimerAlertOfferService {
  private readonly alerts = inject(TimerPushService);
  private readonly feedback = inject(FeedbackService);
  private readonly auth = inject(SupabaseService);

  /** Once per account, and only where alerts can work: signed in, supported and still off. */
  offer(): void {
    const user = this.auth.user();
    if (!user || this.alerts.enabled() || !this.alerts.canEnable()) return;
    const key = offeredKey + JSON.stringify([this.auth.cacheScope, user.id]);
    try {
      if (localStorage.getItem(key) === 'true') return;
      localStorage.setItem(key, 'true');
    } catch {
      // Without storage the offer may return on a later visit; Settings keeps the control.
    }
    this.feedback.show(
      t('Want an alert when a timer ends while Recipebook is in the background?'),
      {
        label: t('Enable'),
        pendingLabel: t('Enabling…'),
        successMessage: t('Timer alerts are on.'),
        errorMessage: t('Could not turn on timer alerts. Try again in Settings.'),
        run: async () => {
          await this.alerts.enable();
          // i18n-ignore: replaced by errorMessage above
          if (!this.alerts.enabled()) throw new Error('Timer alerts are still off.');
        },
      },
    );
  }
}
