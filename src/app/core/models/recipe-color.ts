export const recipeColors = [
  { id: 'beige', label: 'Oat' },
  { id: 'blue', label: 'Sea glass' },
  { id: 'sage', label: 'Sage' },
  { id: 'accent', label: 'Lavender' },
  { id: 'clay', label: 'Clay' },
  { id: 'butter', label: 'Butter' },
  { id: 'green', label: 'Olive' },
  { id: 'rose', label: 'Rose' },
  { id: 'sky', label: 'Sky' },
  { id: 'peach', label: 'Peach' },
  { id: 'mint', label: 'Mint' },
] as const;
export type RecipeColor = (typeof recipeColors)[number]['id'];
export function isRecipeColor(value: unknown): value is RecipeColor {
  return recipeColors.some((color) => color.id === value);
}
function hash(seed: string): number {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function defaultRecipeColor(seed: string, photo = false): RecipeColor {
  const palette: readonly RecipeColor[] = photo
    ? ['blue', 'clay', 'sage', 'accent', 'beige', 'butter']
    : ['beige', 'blue', 'green', 'accent', 'clay', 'butter', 'sage'];
  return palette[hash((photo ? 'card:' : 'color:') + seed) % palette.length];
}
export function recipeBackground(recipe: {
  id: string;
  color?: RecipeColor;
  imageDataUrl?: string;
}): string {
  return (
    'var(--color-' +
    (isRecipeColor(recipe.color)
      ? recipe.color
      : defaultRecipeColor(recipe.id, !!recipe.imageDataUrl)) +
    ')'
  );
}
