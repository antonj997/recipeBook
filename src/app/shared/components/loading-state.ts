import { Component, input } from '@angular/core';
import { FoodDoodleComponent } from './food-doodle';
@Component({
  selector: 'app-loading-state',
  imports: [FoodDoodleComponent],
  template: `<div role="status">
    <app-food-doodle [animate]="true" /><span>{{ label() }}</span>
  </div>`,
  styles: [
    `
      div {
        display: grid;
        justify-items: center;
        gap: 12px;
        padding: 40px 16px;
        color: var(--color-muted);
      }
      app-food-doodle {
        width: 100px;
      }
    `,
  ],
})
export class LoadingStateComponent {
  label = input('Loading recipes…');
}
