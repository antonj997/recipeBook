import { Component, inject, input, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import type { RecipeCollection } from '../../../core/models/recipe-collection.model';
import { RecipeService } from '../../../core/services/recipe.service';
import { CheckboxMarkComponent } from '../../../shared/components/checkbox-mark';
import { IconComponent } from '../../../shared/components/icon';

@Component({
  selector: 'app-recipe-collections',
  imports: [IconComponent, CheckboxMarkComponent],
  template: `
    <details>
      <summary class="disclosure">
        Collections
        <span
          >{{ selectedCount() ? selectedCount() + ' selected' : 'None' }}<app-icon name="chevron"
        /></span>
      </summary>
      <div class="choices">
        @for (collection of choices(); track collection.id) {
          <label class="check-control"
            ><input
              type="checkbox"
              [checked]="control().value.includes(collection.id)"
              (change)="toggle(collection.id)"
            /><app-checkbox-mark />{{ collection.name }}</label
          >
        }
      </div>
      <div class="create">
        <label
          >New collection<input
            #name
            placeholder="Collection name"
            [disabled]="creating()"
            (keydown.enter)="$event.preventDefault(); create(name)" /></label
        ><button type="button" [disabled]="creating()" (click)="create(name)">
          <app-icon name="plus" />Create
        </button>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
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
    }
    summary app-icon {
      transform: rotate(-90deg);
    }
    details[open] summary app-icon {
      transform: rotate(90deg);
    }
    .choices {
      display: grid;
      gap: 4px;
      margin-bottom: 16px;
    }
    .choices label {
      display: flex;
      gap: 10px;
      align-items: center;
      min-height: 44px;
      font-weight: 400;
    }

    .create {
      display: flex;
      gap: 12px;
      align-items: flex-end;
      margin-bottom: 20px;
    }
    .create label {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 8px;
      font-size: 0.85rem;
    }
    .create input {
      width: 100%;
    }
    .create button {
      flex-shrink: 0;
    }
  `,
})
export class RecipeCollectionsComponent {
  control = input.required<FormControl<string[]>>();
  collections = input.required<RecipeCollection[]>();
  private service = inject(RecipeService);
  added = signal<RecipeCollection[]>([]);
  creating = signal(false);
  error = signal('');
  choices() {
    return [...this.collections(), ...this.added()].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  selectedCount() {
    return this.choices().filter((c) => this.control().value.includes(c.id)).length;
  }
  toggle(id: string) {
    this.control().setValue(
      this.control().value.includes(id)
        ? this.control().value.filter((v) => v !== id)
        : [...this.control().value, id],
    );
    this.control().markAsDirty();
  }
  async create(input: HTMLInputElement) {
    if (this.creating()) return;
    const name = input.value.trim();
    if (!name) {
      this.error.set('Enter a collection name.');
      return;
    }
    this.creating.set(true);
    this.error.set('');
    try {
      const collection = await this.service.createCollection(name);
      if (!this.choices().some((c) => c.id === collection.id))
        this.added.update((v) => [...v, collection]);
      if (!this.control().value.includes(collection.id)) this.toggle(collection.id);
      input.value = '';
    } catch {
      this.error.set('Could not create the collection. Please try again.');
    } finally {
      this.creating.set(false);
    }
  }
}
