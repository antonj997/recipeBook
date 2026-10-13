import { Component, computed, model } from '@angular/core';
import {
  recipeColors,
  recipeColorBackground,
  type RecipeColor,
} from '../../core/models/recipe-color';
import { IconComponent } from './icon';

@Component({
  selector: 'app-recipe-color-picker',
  imports: [IconComponent],
  template: `<fieldset>
    <legend>Recipe color</legend>
    <div class="colors">
      <button
        type="button"
        class="automatic"
        [attr.aria-pressed]="!color()"
        (click)="color.set(undefined)"
      >
        Automatic
      </button>
      @for (option of colors; track option.id) {
        <button
          type="button"
          class="color-choice"
          [attr.aria-label]="'Recipe color: ' + option.label"
          [title]="option.label"
          [attr.aria-pressed]="selectedColor() === option.id"
          (click)="color.set(option.id)"
        >
          <span [style.background]="background(option.id)">
            @if (selectedColor() === option.id) {
              <app-icon name="check" />
            }
          </span>
        </button>
      }
    </div>
  </fieldset>`,
  styles: `
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    legend {
      padding: 0;
      margin-bottom: 8px;
      font-weight: 500;
    }
    .colors {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .color-choice {
      width: 44px;
      height: 44px;
      padding: 5px;
      border: 0;
      background: transparent;
    }
    .color-choice span {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid var(--color-muted);
    }
    .color-choice[aria-pressed='true'] span {
      outline: 1px solid var(--color-ink);
      outline-offset: 2px;
    }
    .color-choice app-icon {
      width: 18px;
      height: 18px;
    }
    .automatic {
      border: 0;
      padding-inline: 8px;
      background: transparent;
      font-size: 0.85rem;
      color: var(--color-muted);
    }
    .automatic[aria-pressed='true'] {
      color: var(--color-ink);
      text-decoration: underline;
      text-underline-offset: 4px;
    }
  `,
})
export class RecipeColorPickerComponent {
  color = model<RecipeColor | undefined>();
  colors = recipeColors;
  readonly background = recipeColorBackground;
  readonly selectedColor = computed(() => (this.color() === 'sky' ? 'blue' : this.color()));
}
