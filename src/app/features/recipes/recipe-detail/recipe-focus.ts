import { PageAppearanceService } from '../../../core/services/page-appearance.service';
import { FeedbackToastComponent } from '../../../shared/components/feedback-toast';
import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../../../shared/components/icon';
import { TranslatePipe } from '../../../core/i18n/i18n';

/** A landscape reading surface. CSS rotation also works in iPhone PWAs without orientation lock. */
@Component({
  selector: 'app-recipe-focus',
  imports: [IconComponent, FeedbackToastComponent, TranslatePipe],
  template: `
    <dialog
      #dialog
      class="recipe-focus"
      [attr.aria-label]="title()"
      (cancel)="$event.preventDefault(); close()"
      (close)="close()"
    >
      <div class="focus-landscape">
        <header>
          <button
            type="button"
            [attr.aria-label]="'Exit focus mode' | t"
            (click)="close()"
            autofocus
          >
            <app-icon name="close" />
          </button>
        </header>
        <ng-content />
        <app-feedback-toast />
      </div>
    </dialog>
  `,
  styleUrl: './recipe-focus.scss',
})
export class RecipeFocusComponent {
  readonly title = input.required<string>();
  readonly scrollPosition = input.required<{ left: number; top: number }>();
  readonly closed = output<void>();
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private restore?: () => void;
  private restoreBrowserColor?: () => void;
  private finished = false;

  constructor() {
    const surface =
      this.document
        .defaultView!.getComputedStyle(this.document.documentElement)
        .getPropertyValue('--color-surface')
        .trim() || '#faf9f5';
    this.restoreBrowserColor = inject(PageAppearanceService).useBrowserColor(surface);
    afterNextRender(() => {
      if (this.finished) return;
      const body = this.document.body;
      const win = this.document.defaultView!;
      const root = this.document.documentElement;
      const rootPrevious = ['overflow', 'scrollbar-gutter'].map(
        (name) =>
          [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)] as const,
      );
      const origin = this.document.activeElement;
      const { left: x, top: y } = this.scrollPosition();
      const properties = ['position', 'top', 'left', 'width', 'overflow'] as const;
      const previous = properties.map(
        (name) =>
          [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)] as const,
      );
      root.style.overflow = 'hidden';
      root.style.scrollbarGutter = 'auto';
      body.style.position = 'fixed';
      body.style.top = -y + 'px';
      body.style.left = -x + 'px';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      this.restore = () => {
        for (const [name, value, priority] of previous) {
          if (value) body.style.setProperty(name, value, priority);
          else body.style.removeProperty(name);
        }
        for (const [name, value, priority] of rootPrevious) {
          if (value) root.style.setProperty(name, value, priority);
          else root.style.removeProperty(name);
        }
        win.scrollTo({ left: x, top: y, behavior: 'instant' });
        if (origin instanceof HTMLElement && origin.isConnected)
          origin.focus({ preventScroll: true });
      };
      try {
        this.dialog().nativeElement.showModal();
      } catch {
        this.close();
      }
    });
    inject(DestroyRef).onDestroy(() => this.release());
  }

  close(): void {
    if (this.finished) return;
    this.finished = true;
    this.release();
    this.closed.emit();
  }

  private release(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
    const restore = this.restore;
    this.restore = undefined;
    restore?.();
    this.restoreBrowserColor?.();
    this.restoreBrowserColor = undefined;
  }
}
