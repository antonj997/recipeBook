import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CloudCookbookService } from '../../core/services/cloud-cookbook.service';
import { IconComponent } from '../../shared/components/icon';
import { CategoryManagerComponent } from '../settings/category-manager';

@Component({
  selector: 'app-categories',
  imports: [RouterLink, IconComponent, CategoryManagerComponent],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class CategoriesComponent {
  readonly auth = inject(CloudCookbookService).auth;
  private readonly manager = viewChild(CategoryManagerComponent);
  canLeave(): boolean | Promise<boolean> {
    return this.manager()?.canLeave() ?? true;
  }
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.manager()?.dirty() || this.manager()?.busy()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
