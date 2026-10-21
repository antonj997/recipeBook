export interface RecipeCollection {
  id: string;
  name: string;
  sortOrder: number;
}

/** Compact labels share saved order across cards and list rows; deleted categories stay hidden. */
export function recipeCategoryNames(
  collectionIds: readonly string[] | undefined,
  names: ReadonlyMap<string, string>,
): string[] {
  return (collectionIds ?? [])
    .map((id) => names.get(id))
    .filter((name): name is string => !!name)
    .slice(0, 3);
}
