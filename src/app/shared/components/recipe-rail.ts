import type { RecipeCollection } from '../../core/models/recipe-collection.model';
import { CardTiltDirective } from './card-tilt';
import { IconComponent } from './icon';
import { formatRecipeTime, metadataTags } from '../../core/models/recipe-metadata';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  untracked,
  linkedSignal,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Recipe } from '../../core/models/recipe.model';
import { FoodPlaceholderComponent, foodPlaceholderBackground, photoCardBackground } from './food-placeholder';

@Component({
  selector: 'app-recipe-rail',
  imports: [RouterLink, FoodPlaceholderComponent, IconComponent, CardTiltDirective],
  templateUrl: './recipe-rail.html',
  styleUrl: './recipe-rail.scss',
  host: {
    '(window:resize)': 'onResize()',
    '(window:blur)': 'finishScrub()',
    '(window:pointerup)': 'finishScrub($event)',
  },
})
export class RecipeRailComponent implements OnDestroy {
  formatTime = formatRecipeTime;
  placeholderBackground = foodPlaceholderBackground;
  photoBackground = photoCardBackground;
  initialRecipeId = input('');
  activeRecipeChange = output<string>();
  private currentRecipeId = '';
  private lastRestoreId = '';
  private restoreFrame = 0;
  title = input.required<string>();
  recipes = input.required<Recipe[]>();
  collections = input<RecipeCollection[]>([]);
  private collectionLabels = computed(() => new Map(this.collections().map(item => [item.id, item.name])));
  categoryLabels(recipe: Recipe): string[] {
    return (recipe.collectionIds ?? []).map(id => this.collectionLabels().get(id)).filter((name): name is string => !!name).slice(0, 3);
  }
  tagLabels(recipe: Recipe): string[] { return metadataTags(recipe).slice(0, 4); }
  railId = input.required<string>();
  filterId = computed(() => this.railId() + '-glass');
  rail = viewChild<ElementRef<HTMLDivElement>>('recipeRail');
  canScrollPrevious = signal(false);
  canScrollNext = signal(false);
  activeIndex = signal(0);
  // Discard measured positions immediately when search changes the recipe list.
  // The next frame measures the new cards, without rendering stale dot indexes.
  stops = linkedSignal<Recipe[], { recipeIndex: number; left: number }[]>({
    source: this.recipes,
    computation: () => [],
  });
  progress = signal(0);
  currentStop = computed(() => Math.round(this.progress()));
  progressControls = viewChild<ElementRef<HTMLDivElement>>('progressControls');
  swipeTilt = signal(0);
  private lastScroll = 0;
  private lastScrollTime = 0;
  private frame = 0;
  private targetIndex: number | null = null;
  private settleTimer?: ReturnType<typeof setTimeout>;
  private cardPositions: number[] = [];
  private needsMeasurement = true;
  private suppressClickUntil = 0;
  private scrub?: {
    pointerId: number;
    controls: HTMLDivElement;
    captureTarget: HTMLElement;
    startX: number;
    startY: number;
    startProgress: number;
    pixelsPerStop: number;
    moved: boolean;
  };

  dotStrength(index: number): number {
    return Math.max(0, 1 - Math.abs(this.progress() - index));
  }

