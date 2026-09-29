import { instructionText } from '../../../core/models/recipe-metadata';
import { RecipeSummaryDetailsComponent, RecipeExtraDetailsComponent } from './recipe-metadata-view';
import { IconComponent } from '../../../shared/components/icon';
import { CheckboxMarkComponent } from '../../../shared/components/checkbox-mark';
import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Recipe } from '../../../core/models/recipe.model';
import { RecipeService } from '../../../core/services/recipe.service';

import { FeedbackService } from '../../../core/services/feedback.service';
import { FoodDoodleComponent } from '../../../shared/components/food-doodle';
import { LoadingStateComponent } from '../../../shared/components/loading-state';

@Component({
  selector: 'app-recipe-detail',
  imports: [
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
export class RecipeDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private recipeService = inject(RecipeService);
  private router = inject(Router);
  private feedback = inject(FeedbackService);
  deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');
  confirmOpen = signal(false);
  openDeleteDialog(): void {
    this.deleteError.set('');
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
  activeSection = signal<'ingredients' | 'instructions'>('ingredients');
  // Cooking progress belongs to this view, not the saved recipe.
  completedSteps = signal<Set<number>>(new Set());
  toggleStep(index: number): void {
    this.completedSteps.update((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  failedStepPhotos = signal<Set<number>>(new Set());
  hideStepPhoto(index: number): void {
    this.failedStepPhotos.update((current) => new Set([...current, index]));
  }
  recipe = signal<Recipe | undefined>(undefined);
  ingredientGroups = computed(() => {
    const recipe = this.recipe();
    const groups: { section: string; ingredients: string[] }[] = [];
    recipe?.ingredients.forEach((ingredient, index) => {
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
  deleteError = signal('');

  ngOnInit(): void {
    void this.loadRecipe();
  }

  private async loadRecipe(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');

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
      this.recipe.set(result);
      const collections = await this.recipeService.getCollections();
      this.collectionNames.set(
        collections.filter((c) => result?.collectionIds?.includes(c.id)).map((c) => c.name),
      );
    } catch (error) {
      console.error('Failed to load recipe:', error);
      this.error.set('Could not load this recipe.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteRecipe(): Promise<void> {
    const currentRecipe = this.recipe();
    if (!currentRecipe || this.deleting()) {
      return;
    }

    // The native dialog supplies focus trapping and explicit confirmation.
    if (!this.deleteDialog()?.nativeElement.open) return;
    this.deleting.set(true);
    this.deleteError.set('');

    try {
      await this.recipeService.deleteRecipe(currentRecipe.id);
      // Return to the recipe list.
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
