import { Component, model } from '@angular/core';
import { IconComponent } from './icon';
import { TranslatePipe } from '../../core/i18n/i18n';

@Component({
  selector: 'app-library-view-toggle',
  imports: [IconComponent, TranslatePipe],
  template: `<button
    type="button"
    [attr.aria-label]="(view() === 'shelf' ? 'Show list' : 'Show cards') | t"
    [title]="(view() === 'shelf' ? 'Show list' : 'Show cards') | t"
    (click)="view.set(view() === 'shelf' ? 'list' : 'shelf')"
  >
    <app-icon [name]="view() === 'shelf' ? 'list' : 'shelf'" />
  </button>`,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    button {
      width: 44px;
      height: 44px;
      padding: 10px;
      border: 0;
      background: transparent;
      color: var(--color-muted);
    }
    @media (hover: hover) and (pointer: fine) {
      button:hover {
        background: transparent;
        color: var(--color-ink);
        transform: none;
      }
    }
  `,
})
export class LibraryViewToggleComponent {
  view = model.required<'shelf' | 'list'>();
}
