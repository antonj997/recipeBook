import { RecipeDraftService } from '../../../core/services/recipe-draft.service';
import { LeaveConfirmationService } from '../../../core/services/leave-confirmation.service';
import { prepareRecipePhoto } from '../../../core/services/recipe-photo';
import { RecipeGroupsComponent } from './recipe-groups';
import { RecipeCollectionsComponent } from './recipe-collections';
import type { RecipeCollection } from '../../../core/models/recipe-collection.model';
import { RECIPE_TAGS } from '../../../core/models/recipe-tag.model';
import {
  RecipeExtraFieldsComponent,
  createMetadataForm,
  populateMetadataForm,
  metadataFromForm,
} from './recipe-extra-fields';
import {
  readRecipeMetadata,
  instructionText,
  type RecipeStepDetail,
  type RecipeMetadata,
} from '../../../core/models/recipe-metadata';
import { FoodDoodleComponent } from '../../../shared/components/food-doodle';
import { IconComponent } from '../../../shared/components/icon';
import { Component, inject, OnInit, signal, viewChildren } from '@angular/core';

import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { RecipeService } from '../../../core/services/recipe.service';
import type { Recipe } from '../../../core/models/recipe.model';

import { FeedbackService } from '../../../core/services/feedback.service';
import { LoadingStateComponent } from '../../../shared/components/loading-state';

@Component({
  selector: 'app-recipe-form',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    FoodDoodleComponent,
    IconComponent,
    ReactiveFormsModule,
    RecipeExtraFieldsComponent,
    RecipeGroupsComponent,
    RecipeCollectionsComponent,
    RouterLink,
    LoadingStateComponent,
  ],
  templateUrl: './recipe-form.html',
  styleUrl: './recipe-form.scss',
})
export class RecipeFormComponent implements OnInit {
  private drafts = inject(RecipeDraftService);
  private confirmation = inject(LeaveConfirmationService);
  private leaving = false;

  async canLeave(): Promise<boolean> {
    if (this.accountChanged()) return true;
    if (this.leaving || this.loadError() || this.loading()) return true;
    if (this.saving() || this.processingImage()) return false;
    if (!this.hasUnsavedChanges()) return true;
    const leave = await this.confirmation.confirm(
      this.editingId
        ? 'Your changes to this recipe will not be saved.'
        : 'This recipe has not been saved. Discard it?',
    );
    if (leave && !this.editingId) this.drafts.clear();
    return leave;
  }
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.leaving && !this.loadError() && !this.loading() && this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private initialSnapshot = '';
  private snapshot(): string {
    return JSON.stringify({
      recipe: this.form.getRawValue(),
      metadata: this.metadataForm.getRawValue(),
      categories: this.collectionIds.value,
      sections: this.ingredientSections.getRawValue(),
      steps: this.stepDetails.getRawValue(),
      photo: this.imageDataUrl(),
      remotePhoto: this.importImageUrl,
    });
  }
  hasUnsavedChanges(): boolean {
    if (this.editingId) return !!this.initialSnapshot && this.snapshot() !== this.initialSnapshot;
    const data = this.form.getRawValue();
    const metadata = this.metadataForm.getRawValue();
    return !!(
      data.title.trim() ||
      data.servings !== 4 ||
      data.ingredients.some((value) => value.trim()) ||
      data.instructions.some((value) => value.trim()) ||
      this.imageDataUrl() ||
      this.importImageUrl ||
      this.importSourceUrl ||
      this.collectionIds.value.length ||
      metadata.description.trim() ||
      metadata.totalTime !== null ||
      metadata.tags.length ||
      Object.values(metadata.nutrition).some((value) => value !== null) ||
      this.stepDetails.getRawValue().some((step) => step.imageDataUrl || step.imageUrl)
    );
  }
  private groupEditors = viewChildren(RecipeGroupsComponent);
  private fb = inject(FormBuilder);
  private feedback = inject(FeedbackService);
  private recipeService = inject(RecipeService);
  private readonly accountVersion = this.recipeService.accountVersion();
  private accountChanged(): boolean {
    return this.accountVersion !== this.recipeService.accountVersion();
  }
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // An ID means we're editing an existing recipe.
  editingId = this.route.snapshot.paramMap.get('id');

  loading = signal(true);
  collections = signal<RecipeCollection[]>([]);
  collectionIds = this.fb.nonNullable.control<string[]>([]);
  loadError = signal('');

  saving = signal(false);
  saveError = signal('');

  importSourceUrl = '';

