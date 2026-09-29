import { Component, input } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  nutritionFields,
  readRecipeMetadata,
  combinedDescription,
  perPortionNutrition,
  type RecipeMetadata,
} from '../../../core/models/recipe-metadata';
import { RecipeTagPickerComponent } from './recipe-tag-picker';
import { IconComponent } from '../../../shared/components/icon';

export function createMetadataForm(fb: FormBuilder) {
  const nutrition = Object.fromEntries(
    nutritionFields.map(({ key }) => [key, fb.control<number | null>(null, Validators.min(0))]),
  ) as Record<(typeof nutritionFields)[number]['key'], FormControl<number | null>>;
  return fb.group({
    description: fb.nonNullable.control(''),
    totalTime: fb.control<number | null>(null, Validators.min(0)),
    tags: fb.nonNullable.control<string[]>([]),
    nutrition: fb.group(nutrition),
  });
}
export type MetadataForm = ReturnType<typeof createMetadataForm>;
export function populateMetadataForm(form: MetadataForm, value: RecipeMetadata) {
  const nutrition = perPortionNutrition(value.nutrition);
  form.patchValue({
    description: combinedDescription(value) ?? '',
    totalTime: value.totalTime ?? null,
    tags: value.tags ?? [],
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
  imports: [ReactiveFormsModule, RecipeTagPickerComponent, IconComponent],
  template: `
    <div class="details-content" [formGroup]="form()">
      <label>Description<textarea formControlName="description" rows="4"></textarea></label>
      <div class="field-grid">
        <label
          >Total time (minutes)<input type="number" min="0" step="any" formControlName="totalTime"
        /></label>
      </div>
      <app-recipe-tag-picker [control]="form().controls.tags" />

      <details [open]="form().controls.nutrition.invalid">
        <summary class="disclosure">Nutrition per portion<app-icon name="chevron" /></summary>
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
      </details>
      @if (form().invalid) {
        <p class="error" role="alert">Time and nutrition values must be zero or more.</p>
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
    details {
      border-top: 1px solid var(--color-border);
    }
    details > label,
    details > .field-grid {
      margin-block: 8px 20px;
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
