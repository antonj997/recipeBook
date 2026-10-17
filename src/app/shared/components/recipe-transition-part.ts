import {
  afterRenderEffect,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  untracked,
} from '@angular/core';
import {
  PageTransitionService,
  isLiveRecipePart,
  type RecipeTransitionPart,
} from '../../core/services/page-transition.service';

/** Selected live elements share native snapshots. Incoming controls wait until they are visible. */
@Directive({
  selector: '[appRecipeTransition]',
  host: {
    '[class.recipe-part-live]': 'live()',
    '[class.recipe-part-reading]': 'transitionPart() === "reading"',
    '[class.recipe-part-waiting]': 'waiting()',
    '[attr.inert]': 'waiting() ? "" : null',
    '[attr.aria-hidden]': 'waiting() ? "true" : null',
  },
})
export class RecipeTransitionPartDirective {
  readonly appRecipeTransition = input.required<string>();
  readonly transitionPart = input.required<RecipeTransitionPart>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly transition = inject(PageTransitionService);
  protected readonly live = computed(
    () =>
      isLiveRecipePart(this.transitionPart()) ||
      ['card-description', 'time', 'categories'].includes(this.transitionPart()),
  );
  protected readonly waiting = computed(
    () =>
      (this.transition.openingRecipe() && this.transition.isLivePart(this.transitionPart())) ||
      (this.transition.closingRecipe() &&
        this.transition.isSharedRecipe(this.appRecipeTransition()) &&
        this.transitionPart() === 'card-description'),
  );
  private unregister = () => {};

  constructor() {
    afterRenderEffect(() => {
      this.unregister();
      const id = this.appRecipeTransition();
      const part = this.transitionPart();
      this.unregister = untracked(() =>
        this.transition.registerPart(this.element.nativeElement, id, part),
      );
    });
    inject(DestroyRef).onDestroy(() => this.unregister());
  }
}
