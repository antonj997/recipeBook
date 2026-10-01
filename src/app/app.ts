import { effect } from '@angular/core';
import { CloudCookbookService } from './core/services/cloud-cookbook.service';
import { RecipeDraftService } from './core/services/recipe-draft.service';
import { LeaveConfirmationService } from './core/services/leave-confirmation.service';
import { AppUpdateService } from './core/services/app-update.service';
import { LeaveConfirmationComponent } from './shared/components/leave-confirmation';
import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconComponent } from './shared/components/icon';
import { FeedbackService } from './core/services/feedback.service';

@Component({
  imports: [RouterOutlet, RouterLink, IconComponent, LeaveConfirmationComponent],
  selector: 'app-root',
  host: {
    '[class.touch-input]': 'touchInput()',
    '(document:pointerdown)': 'onPointerDown($event)',
    '(document:keydown)': 'onNavigationKey($event)',
  },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly hideSettings = signal(false);
  private router = inject(Router);
  protected readonly onSettings = signal(false);
  protected readonly settingsTarget = signal('/settings');
  private lastPage = '/';
  private settingsReturn = '/';

  readonly updates = inject(AppUpdateService);
  private cloud = inject(CloudCookbookService);
  private drafts = inject(RecipeDraftService);
  private confirmation = inject(LeaveConfirmationService);
  readonly accountChanging = signal(false);

  constructor() {
    let version = this.cloud.auth.accountVersion();
    effect(() => {
      const next = this.cloud.auth.accountVersion();
      if (next === version) return;
      version = next;
      this.accountChanging.set(true);
      this.drafts.clear();
      this.confirmation.answer(true);
      this.feedback.dismiss();
      // Keep account feedback visible; other views must leave the previous cookbook.
      const target = this.router.url.split(/[?#]/)[0] === '/settings' ? '/settings' : '/';
      void this.router.navigate([target]).finally(() => {
        if (version === next) this.accountChanging.set(false);
      });
    });
    effect(() => {
      if (
        this.cloud.auth.passwordRecovery() ||
        this.cloud.auth.callbackError() ||
        this.cloud.auth.callbackNotice()
      )
        void this.router.navigate(['/settings']);
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      let route = this.router.routerState.snapshot.root;
      while (route.firstChild) route = route.firstChild;
      this.hideSettings.set(!!route.data['hideSettings']);
      const settings = event.urlAfterRedirects.split(/[?#]/)[0] === '/settings';
      if (settings && !this.onSettings()) this.settingsReturn = this.lastPage;
      this.onSettings.set(settings);
      this.settingsTarget.set(settings ? this.settingsReturn : '/settings');
      if (!settings) this.lastPage = event.urlAfterRedirects;
      requestAnimationFrame(() =>
        document.getElementById('main-content')?.focus({ preventScroll: true }),
      );
    });
  }
  protected readonly touchInput = signal(false);

  protected onPointerDown(event: PointerEvent): void {
    this.touchInput.set(event.pointerType === 'touch' || event.pointerType === 'pen');
  }

  protected onNavigationKey(event: KeyboardEvent): void {
    if (event.key === 'Tab' || event.key?.startsWith('Arrow')) {
      this.touchInput.set(false);
    }
  }

  readonly feedback = inject(FeedbackService);
}
