import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
} from '@angular/core';

/** Live recipe text, with stable word boundaries for native layout-to-layout motion. */
@Component({
  selector: 'app-recipe-title',
  host: {
    '[class.line-limited]': 'maxLines() > 0',
    '[style.--recipe-title-lines]': 'maxLines() || null',
  },
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
    :host(.line-limited) {
      display: block;
      -webkit-box-orient: vertical;
      height: calc(var(--recipe-title-lines) * 1lh);
      overflow: hidden;
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
  readonly maxLines = input(0);
  readonly words = computed(() => this.title().match(/\S+/g) ?? []);

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let observer: ResizeObserver | undefined;
    let destroyed = false;
    const measure = () => {
      if (destroyed) return;
      // Safari can append an ellipsis to fitting inline-block words. Measure
      // without clamping, then enable it only when real content is hidden.
      element.style.removeProperty('-webkit-line-clamp');
      const lines = this.maxLines();
      if (lines <= 0) {
        element.style.removeProperty('display');
        return;
      }
      // An unclamped -webkit-box uses legacy flex layout and loses word spaces.
      element.style.display = 'block';
      if (element.scrollHeight > element.clientHeight + 1) {
        element.style.display = '-webkit-box';
        element.style.webkitLineClamp = String(lines);
      }
    };
    afterRenderEffect(() => {
      this.title();
      if (this.maxLines() > 0) {
        measure();
        if (typeof ResizeObserver !== 'undefined') {
          observer ??= new ResizeObserver(measure);
          observer.observe(element);
        }
      } else {
        observer?.disconnect();
        measure();
      }
    });
    void element.ownerDocument.fonts?.ready.then(measure);
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      observer?.disconnect();
    });
  }
}
