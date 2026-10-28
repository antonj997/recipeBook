import { FeedbackToastComponent } from './shared/components/feedback-toast';
import { StepTimerService } from './core/services/step-timer.service';
import {
  captureSnapshotNavigation,
  recoverSnapshotNavigation,
  observeSnapshotGesture,
  advanceSnapshotFocus,
  type SnapshotNavigationPress,
} from './core/services/page-transition-input';
import { NgOptimizedImage } from '@angular/common';
import { LibraryViewService } from './core/services/library-view.service';
import { PageTransitionService } from './core/services/page-transition.service';
import { PageAppearanceService } from './core/services/page-appearance.service';
import { RecipeActionsOverlayComponent } from './shared/components/recipe-actions-overlay';
import { CloudCookbookService } from './core/services/cloud-cookbook.service';
import { RecipeDraftService } from './core/services/recipe-draft.service';
import { LeaveConfirmationService } from './core/services/leave-confirmation.service';
import { AppUpdateService } from './core/services/app-update.service';
import { LeaveConfirmationComponent } from './shared/components/leave-confirmation';
import { GuestRecipesDialogComponent } from './shared/components/guest-recipes-dialog';
import { GuestRecipesService } from './core/services/guest-recipes.service';
import { RecipeImagesService } from './core/services/recipe-images.service';
import { ImageMigrationService } from './core/services/image-migration.service';
import { BasketService } from './core/services/basket.service';
import { motionMs } from './core/motion';
import { swingHeaderMark } from './core/brand-mark-motion';
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
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconComponent } from './shared/components/icon';
import { FeedbackService } from './core/services/feedback.service';

