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

  constructor() {
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
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
      this.touchInput.set(false);
    }
  }

  readonly feedback = inject(FeedbackService);
}
