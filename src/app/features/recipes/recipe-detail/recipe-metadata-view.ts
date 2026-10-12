import { IconComponent } from '../../../shared/components/icon';
import { Component, computed, input } from '@angular/core';
import type { Recipe } from '../../../core/models/recipe.model';
import {
  formatRecipeTime,
  nutritionFields,
  combinedDescription,
  perPortionNutrition,
} from '../../../core/models/recipe-metadata';

@Component({
  selector: 'app-recipe-summary-details',
  imports: [IconComponent],
  template: `
    @if (description()) {
      <p class="recipe-description">{{ description() }}</p>
    }
    @if (categories().length || recipe().totalTime != null) {
      <div class="recipe-metadata">
        @for (category of categories(); track category) {
          <span class="recipe-category" [title]="category">{{ category }}</span>
        }
        @if (recipe().totalTime != null) {
          <p class="recipe-time" aria-label="Total time">
            <app-icon name="clock" />{{ formatTime(recipe().totalTime!) }}
          </p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .recipe-description {
      max-width: 65ch;
      white-space: pre-line;
      margin-block: 16px;
    }
    .recipe-metadata {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 12px;
      margin-top: 16px;
    }
    .recipe-time {
      margin: 0;
    }
  `,
})
export class RecipeSummaryDetailsComponent {
  recipe = input.required<Recipe>();
  categories = input<string[]>([]);
  description = computed(() => combinedDescription(this.recipe()));
  formatTime = formatRecipeTime;
}

@Component({
  selector: 'app-recipe-extra-details',
  imports: [IconComponent],
  template: `
    <div class="additional-details">
      @if (nutrition(); as nutrition) {
        <details>
          <summary class="disclosure">Nutrition per portion<app-icon name="chevron" /></summary>
          <dl class="nutrition-list">
            @for (field of nutritionFields; track field.key) {
              @if (nutrition[field.key]) {
                <div>
                  <dt>{{ field.label }}</dt>
                  <dd>{{ nutrition[field.key] }}</dd>
                </div>
              }
            }
          </dl>
        </details>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .additional-details {
      margin-top: 32px;
      max-width: 70ch;
    }
    .additional-details:empty {
      display: none;
    }
    .additional-details details {
      border-top: 1px solid var(--color-border);
    }
    .additional-details summary {
      cursor: pointer;
      padding-block: 16px;
      min-height: 44px;
      font-weight: 600;
    }
    .additional-details p {
      white-space: pre-line;
      margin-bottom: 20px;
    }
    .nutrition-list {
      margin: 0 0 24px;
    }
    .nutrition-list div {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding-block: 8px;
      border-bottom: 1px solid var(--color-border);
    }
    .nutrition-list dd {
      margin: 0;
      text-align: right;
    }
  `,
})
export class RecipeExtraDetailsComponent {
  recipe = input.required<Recipe>();
  nutritionFields = nutritionFields;
  nutrition = computed(() => perPortionNutrition(this.recipe().nutrition));
}
