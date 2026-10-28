import { Component, effect, input, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  nutritionFields,
  readRecipeMetadata,
  combinedDescription,
  perPortionNutrition,
  type RecipeMetadata,
} from '../../../core/models/recipe-metadata';
import { AutoGrowTextareaDirective } from '../../../shared/directives/auto-grow-textarea';
import { IconComponent } from '../../../shared/components/icon';

export function createMetadataForm(fb: FormBuilder) {
  const nutrition = Object.fromEntries(
    nutritionFields.map(({ key }) => [key, fb.control<number | null>(null, Validators.min(0))]),
  ) as Record<(typeof nutritionFields)[number]['key'], FormControl<number | null>>;
  return fb.group({
    description: fb.nonNullable.control(''),
    totalTime: fb.control<number | null>(null, Validators.min(0)),
    nutrition: fb.group(nutrition),
  });
}
export type MetadataForm = ReturnType<typeof createMetadataForm>;
export function populateMetadataForm(form: MetadataForm, value: RecipeMetadata) {
  const nutrition = perPortionNutrition(value.nutrition);
  form.patchValue({
    description: combinedDescription(value) ?? '',
    totalTime: value.totalTime ?? null,
    nutrition: Object.fromEntries(
      nutritionFields.map(({ key }) => [
        key,
        nutrition?.[key] ? parseFloat(nutrition[key]!) : null,
      ]),
    ),
  });
}
export function metadataFromForm(form: MetadataForm): RecipeMetadata {
  const v = form.getRawValue();
  const nutrition = Object.fromEntries(
    nutritionFields
      .filter(({ key }) => v.nutrition[key] !== null)
      .map(({ key, unit }) => [key, v.nutrition[key] + ' ' + unit]),
  );
  return {
    totalTime: undefined,
    nutrition: undefined,
    ...readRecipeMetadata({ ...v, nutrition: { ...nutrition, servingSize: 'Per portion' } }),
  };
}
@Component({
  selector: 'app-recipe-extra-fields',
  imports: [ReactiveFormsModule, AutoGrowTextareaDirective],
  template: `
    <div class="details-content" [formGroup]="form()">
      <label
        >Description<textarea appAutoGrow formControlName="description" rows="2"></textarea>
      </label>
      <div class="field-grid">
        <label
          >Total time (minutes)<input type="number" min="0" step="any" formControlName="totalTime"
        /></label>
      </div>
      @if (form().controls.totalTime.invalid) {
        <p class="error" role="alert">Total time must be zero or more.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .details-content {
      display: grid;
      gap: 24px;
    }
    label {
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    @media (max-width: 380px) {
      .field-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class RecipeExtraFieldsComponent {
  form = input.required<MetadataForm>();
  nutritionFields = nutritionFields;
}

/** Nutrition per portion, a row of its own beside Categories and Recipe details. */
@Component({
  selector: 'app-recipe-nutrition-fields',
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    <details [open]="form().controls.nutrition.invalid" [formGroup]="form()">
      <summary class="disclosure">
        Nutrition
        <span
          >{{ calories() === null ? 'Optional' : calories() + ' kcal' }}<app-icon name="chevron"
        /></span>
      </summary>
      <div class="field-grid" formGroupName="nutrition">
        @for (field of nutritionFields; track field.key) {
          <label
            >{{ field.label }} ({{ field.unit }})<input
              type="number"
              min="0"
              step="any"
              [formControlName]="field.key"
          /></label>
        }
      </div>
      @if (form().controls.nutrition.invalid) {
        <p class="error" role="alert">Nutrition values must be zero or more.</p>
      }
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    details {
      border-top: 1px solid var(--color-border);
    }
    summary > span {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--color-muted);
      font-size: 0.85rem;
      font-weight: 400;
    }
    summary app-icon {
      transform: rotate(-90deg);
    }
    details[open] summary app-icon {
      transform: rotate(90deg);
    }
    label {
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-block: 8px 20px;
    }
    @media (max-width: 380px) {
      .field-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class RecipeNutritionFieldsComponent {
  form = input.required<MetadataForm>();
  nutritionFields = nutritionFields;
  /** Energy shown on the closed row, kept in step with the field. */
  readonly calories = signal<number | null>(null);

  constructor() {
    effect((onCleanup) => {
      const control = this.form().controls.nutrition.controls.calories;
      this.calories.set(control.value);
      const changes = control.valueChanges.subscribe((value) => this.calories.set(value));
      onCleanup(() => changes.unsubscribe());
    });
  }
}
