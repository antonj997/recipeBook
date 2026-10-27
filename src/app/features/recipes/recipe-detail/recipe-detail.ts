import { NgTemplateOutlet } from '@angular/common';
import { RecipeFocusComponent } from './recipe-focus';
import { RecipeShoppingPickerComponent } from '../../../shared/components/recipe-shopping-picker';
import { TimerAlertPreferencesComponent } from '../../../shared/components/timer-alert-preferences';
import { StepTimerService } from '../../../core/services/step-timer.service';
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
  type CookingSection,
} from '../../../core/services/cooking-session.service';
import { RecipeSummaryDetailsComponent, RecipeExtraDetailsComponent } from './recipe-metadata-view';
import { IconComponent } from '../../../shared/components/icon';
import { CheckboxMarkComponent } from '../../../shared/components/checkbox-mark';
import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
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
    NgTemplateOutlet,
    RecipeFocusComponent,
    StepTimerComponent,
    RecipeShoppingPickerComponent,
    TimerAlertPreferencesComponent,
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
    effect((onCleanup) => {
      const recipe = this.recipe();
      if (recipe && !this.accountChanged())
        onCleanup(this.appearance.useBackground(recipeBackground(recipe)));
    });
    effect(() => {
      if (this.accountChanged()) {
        this.focusMode.set(false);
        this.completedSteps.set(new Set());
        this.activeSection.set('ingredients');
      }
    });
  }
  // Progress is local to this account and never changes the saved recipe.
  completedSteps = signal<Set<number>>(new Set());
  toggleStep(index: number): void {
    if (this.accountChanged()) return;
    this.completedSteps.update((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
    this.saveCookingSession();
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
    this.saveCookingSession();
  }

  switchSection(section: CookingSection): void {
    if (section === this.activeSection() || this.accountChanged()) return;
    this.activeSection.set(section);
    this.saveCookingSession();
  }

  ngOnDestroy(): void {
    this.loadRequest++;
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
    const groups: { section: string; ingredients: string[] }[] = [];
    recipe?.ingredients.forEach((ingredient, index) => {
      ingredient = scaleIngredient(ingredient, this.baseServings(), this.selectedServings());
      const section = recipe.ingredientSections?.[index] ?? '';
      const previous = groups.at(-1);
      if (previous?.section === section) previous.ingredients.push(ingredient);
      else groups.push({ section, ingredients: [ingredient] });
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
