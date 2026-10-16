import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import type { Recipe } from '../../core/models/recipe.model';
import { RecipeActionsService } from '../../core/services/recipe-actions.service';

@Directive({
  selector: '[appRecipeContext]',
  host: {
    'aria-describedby': 'recipe-actions-hint',
    '(contextmenu)': 'context($event)',
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'finishHold()',
    '(pointercancel)': 'finishHold()',
    '(window:scroll)': 'cancel()',
    '(keydown)': 'key($event)',
  },
})
export class RecipeContextDirective {
  recipe = input.required<Recipe>({ alias: 'appRecipeContext' });
  private actions = inject(RecipeActionsService);
  private element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private timer?: ReturnType<typeof setTimeout>;
  private point?: { x: number; y: number; pointerId: number };
  private ignoreClickUntil = 0;
  private openedOnHold = false;
  constructor() {
    const click = (event: MouseEvent) => {
      if (Date.now() < this.ignoreClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.ignoreClickUntil = 0;
      }
    };
    this.element.addEventListener('click', click, true);
    inject(DestroyRef).onDestroy(() => {
      this.cancel();
      this.element.removeEventListener('click', click, true);
    });
  }
  start(event: PointerEvent): void {
    this.cancel();
    this.openedOnHold = false;
    this.ignoreClickUntil = 0;
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    this.point = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    this.timer = setTimeout(() => {
      this.openHold(event.clientX, event.clientY, event.pointerId);
      this.point = undefined;
    }, 500);
  }
  move(event: PointerEvent): void {
    if (this.point && Math.hypot(event.clientX - this.point.x, event.clientY - this.point.y) > 10)
      this.cancel();
  }
  finishHold(): void {
    if (this.openedOnHold) this.ignoreClickUntil = Date.now() + 1200;
    this.openedOnHold = false;
    this.cancel();
  }
  cancel(): void {
    clearTimeout(this.timer);
    this.point = undefined;
  }
  context(event: MouseEvent): void {
    event.preventDefault();
    if (this.openedOnHold && this.actions.menu()?.trigger === this.element) return;
    const pointer = event as PointerEvent;
    const pointerId =
      this.point?.pointerId ?? (pointer.pointerType === 'touch' ? pointer.pointerId : undefined);
    this.cancel();
    if (pointerId === undefined) this.open(event.clientX, event.clientY);
    else this.openHold(event.clientX, event.clientY, pointerId);
  }
  key(event: KeyboardEvent): void {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const r = this.element.getBoundingClientRect();
      this.open(r.left + 20, Math.min(r.bottom, innerHeight - 20));
    }
  }
  private openHold(x: number, y: number, pointerId: number): void {
    this.openedOnHold = true;
    this.ignoreClickUntil = Date.now() + 1200;
    this.open(x, y, pointerId);
  }
  private open(x: number, y: number, pointerId?: number): void {
    this.actions.open(this.recipe(), x, y, this.element, pointerId);
  }
}
