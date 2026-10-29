import { Component, input } from '@angular/core';

// Small, editable line icons in the hand of the food doodles: a 1.65 line, round caps and
// curves that are a touch irregular. Decorative: the parent control supplies its label, and an
// icon-only control repeats it as its title. Sizes: 16px in text, 20px in rows, 22px in the header.
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
      @case ('focus') {
        <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
      }
      @case ('reset') {
        <path d="M4.6 9.6a7.9 7.9 0 1 1-.3 5.4M4.2 4.4l.3 5.6 5.6-.4" />
      }
      @case ('clock') {
        <path d="M12 4c-11-1-11 17 0 17s11-17 0-17Z M12 8v5l4 2" />
      }
      @case ('settings') {
        <path
          d="m9 3-.7 2.5-2 .9-2.4-.6-1.5 2.6 1.7 1.9-.1 2.3-1.6 1.9 1.6 2.7 2.5-.6 1.9 1 .7 2.4h3l.8-2.4 2-1 2.4.6 1.5-2.7-1.7-1.9.1-2.3 1.6-1.9-1.6-2.6-2.5.6-1.9-.9L12 3Z"
        />
        <circle cx="10.5" cy="11.8" r="3.2" />
      }
      @case ('search') {
        <path
          d="M10.6 4.1c3.8-.2 6.7 2.9 6.5 6.6-.2 3.6-3.2 6.2-6.7 6-3.6-.2-6.3-3.1-6.1-6.6.2-3.4 2.9-5.9 6.3-6ZM15.6 15.7l5.2 5.3"
        />
      }
      @case ('minus') {
        <path d="M4 12h16" />
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
      @case ('write') {
        <path d="M13 3.5 4 3Q3 3 3 4l.3 16q0 1 1 1l14-.2q1 0 1-1v-6M6 16h4m-4-4h2" />
        <path d="m10 13 1-4L18.5 2q1-1 2.5.5t.5 2.5L14 12Zm7-9 3 3" />
      }
      @case ('chevron') {
        <path d="m14 5-7 7 7 7" />
      }
      @case ('arrow-down') {
        <path d="M12 4v15m-7-7 7 7 7-7" />
      }
      @case ('shelf') {
        <rect x="7" y="3" width="10" height="18" rx="1.5" />
        <path d="M3 6H1v12h2m18-12h2v12h-2" />
      }
      @case ('category') {
        <path d="M3 3h7l11 11-7 7L3 10Z" />
        <circle cx="7.5" cy="7.5" r="1" />
      }
      @case ('basket') {
        <path
          d="M3 9.2c6-.4 12-.4 18 0l-1.9 11.4c-4.7.6-9.5.6-14.2 0L3 9.2Zm4.1-.1L12 3.3l4.9 5.8M9.2 13v4m5.6-4v4"
        />
      }
      @case ('list') {
        <path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" />
      }
      @case ('external') {
        <path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6" />
      }
      @case ('pencil') {
        <path d="m4 16-1 5 5-1L21 7a2.8 2.8 0 0 0-4-4ZM15 5l4 4M4 16l4 4" />
      }
      @case ('trash') {
        <path
          d="M4 6.2c5.3-.4 10.6-.4 16 0M9.2 6V3.6c1.9-.3 3.8-.3 5.6 0V6M6.2 6.4l1.1 14.2c3.1.5 6.3.5 9.4 0l1.1-14.2M10 10.2v6.6m4-6.6v6.6"
        />
      }
      @case ('more') {
        <path d="M5.2 12.1h.1M12 11.9h.1M18.8 12.1h.1" stroke-width="3" />
      }
      @case ('play') {
        <path d="M7.5 4.8c-.4 4.8-.4 9.6 0 14.4 4.4-2.1 8.4-4.5 12-7.2-3.6-2.7-7.6-5.1-12-7.2Z" />
      }
      @case ('pause') {
        <path d="M8.6 5.1c-.3 4.6-.3 9.2 0 13.8M15.4 5.1c.3 4.6.3 9.2 0 13.8" />
      }
      @case ('download') {
        <path d="M12 3.5v12M7 11.1l5 4.9 5-4.9M4 20.3c5.3.4 10.7.4 16 0" />
      }
      @case ('upload') {
        <path d="M12 16V4.1M7 8.7l5-5 5 5M4 20.3c5.3.4 10.7.4 16 0" />
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
        stroke-width: var(--icon-stroke-width, 1.65);
        transition: stroke-width var(--motion-reveal) var(--motion-ease-out);
      }
      @media (prefers-reduced-motion: reduce) {
        svg {
          transition: none;
        }
      }
    `,
  ],
})
export class IconComponent {
  name = input.required<
    | 'focus'
    | 'reset'
    | 'clock'
    | 'settings'
    | 'search'
    | 'plus'
    | 'minus'
    | 'close'
    | 'check'
    | 'link'
    | 'write'
    | 'more'
    | 'play'
    | 'pause'
    | 'download'
    | 'upload'
    | 'pencil'
    | 'trash'
    | 'chevron'
    | 'external'
    | 'arrow-down'
    | 'shelf'
    | 'category'
    | 'list'
    | 'basket'
  >();
}
