import { IconComponent } from '../../../shared/components/icon';
import { Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Recipe } from '../../../core/models/recipe.model';
import { RecipeService } from '../../../core/services/recipe.service';

import { FeedbackService } from '../../../core/services/feedback.service';
import { FoodDoodleComponent } from '../../../shared/components/food-doodle';
import { LoadingStateComponent } from '../../../shared/components/loading-state';

@Component({
  selector: 'app-recipe-detail',
  imports: [IconComponent, RouterLink, FoodDoodleComponent, LoadingStateComponent],
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

  recipe = signal<Recipe | undefined>(undefined);
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
      this.recipe.set(result);
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
