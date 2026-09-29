import { CardTiltDirective } from './card-tilt';
import { IconComponent } from './icon';
import { formatRecipeTime } from '../../core/models/recipe-metadata';
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
import { FoodPlaceholderComponent, foodPlaceholderBackground } from './food-placeholder';

@Component({
  selector: 'app-recipe-rail',
  imports: [RouterLink, FoodPlaceholderComponent, IconComponent, CardTiltDirective],
  templateUrl: './recipe-rail.html',
  styleUrl: './recipe-rail.scss',
  host: { '(window:resize)': 'onResize()' },
})
export class RecipeRailComponent implements OnDestroy {
  formatTime = formatRecipeTime;
  placeholderBackground = foodPlaceholderBackground;
  cardColors = ['blue', 'clay', 'sage', 'accent', 'beige', 'butter'];
  title = input.required<string>();
  recipes = input.required<Recipe[]>();
  railId = input.required<string>();
  filterId = computed(() => this.railId() + '-glass');
  rail = viewChild<ElementRef<HTMLDivElement>>('recipeRail');
  canScrollPrevious = signal(false);
  canScrollNext = signal(false);
  activeIndex = signal(0);
  stops = signal<{ recipeIndex: number; left: number }[]>([]);
  progress = signal(0);
  currentStop = computed(() => Math.round(this.progress()));
  progressControls = viewChild<ElementRef<HTMLDivElement>>('progressControls');
  swipeTilt = signal(0);
  private lastScroll = 0;
  private lastScrollTime = 0;
  private frame = 0;
  private targetIndex: number | null = null;
  private settleTimer?: ReturnType<typeof setTimeout>;

  dotStrength(index: number): number {
    return Math.max(0, 1 - Math.abs(this.progress() - index));
  }

  constructor() {
    afterNextRender(() => this.updateArrowState());
    effect(() => {
      this.recipes();
      // A search changes the list. Start at its first result and refresh controls.
      const rail = this.rail()?.nativeElement;
      if (rail) {
        this.targetIndex = null;
        rail.scrollTo({ left: 0, behavior: 'instant' });
        this.lastScroll = 0;
        this.swipeTilt.set(0);
        this.queueUpdate();
      }
    });
  }
  private positions(): number[] {
    const rail = this.rail()?.nativeElement;
    if (!rail) return [];
    const mobile = window.matchMedia('(max-width: 600px)').matches;
    const padding = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    return Array.from(rail.querySelectorAll<HTMLElement>('.recipe-card')).map((card) => {
      const align = mobile ? (rail.clientWidth - card.offsetWidth) / 2 : padding;
      return Math.max(0, Math.min(max, card.offsetLeft - align));
    });
  }
  updateArrowState(): void {
    const rail = this.rail()?.nativeElement;
    if (!rail) return;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    this.canScrollPrevious.set(rail.scrollLeft > 2);
    this.canScrollNext.set(rail.scrollLeft < max - 2);
    const positions = this.positions();
    // A desktop rail shows several cards at once; duplicate end positions share one dot.
    const stops = positions.flatMap((left, recipeIndex) =>
      recipeIndex === 0 || Math.abs(left - positions[recipeIndex - 1]) > 2
        ? [{ recipeIndex, left }]
        : [],
    );
    if (
      stops.length !== this.stops().length ||
      stops.some(
        (stop, i) =>
          stop.recipeIndex !== this.stops()[i].recipeIndex ||
          Math.abs(stop.left - this.stops()[i].left) > 1,
      )
    ) {
      this.stops.set(stops);
    }
    let progress = 0;
    for (let i = 1; i < stops.length; i++) {
      if (rail.scrollLeft >= stops[i].left) progress = i;
      else {
        progress =
          i -
          1 +
          Math.max(0, (rail.scrollLeft - stops[i - 1].left) / (stops[i].left - stops[i - 1].left));
        break;
      }
    }
    const previousStop = this.currentStop();
    this.progress.set(progress);
    // Keep the active dot visible for larger collections without scrolling the page.
    if (previousStop !== this.currentStop()) {
      const controls = this.progressControls()?.nativeElement;
      const dot = controls?.children[this.currentStop()] as HTMLElement | undefined;
      if (controls && dot)
        controls.scrollTo({
          left: dot.offsetLeft - controls.clientWidth / 2 + dot.offsetWidth / 2,
          behavior: 'instant',
        });
    }
    let nearest = 0;
    positions.forEach((p, i) => {
      if (Math.abs(p - rail.scrollLeft) < Math.abs(positions[nearest] - rail.scrollLeft))
        nearest = i;
    });
    this.activeIndex.set(nearest);
  }
  queueUpdate(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const rail = this.rail()?.nativeElement;
      const now = performance.now();
      if (rail && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const speed = (rail.scrollLeft - this.lastScroll) / Math.max(16, now - this.lastScrollTime);
        this.swipeTilt.set(Math.max(-4, Math.min(4, speed * -2.5)));
        this.lastScroll = rail.scrollLeft;
        this.lastScrollTime = now;
      }
      this.updateArrowState();
    });
  }
  onScroll(): void {
    this.queueUpdate();
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.targetIndex = null;
      this.swipeTilt.set(0);
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
    this.scrollToCard(next);
  }
  scrollToCard(index: number): void {
    const rail = this.rail()?.nativeElement;
    const positions = this.positions();
    if (!rail || positions[index] == null) return;
    this.targetIndex = index;
    rail.scrollTo({
      left: positions[index],
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
