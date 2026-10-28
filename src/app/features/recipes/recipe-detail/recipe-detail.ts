import { NgTemplateOutlet } from '@angular/common';
import { RecipeFocusComponent } from './recipe-focus';
import { IngredientCheckComponent } from './ingredient-check';
import { EdgeSwipeBackDirective } from '../../../shared/directives/edge-swipe-back';
import { RecipeShoppingPickerComponent } from '../../../shared/components/recipe-shopping-picker';
import { StepTimerService } from '../../../core/services/step-timer.service';
import { WakeLockService } from '../../../core/services/wake-lock.service';
import { animateHeight } from '../../../shared/motion/flip';
import { motionMs } from '../../../core/motion';
import { StepTimerComponent } from '../../../shared/components/step-timer';
import {
  maxClockSeconds,
  recipeStepTimers,
  type StepTimerTarget,
} from '../../../core/models/step-timer';
import type { RecipePageData } from '../../../core/services/recipe-page-resolvers';
import { RecipeTitleComponent } from '../../../shared/components/recipe-title';
import { RecipeTransitionPartDirective } from '../../../shared/components/recipe-transition-part';
import { PageAppearanceService } from '../../../core/services/page-appearance.service';
import { recipeBackground } from '../../../core/models/recipe-color';
import { ShoppingListService } from '../../../core/services/shopping-list.service';
import { BasketService } from '../../../core/services/basket.service';
import { hasPhoto, type PhotoRef } from '../../../core/models/recipe-image';
import { RecipeImagesService } from '../../../core/services/recipe-images.service';
import { RecipeActionsService } from '../../../core/services/recipe-actions.service';
import { SelectMenuComponent } from '../../../shared/components/select-menu';
import { scaleIngredient } from '../../../core/models/ingredient-quantity';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  downloadRecipePhoto,
  isSupportedRecipePhotoUrl,
} from '../../../core/services/recipe-photo';
import { ScreenAwakeComponent } from '../../../shared/components/screen-awake';
import { RecipeDraftService } from '../../../core/services/recipe-draft.service';
import { StorageDurabilityService } from '../../../core/services/storage-durability.service';
import { LeaveConfirmationService } from '../../../core/services/leave-confirmation.service';
import { instructionText } from '../../../core/models/recipe-metadata';
import {
  CookingSessionService,
  stepFingerprint,
  ingredientFingerprint,
  type CookingSection,
} from '../../../core/services/cooking-session.service';
import { RecipeSummaryDetailsComponent, RecipeExtraDetailsComponent } from './recipe-metadata-view';
import { IconComponent } from '../../../shared/components/icon';
import { CheckboxMarkComponent } from '../../../shared/components/checkbox-mark';
import {
  afterRenderEffect,
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  Injector,
  OnInit,
  OnDestroy,
  signal,
  untracked,
  viewChildren,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageTransitionService } from '../../../core/services/page-transition.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Recipe } from '../../../core/models/recipe.model';
import { RecipeService } from '../../../core/services/recipe.service';

import { FeedbackService } from '../../../core/services/feedback.service';
import { LoadingStateComponent } from '../../../shared/components/loading-state';
import { FoodDoodleComponent } from '../../../shared/components/food-doodle';

