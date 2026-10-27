import { computed, DestroyRef, inject, Injector, Service, signal } from '@angular/core';
import { motionMs } from '../motion';
import type { ShoppingListService } from './shopping-list.service';

const maxDots = 6;

/** The header basket: how much is left to buy, and ingredients flying into it. */
@Service()
export class BasketService {
  private readonly injector = inject(Injector);
  // Loaded after startup so the header does not pull the list and its quantity parser into the
  // first download; the count appears a moment later.
  private readonly shopping = signal<ShoppingListService | null>(null);
  readonly count = computed(
    () =>
      this.shopping()
        ?.groups()
        .filter((group) => !group.checked).length ?? 0,
  );

  constructor() {
    let alive = true;
    inject(DestroyRef).onDestroy(() => (alive = false));
    void import('./shopping-list.service').then(({ ShoppingListService }) => {
      if (alive) this.shopping.set(this.injector.get(ShoppingListService));
    });
  }
  readonly label = computed(() =>
    this.count() ? `Shopping list, ${this.count()} to buy` : 'Shopping list',
  );
  /** Increments each time added items land in the basket; the header bumps the icon. */
  readonly arrivals = signal(0);

  /** A few dots arc from `source` into the header basket, then the basket bumps. */
  async flyFrom(source: DOMRect, count: number, color = 'var(--color-ink)'): Promise<void> {
    const basket = document.querySelector<HTMLElement>('.shopping-link');
    if (
      !basket ||
      typeof basket.animate !== 'function' ||
      typeof matchMedia !== 'function' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.arrivals.update((value) => value + 1);
      return;
    }
    const target = basket.getBoundingClientRect();
    const from = { x: source.left + source.width / 2, y: source.top + source.height / 2 };
    const to = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
    const peak = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 80 };
    const flights = Array.from({ length: Math.min(maxDots, Math.max(1, count)) }, (_, index) => {
      const dot = document.createElement('span');
      dot.className = 'basket-dot';
      dot.setAttribute('aria-hidden', 'true');
      Object.assign(dot.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '8px',
        height: '8px',
        margin: '-4px 0 0 -4px',
        borderRadius: '50%',
        background: color,
        pointerEvents: 'none',
        zIndex: '1000',
      });
      document.body.append(dot);
      const animation = dot.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px)` },
          { transform: `translate(${peak.x}px, ${peak.y}px)`, offset: 0.45 },
          { transform: `translate(${to.x}px, ${to.y}px) scale(0.4)` },
        ],
        {
          duration: motionMs(560),
          delay: motionMs(index * 45),
          easing: 'ease-in-out',
          fill: 'both',
        },
      );
      return animation.finished.catch(() => undefined).finally(() => dot.remove());
    });
    await Promise.all(flights);
    this.arrivals.update((value) => value + 1);
  }
}
