import { Component, computed, input, signal } from '@angular/core';
import type { FormControl } from '@angular/forms';
import { RECIPE_TAGS } from '../../../core/models/recipe-tag.model';
import { CheckboxMarkComponent } from '../../../shared/components/checkbox-mark';
import { IconComponent } from '../../../shared/components/icon';

@Component({
  selector: 'app-recipe-tag-picker',
  imports: [IconComponent, CheckboxMarkComponent],
  template: `
    <span class="field-label">Tags</span>
    <div class="selected-tags" aria-label="Applied tags">
      @for (tag of control().value; track tag) {
        <button type="button" (click)="remove(tag)" [attr.aria-label]="'Remove tag ' + tag">
          {{ tag }}<app-icon name="close" />
        </button>
      }
    </div>
    <details #picker (keydown.escape)="picker.open = false">
      <summary class="disclosure">Choose tags<app-icon name="chevron" /></summary>
      <div class="tag-menu">
        <div class="search-field" role="search">
          <app-icon name="search" /><input
            type="search"
            aria-label="Search saved tags"
            placeholder="Search tags"
            [value]="query()"
            (input)="search($event)"
          />
          @if (query()) {
            <button type="button" aria-label="Clear tag search" (click)="query.set('')">
              <app-icon name="close" />
            </button>
          }
        </div>
        <div class="tag-options">
          @for (tag of matches(); track tag.id) {
            <label class="check-control"
              ><input
                type="checkbox"
                [checked]="isSelected(tag.label)"
                (change)="toggle(tag.label)"
              /><app-checkbox-mark />{{ tag.label }}</label
            >
          } @empty {
            <p>No matching tags.</p>
          }
        </div>
      </div>
    </details>
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .field-label {
      font-weight: 600;
    }
    .selected-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .selected-tags:empty {
      display: none;
    }
    .selected-tags button {
      border-radius: 999px;
      background: var(--color-blue);
      border-color: transparent;
      padding: 6px 10px;
      gap: 8px;
      font-size: 0.85rem;
    }
    .selected-tags app-icon {
      width: 16px;
      height: 16px;
    }
    details {
      border: 1px solid var(--color-control-border);
      border-radius: var(--radius-control);
      background: var(--color-surface);
    }
    summary {
      padding: 10px 14px;
    }
    .tag-menu {
      padding: 0 12px 12px;
    }
    .tag-options {
      max-height: 220px;
      overflow-y: auto;
      padding-top: 8px;
    }
    .tag-options label {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      font-weight: 400;
      cursor: pointer;
    }
  `,
})
export class RecipeTagPickerComponent {
  control = input.required<FormControl<string[]>>();
  query = signal('');
  search(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
  }
  matches = computed(() =>
    RECIPE_TAGS.filter((tag) =>
      tag.label.toLocaleLowerCase().includes(this.query().trim().toLocaleLowerCase()),
    ),
  );
  isSelected(label: string) {
    return this.control().value.some(
      (tag) => tag.toLocaleLowerCase() === label.toLocaleLowerCase(),
    );
  }
  remove(label: string) {
    this.control().setValue(
      this.control().value.filter((tag) => tag.toLocaleLowerCase() !== label.toLocaleLowerCase()),
    );
    this.control().markAsDirty();
  }
  toggle(label: string) {
    if (this.isSelected(label)) this.remove(label);
    else {
      this.control().setValue([...this.control().value, label]);
      this.control().markAsDirty();
    }
  }
}
