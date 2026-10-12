import { SelectMenuComponent } from '../../../shared/components/select-menu';
import { scaleIngredient } from '../../../core/models/ingredient-quantity';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  downloadRecipePhoto,
  isSupportedRecipePhotoUrl,
} from '../../../core/services/recipe-photo';
import { ScreenAwakeComponent } from '../../../shared/components/screen-awake';
import { RecipeDraftService } from '../../../core/services/recipe-draft.service';
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
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Recipe } from '../../../core/models/recipe.model';
import { RecipeService } from '../../../core/services/recipe.service';

import { FeedbackService } from '../../../core/services/feedback.service';
import { FoodDoodleComponent } from '../../../shared/components/food-doodle';
import { LoadingStateComponent } from '../../../shared/components/loading-state';

@Component({
  selector: 'app-recipe-detail',
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(window:pagehide)': 'saveCookingSession()',
  },
  imports: [
    SelectMenuComponent,
    ScreenAwakeComponent,
    CheckboxMarkComponent,
    RecipeSummaryDetailsComponent,
    RecipeExtraDetailsComponent,
    IconComponent,
    RouterLink,
    FoodDoodleComponent,
    LoadingStateComponent,
  ],
  templateUrl: './recipe-detail.html',
  styleUrl: './recipe-detail.scss',
})
export class RecipeDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
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
      this.feedback.show('Recipe saved');
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
  deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');
  confirmOpen = signal(false);
  openDeleteDialog(): void {
    if (this.accountChanged() || this.deleting()) return;
    this.deleteError.set('');
    this.deleteSucceeded.set(false);
    this.confirmOpen.set(true);
    this.deleteDialog()?.nativeElement.showModal();
  }
  closeDeleteDialog(): void {
    if (!this.deleting()) this.deleteDialog()?.nativeElement.close();
  }
  onDialogCancel(event: Event): void {
    if (this.deleting()) event.preventDefault();
  }

  collectionNames = signal<string[]>([]);
  activeSection = signal<CookingSection>('ingredients');
  sectionHeight = signal(0);
  recipeBody = viewChild<ElementRef<HTMLElement>>('recipeBody');
  private cookingSessions = inject(CookingSessionService);
  private destroyed = false;
  constructor() {
    effect(() => {
      if (this.accountChanged()) {
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

  resetInstructions(): void {
    if (this.accountChanged()) return;
    this.completedSteps.set(new Set());
    this.saveCookingSession();
  }

  switchSection(section: CookingSection): void {
    if (section === this.activeSection() || this.accountChanged()) return;
    const body = this.recipeBody()?.nativeElement;
    if (body && window.matchMedia('(max-width: 700px)').matches) {
      // Retain space only when scrolled down, so a shorter panel cannot clamp the page upward.
      this.sectionHeight.set(
        window.scrollY > 0
          ? Math.max(this.sectionHeight(), body.getBoundingClientRect().height)
          : 0,
      );
    }
    this.activeSection.set(section);
    this.saveCookingSession();
  }

  saveCookingSession(): void {
    const recipe = this.recipe();
    if (this.isDraft || !recipe || this.accountChanged() || this.deleteSucceeded()) return;
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

  ngOnDestroy(): void {
    this.saveCookingSession();
    this.destroyed = true;
  }

  private auth = inject(SupabaseService);
  loadedStepPhotos = signal<Record<number, string>>({});
  loadingStepPhotos = signal<Set<number>>(new Set());
  stepPhotoNotice = signal('');
  canLoadStepPhoto(index: number): boolean {
    return isSupportedRecipePhotoUrl(this.recipe()?.stepDetails?.[index]?.imageUrl);
  }
  async loadStepPhoto(index: number): Promise<void> {
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
      if (!this.accountChanged())
        this.loadedStepPhotos.update((items) => ({ ...items, [index]: photo }));
    } catch {
      if (!this.accountChanged())
        this.stepPhotoNotice.set('Could not load the photo. Sign in to load imported photos.');
    } finally {
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
  deleting = signal(false);
  deleteSucceeded = signal(false);
  deleteError = signal('');

  ngOnInit(): void {
    void this.loadRecipe();
  }

  private async loadRecipe(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');

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

    try {
      const result = await this.recipeService.getRecipe(id);
      if (result) {
        result.instructions = result.instructions.map((step, index) =>
          instructionText(step, result.stepDetails?.[index]),
        );
      }
      if (this.accountChanged()) return;
      this.recipe.set(result);
      this.selectedServings.set(this.baseServings());
      const collections = await this.recipeService.getCollections();
      this.collectionNames.set(
        collections.filter((c) => result?.collectionIds?.includes(c.id)).map((c) => c.name),
      );
    } catch (error) {
      console.error('Failed to load recipe:', error);
      this.error.set('Could not load this recipe.');
    } finally {
      this.loading.set(false);
      const recipe = this.recipe();
      if (recipe && !this.accountChanged()) this.restoreCookingSession(recipe);
    }
  }

  async deleteRecipe(): Promise<void> {
    const currentRecipe = this.recipe();
    if (this.accountChanged() || !currentRecipe || this.deleting()) {
      return;
    }

    // The native dialog supplies focus trapping and explicit confirmation.
    if (!this.deleteDialog()?.nativeElement.open) return;
    this.deleting.set(true);
    this.deleteError.set('');

    try {
      await this.recipeService.deleteRecipe(currentRecipe.id);
      if (this.accountChanged()) return;
      this.cookingSessions.clear(currentRecipe.id);
      this.deleteSucceeded.set(true);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2200));
      }
      if (this.accountChanged() || this.destroyed) return;
      this.deleteDialog()?.nativeElement.close();
      this.feedback.show('Recipe deleted');
      await this.router.navigate(['/']);
    } catch (error) {
      console.error('Failed to delete recipe:', error);
      this.deleteError.set('Could not delete the recipe. Please try again.');
    } finally {
      this.deleting.set(false);
    }
  }
}
