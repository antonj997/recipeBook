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
import {
  FoodPlaceholderComponent,
  foodPlaceholderBackground,
  photoCardBackground,
} from './food-placeholder';

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
  private collectionLabels = computed(
    () => new Map(this.collections().map((item) => [item.id, item.name])),
  );
  categoryLabels(recipe: Recipe): string[] {
    return (recipe.collectionIds ?? [])
      .map((id) => this.collectionLabels().get(id))
      .filter((name): name is string => !!name)
      .slice(0, 3);
  }
  tagLabels(recipe: Recipe): string[] {
    return metadataTags(recipe).slice(0, 4);
  }
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
  indicatorCapacity = signal(9);
  condensed = computed(() => this.stops().length > this.indicatorCapacity());
  // Every mark keeps its recipe index. Only the nearby window is rendered.
  indicatorOffset = computed(() =>
    Math.max(
      0,
      Math.min(
        this.stops().length - this.indicatorCapacity(),
        this.progress() - (this.indicatorCapacity() - 1) / 2,
      ),
    ),
  );
  indicatorMarks = computed(() => {
    const first = Math.max(0, Math.floor(this.indicatorOffset()) - 1);
    const end = Math.min(
      this.stops().length,
      Math.ceil(this.indicatorOffset()) + this.indicatorCapacity() + 1,
    );
    return Array.from({ length: end - first }, (_, i) => first + i);
  });
  positionLabel = computed(() => {
    const stops = this.stops();
    const index = Math.min(stops.length - 1, this.currentStop());
    const title = this.recipes()[stops[index]?.recipeIndex]?.title ?? '';
    return title + ', position ' + (index + 1) + ' of ' + stops.length;
  });
  currentStop = computed(() => Math.round(this.progress()));
  progressControls = viewChild<ElementRef<HTMLDivElement>>('progressControls');
  swipeTilt = signal(0);
  private lastScroll = 0;
  private lastScrollTime = 0;
  private frame = 0;
  private edgeFrame = 0;
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
    pressedProgress: number;
    lastX: number;
    edgeDirection: number;
    edgeSince: number;
    edgeTime: number;
    moved: boolean;
    condensed: boolean;
  };

  dotStrength(index: number): number {
    return Math.max(0, 1 - Math.abs(this.progress() - index));
  }

  indicatorScale(index: number): number {
    const slot = index - this.indicatorOffset();
    const last = this.indicatorCapacity() - 1;
    const distance = Math.min(
      this.indicatorOffset() > 0 ? slot : 1,
      this.indicatorOffset() < this.stops().length - this.indicatorCapacity() ? last - slot : 1,
    );
    return Math.max(0.4, Math.min(1, 0.4 + distance * 0.6));
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
          const index = Math.max(
            0,
            recipes.findIndex((recipe) => recipe.id === desired),
          );
          const left = this.positions()[index] ?? 0;
          this.targetIndex = null;
          rail.scrollTo({ left, behavior: 'instant' });
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
    const available =
      rail.closest<HTMLElement>('.collection-section')?.clientWidth ?? rail.clientWidth;
    this.indicatorCapacity.set(Math.max(2, Math.min(9, Math.floor(available / 32))));
    const measured = this.needsMeasurement;
    const positions = this.positions();
    if (measured || positions.length !== this.stops().length) {
      this.stops.set(positions.map((left, recipeIndex) => ({ recipeIndex, left })));
    }
    // Measured positions are reused during dragging; locate the card in O(log n).
    let low = 0;
    let high = Math.max(0, positions.length - 1);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (positions[middle] <= rail.scrollLeft) low = middle;
      else high = middle - 1;
    }
    const next = Math.min(positions.length - 1, low + 1);
    const distance = positions[next] - positions[low];
    const progress =
      low +
      (distance > 0 ? Math.max(0, Math.min(1, (rail.scrollLeft - positions[low]) / distance)) : 0);
    this.progress.set(progress);
    const nearest = Math.round(progress);
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
      if (
        rail &&
        matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
          .matches
      ) {
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
    const condensed = this.condensed();
    const bounds = controls.getBoundingClientRect();
    const last = this.stops().length - 1;
    const pressedProgress = button
      ? Number(button.dataset['stop'])
      : Math.max(
          0,
          Math.min(
            last,
            Math.round(this.indicatorOffset() + (event.clientX - bounds.left - 16) / 32),
          ),
        );
    // Freeze the starting recipe, not a percentage of the whole collection.
    this.scrub = {
      pointerId: event.pointerId,
      controls,
      captureTarget: button ?? controls,
      startX: event.clientX,
      startY: event.clientY,
      startProgress: pressedProgress,
      pressedProgress,
      lastX: event.clientX,
      edgeDirection: 0,
      edgeSince: 0,
      edgeTime: 0,
      moved: false,
      condensed,
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
    scrub.lastX = event.clientX;
    this.scrubTo(scrub.startProgress + dx / 32);
    const bounds = scrub.controls.getBoundingClientRect();
    const direction = !scrub.condensed
      ? 0
      : event.clientX <= bounds.left + 24
        ? -1
        : event.clientX >= bounds.right - 24
          ? 1
          : 0;
    if (direction !== scrub.edgeDirection) {
      scrub.edgeDirection = direction;
      scrub.edgeSince = scrub.edgeTime = performance.now();
      cancelAnimationFrame(this.edgeFrame);
      this.edgeFrame = 0;
    }
    if (direction && !this.edgeFrame)
      this.edgeFrame = requestAnimationFrame((time) => this.scrubEdge(time));
  }
  private scrubTo(value: number): void {
    const stops = this.stops();
    if (!stops.length) return;
    const progress = Math.max(0, Math.min(stops.length - 1, value));
    const lower = Math.floor(progress);
    const upper = Math.min(stops.length - 1, lower + 1);
    const left = stops[lower].left + (stops[upper].left - stops[lower].left) * (progress - lower);
    this.rail()?.nativeElement.scrollTo({ left, behavior: 'instant' });
    this.updateArrowState();
  }
  private scrubEdge(time: number): void {
    this.edgeFrame = 0;
    const scrub = this.scrub;
    if (!scrub?.moved || !scrub.edgeDirection) return;
    // A short hold starts slowly, then speeds up for long collections.
    const speed = 4 + Math.min(26, (time - scrub.edgeSince) / 80);
    const delta = (scrub.edgeDirection * speed * Math.min(64, time - scrub.edgeTime)) / 1000;
    scrub.edgeTime = time;
    const previous = this.progress();
    this.scrubTo(previous + delta);
    // Keep the finger-relative drag anchored to the actual clamped position.
    scrub.startProgress = this.progress() - (scrub.lastX - scrub.startX) / 32;
    if (this.progress() !== previous)
      this.edgeFrame = requestAnimationFrame((next) => this.scrubEdge(next));
  }
  onLostScrubCapture(event: PointerEvent): void {
    // Capture events bubble: losing a child's implicit capture must not end our drag.
    if (event.target === this.scrub?.captureTarget) this.finishScrub(event);
  }
  finishScrub(event?: PointerEvent, snap = true): void {
    const scrub = this.scrub;
    if (!scrub || (event && event.pointerId !== scrub.pointerId)) return;
    this.scrub = undefined;
    cancelAnimationFrame(this.edgeFrame);
    this.edgeFrame = 0;
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
      if (scrub.condensed && snap && event?.type === 'pointerup') {
        const stop = this.stops()[scrub.pressedProgress];
        if (stop) this.scrollToCard(stop.recipeIndex);
      }
    }
  }
  onProgressClick(event: MouseEvent, recipeIndex: number): void {
    // Releasing a drag can synthesize a click; keyboard activation must always work.
    if (event.detail > 0 && performance.now() < this.suppressClickUntil) return;
    this.scrollToCard(recipeIndex);
  }
  onProgressKeydown(event: KeyboardEvent): void {
    if (!this.condensed()) return;
    const stops = this.stops();
    const pending =
      this.targetIndex == null
        ? -1
        : stops.findIndex((stop) => stop.recipeIndex === this.targetIndex);
    const current = pending >= 0 ? pending : this.currentStop();
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = current + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current - 1;
        break;
      case 'PageDown':
        next = current + 5;
        break;
      case 'PageUp':
        next = current - 5;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = stops.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const stop = stops[Math.max(0, Math.min(stops.length - 1, next))];
    if (stop) this.scrollToCard(stop.recipeIndex);
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
