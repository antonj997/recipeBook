export type TagGroup = 'dietary' | 'main-ingredient' | 'meal' | 'cuisine';

export interface RecipeTag {
  id: string;
  label: string;
  group: TagGroup;
}

export const RECIPE_TAGS: readonly RecipeTag[] = [
  // Dietary
  { id: 'vegetarian', label: 'Vegetarian', group: 'dietary' },
  { id: 'vegan', label: 'Vegan', group: 'dietary' },
  { id: 'gluten-free', label: 'Gluten-free', group: 'dietary' },
  { id: 'dairy-free', label: 'Dairy-free', group: 'dietary' },

  // Main ingredient
  { id: 'meat', label: 'Meat', group: 'main-ingredient' },
  { id: 'chicken', label: 'Chicken', group: 'main-ingredient' },
  { id: 'beef', label: 'Beef', group: 'main-ingredient' },
  { id: 'pork', label: 'Pork', group: 'main-ingredient' },
  { id: 'fish', label: 'Fish', group: 'main-ingredient' },
  { id: 'seafood', label: 'Seafood', group: 'main-ingredient' },
  { id: 'vegetables', label: 'Vegetables', group: 'main-ingredient' },

  // Meal type
  { id: 'breakfast', label: 'Breakfast', group: 'meal' },
  { id: 'lunch', label: 'Lunch', group: 'meal' },
  { id: 'dinner', label: 'Dinner', group: 'meal' },
  { id: 'dessert', label: 'Dessert', group: 'meal' },
  { id: 'snack', label: 'Snack', group: 'meal' },

  // Cuisine
  { id: 'italian', label: 'Italian', group: 'cuisine' },
  { id: 'swedish', label: 'Swedish', group: 'cuisine' },
  { id: 'mexican', label: 'Mexican', group: 'cuisine' },
  { id: 'indian', label: 'Indian', group: 'cuisine' },
  { id: 'japanese', label: 'Japanese', group: 'cuisine' },
];
