import type { RecipeMetadata } from './recipe-metadata';

export interface Recipe extends RecipeMetadata {
  id: string;

  title: string;
  /** Id of the cover photo in the device image store. */
  photoId?: string;
  /** Cover photo of drafts, backups and records saved before the image store. */
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
