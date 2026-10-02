import { Component, model } from '@angular/core';
import { IconComponent } from './icon';

@Component({
  selector: 'app-library-view-toggle',
  imports: [IconComponent],
  template: `
    <div
      class="view-toggle"
      role="group"
      aria-label="Library view"
      [class.list-active]="view() === 'list'"
    >
      <span class="active-view" aria-hidden="true"></span>
      <button
        type="button"
        aria-label="Shelf view"
        title="Shelf view"
        [attr.aria-pressed]="view() === 'shelf'"
        (click)="view.set('shelf')"
      >
        <app-icon name="shelf" />
      </button>
      <button
        type="button"
        aria-label="List view"
        title="List view"
        [attr.aria-pressed]="view() === 'list'"
        (click)="view.set('list')"
      >
        <app-icon name="list" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    .view-toggle {
      position: relative;
      display: flex;
      padding: 2px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
    }
    .active-view {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 44px;
      height: 44px;
      background: var(--color-surface);
      border-radius: calc(var(--radius-control) - 2px);
      transition: transform 180ms var(--ease-out);
      pointer-events: none;
    }
    .list-active .active-view {
      transform: translateX(44px);
    }
    button {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      min-width: 44px;
      padding: 10px;
      border: 0;
      background: transparent;
      color: var(--color-muted);
    }
    button[aria-pressed='true'] {
      color: var(--color-ink);
    }
    @media (hover: hover) {
      button:hover {
        background: transparent;
        color: var(--color-ink);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .active-view {
        transition: none;
      }
    }
  `,
})
export class LibraryViewToggleComponent {
  view = model.required<'shelf' | 'list'>();
}
