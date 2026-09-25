import { Component, input } from '@angular/core';

// Small, editable line icons. Decorative: the parent control supplies its label.
@Component({
  selector: 'app-icon',
  host: { 'aria-hidden': 'true' },
  template: `<svg
    viewBox="-2 -2 28 28"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    @switch (name()) {
      @case ('settings') {
        <path
          d="m9 3-.7 2.5-2 .9-2.4-.6-1.5 2.6 1.7 1.9-.1 2.3-1.6 1.9 1.6 2.7 2.5-.6 1.9 1 .7 2.4h3l.8-2.4 2-1 2.4.6 1.5-2.7-1.7-1.9.1-2.3 1.6-1.9-1.6-2.6-2.5.6-1.9-.9L12 3Z"
        />
        <circle cx="10.5" cy="11.8" r="3.2" />
      }
      @case ('search') {
        <path d="M15.5 15.5 21 21" />
        <circle cx="10.5" cy="10.5" r="6.7" />
      }
      @case ('plus') {
        <path d="M12 4v16M4 12h16" />
      }
      @case ('close') {
        <path d="m6 6 12 12M18 6 6 18" />
      }
      @case ('check') {
        <path d="m4 12 5 5L20 6" />
      }
      @case ('link') {
        <path
          d="M9.2 14.8 14.8 9.2M8 16l-1.2 1.2a3.8 3.8 0 0 1-5.3-5.4l4-4a3.8 3.8 0 0 1 5.4 0M16 8l1.2-1.2a3.8 3.8 0 0 1 5.3 5.4l-4 4a3.8 3.8 0 0 1-5.4 0"
        />
      }
      @case ('book') {
        <path d="M13 3.5 4 3Q3 3 3 4l.3 16q0 1 1 1l14-.2q1 0 1-1v-6M6 16h4m-4-4h2" />
        <path d="m10 13 1-4L18.5 2q1-1 2.5.5t.5 2.5L14 12Zm7-9 3 3" />
      }
      @case ('chevron') {
        <path d="m14 5-7 7 7 7" />
      }
      @case ('external') {
        <path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6" />
      }
      @case ('arrow') {
        <path d="M4 12h15m-6-6 6 6-6 6" />
      }
      @case ('trash') {
        <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
      }
    }
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: 0 0 auto;
        width: 22px;
        height: 22px;
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class IconComponent {
  name = input.required<
    | 'settings'
    | 'search'
    | 'plus'
    | 'close'
    | 'check'
    | 'link'
    | 'book'
    | 'arrow'
    | 'trash'
    | 'chevron'
    | 'external'
  >();
}
