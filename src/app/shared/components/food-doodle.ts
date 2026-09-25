import { Component, input } from '@angular/core';
@Component({
  selector: 'app-food-doodle',
  host: {
    'aria-hidden': 'true',
    '[class.loading]': 'animate()',
    '[class.discard]': "kind() === 'discard'",
  },
  template: `<svg
    viewBox="0 0 160 140"
    fill="none"
    stroke="currentColor"
    stroke-width="3.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    @if (kind() === 'discard') {
      <g class="food">
        <path
          fill="var(--color-surface)"
          d="M-11-2C-14-7-8-12-4-10 0-15 7-11 8-7 14-6 14 1 10 4 11 10 4 13 0 10-6 14-12 9-10 5-14 4-14 0-11-2Z"
        />
        <path d="M-7-4c6-5 9 3 4 5s-1 7 3 6M4-7c-3 3 5 4 4 8" />
      </g>
      <path
        class="toss-trail"
        d="M16 46C51 32 80 40 91 68"
        stroke-dasharray="3 8"
        stroke-width="2"
      />
      <g class="bin">
        <path fill="var(--color-blue)" d="m61 71 5 54q23 5 46-1l5-53" />
        <path d="M78 82l2 29m19-29-2 29" />
        <path d="m117 71 5-3" />
        <g class="bin-lid">
          <path fill="var(--color-blue)" d="M56 68c1-10 64-11 66 0-2 10-64 10-66 0Z" />
          <path d="M80 64v-6q8-4 17 0v6" />
        </g>
      </g>
    } @else if (kind() === 'plate') {
      <path fill="var(--color-surface)" d="M43 71c-2-44 81-47 83-2s-81 45-83 2Z" />
      <path d="M57 71c-1-27 52-29 53-1s-52 29-53 1" />
      <path d="M72 59c-10 0-12 12-6 17-3 10 11 14 18 8 10 4 21-7 14-14 1-11-16-17-26-11Z" />
      <path d="M77 70c0-9 14-9 14 0s-14 9-14 0Z" />
      <path d="M15 29v23q0 11 9 11t9-11V29M21 29v22m6-22v22M24 63l1 50" />
      <path d="m135 113 1-83q14 18 6 42h-6" />
    } @else if (kind() === 'platter') {
      <path d="M26 63c-22-12-24 28-2 20m112-20c21-10 22 27 1 20" />
      <path fill="var(--color-surface)" d="M22 73c-2-41 115-44 117-1s-116 41-117 1Z" />
      <path d="M37 82q43 16 87-1" />
      <path
        d="M40 72q9-28 27 0-12 10-27 0Zm29-5q10-28 27 0-12 10-27 0Zm28 9q10-28 27 0-13 10-27 0Z"
      />
      <path d="m51 58 4 7m25-14 4 8m25 0 4 7" />
    } @else if (kind() === 'shallow-bowl') {
      <path fill="var(--color-surface)" d="M21 66q7 41 58 43 51-1 61-43Z" />
      <path fill="var(--color-surface)" d="M21 66c-1-27 117-28 119 0-1 27-117 28-119 0Z" />
      <path
        d="M47 68q-12-28 14-30 19 12 5 28m3-1q-7-33 20-29 14 17-1 30m5 0q7-31 26-16 3 16-11 21"
      />
      <path d="m55 50 6 15m22-17-3 16m29-9-9 12M49 80q29 9 60 0" />
    } @else if (kind() === 'casserole') {
      <path d="M27 70H14q-7 7 2 12h14m101-12h13q8 7-1 12h-12" />
      <path fill="var(--color-surface)" d="m27 70 6 29q2 9 13 9h69q12-1 14-10l5-28Z" />
      <path
        fill="var(--color-surface)"
        d="M38 51h80q9 0 12 9l6 17q1 8-10 8H35q-11 0-9-8l4-17q2-9 8-9Z"
      />
      <path d="M39 63q6-7 14-1t16-1 17 1 17-1 17 1M42 73l8-3m18 4 8-4m19 4 9-3m-47 24h47" />
      <path d="M62 39c-9-9 8-12 1-21m28 20c-8-8 8-11 1-21" />
    } @else if (kind() === 'soup') {
      <path fill="var(--color-surface)" d="M27 65q4 45 52 48 46-1 54-48Z" />
      <path fill="var(--color-surface)" d="M27 65c0-26 105-28 106 0-2 25-104 25-106 0Z" />
      <path d="M43 67q35-17 70 0" />
      <path d="m61 62 9-3 4 8-10 3Zm25-1 10-1 2 8-10 1M120 57l17-30" />
      <path d="M60 36c-8-8 7-12 1-20m22 17c-8-8 8-12 2-21" />
    } @else if (kind() === 'sandwich') {
      <path fill="var(--color-surface)" d="M18 89c0-29 124-30 125 0-1 30-124 30-125 0Z" />
      <path fill="var(--color-surface)" d="m84 65 41 15v8l-39 14-2-8Z" />
      <path d="m84 65 41 15-39 14ZM88 98q6-5 11-4t11-4 12-5" />
      <path fill="var(--color-surface)" d="m35 77 35-13 8 27v8L35 85Z" />
      <path d="m35 77 35-13 8 27ZM38 82q7 0 12 3t12 4 12 5M58 76l3-1m39 4 3 1" />
    } @else if (kind() === 'pasta') {
      <path fill="var(--color-surface)" d="M22 84c1-29 116-30 117 0s-117 30-117 0Z" />
      <path
        d="M36 86q44 21 90-1M47 76c-17-22 32-33 25-9s-23-9-5-18 28 22 15 28 1-39 20-26-9 25-6 10 24-8 19 15M110 40l21-23m-15 28 21-22"
      />
    } @else if (kind() === 'toast') {
      <path
        fill="var(--color-surface)"
        d="M43 112 40 58C17 46 38 23 79 24s65 23 42 36l-4 52q-36 5-74 0Z"
      />
      <path d="M53 99 51 57q-15-14 28-20 42 2 30 21l-3 41q-27 5-53 0Z" />
      <path d="m69 64 23-3 3 20-24 4Z" />
    } @else if (kind() === 'stew') {
      <path d="M32 66H18q-8 8 1 14h14m94-14h14q9 8 0 14h-14" />
      <path fill="var(--color-surface)" d="M31 60h98l-5 43q-1 12-43 12-42 0-45-12Z" />
      <path fill="var(--color-surface)" d="M31 60c0-23 96-24 98 0-1 23-97 23-98 0Z" />
      <path d="M46 61q34-10 68 0m-57-3 9-3 4 8-10 2m24-9 10 1-2 8-10-2M57 91q22 7 46 0" />
      <path d="M62 33c-9-9 8-12 1-22m29 21c-8-8 8-11 1-21" />
    } @else if (kind() === 'roast') {
      <path fill="var(--color-surface)" d="M17 99c1-28 126-28 128 0-2 29-126 29-128 0Z" />
      <path
        fill="var(--color-surface)"
        d="M93 66c2-12 17-12 23-4l10-6c-2-5 4-8 7-4 6-1 8 6 2 8l-15 12c-9 10-24 6-27-6Z"
      />
      <path
        fill="var(--color-surface)"
        d="M37 87c-8-16 7-34 29-36 24-4 43 8 45 27 3 17-15 25-38 25-20 0-31-5-36-16Z"
      />
      <path d="M50 65q13-10 29-5M43 82c8-14 25-9 23 2-1 8-12 12-20 8l12-8" />
      <path
        fill="var(--color-surface)"
        d="M88 88c-2-12 15-17 24-7 4 4 3 9 3 12l15 1c4-4 9 0 6 4 3 5-3 9-7 4l-19-1c-10 7-21 0-22-13Z"
      />
      <path d="M99 84q8 0 9 7M31 106q13 8 28 8" />
    } @else {
      <path fill="var(--color-surface)" d="M24 70q55-9 112 0c-5 37-27 47-56 47S30 105 24 70Z" />
      <path d="M23 70q56 12 114 0M63 119l-5 8q20 4 43 0l-6-8" />
      <g class="steam">
        <path d="M55 55c-15-14 12-16 0-31m25 29c-13-13 14-18 3-34m24 38c-14-12 11-17 2-28" />
      </g>
      <path d="m127 42 20-27m-14 35 20-23" />
    }
  </svg>`,
  styles: [
    `
      :host {
        display: block;
        width: 160px;
        color: var(--color-ink);
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
      }
      :host(.loading) .steam {
        animation: steam 1.8s ease-in-out infinite;
      }
      :host(.discard) .food {
        offset-path: path('M16 46 C51 32 80 40 91 68 L91 92');
        offset-rotate: 0deg;
        offset-anchor: center;
        transform-box: fill-box;
        transform-origin: center;
        animation: toss 2200ms linear both;
      }
      :host(.discard) .toss-trail {
        animation: trail 2200ms ease-out both;
      }
      :host(.discard) .bin {
        transform-origin: 89px 125px;
        animation: bin-hop 2200ms linear both;
      }
      :host(.discard) .bin-lid {
        /* Keep the back-right attachment fixed throughout the swing. */
        transform-box: view-box;
        transform-origin: 122px 68px;
        animation: lid-close 2200ms linear both;
      }
      @keyframes steam {
        50% {
          transform: translateY(-7px);
          opacity: 0.35;
        }
      }
      /* One shared timeline: paper lands, lid shuts, then the bin reacts. */
      @keyframes toss {
        0%,
        8% {
          offset-distance: 0%;
          transform: rotate(-15deg);
          opacity: 1;
          animation-timing-function: cubic-bezier(0.4, 0.2, 0.7, 0.6);
        }
        36% {
          opacity: 1;
        }
        42%,
        100% {
          offset-distance: 100%;
          transform: rotate(140deg) scale(0.65);
          opacity: 0;
        }
      }
      @keyframes lid-close {
        0%,
        42% {
          transform: rotate(68deg) scale(0.85, 1.3);
          animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
        }
        50% {
          transform: rotate(0deg) scale(1);
        }
        53% {
          transform: rotate(5deg) scale(1);
        }
        57%,
        100% {
          transform: rotate(0deg);
        }
      }
      @keyframes bin-hop {
        0%,
        50% {
          transform: translateY(0) scale(1);
        }
        53% {
          transform: translateY(1px) scale(1.035, 0.97);
          animation-timing-function: cubic-bezier(0.15, 0.7, 0.3, 1);
        }
        62% {
          transform: translateY(-9px) rotate(-2deg);
          animation-timing-function: cubic-bezier(0.5, 0, 0.85, 0.4);
        }
        71% {
          transform: translateY(0) scale(1.025, 0.975);
        }
        78%,
        100% {
          transform: none;
        }
      }
      @keyframes trail {
        0%,
        42%,
        100% {
          opacity: 0;
        }
        18%,
        32% {
          opacity: 0.4;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        :host(.loading) .steam,
        :host(.discard) .food,
        :host(.discard) .toss-trail,
        :host(.discard) .bin,
        :host(.discard) .bin-lid {
          animation: none;
        }
        :host(.discard) .toss-trail {
          display: none;
        }
      }
    `,
  ],
})
export class FoodDoodleComponent {
  kind = input<
    | 'bowl'
    | 'plate'
    | 'pasta'
    | 'toast'
    | 'stew'
    | 'roast'
    | 'platter'
    | 'shallow-bowl'
    | 'casserole'
    | 'soup'
    | 'sandwich'
    | 'discard'
  >('bowl');
  animate = input(false);
}
