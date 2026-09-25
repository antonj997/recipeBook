import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { IconComponent } from './shared/components/icon';
import { FeedbackService } from './core/services/feedback.service';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  selector: 'app-root',
  host: {
    '[class.touch-input]': 'touchInput()',
    '(document:pointerdown)': 'onPointerDown($event)',
    '(document:keydown)': 'onNavigationKey($event)',
  },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly touchInput = signal(false);

  protected onPointerDown(event: PointerEvent): void {
    this.touchInput.set(event.pointerType === 'touch' || event.pointerType === 'pen');
  }

  protected onNavigationKey(event: KeyboardEvent): void {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
      this.touchInput.set(false);
    }
  }

  readonly feedback = inject(FeedbackService);
  protected readonly title = signal('recipiebook');
}
