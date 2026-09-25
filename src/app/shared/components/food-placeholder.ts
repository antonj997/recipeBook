import { Component, computed, input } from '@angular/core';
import { FoodDoodleComponent } from './food-doodle';

const kinds = [
  'bowl',
  'plate',
  'pasta',
  'toast',
  'stew',
  'roast',
  'platter',
  'shallow-bowl',
  'casserole',
  'soup',
  'sandwich',
] as const;
const colors = ['beige', 'blue', 'green', 'accent', 'clay', 'butter', 'sage'] as const;

// Stable pseudo-random choices: sorting, searching and reopening keep the same art.
function hash(seed: string): number {
  let value = 2166136261;
  for (const character of seed) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  }
  return value >>> 0;
}

@Component({
  selector: 'app-food-placeholder',
  imports: [FoodDoodleComponent],
  host: { 'aria-hidden': 'true', '[style.background-color]': 'background()' },
  template: '<app-food-doodle [kind]="kind()" />',
  styles: [
    ':host { display: grid; place-items: center; width: 100%; height: 100%; } app-food-doodle { width: 45%; max-width: 160px; }',
  ],
})
export class FoodPlaceholderComponent {
  seed = input.required<string>();
  kind = computed(() => kinds[hash('food:' + this.seed()) % kinds.length]);
  background = computed(
    () => 'var(--color-' + colors[hash('color:' + this.seed()) % colors.length] + ')',
  );
}
