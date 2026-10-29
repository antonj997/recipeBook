import { Service, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, type RouterStateSnapshot } from '@angular/router';
import { t } from './i18n';

/** Route titles are English keys; the tab shows them in the current language and follows changes. */
@Service()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly route = signal<string | undefined>(undefined);

  constructor() {
    super();
    effect(() => {
      const key = this.route();
      this.title.setTitle(key ? t(key) : 'Recipebook');
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.route.set(this.buildTitle(snapshot));
  }
}
