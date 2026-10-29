import type { Routes } from '@angular/router';
import { resolveLibraryPage, resolveRecipePage } from './core/services/recipe-page-resolvers';
import { confirmBeforeLeaving } from './core/services/leave-confirmation.service';
import { msg } from './core/i18n/i18n';

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
    title: msg('My Recipes'),
    resolve: { libraryPage: resolveLibraryPage },
    pathMatch: 'full',
  },
  {
    path: 'recipes/new/edit',
    loadComponent: form,
    title: msg('Edit draft'),
    data: editing,
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'recipes/new',
    loadComponent: detail,
    title: msg('Review recipe'),
    data: { ...editing, draft: true },
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'recipes/import',
    loadComponent: () =>
      import('./features/recipes/recipe-import/recipe-import').then((m) => m.RecipeImportComponent),
    title: msg('Import Recipe'),
  },
  {
    path: 'recipes/:id/edit',
    loadComponent: form,
    title: msg('Edit Recipe'),
    data: editing,
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'recipes/:id',
    loadComponent: detail,
    title: msg('Recipe Details'),
    resolve: { recipePage: resolveRecipePage },
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./features/categories/categories').then((m) => m.CategoriesComponent),
    title: msg('Categories'),
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'shopping-list',
    loadComponent: () =>
      import('./features/shopping-list/shopping-list').then((m) => m.ShoppingListComponent),
    title: msg('Shopping list'),
    canDeactivate: [confirmBeforeLeaving],
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsComponent),
    title: msg('Settings'),
  },
  { path: '**', redirectTo: '' },
];
