import type { Routes } from '@angular/router';
import { confirmBeforeLeaving } from './core/services/leave-confirmation.service';

const detail = () =>
  import('./features/recipes/recipe-detail/recipe-detail').then((m) => m.RecipeDetailComponent);
const form = () =>
  import('./features/recipes/recipe-form/recipe-form').then((m) => m.RecipeFormComponent);
const editing = { hideSettings: true };

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/recipes/recipe-list/recipe-list').then((m) => m.RecipeListComponent),
    title: 'My Recipes',
    pathMatch: 'full',
  },
  {
    path: 'recipes/new/edit',
    loadComponent: form,
    title: 'Edit draft',
    data: editing,
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'recipes/new',
    loadComponent: detail,
    title: 'Review recipe',
    data: { ...editing, draft: true },
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'recipes/import',
    loadComponent: () =>
      import('./features/recipes/recipe-import/recipe-import').then((m) => m.RecipeImportComponent),
    title: 'Import Recipe',
  },
  {
    path: 'recipes/:id/edit',
    loadComponent: form,
    title: 'Edit Recipe',
    data: editing,
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'recipes/:id',
    loadComponent: detail,
    title: 'Recipe Details',
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsComponent),
    title: 'Settings',
  },
  { path: '**', redirectTo: '' },
];