  imageDataUrl = signal('');
  processingImage = signal(false);
  imageError = signal('');

  importImageUrl = '';

  metadataForm = createMetadataForm(this.fb);
  ingredientSections = this.fb.array([this.fb.nonNullable.control('')]);
  stepDetails = this.fb.array([this.createStepDetail()]);

  private createStepDetail(detail: RecipeStepDetail = {}) {
    return this.fb.nonNullable.group({
      section: detail.section ?? '',
      imageUrl: detail.imageUrl ?? '',
      imageDataUrl: detail.imageDataUrl ?? '',
    });
  }
  private loadMetadata(recipe: RecipeMetadata): void {
    const metadata = readRecipeMetadata(recipe);
    const legacyIds = (recipe as Recipe).tagIds ?? [];
    metadata.tags = [
      ...new Set([
        ...(metadata.tags ?? []),
        ...RECIPE_TAGS.filter((tag) => legacyIds.includes(tag.id)).map((tag) => tag.label),
      ]),
    ];
    populateMetadataForm(this.metadataForm, metadata);
    this.ingredientSections.clear();
    this.ingredients.controls.forEach((_, i) =>
      this.ingredientSections.push(
        this.fb.nonNullable.control(metadata.ingredientSections?.[i] ?? ''),
      ),
    );
    this.stepDetails.clear();
    this.instructions.controls.forEach((_, i) =>
      this.stepDetails.push(this.createStepDetail(metadata.stepDetails?.[i])),
    );
  }
  // Our reactive form.
  servingChoices(): number[] {
    const current = this.form.controls.servings.value;
    return [...new Set([2, 4, 6, 8, 10, ...(Number.isSafeInteger(current) && current > 0 ? [current] : [])])].sort((a, b) => a - b);
  }

