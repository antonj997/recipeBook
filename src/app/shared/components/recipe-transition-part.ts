import { afterRenderEffect, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { PageTurnService, type RecipeTransitionPart } from '../../core/services/page-turn.service';

/** Only the selected recipe's live elements receive shared snapshot names. */
@Directive({ selector: '[appRecipeTransition]' })
export class RecipeTransitionPartDirective {
  readonly appRecipeTransition = input.required<string>();
  readonly transitionPart = input.required<RecipeTransitionPart>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pageTurn = inject(PageTurnService);
  private unregister = () => {};

  constructor() {
    afterRenderEffect(() => {
      this.unregister();
      this.unregister = this.pageTurn.registerPart(
        this.element.nativeElement,
        this.appRecipeTransition(),
        this.transitionPart(),
      );
    });
    inject(DestroyRef).onDestroy(() => this.unregister());
  }
}
