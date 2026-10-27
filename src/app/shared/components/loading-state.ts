import { NgOptimizedImage } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { tipRecipebookMark, type BrandMarkMotion } from '../../core/brand-mark-motion';

@Component({
  selector: 'app-loading-state',
  imports: [NgOptimizedImage],
  template: `<div role="status">
    <img
      #mark
      ngSrc="icons/recipebook-mark-black-8de06a47.svg"
      width="64"
      height="64"
      priority
      alt=""
      aria-hidden="true"
    />
    <span>{{ label() }}</span>
  </div>`,
  styles: `
    div {
      display: grid;
      justify-items: center;
      gap: 12px;
      padding: 40px 16px;
      color: var(--color-muted);
    }
    img {
      display: block;
      transform: rotate(0deg);
    }
    @media (prefers-reduced-motion: reduce) {
      img {
        transform: rotate(-90deg);
      }
    }
  `,
})
export class LoadingStateComponent {
  label = input('Loading recipes…');
  private readonly mark = viewChild.required<ElementRef<HTMLImageElement>>('mark');
  private motion?: BrandMarkMotion;

  constructor() {
    afterNextRender(() => {
      this.motion = tipRecipebookMark(this.mark().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => this.motion?.cancel());
  }
}
