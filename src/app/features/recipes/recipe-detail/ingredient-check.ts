import { Component, input, output } from '@angular/core';

/** An ingredient that can be marked as set out while cooking, without crossing out its text. */
@Component({
  selector: 'app-ingredient-check',
  host: { '[class.gathered]': 'checked()', '[class.just-gathered]': 'justChecked()' },
  template: `
    <label class="ingredient-check">
      <input type="checkbox" [checked]="checked()" (change)="toggled.emit()" />
      <span class="pinch-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M7 12.5l3.2 3.2L17 8.6" pathLength="1" /></svg>
        <i></i><i></i><i></i>
      </span>
      <span class="ingredient-text">{{ text() }}</span>
    </label>
  `,
  styleUrl: './ingredient-check.scss',
})
export class IngredientCheckComponent {
  readonly text = input.required<string>();
  readonly checked = input(false);
  /** Scatter the crumbs only for a mark set just now, not for one restored from the session. */
  readonly justChecked = input(false);
  readonly toggled = output();
}
