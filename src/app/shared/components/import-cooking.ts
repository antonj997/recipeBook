import { Component, input } from '@angular/core';

@Component({
  selector: 'app-import-cooking',
  host: { '[style.--cooking-background]': 'background' },
  template: `<div class="cooking-card" role="status" [class.ready]="ready()">
    <svg
      viewBox="0 0 240 170"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <g class="steam" stroke-width="2.5">
        <path d="M94 80c-13-14 9-18 0-30" />
        <path d="M117 76c-12-14 10-18 0-33" />
      </g>
      <g class="spoon">
        <path d="m143 40-27 63" />
        <path fill="var(--color-beige)" d="M110 91c-13-4-23 19-13 25s27-19 13-25Z" />
      </g>
      <g class="pot">
        <path d="M68 105c-25-12-25 20 1 15m74-15c24-12 24 20-1 15" />
        <path fill="var(--color-surface)" d="m65 97 5 36q35 21 70 0l5-36" />
        <path d="M65 97q40-15 80 0-40 16-80 0Z" fill="var(--color-butter)" />
        <path d="M83 123q22 8 44 0" stroke-width="2" />
      </g>
      <g class="recipe-sheet">
        <path fill="var(--color-surface)" d="m174 80 41 3-3 57-43-3Z" />
        <path d="m180 95 23 2m-24 9 18 1m-18 10 11 1" stroke-width="2" />
        <path class="recipe-check" d="m178 123 7 7 16-15" stroke="var(--color-green)" />
      </g>
    </svg>
    <span>{{ ready() ? 'Ready to review' : 'Importing recipe…' }}</span>
  </div>`,
  styleUrl: './import-cooking.scss',
})
export class ImportCookingComponent {
  ready = input(false);
  readonly background =
    'var(--color-' +
    ['blue', 'clay', 'sage', 'accent', 'beige', 'butter'][Math.floor(Math.random() * 6)] +
    ')';
}
