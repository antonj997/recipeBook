import { Routes } from '@angular/router';

import { RecipeListComponent } from './features/recipes/recipe-list/recipe-list';
import { RecipeDetailComponent } from './features/recipes/recipe-detail/recipe-detail';
import { RecipeFormComponent } from './features/recipes/recipe-form/recipe-form';
import { SettingsComponent } from './features/settings/settings';
import { RecipeImportComponent } from './features/recipes/recipe-import/recipe-import';

export const routes: Routes = [
  {
    path: '',
    component: RecipeListComponent,
    title: 'My Recipes',
  },
  {
    path: 'recipes/new',
    component: RecipeFormComponent,
    title: 'Add Recipe',
  },
  {
    path: 'recipes/import',
    component: RecipeImportComponent,
    title: 'Import Recipe',
  },
  {
    path: 'recipes/:id/edit',
    component: RecipeFormComponent,
    title: 'Edit Recipe',
  },
  {
    path: 'recipes/:id',
    component: RecipeDetailComponent,
    title: 'Recipe Details',
  },
  {
    path: 'settings',
    component: SettingsComponent,
    title: 'Settings',
  },
];