  constructor() {
    afterNextRender(() => this.updateArrowState());
    effect(() => {
      const recipes = this.recipes();
      const restore = this.initialRecipeId();
      untracked(() => {
        const desired = restore !== this.lastRestoreId ? restore : this.currentRecipeId || restore;
        this.lastRestoreId = restore;
        this.finishScrub(undefined, false);
        this.needsMeasurement = true;
        this.cardPositions = [];
        this.restoreSnap();
        cancelAnimationFrame(this.restoreFrame);
        this.restoreFrame = requestAnimationFrame(() => {
          this.restoreFrame = 0;
          const rail = this.rail()?.nativeElement;
          if (!rail) return;
          const index = Math.max(0, recipes.findIndex(recipe => recipe.id === desired));
          const left = this.positions()[index] ?? 0;
          this.targetIndex = null;
          rail.scrollTo({left, behavior:'instant'});
          this.lastScroll = left;
          this.swipeTilt.set(0);
          this.queueUpdate();
        });
      });
    });
  }
  private positions(): number[] {
    if (!this.needsMeasurement) return this.cardPositions;
    const rail = this.rail()?.nativeElement;
    if (!rail) return [];
    const mobile = window.matchMedia('(max-width: 600px)').matches;
    const padding = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    this.cardPositions = Array.from(rail.querySelectorAll<HTMLElement>('.recipe-card')).map(
      (card) => {
        const align = mobile ? (rail.clientWidth - card.offsetWidth) / 2 : padding;
        return Math.max(0, Math.min(max, card.offsetLeft - align));
      },
    );
    this.needsMeasurement = false;
    return this.cardPositions;
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
    this.progress.set(progress);
    // Follow fractional progress continuously, rather than jumping the strip at each dot.
    const controls = this.progressControls()?.nativeElement;
    if (controls && controls.scrollWidth > controls.clientWidth) {
      const last = Math.max(1, stops.length - 1);
      controls.scrollLeft = (progress / last) * (controls.scrollWidth - controls.clientWidth);
    }
    let nearest = 0;
    positions.forEach((p, i) => {
      if (Math.abs(p - rail.scrollLeft) < Math.abs(positions[nearest] - rail.scrollLeft))
        nearest = i;
    });
    this.activeIndex.set(nearest);
    const id = this.recipes()[nearest]?.id ?? '';
    if (id && id !== this.currentRecipeId) {
      this.currentRecipeId = id;
      this.activeRecipeChange.emit(id);
    }
  }
  queueUpdate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const rail = this.rail()?.nativeElement;
      const now = performance.now();
      if (rail && matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) {
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
    if (this.scrub?.moved) return;
    this.settleTimer = setTimeout(() => {
      this.targetIndex = null;
      this.swipeTilt.set(0);
      this.updateArrowState();
      this.restoreSnap();
    }, 180);
  }
  onResize(): void {
    this.finishScrub(undefined, false);
    this.restoreSnap();
    this.needsMeasurement = true;
    this.targetIndex = null;
    this.queueUpdate();
  }
  interruptScroll(): void {
    this.restoreSnap();
    this.targetIndex = null;
  }
  private restoreSnap(): void {
    this.rail()?.nativeElement.classList.remove('is-scrubbing');
  }
  startScrub(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0 || this.stops().length < 2 || this.scrub) return;
    const controls = event.currentTarget as HTMLDivElement;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.progress-dot');
    // Freeze gesture geometry: expanding dots and strip scrolling must not move its target.
    this.scrub = {
      pointerId: event.pointerId,
      controls,
      captureTarget: button ?? controls,
      startX: event.clientX,
      startY: event.clientY,
      startProgress: button ? Number(button.dataset['stop']) : this.progress(),
      pixelsPerStop: Math.max(
        1,
        Math.min(24, (controls.clientWidth - 44) / (this.stops().length - 1)),
      ),
      moved: false,
    };
    // Capture from the press, so fast drags can leave the strip. Keep capture on
    // the starting button to preserve taps and avoid a touch capture handoff mid-drag.
    this.scrub.captureTarget.setPointerCapture(event.pointerId);
  }
  moveScrub(event: PointerEvent): void {
    const scrub = this.scrub;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    const dx = event.clientX - scrub.startX;
    const dy = event.clientY - scrub.startY;
    if (!scrub.moved) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      // Vertical movement still scrolls the page; only horizontal movement scrubs cards.
      if (Math.abs(dy) > Math.abs(dx)) {
        this.finishScrub(undefined, false);
        return;
      }
      scrub.moved = true;
      scrub.controls.classList.add('is-scrubbing');
      this.rail()?.nativeElement.classList.add('is-scrubbing');
      this.targetIndex = null;
      clearTimeout(this.settleTimer);
    }
    event.preventDefault();
    const stops = this.stops();
    const progress = Math.max(
      0,
      Math.min(stops.length - 1, scrub.startProgress + dx / scrub.pixelsPerStop),
    );
    const lower = Math.floor(progress);
    const upper = Math.min(stops.length - 1, lower + 1);
    const left = stops[lower].left + (stops[upper].left - stops[lower].left) * (progress - lower);
    this.rail()?.nativeElement.scrollTo({ left, behavior: 'instant' });
    this.queueUpdate();
  }
  onLostScrubCapture(event: PointerEvent): void {
    // Capture events bubble: losing a child's implicit capture must not end our drag.
    if (event.target === this.scrub?.captureTarget) this.finishScrub(event);
  }
  finishScrub(event?: PointerEvent, snap = true): void {
    const scrub = this.scrub;
    if (!scrub || (event && event.pointerId !== scrub.pointerId)) return;
    this.scrub = undefined;
    if (scrub.captureTarget.hasPointerCapture(scrub.pointerId))
      scrub.captureTarget.releasePointerCapture(scrub.pointerId);
    scrub.controls.classList.remove('is-scrubbing');
    const rail = this.rail()?.nativeElement;
    if (scrub.moved) {
      this.suppressClickUntil = performance.now() + 400;
      // Read the last scroll position before restoring native snapping.
      if (snap) this.updateArrowState();
      const stop = snap ? this.stops()[this.currentStop()] : undefined;
      if (stop) {
        // Keep snapping disabled during the short settling scroll, avoiding a release jump.
        this.scrollToCard(stop.recipeIndex);
        this.onScroll();
      } else {
        rail?.classList.remove('is-scrubbing');
      }
    } else {
      rail?.classList.remove('is-scrubbing');
    }
  }
  onProgressClick(event: MouseEvent, recipeIndex: number): void {
    // Releasing a drag can synthesize a click; keyboard activation must always work.
    if (event.detail > 0 && performance.now() < this.suppressClickUntil) return;
    this.scrollToCard(recipeIndex);
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
    this.finishScrub(undefined, false);
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.restoreFrame);
    clearTimeout(this.settleTimer);
  }
}