  form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.pattern(/\S/)]],

    servings: [4, [Validators.required, Validators.min(1)]],

    ingredients: this.fb.array([this.createTextControl()]),

    instructions: this.fb.array([this.createTextControl()]),
  });

  // References to the dynamic arrays.
  get ingredients() {
    return this.form.controls.ingredients;
  }

  get instructions() {
    return this.form.controls.instructions;
  }

  // Create a text control with an optional initial value.
  private createTextControl(value = '') {
    return this.fb.nonNullable.control(value);
  }

  // Add and remove ingredients.
  addIngredient() {
    this.ingredients.push(this.createTextControl());
    this.ingredientSections.push(this.fb.nonNullable.control(''));
  }

  // Add and remove instructions.
  addInstruction() {
    this.instructions.push(this.createTextControl());
    this.stepDetails.push(this.createStepDetail());
  }

  // Runs when the component initializes.
  async ngOnInit(): Promise<void> {
    try {
      this.collections.set(await this.recipeService.getCollections());
    } catch {
      this.loadError.set('Could not load collections. Please reload the page.');
      this.loading.set(false);
      return;
    }
    // Editing an existing recipe.
    if (this.editingId) {
      void this.loadRecipe(this.editingId);
      return;
    }

    const draft = this.drafts.getOrCreate();
    this.form.patchValue({ title: draft.title, servings: draft.servings ?? 4 });
    this.imageDataUrl.set(draft.imageDataUrl ?? '');
    this.importImageUrl = draft.imageUrl ?? '';
    this.importSourceUrl = draft.sourceUrl ?? '';
    this.ingredients.clear();
    for (const ingredient of draft.ingredients)
      this.ingredients.push(this.createTextControl(ingredient));
    this.instructions.clear();
    for (const instruction of draft.instructions)
      this.instructions.push(this.createTextControl(instruction));
    if (!this.ingredients.length) this.ingredients.push(this.createTextControl());
    if (!this.instructions.length) this.instructions.push(this.createTextControl());
    this.loadMetadata(draft);
    this.collectionIds.setValue(draft.collectionIds ?? []);
    this.loading.set(false);
  }

  // Load an existing recipe into the form.
  private async loadRecipe(id: string): Promise<void> {
    try {
      const recipe = await this.recipeService.getRecipe(id);
      if (this.accountChanged()) return;

      if (!recipe) {
        this.loadError.set('Recipe not found.');
        return;
      }

      // Populate normal fields.
      this.form.patchValue({
        title: recipe.title,
        servings: recipe.servings ?? 4,
      });

      this.imageDataUrl.set(recipe.imageDataUrl ?? '');
      this.importSourceUrl = recipe.sourceUrl ?? '';

      // Populate ingredients.
      this.ingredients.clear();

      for (const ingredient of recipe.ingredients) {
        this.ingredients.push(this.createTextControl(ingredient));
      }

      // Populate instructions.
      this.instructions.clear();

      for (const [index, instruction] of recipe.instructions.entries()) {
        this.instructions.push(
          this.createTextControl(instructionText(instruction, recipe.stepDetails?.[index])),
        );
      }

      // Keep at least one field in each array.
      if (this.ingredients.length === 0) {
        this.addIngredient();
      }

      if (this.instructions.length === 0) {
        this.addInstruction();
      }

      this.loadMetadata(recipe);
      this.collectionIds.setValue(
        recipe.collectionIds ??
          this.recipeService.matchCollections(recipe.category, this.collections()),
      );
      this.form.markAsPristine();
      this.initialSnapshot = this.snapshot();
    } catch (error) {
      console.error('Failed to load recipe:', error);

      this.loadError.set('Could not load the recipe. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  // Create or update a recipe.
  async onSubmit(): Promise<void> {
    if (
      this.accountChanged() ||
      this.saving() ||
      this.loading() ||
      this.processingImage() ||
      this.loadError()
    ) {
      return;
    }

    if (this.form.invalid || this.metadataForm.invalid) {
      this.metadataForm.markAllAsTouched();
      this.form.markAllAsTouched();
      const invalidId = this.form.controls.title.invalid
        ? 'title'
        : this.form.controls.servings.invalid
          ? 'servings'
          : null;
      if (invalidId) document.getElementById(invalidId)?.focus();
      else
        document.querySelector<HTMLDetailsElement>('.optional-details')?.setAttribute('open', '');
      return;
    }

    for (const editor of this.groupEditors()) editor.pruneEmpty();
    const data = this.form.getRawValue();

    const recipeData = {
      ...metadataFromForm(this.metadataForm),
      collectionIds: this.collectionIds.value,
      tagIds: RECIPE_TAGS.filter((tag) =>
        this.metadataForm.controls.tags.value.some(
          (label) => label.toLocaleLowerCase() === tag.label.toLocaleLowerCase(),
        ),
      ).map((tag) => tag.id),
      ingredientSections: this.ingredientSections.getRawValue().map((s) => s.trim()),
      stepDetails: this.stepDetails.getRawValue().map((detail) => ({
        section: detail.section.trim() || undefined,
        imageUrl: detail.imageUrl || undefined,
        imageDataUrl: detail.imageDataUrl || undefined,
      })),
      title: data.title.trim(),

      servings: data.servings,

      ingredients: data.ingredients.map((ingredient) => ingredient.trim()),

      instructions: data.instructions.map((instruction) => instruction.trim()),

      imageDataUrl: this.imageDataUrl() || undefined,
    };

    this.saving.set(true);
    this.saveError.set('');

    try {
      if (this.accountChanged()) return;
      if (this.editingId) {
        // EDIT MODE: Update the existing recipe.
        await this.recipeService.updateRecipe(this.editingId, recipeData);
        if (this.accountChanged()) return;

        this.leaving = true;
        this.feedback.show('Recipe updated');
        await this.router.navigate(['/recipes', this.editingId]);
      } else {
        // Review first; only the preview's approval action writes to Dexie.
        this.drafts.set({
          ...recipeData,
          id: this.drafts.getOrCreate().id,
          imageUrl: this.importImageUrl || undefined,
          sourceUrl: this.importSourceUrl || undefined,
        });
        this.leaving = true;
        await this.router.navigate(['/recipes/new']);
      }
    } catch (error) {
      console.error('Failed to save recipe:', error);

      this.saveError.set('Could not save your recipe. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async onImageSelected(event: Event | File): Promise<void> {
    const input = event instanceof File ? null : (event.target as HTMLInputElement);

    const file = event instanceof File ? event : input?.files?.[0];

    if (!file || this.processingImage()) {
      return;
    }

    this.imageError.set('');

    this.processingImage.set(true);
    try {
      this.imageDataUrl.set(await prepareRecipePhoto(file));
      this.importImageUrl = '';
    } catch (error) {
      console.error('Image processing failed:', error);

      this.imageError.set(
        error instanceof Error ? error.message : 'Could not process the selected image.',
      );
    } finally {
      this.processingImage.set(false);

      // Allow the same file to be selected again.
      if (input) {
        input.value = '';
      }
    }
  }

  removeImage(): void {
    if (this.processingImage()) {
      return;
    }

    this.imageDataUrl.set('');
    this.importImageUrl = '';
    this.imageError.set('');
  }
}
