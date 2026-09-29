import { Component, ElementRef, input, signal, viewChild } from '@angular/core';
import type { Recipe } from '../../../core/models/recipe.model';
import { formatRecipeTime } from '../../../core/models/recipe-metadata';
import { FoodPlaceholderComponent } from '../../../shared/components/food-placeholder';
import { IconComponent } from '../../../shared/components/icon';

export type DemoBackdrop = 'mist' | 'ribbons' | 'discs' | 'lines' | 'paper';

@Component({
  selector: 'app-card-demo-rail',
  imports: [FoodPlaceholderComponent, IconComponent],
  templateUrl: './demo-rail.html',
  styleUrl: './demo-rail.scss',
  host: { '(window:resize)': 'updatePosition()' },
})
export class CardDemoRailComponent {
  recipes = input.required<Recipe[]>();
  treatment = input<'color' | 'glass'>('color');
  phone = input(false);
  strength = input(42);
  graphic = input(true);
  backdrop = input<DemoBackdrop>('mist');
  rail = viewChild<ElementRef<HTMLDivElement>>('rail');
  active = signal(0);
  formatTime = formatRecipeTime;
  colors = [
    'var(--color-blue)',
    'var(--color-clay)',
    'var(--color-sage)',
    'var(--color-accent)',
    'var(--color-beige)',
  ];

  updatePosition() {
    const rail = this.rail()?.nativeElement;
    if (!rail) return;
    const cards = Array.from(rail.querySelectorAll<HTMLElement>('.demo-card'));
    const box = rail.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(rail).paddingLeft);
    let nearest = 0;
    cards.forEach((card, index) => {
      if (
        Math.abs(card.getBoundingClientRect().left - box.left - inset) <
        Math.abs(cards[nearest].getBoundingClientRect().left - box.left - inset)
      )
        nearest = index;
    });
    this.active.set(nearest);
  }
  go(direction: number) {
    const rail = this.rail()?.nativeElement;
    const cards = rail?.querySelectorAll<HTMLElement>('.demo-card');
    if (!rail || !cards?.length) return;
    const index = Math.max(0, Math.min(cards.length - 1, this.active() + direction));
    const left =
      rail.scrollLeft +
      cards[index].getBoundingClientRect().left -
      rail.getBoundingClientRect().left -
      parseFloat(getComputedStyle(rail).paddingLeft);
    rail.scrollTo({
      left,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  keyboard(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.go(event.key === 'ArrowLeft' ? -1 : 1);
  }
}