@Component({
  imports: [
    FeedbackToastComponent,
    NgOptimizedImage,
    RecipeActionsOverlayComponent,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
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
    '[class.header-title-shown]': '!!appearance.headerTitle()?.shown',
    '[class.compact-header]': 'compactHeader()',
    '[class.focus-surface]': '!!appearance.browserColor()',
    '[style.--browser-surface]': 'appearance.browserColor()',
    '[class.restoring-library]': 'restoringLibrary()',
    '(document:pointerdown)': 'onPointerDown($event)',
    '(document:click)': 'onNavigationClick($event)',
    '(document:keydown)': 'onNavigationKey($event)',
  },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly appearance = inject(PageAppearanceService);
  protected readonly headerHeight = signal<string | null>(null);
  protected readonly compactHeader = signal(false);
  protected readonly restoringLibrary = signal(false);
  private library = inject(LibraryViewService);
  private headerRestoreFrame = 0;
  private readonly appHeader = viewChild<ElementRef<HTMLElement>>('appHeader');
  private readonly destroyRef = inject(DestroyRef);
  protected readonly hideSettings = signal(false);
  private router = inject(Router);
  private readonly pageTransition = inject(PageTransitionService);
  protected readonly onSettings = signal(false);
  protected readonly settingsTarget = signal('/settings');
  private lastPage = '/';
  private settingsReturn = '/';

  readonly updates = inject(AppUpdateService);
  private cloud = inject(CloudCookbookService);
  private drafts = inject(RecipeDraftService);
  private confirmation = inject(LeaveConfirmationService);
  private guestRecipes = inject(GuestRecipesService);
  private images = inject(RecipeImagesService);
  protected readonly basket = inject(BasketService);
  private readonly basketLink = viewChild<ElementRef<HTMLElement>>('basketLink');
  private readonly brandMark = viewChild<ElementRef<HTMLElement>>('brandMark');
  readonly accountChanging = signal(false);

  private syncThemeColor = (): void => {};

  constructor() {
    effect(() => {
      this.appearance.browserColor();
      this.syncThemeColor();
    });
    inject(StepTimerService); // Restore countdowns even when the app opens on the library.
    inject(ImageMigrationService).start();
    // The basket gives a small hop each time added ingredients land in it.
    let landed = this.basket.arrivals();
    effect(() => {
      const arrivals = this.basket.arrivals();
      if (arrivals === landed) return;
      landed = arrivals;
      const icon = this.basketLink()?.nativeElement.querySelector('app-icon');
      if (!icon?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      icon.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.22) rotate(-6deg)' },
          { transform: 'scale(1)' },
        ],
        { duration: motionMs(360), easing: 'ease-out' },
      );
    });
    // The mark stands as an R in the tall header and tips onto its spine as the header compacts.
    let compact = this.compactHeader();
    let swing: Animation | undefined;
    effect(() => {
      const next = this.compactHeader();
      const mark = this.brandMark()?.nativeElement;
      if (next === compact || !mark) return;
      compact = next;
      swing = swingHeaderMark(mark, next, swing);
    });
    this.destroyRef.onDestroy(() => {
      this.stopSnapshotGesture?.();
      cancelAnimationFrame(this.snapshotFocusFrame);
    });
    afterNextRender(() => {
      const header = this.appHeader()?.nativeElement;
      if (!header) return;
      const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const originalThemeColor = themeColor?.content;
      let themeFrame = 0;
      const syncThemeColor = () => {
        const color = this.appearance.browserColor() ?? getComputedStyle(header).backgroundColor;
        if (themeColor && themeColor.content !== color) themeColor.content = color;
      };
      this.syncThemeColor = syncThemeColor;
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
        if (height <= 0) return;
        this.headerHeight.set(height + 'px');
        this.appearance.setHeaderHeight(height);
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
      const onWheel = () => this.pageTransition.cancel();
      window.addEventListener('wheel', onWheel, { passive: true });
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(this.headerRestoreFrame);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('wheel', onWheel);
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
      this.pageTransition.reset();
      // Photo URLs belong to the previous cookbook's database.
      this.images.clear();
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
      cancelAnimationFrame(this.headerRestoreFrame);
      const home = event.urlAfterRedirects.split(/[?#]/)[0] === '/';
      this.restoringLibrary.set(home);
      if (home) {
        this.compactHeader.set(this.library.read().scrollY >= 80);
        // Match the saved geometry before the destination snapshot, without scroll anchoring drift.
        this.headerRestoreFrame = requestAnimationFrame(() => {
          this.headerRestoreFrame = requestAnimationFrame(() => {
            this.headerRestoreFrame = 0;
            this.restoringLibrary.set(false);
            this.updateHeaderForScroll();
          });
        });
      }
      let route = this.router.routerState.snapshot.root;
      while (route.firstChild) route = route.firstChild;
      this.hideSettings.set(!!route.data['hideSettings']);
      const settings = event.urlAfterRedirects.split(/[?#]/)[0] === '/settings';
      if (settings && !this.onSettings()) this.settingsReturn = this.lastPage;
      this.onSettings.set(settings);
      this.settingsTarget.set(settings ? this.settingsReturn : '/settings');
      if (!settings) this.lastPage = event.urlAfterRedirects;
      // A navigation with its own scroll destination also owns focus (for example View step).
      if (this.router.currentNavigation()?.extras.scroll !== 'manual')
        requestAnimationFrame(() => {
          if (!this.guestRecipes.required())
            document.getElementById('main-content')?.focus({ preventScroll: true });
        });
    });
  }
  protected readonly touchInput = signal(false);

  private updateHeaderForScroll(): void {
    // A fixed-body modal temporarily reports scrollY=0; keep the underlying header geometry.
    if (this.restoringLibrary() || document.body.style.position === 'fixed') return;
    // Shrinking the header changes document height. Separate thresholds avoid flickering.
    this.compactHeader.set(this.compactHeader() ? window.scrollY > 8 : window.scrollY >= 80);
  }

  private snapshotPress?: SnapshotNavigationPress;
  private snapshotFocusFrame = 0;

  protected onNavigationClick(event: MouseEvent): void {
    const press = this.snapshotPress;
    this.snapshotPress = undefined;
    recoverSnapshotNavigation(event, press, () => this.pageTransition.cancel());
  }

  protected onPointerDown(event: PointerEvent): void {
    // A second finger must not replace the observer awaiting the primary pan/pinch cancellation.
    if (!event.isPrimary) return;
    this.snapshotPress = captureSnapshotNavigation(event, this.appHeader()?.nativeElement);
    this.watchSnapshotGesture(event);
    this.touchInput.set(event.pointerType === 'touch' || event.pointerType === 'pen');
  }

  private stopSnapshotGesture?: () => void;
  private watchSnapshotGesture(press: PointerEvent): void {
    this.stopSnapshotGesture?.();
    this.stopSnapshotGesture = observeSnapshotGesture(document, press, () => {
      this.snapshotPress = undefined;
      this.pageTransition.cancel();
    });
  }

  protected onNavigationKey(event: KeyboardEvent): void {
    if (event.key === 'Tab' && this.pageTransition.phase() !== 'idle') {
      // Native snapshot teardown is asynchronous. Preserve this Tab rather than
      // letting its default traversal skip controls that are temporarily inert.
      event.preventDefault();
      const route = this.router.url;
      void this.pageTransition.cancel()?.then(() => {
        cancelAnimationFrame(this.snapshotFocusFrame);
        this.snapshotFocusFrame = requestAnimationFrame(() => {
          this.snapshotFocusFrame = 0;
          if (this.router.url === route && this.pageTransition.phase() === 'idle')
            advanceSnapshotFocus(document, event.shiftKey);
        });
      });
      this.touchInput.set(false);
      return;
    }
    if (
      ['Tab', 'Enter', ' ', 'Escape', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) ||
      event.key?.startsWith('Arrow')
    )
      this.pageTransition.cancel();
    if (event.key === 'Tab' || event.key?.startsWith('Arrow')) {
      this.touchInput.set(false);
    }
  }

  readonly feedback = inject(FeedbackService);
}
