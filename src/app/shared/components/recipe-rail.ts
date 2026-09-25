import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Recipe } from '../../core/models/recipe.model';
import { FoodPlaceholderComponent } from './food-placeholder';

@Component({
  selector: 'app-recipe-rail',
  imports: [RouterLink, FoodPlaceholderComponent],
  templateUrl: './recipe-rail.html',
  styleUrl: './recipe-rail.scss',
  host: { '(window:resize)': 'onResize()' },
})
export class RecipeRailComponent implements OnDestroy {
  title = input.required<string>();
  recipes = input.required<Recipe[]>();
  railId = input.required<string>();
  filterId = computed(() => this.railId() + '-glass');
  rail = viewChild<ElementRef<HTMLDivElement>>('recipeRail');
  canScrollPrevious = signal(false);
  canScrollNext = signal(false);
  activeIndex = signal(0);
  private frame = 0;
  private targetIndex: number | null = null;
  private settleTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => this.updateArrowState());
    effect(() => {
      this.recipes();
      // A search changes the list. Start at its first result and refresh controls.
      const rail = this.rail()?.nativeElement;
      if (rail) {
        this.targetIndex = null;
        rail.scrollTo({ left: 0, behavior: 'instant' });
        this.queueUpdate();
      }
    });
  }
  private positions(): number[] {
    const rail = this.rail()?.nativeElement;
    if (!rail) return [];
    const rect = rail.getBoundingClientRect();
    const mobile = window.matchMedia('(max-width: 600px)').matches;
    const padding = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    return Array.from(rail.querySelectorAll<HTMLElement>('.recipe-card')).map((card) => {
      const box = card.getBoundingClientRect();
      const align = mobile ? (rail.clientWidth - box.width) / 2 : padding;
      return Math.max(0, Math.min(max, rail.scrollLeft + box.left - rect.left - align));
    });
  }
  updateArrowState(): void {
    const rail = this.rail()?.nativeElement;
    if (!rail) return;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    this.canScrollPrevious.set(rail.scrollLeft > 2);
    this.canScrollNext.set(rail.scrollLeft < max - 2);
    const positions = this.positions();
    let nearest = 0;
    positions.forEach((p, i) => {
      if (Math.abs(p - rail.scrollLeft) < Math.abs(positions[nearest] - rail.scrollLeft))
        nearest = i;
    });
    this.activeIndex.set(nearest);
  }
  queueUpdate(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.updateArrowState());
  }
  onScroll(): void {
    this.queueUpdate();
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.targetIndex = null;
      this.updateArrowState();
    }, 180);
  }
  onResize(): void {
    this.targetIndex = null;
    this.queueUpdate();
  }
  interruptScroll(): void {
    this.targetIndex = null;
  }
  scrollByCard(direction: -1 | 1): void {
    const rail = this.rail()?.nativeElement;
    const positions = this.positions();
    if (!rail || !positions.length) return;
    const current = this.targetIndex ?? this.activeIndex();
    let next = Math.max(0, Math.min(positions.length - 1, current + direction));
    // Desktop can fit several cards: skip duplicate clamped end positions.
    while (
      next > 0 &&
      next < positions.length - 1 &&
      Math.abs(positions[next] - rail.scrollLeft) < 2
    )
      next += direction;
    this.targetIndex = next;
    rail.scrollTo({
      left: positions[next],
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  onKeydown(event: KeyboardEvent): void {
    if (event.target !== this.rail()?.nativeElement) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      this.scrollByCard(event.key === 'ArrowRight' ? 1 : -1);
    }
  }
  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.settleTimer);
  }
}