@Component({
  selector: 'app-recipe-detail',
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  imports: [
    EdgeSwipeBackDirective,
    IngredientCheckComponent,
    NgTemplateOutlet,
    RecipeFocusComponent,
    StepTimerComponent,
    RecipeShoppingPickerComponent,
    RecipeTitleComponent,
    RecipeTransitionPartDirective,
    SelectMenuComponent,
    ScreenAwakeComponent,
    CheckboxMarkComponent,
    RecipeSummaryDetailsComponent,
    RecipeExtraDetailsComponent,
    IconComponent,
    RouterLink,
    LoadingStateComponent,
    FoodDoodleComponent,
  ],
  templateUrl: './recipe-detail.html',
  styleUrls: ['./recipe-tabs.scss', './recipe-detail.scss', './recipe-focus-content.scss'],
})
export class RecipeDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMotion = inject(PageTransitionService);
  private loadRequest = 0;
  readonly drafts = inject(RecipeDraftService);
  private confirmation = inject(LeaveConfirmationService);
  readonly isDraft = !!this.route.snapshot.data['draft'];
  /** iPhone Home Screen apps have no system back swipe; elsewhere the system owns the edge. */
  readonly edgeSwipe =
    !this.isDraft && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  private readonly edgeSwipeBack = viewChild(EdgeSwipeBackDirective);
  async swipeHome(): Promise<void> {
    const left =
      !this.accountChanged() && (await this.router.navigateByUrl('/').catch(() => false));
    // A navigation that was cancelled or failed leaves the page where the finger let go.
    if (!left) this.edgeSwipeBack()?.reset();
  }
  savingDraft = signal(false);
  saveDraftError = signal('');
  private leaving = false;

  async canLeave(): Promise<boolean> {
    if (this.accountChanged()) return true;
    if (!this.isDraft || this.leaving) return true;
    if (this.savingDraft()) return false;
    const leave = await this.confirmation.confirm('This recipe has not been saved. Discard it?');
    if (leave) this.drafts.clear();
    return leave;
  }
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isDraft && !this.leaving) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  async editDraft(): Promise<void> {
    this.leaving = true;
    await this.router.navigate(['/recipes/new/edit']);
  }
  async saveDraft(): Promise<void> {
    const draft = this.recipe();
    if (this.accountChanged() || !draft?.title.trim() || this.savingDraft()) return;
    this.savingDraft.set(true);
    this.saveDraftError.set('');
    try {
      const { id, imageUrl, ...data } = this.drafts.getOrCreate();
      const saved = await this.recipeService.addRecipe(data);
      if (this.accountChanged()) return;
      this.leaving = true;
      this.drafts.clear();
      // Firefox asks the person first; never hold navigation on that prompt.
      await Promise.race([
        this.durability.ensurePersisted(),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
      if (this.durability.shouldNudge()) {
        // A signed-out cookbook in a browser tab can be cleared by the browser; say so once.
        this.durability.markNudged();
        this.feedback.show(
          'Recipe saved on this device. Install Recipebook or sign in so the browser keeps it.',
          {
            label: 'Show how',
            pendingLabel: 'Opening…',
            run: async () => {
              await this.router.navigate(['/settings'], { fragment: 'import-cookbook' });
            },
          },
        );
      } else this.feedback.show('Recipe saved');
      await this.router.navigate(['/recipes', saved.id]);
    } catch {
      this.saveDraftError.set('Could not save your recipe. Please try again.');
    } finally {
      this.savingDraft.set(false);
    }
  }
  private recipeService = inject(RecipeService);
  private readonly accountVersion = this.recipeService.accountVersion();
  private accountChanged(): boolean {
    return this.accountVersion !== this.recipeService.accountVersion();
  }
  private router = inject(Router);
  private feedback = inject(FeedbackService);
  private durability = inject(StorageDurabilityService);
  private images = inject(RecipeImagesService);
  readonly hasPhoto = hasPhoto;
  photoUrl(ref: PhotoRef | undefined): string | undefined {
    return this.images.peek(ref, 'full');
  }
  private actions = inject(RecipeActionsService);
  private appearance = inject(PageAppearanceService);
  optionsOpen = computed(
    () => !!this.actions.menu()?.fromDetail && this.actions.menu()?.recipe.id === this.recipe()?.id,
  );
  openOptions(trigger: HTMLButtonElement): void {
    const recipe = this.recipe();
    if (!recipe || this.isDraft || this.accountChanged()) return;
    this.actions.openDetails(recipe, trigger, () => this.router.navigate(['/']));
  }

  collectionNames = signal<string[]>([]);
  activeSection = signal<CookingSection>('ingredients');
  wideReading = signal(false);
  readonly focusMode = signal(false);
  private readonly readingSurface = viewChild<ElementRef<HTMLElement>>('readingSurface');
  private readonly titleHeading = viewChild<ElementRef<HTMLElement>>('titleHeading');
  private readonly headingPassed = signal(false);
  private readonly headerTitle = computed(() => {
    const recipe = this.recipe();
    if (!recipe || this.accountChanged()) return null;
    return { text: recipe.title || 'New recipe', shown: this.headingPassed() };
  });
  focusReadingHeight = 0;
  focusScroll = { left: 0, top: 0 };
  openFocus(): void {
    if (!this.recipe() || this.accountChanged() || this.focusMode()) return;
    // Reserve the old reading surface before moving its template to the dialog.
    // This prevents long-page scroll positions being clamped on entry or exit.
    this.focusReadingHeight =
      this.readingSurface()?.nativeElement.getBoundingClientRect().height ?? 0;
    this.focusScroll = { left: window.scrollX, top: window.scrollY };
    this.focusMode.set(true);
  }
  readonly focusPortrait = signal(false);
  readonly bothPanels = computed(() => this.wideReading() || this.focusMode());
  private focusMedia?: MediaQueryList;
  private syncFocusOrientation = (): void => {
    this.focusPortrait.set(this.focusMedia?.matches ?? false);
  };
  adjustServings(direction: -1 | 1): void {
    const options = this.servingOptions();
    const next = options[options.indexOf(this.selectedServings()) + direction];
    if (next !== undefined) this.changeServings(String(next));
  }
  private readingMedia?: MediaQueryList;
  private layoutFocusFrame?: number;
  // Both panels fit from 40rem; keep the selected portrait tab and cooking state intact.
  private syncReadingLayout = (): void => {
    const wide = this.readingMedia?.matches ?? false;
    if (wide === this.wideReading()) return;
    const focused = document.activeElement;
    const inactive = this.activeSection() === 'ingredients' ? 'instructions' : 'ingredients';
    const focusTarget = wide
      ? focused?.closest('.section-switch') && this.activeSection() + '-panel'
      : focused?.closest('#' + inactive + '-panel') && 'recipe-' + this.activeSection() + '-tab';
    if (this.layoutFocusFrame !== undefined) cancelAnimationFrame(this.layoutFocusFrame);
    this.wideReading.set(wide);
    if (focusTarget) {
      this.layoutFocusFrame = requestAnimationFrame(() => {
        this.layoutFocusFrame = undefined;
        document.getElementById(focusTarget)?.focus({ preventScroll: true });
      });
    }
  };
  private cookingSessions = inject(CookingSessionService);
  private readonly timers = inject(StepTimerService);
  private readonly wakeLock = inject(WakeLockService);
  private readonly injector = inject(Injector);
  readonly stepTimers = computed(() => {
    const recipe = this.recipe();
    return recipe ? recipeStepTimers(recipe) : [];
  });
  readonly hasTimers = computed(() => this.stepTimers().some(Boolean));
  private readonly timerControls = viewChildren(StepTimerComponent);
  readonly canResetInstructions = computed(
    () =>
      !this.accountChanged() &&
      (this.completedSteps().size > 0 ||
        this.checkedIngredients().size > 0 ||
        (!this.isDraft &&
          this.stepTimers().some((target) => !!target && this.timerNeedsReset(target)))),
  );
  private timerNeedsReset(target: StepTimerTarget): boolean {
    const state = this.timers.state(target);
    return state.started || state.remaining !== Math.min(target.seconds, maxClockSeconds);
  }

  private readonly requestedStep = computed(() => {
    const target = this.timers.stepToReveal();
    if (
      !target ||
      this.loading() ||
      this.isDraft ||
      this.accountChanged() ||
      target.recipeId !== this.recipe()?.id ||
      this.stepTimers()[target.index]?.key !== target.key
    )
      return null;
    return target;
  });
  constructor() {
    effect(() => {
      if (this.requestedStep()) untracked(() => this.switchSection('instructions'));
    });
    afterRenderEffect(() => {
      const target = this.requestedStep();
      if (!target || this.activeSection() !== 'instructions' || this.pageMotion.phase() !== 'idle')
        return;
      const step = document.getElementById('recipe-step-' + (target.index + 1));
      if (!step) return;
      step.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      });
      step.focus({ preventScroll: true });
      this.timers.stepToReveal.set(null);
    });
    effect(() => {
      if (this.accountChanged() || this.isDraft) return;
      // A checked step stops counting but keeps its time; unchecking shows the clock paused.
      for (const index of this.completedSteps()) {
        const target = this.stepTimers()[index];
        if (!target) continue;
        const state = this.timers.state(target);
        if (state.running || state.done) this.timers.pause(target);
      }
    });
    // Focus mode is for cooking: keep the screen on while it is open, whatever the toggle says.
    effect((onCleanup) => {
      if (!this.focusMode()) return;
      void this.wakeLock.acquire('focus');
      onCleanup(() => void this.wakeLock.release('focus'));
    });
    effect((onCleanup) => {
      const recipe = this.recipe();
      if (recipe && !this.accountChanged())
        onCleanup(this.appearance.useBackground(recipeBackground(recipe)));
    });
    // The compact header takes over the title once the heading has scrolled under it.
    this.destroyRef.onDestroy(this.appearance.useHeaderTitle(this.headerTitle));
    effect((onCleanup) => {
      const heading = this.titleHeading()?.nativeElement;
      const top = Math.round(this.appearance.headerHeight());
      if (!heading || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry)
            this.headingPassed.set(
              !entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0),
            );
        },
        { rootMargin: `-${top}px 0px 0px 0px` },
      );
      observer.observe(heading);
      onCleanup(() => observer.disconnect());
    });
    effect(() => {
      if (this.accountChanged()) {
        this.focusMode.set(false);
        this.completedSteps.set(new Set());
        this.checkedIngredients.set(new Set());
        this.clearStepPhases();
        this.activeSection.set('ingredients');
      }
    });
  }
  // Progress is local to this account and never changes the saved recipe.
  completedSteps = signal<Set<number>>(new Set());
  /** Ingredients set out while cooking; separate from the shopping list. */
  checkedIngredients = signal<Set<number>>(new Set());
  /** Only a mark checked just now scatters its crumbs; restored marks stay still. */
  readonly justGathered = signal<number | null>(null);
  toggleIngredient(index: number): void {
    if (this.accountChanged() || this.isDraft) return;
    this.justGathered.set(this.checkedIngredients().has(index) ? null : index);
    this.checkedIngredients.update((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
    this.saveCookingSession();
  }
  /**
   * Where cooking continues: the first unchecked step after the last checked one, or the first
   * unchecked step when everything after it is done. -1 before the first check or when all are.
   */
  readonly nextStep = computed(() => {
    const done = this.completedSteps();
    const count = this.recipe()?.instructions.length ?? 0;
    if (!done.size) return -1;
    const after = Math.max(...done) + 1;
    for (let index = after; index < count; index++) if (!done.has(index)) return index;
    for (let index = 0; index < count; index++) if (!done.has(index)) return index;
    return -1;
  });
  /** Checked steps whose strike is still drawing; they collapse when it is done. */
  readonly striking = signal<ReadonlySet<number>>(new Set());
  /** Unchecked steps that have opened again while their strike is still erasing. */
  readonly unstriking = signal<ReadonlySet<number>>(new Set());
  private readonly stepPhases = new Map<number, ReturnType<typeof setTimeout>>();
  isStruck(index: number): boolean {
    return this.completedSteps().has(index) || this.unstriking().has(index);
  }
  isCollapsed(index: number): boolean {
    return this.completedSteps().has(index) && !this.striking().has(index);
  }
  toggleStep(index: number): void {
    if (this.accountChanged()) return;
    const checking = !this.completedSteps().has(index);
    const row = document.getElementById('recipe-step-' + (index + 1));
    const animated = !!row && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    clearTimeout(this.stepPhases.get(index));
    this.stepPhases.delete(index);
    const phase = (set: typeof this.striking, on: boolean) =>
      set.update((current) => {
        const next = new Set(current);
        on ? next.add(index) : next.delete(index);
        return next;
      });
    phase(this.unstriking, !checking && animated);
    phase(this.striking, false);
    if (checking && animated && row) {
      // The strike draws first; only then does the step fold to one line.
      phase(this.striking, true);
      this.stepPhases.set(
        index,
        setTimeout(() => {
          this.stepPhases.delete(index);
          void animateHeight(row, () => phase(this.striking, false)).then(() =>
            this.revealNextStep(),
          );
        }, motionMs(220)),
      );
    } else if (!checking && animated && row) {
      // Reverse: the step opens at once, then its strike erases.
      void animateHeight(row, () => undefined);
      this.stepPhases.set(
        index,
        setTimeout(() => {
          this.stepPhases.delete(index);
          phase(this.unstriking, false);
        }, motionMs(200)),
      );
    }
    this.completedSteps.update((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
    this.saveCookingSession();
    // Measure after the checked step has collapsed.
    if (checking && !animated)
      afterNextRender(() => this.revealNextStep(), { injector: this.injector });
  }
  private clearStepPhases(): void {
    for (const timer of this.stepPhases.values()) clearTimeout(timer);
    this.stepPhases.clear();
    this.striking.set(new Set());
    this.unstriking.set(new Set());
  }
  /** Scrolls only when the next step starts above the sticky tabs or near the bottom edge. */
  private revealNextStep(): void {
    const index = this.nextStep();
    const step = index < 0 ? null : document.getElementById('recipe-step-' + (index + 1));
    if (!step) return;
    const { top } = step.getBoundingClientRect();
    const covered = parseFloat(getComputedStyle(step).scrollMarginTop) || 0;
    if (top >= covered && top <= window.innerHeight - 96) return;
    step.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  }

  tabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const section =
      event.key === 'Home'
        ? 'ingredients'
        : event.key === 'End'
          ? 'instructions'
          : this.activeSection() === 'ingredients'
            ? 'instructions'
            : 'ingredients';
    this.switchSection(section);
    document.getElementById('recipe-' + section + '-tab')?.focus({ preventScroll: true });
  }
  resetInstructions(): void {
    if (this.accountChanged()) return;
    const recipe = this.recipe();
    if (recipe && !this.isDraft) {
      for (const control of this.timerControls()) control.resetInteraction();
      this.timers.removeRecipe(recipe.id);
    }
    this.completedSteps.set(new Set());
    this.checkedIngredients.set(new Set());
    this.clearStepPhases();
    this.saveCookingSession();
  }

  switchSection(section: CookingSection): void {
    if (section === this.activeSection() || this.accountChanged()) return;
    this.activeSection.set(section);
    this.saveCookingSession();
  }

  ngOnDestroy(): void {
    this.loadRequest++;
    this.clearStepPhases();
    this.readingMedia?.removeEventListener('change', this.syncReadingLayout);
    this.focusMedia?.removeEventListener('change', this.syncFocusOrientation);
    if (this.layoutFocusFrame !== undefined) cancelAnimationFrame(this.layoutFocusFrame);
  }

  saveCookingSession(): void {
    const recipe = this.recipe();
    if (this.isDraft || !recipe || this.accountChanged()) return;
    this.cookingSessions.save(recipe.id, {
      section: this.activeSection(),
      servings: this.selectedServings(),
      completed: [...this.completedSteps()].map((index) => ({
        index,
        fingerprint: stepFingerprint(recipe, index),
      })),
      ingredients: [...this.checkedIngredients()].map((index) => ({
        index,
        fingerprint: ingredientFingerprint(recipe, index),
      })),
    });
  }

  private restoreCookingSession(recipe: Recipe): void {
    const saved = this.cookingSessions.read(recipe.id);
    if (!saved) return;
    this.activeSection.set(saved.section);
    if (saved.servings && this.servingOptions().includes(saved.servings))
      this.selectedServings.set(saved.servings);
    this.completedSteps.set(
      new Set(
        saved.completed
          .filter(
            (step) =>
              step.index < recipe.instructions.length &&
              step.fingerprint === stepFingerprint(recipe, step.index),
          )
          .map((step) => step.index),
      ),
    );
    this.checkedIngredients.set(
      new Set(
        (saved.ingredients ?? [])
          .filter(
            (item) =>
              item.index < recipe.ingredients.length &&
              item.fingerprint === ingredientFingerprint(recipe, item.index),
          )
          .map((item) => item.index),
      ),
    );
  }

  private auth = inject(SupabaseService);
  loadedStepPhotos = signal<Record<number, string>>({});
  loadingStepPhotos = signal<Set<number>>(new Set());
  stepPhotoNotice = signal('');
  canLoadStepPhoto(index: number): boolean {
    return isSupportedRecipePhotoUrl(this.recipe()?.stepDetails?.[index]?.imageUrl);
  }
  async loadStepPhoto(index: number): Promise<void> {
    const recipeId = this.recipe()?.id;
    const current = () => !this.accountChanged() && recipeId === this.recipe()?.id;
    const url = this.recipe()?.stepDetails?.[index]?.imageUrl;
    if (
      this.accountChanged() ||
      !isSupportedRecipePhotoUrl(url) ||
      this.loadingStepPhotos().has(index)
    )
      return;
    this.loadingStepPhotos.update((items) => new Set([...items, index]));
    this.stepPhotoNotice.set('');
    try {
      const photo = await downloadRecipePhoto(
        url,
        800,
        this.auth.configured()
          ? (url) => this.auth.invokeImporter({ url, action: 'photo' })
          : undefined,
      );
      if (current()) this.loadedStepPhotos.update((items) => ({ ...items, [index]: photo }));
    } catch {
      if (current())
        this.stepPhotoNotice.set('Could not load the photo. Sign in to load imported photos.');
    } finally {
      if (!current()) return;
      this.loadingStepPhotos.update((items) => {
        const next = new Set(items);
        next.delete(index);
        return next;
      });
    }
  }

  failedStepPhotos = signal<Set<number>>(new Set());
  hideStepPhoto(index: number): void {
    this.failedStepPhotos.update((current) => new Set([...current, index]));
  }
  recipe = signal<Recipe | undefined>(undefined);
  readonly shoppingPickerOpen = signal(false);
  private readonly shopping = inject(ShoppingListService);
  private readonly basket = inject(BasketService);
  readonly addingToShopping = signal(false);
  /**
   * Checked ingredients go to the shopping list as they are, their count on the button; with
   * none checked the picker opens to choose. A selection already on the list offers Add again.
   */
  async addToShopping(button: HTMLElement, allowDuplicate = false): Promise<void> {
    const recipe = this.recipe();
    if (!recipe || this.isDraft || this.accountChanged() || this.addingToShopping()) return;
    const indices = [...this.checkedIngredients()].sort((a, b) => a - b);
    if (!indices.length) {
      this.shoppingPickerOpen.set(true);
      return;
    }
    const servings = this.selectedServings();
    const account = this.shopping.accountVersion();
    this.addingToShopping.set(true);
    try {
      const count = await this.shopping.addRecipe(recipe, servings, indices, allowDuplicate);
      if (this.recipe() !== recipe || account !== this.shopping.accountVersion()) return;
      if (button.isConnected)
        void this.basket.flyFrom(
          button.getBoundingClientRect(),
          count,
          `color-mix(in srgb, ${recipeBackground(recipe)} 52%, var(--color-ink))`,
        );
      this.checkedIngredients.set(new Set());
      this.saveCookingSession();
      this.feedback.show(count + (count === 1 ? ' item added' : ' items added'), {
        label: 'View list',
        run: async () => {
          if (account === this.shopping.accountVersion())
            await this.router.navigateByUrl('/shopping-list');
        },
      });
    } catch (error) {
      if (account !== this.shopping.accountVersion()) return;
      if (error instanceof Error && error.message === 'These ingredients are already on your list.')
        this.feedback.show('Already on your list', {
          label: 'Add again',
          run: () => this.addToShopping(button, true),
        });
      else
        this.feedback.show(
          error instanceof Error ? error.message : 'Could not add these ingredients. Try again.',
        );
    } finally {
      this.addingToShopping.set(false);
    }
  }
  selectedServings = signal(4);
  baseServings = computed(() => {
    const value = this.recipe()?.servings;
    return value && Number.isSafeInteger(value) && value > 0 ? value : 4;
  });
  servingOptions = computed(() =>
    [...new Set([2, 4, 6, 8, 10, this.baseServings()])].sort((a, b) => a - b),
  );
  servingMenuOptions = computed(() =>
    this.servingOptions().map((count) => ({ value: String(count), label: count + ' servings' })),
  );
  changeServings(selection: string): void {
    const value = Number(selection);
    if (this.accountChanged() || !this.servingOptions().includes(value)) return;
    this.selectedServings.set(value);
    this.saveCookingSession();
  }
  ingredientGroups = computed(() => {
    const recipe = this.recipe();
    const groups: { section: string; ingredients: { text: string; index: number }[] }[] = [];
    recipe?.ingredients.forEach((ingredient, index) => {
      const text = scaleIngredient(ingredient, this.baseServings(), this.selectedServings());
      const section = recipe.ingredientSections?.[index] ?? '';
      const previous = groups.at(-1);
      if (previous?.section === section) previous.ingredients.push({ text, index });
      else groups.push({ section, ingredients: [{ text, index }] });
    });
    return groups;
  });
  loading = signal(true);
  error = signal('');
  ngOnInit(): void {
    this.focusMedia = window.matchMedia('(orientation: portrait)');
    this.syncFocusOrientation();
    this.focusMedia.addEventListener('change', this.syncFocusOrientation);
    this.readingMedia = window.matchMedia('(min-width: 40rem)');
    this.syncReadingLayout();
    this.readingMedia.addEventListener('change', this.syncReadingLayout);
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadRecipe());
  }

  private async loadRecipe(useResolved = true): Promise<void> {
    const request = ++this.loadRequest;
    const current = () => request === this.loadRequest && !this.accountChanged();
    const id = this.route.snapshot.paramMap.get('id');
    if (!this.isDraft && this.recipe()?.id !== id) {
      this.focusMode.set(false);
      this.recipe.set(undefined);
      this.loading.set(true);
      this.completedSteps.set(new Set());
      this.checkedIngredients.set(new Set());
      this.clearStepPhases();
      this.activeSection.set('ingredients');
      this.loadedStepPhotos.set({});
      this.loadingStepPhotos.set(new Set());
      this.failedStepPhotos.set(new Set());
      this.stepPhotoNotice.set('');
    }

    if (this.isDraft) {
      const draft = this.drafts.getOrCreate();
      this.recipe.set(draft);
      this.selectedServings.set(this.baseServings());
      try {
        const collections = await this.recipeService.getCollections();
        this.collectionNames.set(
          collections.filter((c) => draft.collectionIds?.includes(c.id)).map((c) => c.name),
        );
      } catch {
        this.error.set('Could not load your collections. Reload to try again.');
      }
      this.loading.set(false);
      return;
    }
    if (!id) {
      this.loading.set(false);
      return;
    }

    const data = this.route.snapshot.data['recipePage'] as RecipePageData | undefined;
    const ready =
      useResolved && data?.accountVersion === this.recipeService.accountVersion()
        ? data
        : undefined;
    if (ready?.error) {
      this.error.set(ready.error);
      this.loading.set(false);
      return;
    }
    try {
      const result = ready ? ready.recipe : await this.recipeService.getRecipe(id);
      if (result) {
        result.instructions = result.instructions.map((step, index) =>
          instructionText(step, result.stepDetails?.[index]),
        );
      }
      if (!current()) return;
      this.recipe.set(result);
      // Step photos sit below the fold; they need no part in the page capture.
      if (result) void this.images.prepare([result, ...(result.stepDetails ?? [])], 'full');
      this.error.set(result ? '' : 'This recipe is no longer available.');
      this.selectedServings.set(this.baseServings());
      const collections = ready ? ready.collections : await this.recipeService.getCollections();
      if (!current()) return;
      this.collectionNames.set(
        collections.filter((c) => result?.collectionIds?.includes(c.id)).map((c) => c.name),
      );
    } catch (error) {
      if (!current()) return;
      console.error('Failed to load recipe:', error);
      this.error.set('Could not load this recipe.');
    } finally {
      if (!current()) return;
      this.loading.set(false);
      const recipe = this.recipe();
      if (recipe && !this.accountChanged()) this.restoreCookingSession(recipe);
      // Keep the capture ready, then refresh if sync changed local data while the route chunk loaded.
      if (ready && ready.revision !== this.recipeService.revision() && !this.accountChanged())
        void this.loadRecipe(false);
    }
  }
}
