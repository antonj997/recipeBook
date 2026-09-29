import { Component, input } from '@angular/core';

// Decorative drawing; the adjacent native checkbox owns interaction and accessibility.
@Component({
  selector: 'app-checkbox-mark',
  host: { 'aria-hidden': 'true' },
  template: `<svg viewBox="0 0 24 24" fill="none">
    <path
      class="checkbox-frame"
      d="M18 3.5H6a2.5 2.5 0 0 0-2.5 2.5v12A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5V6A2.5 2.5 0 0 0 18 3.5Z"
    />
    @if (number(); as stepNumber) {
      <text class="checkbox-number" x="12" y="12" text-anchor="middle" dominant-baseline="central">
        {{ stepNumber }}
      </text>
    }
    <path class="checkbox-tick" pathLength="1" d="m7 12 3.4 3.8L17.3 8.5" />
  </svg>`,
})
export class CheckboxMarkComponent {
  number = input<number>();
}
