import { Component, model } from '@angular/core';
import { IconComponent } from './icon';

@Component({
  selector: 'app-library-view-toggle',
  imports: [IconComponent],
  template: `<button
    type="button"
    [attr.aria-label]="view() === 'shelf' ? 'Show list' : 'Show cards'"
    [title]="view() === 'shelf' ? 'Show list' : 'Show cards'"
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
    app-icon {
      transition: transform 180ms var(--ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      button:hover {
        background: transparent;
        color: var(--color-ink);
        transform: none;
      }
      button:hover app-icon {
        transform: translateY(-1px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      app-icon {
        transition: none;
      }
    }
  `,
})
export class LibraryViewToggleComponent {
  view = model.required<'shelf' | 'list'>();
}
