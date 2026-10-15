import { Component, computed, input } from '@angular/core';

/** Live recipe text, with stable word boundaries for native layout-to-layout motion. */
@Component({
  selector: 'app-recipe-title',
  template: `@for (word of words(); track $index; let last = $last) {
    <span [attr.data-title-word]="$index">{{ word }}</span>
    @if (!last) {
      {{ ' ' }}
    }
  }`,
  styles: `
    :host {
      display: contents;
    }
    span {
      display: inline-block;
      max-width: 100%;
      vertical-align: baseline;
      view-transition-class: book-title-word;
    }
  `,
})
export class RecipeTitleComponent {
  readonly title = input.required<string>();
  readonly words = computed(() => this.title().match(/\S+/g) ?? []);
}
