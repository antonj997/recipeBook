export const recipeColors = [
  { id: 'beige', label: 'Oat' },
  { id: 'butter', label: 'Butter' },
  { id: 'clay', label: 'Apricot' },
  { id: 'peach', label: 'Peach' },
  { id: 'rose', label: 'Rhubarb' },
  { id: 'accent', label: 'Lavender' },
  { id: 'sage', label: 'Sage' },
  { id: 'green', label: 'Pistachio' },
  { id: 'mint', label: 'Mint' },
  { id: 'blue', label: 'Duck egg' },
] as const;
// Keep older Sky choices valid in local storage, cloud records and backups.
export type RecipeColor = (typeof recipeColors)[number]['id'] | 'sky';
export function isRecipeColor(value: unknown): value is RecipeColor {
  return value === 'sky' || recipeColors.some((color) => color.id === value);
}
export function recipeColorBackground(color: RecipeColor): string {
  return 'var(--recipe-color-' + (color === 'sky' ? 'blue' : color) + ')';
}
function hash(seed: string): number {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function defaultRecipeColor(seed: string, photo = false): RecipeColor {
  return recipeColors[hash((photo ? 'card:' : 'color:') + seed) % recipeColors.length].id;
}
export function recipeBackground(recipe: {
  id: string;
  color?: RecipeColor;
  imageDataUrl?: string;
}): string {
  return recipeColorBackground(
    isRecipeColor(recipe.color)
      ? recipe.color
      : defaultRecipeColor(recipe.id, !!recipe.imageDataUrl),
  );
}
