import { IconComponent } from '../../../shared/components/icon';
import { Component, computed, input } from '@angular/core';
import type { Recipe } from '../../../core/models/recipe.model';
import {
  formatRecipeTime,
  nutritionFields,
  combinedDescription,
  metadataTags,
  perPortionNutrition,
} from '../../../core/models/recipe-metadata';

@Component({
  selector: 'app-recipe-summary-details',
  template: `
    @if (description()) {
      <p class="recipe-description">{{ description() }}</p>
    }
    @if (recipe().totalTime != null) {
      <dl class="recipe-facts">
        @if (recipe().totalTime) {
          <div>
            <dt>Total time</dt>
            <dd>{{ formatTime(recipe().totalTime!) }}</dd>
          </div>
        }
      </dl>
    }
    @if (visibleTags().length) {
      <div class="recipe-tags">
        @for (tag of visibleTags(); track tag) {
          <span>{{ tag }}</span>
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
    .recipe-facts {
      display: flex;
      flex-wrap: wrap;
      gap: 16px 28px;
      margin-block: 24px 0;
    }
    .recipe-facts:empty {
      display: none;
    }
    .recipe-facts dt,
    .recipe-tags {
      color: var(--color-muted);
      font-size: 0.9rem;
    }
    .recipe-facts dd {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
    .recipe-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 16px;
    }
    .recipe-tags span {
      padding: 4px 12px;
      border-radius: 999px;
      background: var(--color-blue);
      color: var(--color-ink);
    }
  `,
})
export class RecipeSummaryDetailsComponent {
  recipe = input.required<Recipe>();
  description = computed(() => combinedDescription(this.recipe()));
  formatTime = formatRecipeTime;
  visibleTags = computed(() => metadataTags(this.recipe()));
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
