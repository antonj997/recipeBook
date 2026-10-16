import {
  afterRenderEffect,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import {
  PageTransitionService,
  type RecipeTransitionPart,
} from '../../core/services/page-transition.service';

const secondaryParts = new Set<RecipeTransitionPart>([
  'navigation',
  'description',
  'reading',
  'controls',
]);

/** Selected live elements share native snapshots. Incoming controls wait until they are visible. */
@Directive({
  selector: '[appRecipeTransition]',
  host: {
    '[attr.inert]': 'waiting() ? "" : null',
    '[attr.aria-hidden]': 'waiting() ? "true" : null',
  },
})
export class RecipeTransitionPartDirective {
  readonly appRecipeTransition = input.required<string>();
  readonly transitionPart = input.required<RecipeTransitionPart>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly transition = inject(PageTransitionService);
  protected readonly waiting = computed(
    () => this.transition.openingRecipe() && secondaryParts.has(this.transitionPart()),
  );
  private unregister = () => {};

  constructor() {
    afterRenderEffect(() => {
      this.unregister();
      this.unregister = this.transition.registerPart(
        this.element.nativeElement,
        this.appRecipeTransition(),
        this.transitionPart(),
      );
    });
    inject(DestroyRef).onDestroy(() => this.unregister());
  }
}
