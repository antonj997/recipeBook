import type { RecipeMetadata } from './recipe-metadata';

export interface Recipe extends RecipeMetadata {
  id: string;

  title: string;
  imageDataUrl?: string;

  servings?: number;

  ingredients: string[];
  instructions: string[];

  collectionIds?: string[];
  notes?: string;

  sourceUrl?: string;

  createdAt?: string;
  updatedAt?: string;
}
