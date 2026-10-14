import { PageTurnService } from './core/services/page-turn.service';
import { PageAppearanceService } from './core/services/page-appearance.service';
import { RecipeActionsOverlayComponent } from './shared/components/recipe-actions-overlay';
import { CloudCookbookService } from './core/services/cloud-cookbook.service';
import { RecipeDraftService } from './core/services/recipe-draft.service';
import { LeaveConfirmationService } from './core/services/leave-confirmation.service';
import { AppUpdateService } from './core/services/app-update.service';
import { LeaveConfirmationComponent } from './shared/components/leave-confirmation';
import { GuestRecipesDialogComponent } from './shared/components/guest-recipes-dialog';
import { GuestRecipesService } from './core/services/guest-recipes.service';
import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconComponent } from './shared/components/icon';
import { FeedbackService } from './core/services/feedback.service';

@Component({
  imports: [
    RecipeActionsOverlayComponent,
    RouterOutlet,
    RouterLink,
    IconComponent,
    LeaveConfirmationComponent,
    GuestRecipesDialogComponent,
  ],
  selector: 'app-root',
  host: {
    '[class.touch-input]': 'touchInput()',
    '[style.--page-background]': 'appearance.background()',
    '[style.--app-header-height]': 'headerHeight()',
    '[class.recipe-page]': '!!appearance.background()',
    '[class.compact-header]': 'compactHeader()',
    '(document:pointerdown)': 'onPointerDown($event)',
    '(document:keydown)': 'onNavigationKey($event)',
  },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly appearance = inject(PageAppearanceService);
  protected readonly headerHeight = signal<string | null>(null);
  protected readonly compactHeader = signal(false);
  private readonly appHeader = viewChild<ElementRef<HTMLElement>>('appHeader');
  private readonly destroyRef = inject(DestroyRef);
  protected readonly hideSettings = signal(false);
  private router = inject(Router);
  private readonly pageTurn = inject(PageTurnService);
  protected readonly onSettings = signal(false);
  protected readonly settingsTarget = signal('/settings');
  private lastPage = '/';
  private settingsReturn = '/';

  readonly updates = inject(AppUpdateService);
  private cloud = inject(CloudCookbookService);
  private drafts = inject(RecipeDraftService);
  private confirmation = inject(LeaveConfirmationService);
  private guestRecipes = inject(GuestRecipesService);
  readonly accountChanging = signal(false);

  constructor() {
    afterNextRender(() => {
      const header = this.appHeader()?.nativeElement;
      if (!header) return;
      const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const originalThemeColor = themeColor?.content;
      let themeFrame = 0;
      const syncThemeColor = () => {
        const color = getComputedStyle(header).backgroundColor;
        if (themeColor && themeColor.content !== color) themeColor.content = color;
      };
      const queueThemeColor = () => {
        cancelAnimationFrame(themeFrame);
        themeFrame = requestAnimationFrame(() => {
          themeFrame = 0;
          syncThemeColor();
        });
      };
      const onHeaderTransition = (event: TransitionEvent) => {
        if (event.target !== header || event.propertyName !== 'background-color') return;
        cancelAnimationFrame(themeFrame);
        const until = performance.now() + 500;
        const tick = () => {
          syncThemeColor();
          themeFrame = performance.now() < until ? requestAnimationFrame(tick) : 0;
        };
        themeFrame = requestAnimationFrame(tick);
      };
      header.addEventListener('transitionrun', onHeaderTransition);
      // Keep sticky tabs below the real header, including safe-area changes and enlarged text.
      const updateHeight = () => {
        const height = header.getBoundingClientRect().height;
        if (height > 0) this.headerHeight.set(height + 'px');
      };
      updateHeight();
      const observer = new ResizeObserver(updateHeight);
      observer.observe(header, { box: 'border-box' });
      this.updateHeaderForScroll();
      queueThemeColor();
      const onScroll = () => {
        const wasCompact = this.compactHeader();
        this.updateHeaderForScroll();
        if (wasCompact !== this.compactHeader()) queueThemeColor();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        window.removeEventListener('scroll', onScroll);
        header.removeEventListener('transitionrun', onHeaderTransition);
        cancelAnimationFrame(themeFrame);
        if (themeColor && originalThemeColor) themeColor.content = originalThemeColor;
      });
    });
    let version = this.cloud.auth.accountVersion();
    effect(() => {
      const next = this.cloud.auth.accountVersion();
      if (next === version) return;
      version = next;
      this.pageTurn.cancel();
      this.accountChanging.set(true);
      this.drafts.clear();
      this.confirmation.answer(true);
      this.feedback.dismiss();
      // Keep account feedback visible; other views must leave the previous cookbook.
      const target = this.router.url.split(/[?#]/)[0] === '/settings' ? this.router.url : '/';
      void this.router.navigateByUrl(target).finally(() => {
        if (version === next) this.accountChanging.set(false);
      });
    });
    effect(() => {
      if (
        this.cloud.auth.passwordRecovery() ||
        this.cloud.auth.callbackError() ||
        this.cloud.auth.callbackNotice()
      )
        if (this.router.url.split(/[?#]/)[0] !== '/settings')
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
      requestAnimationFrame(() => {
        if (!this.guestRecipes.required())
          document.getElementById('main-content')?.focus({ preventScroll: true });
      });
    });
  }
  protected readonly touchInput = signal(false);

  private updateHeaderForScroll(): void {
    // Shrinking the header changes document height. Separate thresholds avoid flickering.
    this.compactHeader.set(this.compactHeader() ? window.scrollY > 8 : window.scrollY >= 80);
  }

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
