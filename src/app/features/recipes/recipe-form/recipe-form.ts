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
import { downloadStepPhoto } from '../../../core/services/step-photo';
import { FoodPlaceholderComponent } from '../../../shared/components/food-placeholder';
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
  imports: [
    FoodPlaceholderComponent,
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
  private groupEditors = viewChildren(RecipeGroupsComponent);
  private fb = inject(FormBuilder);
  private feedback = inject(FeedbackService);
  private recipeService = inject(RecipeService);
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
  importingImage = signal(false);

  metadataForm = createMetadataForm(this.fb);
  ingredientSections = this.fb.array([this.fb.nonNullable.control('')]);
  stepDetails = this.fb.array([this.createStepDetail()]);
  importingStepImages = signal(false);
  stepImageMessage = signal('');

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
  removeStepPhoto(index: number): void {
    this.stepDetails.at(index).patchValue({ imageUrl: '', imageDataUrl: '' });
  }
  private async saveStepPhotos(): Promise<void> {
    const pending = this.stepDetails.controls.filter(
      (control) => control.value.imageUrl && !control.value.imageDataUrl,
    );
    if (!pending.length) return;
    this.importingStepImages.set(true);
    let failed = 0;
    // Two downloads at a time avoids saturating a mobile connection.
    for (let i = 0; i < pending.length; i += 2) {
      await Promise.all(
        pending.slice(i, i + 2).map(async (control) => {
          try {
            control.patchValue({
              imageDataUrl: await downloadStepPhoto(control.getRawValue().imageUrl),
            });
          } catch {
            failed++;
          }
        }),
      );
    }
    this.stepImageMessage.set(
      failed
        ? failed + ' step photo(s) could not be saved offline. Their original links are kept.'
        : '',
    );
    this.importingStepImages.set(false);
  }

  // Our reactive form.
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

  removeIngredient(index: number) {
    if (this.ingredients.length > 1) {
      this.ingredients.removeAt(index);
      this.ingredientSections.removeAt(index);
    }
  }

  // Add and remove instructions.
  addInstruction() {
    this.instructions.push(this.createTextControl());
    this.stepDetails.push(this.createStepDetail());
  }

  removeInstruction(index: number) {
    if (this.instructions.length > 1) {
      this.instructions.removeAt(index);
      this.stepDetails.removeAt(index);
    }
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

    // Creating a recipe from an imported URL.
    const isImport = this.route.snapshot.queryParamMap.get('import') === '1';

    if (isImport) {
      this.loadImportDraft();
    }
    this.loading.set(false);
  }

  // Load an existing recipe into the form.
  private async loadRecipe(id: string): Promise<void> {
    try {
      const recipe = await this.recipeService.getRecipe(id);

      if (!recipe) {
        this.loadError.set('Recipe not found.');
        return;
      }

      // Populate normal fields.
      this.form.patchValue({
        title: recipe.title,
        servings: recipe.servings,
      });

      this.imageDataUrl.set(recipe.imageDataUrl ?? '');

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
    } catch (error) {
      console.error('Failed to load recipe:', error);

      this.loadError.set('Could not load the recipe. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private loadImportDraft(): void {
    const stored = sessionStorage.getItem('recipiebook:import-draft');

    if (!stored) {
      this.loadError.set('No imported recipe was found. Please import the URL again.');

      return;
    }

    try {
      const draft: unknown = JSON.parse(stored);

      if (!draft || typeof draft !== 'object') {
        throw new Error('Invalid recipe draft.');
      }

      const recipe = draft as Partial<Recipe> & {
        imageUrl?: unknown;
      };

      // Validate the data before populating the form.
      if (
        typeof recipe.title !== 'string' ||
        !recipe.title.trim() ||
        !Array.isArray(recipe.ingredients) ||
        recipe.ingredients.length === 0 ||
        !recipe.ingredients.every((value) => typeof value === 'string' && !!value.trim()) ||
        !Array.isArray(recipe.instructions) ||
        recipe.instructions.length === 0 ||
        !recipe.instructions.every((value) => typeof value === 'string' && !!value.trim()) ||
        typeof recipe.sourceUrl !== 'string' ||
        !recipe.sourceUrl.startsWith('https://')
      ) {
        throw new Error('Incomplete recipe data.');
      }

      // Populate the basic form fields.
      this.form.patchValue({
        title: recipe.title,

        servings:
          typeof recipe.servings === 'number' &&
          Number.isSafeInteger(recipe.servings) &&
          recipe.servings > 0
            ? recipe.servings
            : 4,
      });

      // Replace the initial ingredient controls.
      this.ingredients.clear();

      for (const ingredient of recipe.ingredients) {
        this.ingredients.push(this.createTextControl(ingredient));
      }

      // Replace the initial instruction controls.
      this.instructions.clear();

      for (const instruction of recipe.instructions) {
        this.instructions.push(this.createTextControl(instruction));
      }

      // Remember the original website.
      this.importSourceUrl = recipe.sourceUrl;
      if (typeof recipe.imageUrl === 'string') {
        try {
          const imageUrl = new URL(recipe.imageUrl);

          if (imageUrl.protocol === 'https:' && !imageUrl.username && !imageUrl.password) {
            this.importImageUrl = imageUrl.toString();

            // Attempt to save an independent copy automatically.
            void this.downloadImportedImage(this.importImageUrl);
          }
        } catch {
          // An invalid image URL shouldn't prevent the recipe from importing.
        }
      }

      this.loadMetadata(recipe);
      this.collectionIds.setValue(
        this.recipeService.matchCollections(recipe.category, this.collections()),
      );
      void this.saveStepPhotos();
      this.form.markAsPristine();
    } catch (error) {
      console.error('Could not load import:', error);

      this.loadError.set('The imported recipe is invalid. Please try importing it again.');
    }
  }

  // Create or update a recipe.
  async onSubmit(): Promise<void> {
    if (
      this.saving() ||
      this.loading() ||
      this.importingImage() ||
      this.importingStepImages() ||
      this.processingImage() ||
      this.loadError()
    ) {
      return;
    }

    if (this.form.invalid || this.metadataForm.invalid) {
      this.metadataForm.markAllAsTouched();
      this.form.markAllAsTouched();
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
      if (this.editingId) {
        // EDIT MODE: Update the existing recipe.
        await this.recipeService.updateRecipe(this.editingId, recipeData);

        this.feedback.show('Recipe updated');
        await this.router.navigate(['/recipes', this.editingId]);
      } else {
        // CREATE MODE: Add a new recipe.
        const newRecipe = await this.recipeService.addRecipe({
          ...recipeData,

          ...(this.importSourceUrl ? { sourceUrl: this.importSourceUrl } : {}),
        });

        // Clear the temporary import only after saving succeeds.
        if (this.importSourceUrl) {
          sessionStorage.removeItem('recipiebook:import-draft');
        }

        this.feedback.show('Recipe saved');
        await this.router.navigate(['/recipes', newRecipe.id]);
      }
    } catch (error) {
      console.error('Failed to save recipe:', error);

      this.saveError.set('Could not save your recipe. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  private async downloadImportedImage(imageUrl: string): Promise<void> {
    if (this.importingImage()) {
      return;
    }

    this.importingImage.set(true);
    this.imageError.set('');

    const maxImageBytes = 20 * 1024 * 1024;

    try {
      const response = await fetch(imageUrl, {
        mode: 'cors',
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Image returned HTTP ${response.status}.`);
      }

      const declaredSize = Number(response.headers.get('content-length') ?? 0);

      if (declaredSize > maxImageBytes) {
        throw new Error('The imported image is too large.');
      }

      const blob = await response.blob();

      if (blob.size > maxImageBytes) {
        throw new Error('The imported image is too large.');
      }

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
        this.imageError.set(
          'The imported photo has an unsupported file type. Add a JPEG, PNG or WebP photo.',
        );
        return;
      }

      const file = new File([blob], 'imported-recipe-image', { type: blob.type });

      // Reuse the existing resizing and compression logic.
      await this.onImageSelected(file);
    } catch (error) {
      console.warn('Could not download imported image:', error);

      this.imageError.set(
        'The recipe was imported, but its photo could not be saved ' +
          'automatically. You can upload the photo manually.',
      );
    } finally {
      this.importingImage.set(false);
    }
  }

  async onImageSelected(event: Event | File): Promise<void> {
    const input = event instanceof File ? null : (event.target as HTMLInputElement);

    const file = event instanceof File ? event : input?.files?.[0];

    if (!file || this.processingImage()) {
      return;
    }

    this.imageError.set('');

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      this.imageError.set('Please select a JPEG, PNG or WebP image.');
      if (input) {
        input.value = '';
      }
      return;
    }

    // Limit the original upload to 20 MB.
    if (file.size > 20 * 1024 * 1024) {
      this.imageError.set('The image is too large.');
      if (input) {
        input.value = '';
      }
      return;
    }

    this.processingImage.set(true);

    try {
      // Decode the selected image.
      const bitmap = await createImageBitmap(file);

      try {
        // Resize large images to a maximum of 1200 pixels.
        const maxSize = 1200;

        const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));

        const width = Math.max(1, Math.round(bitmap.width * scale));

        const height = Math.max(1, Math.round(bitmap.height * scale));

        // Create a canvas.
        const canvas = document.createElement('canvas');

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Could not process the image.');
        }

        // Use a white background for transparent PNG images.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);

        // Draw the resized image.
        context.drawImage(bitmap, 0, 0, width, height);

        // Convert the image to a compressed JPEG.
        const result = canvas.toDataURL('image/jpeg', 0.75);

        if (!result.startsWith('data:image/jpeg;base64,') || result.length > 1_500_000) {
          throw new Error('The processed image is too large. Choose a smaller photo.');
        }

        // Store the image in our component.
        this.imageDataUrl.set(result);
        if (input) {
          this.importImageUrl = '';
        }
      } finally {
        bitmap.close();
      }
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
    if (this.processingImage() || this.importingImage()) {
      return;
    }

    this.imageDataUrl.set('');
    this.importImageUrl = '';
    this.imageError.set('');
  }
}
