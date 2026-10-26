import { Component, inject, input } from '@angular/core';
import { FeedbackService } from '../../core/services/feedback.service';
import { IconComponent } from './icon';

/** The same feedback presentation for the app shell and top-layer cooking focus. */
@Component({
  selector: 'app-feedback-toast',
  imports: [IconComponent],
  templateUrl: './feedback-toast.html',
  styleUrl: './feedback-toast.scss',
})
export class FeedbackToastComponent {
  readonly feedback = inject(FeedbackService);
  readonly editing = input(false);
}
