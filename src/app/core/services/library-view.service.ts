import { inject, Service } from '@angular/core';
import { SupabaseService } from './supabase.service';

interface LibraryView {
  query: string;
  categoryId: string;
  view: 'shelf' | 'list';
  recipeId: string;
}
const emptyView: LibraryView = { query: '', categoryId: '', view: 'shelf', recipeId: '' };

// Navigation preferences stay on this device, separate from saved recipes.
@Service()
export class LibraryViewService {
  private auth = inject(SupabaseService);
  private views = new Map<string, LibraryView>();
  private get key(): string {
    return 'recipebook:library:' + this.auth.cacheScope + ':' + (this.auth.user()?.id ?? 'device');
  }
  read(): LibraryView {
    const cached = this.views.get(this.key);
    if (cached) return { ...cached };
    let view = { ...emptyView };
    try {
      const data: unknown = JSON.parse(localStorage.getItem(this.key) ?? 'null');
      if (data && typeof data === 'object') {
        const value = data as Record<string, unknown>;
        for (const field of ['query', 'categoryId', 'recipeId'] as const)
          if (typeof value[field] === 'string') view[field] = value[field].slice(0, 200);
        if (value['view'] === 'list') view.view = 'list';
      }
    } catch { /* Browsing also works when local storage is unavailable. */ }
    this.views.set(this.key, view);
    return { ...view };
  }
  write(changes: Partial<LibraryView>): void {
    const view = { ...this.read(), ...changes };
    this.views.set(this.key, view);
    try { localStorage.setItem(this.key, JSON.stringify(view)); } catch { /* Keep this session's place. */ }
  }
}
