# Food doodles

The shared `FoodDoodleComponent` supports `bowl`, `plate`, `pasta`, `toast`, `stew`, `roast`, `platter`, `shallow-bowl`, `casserole`, `soup`, `sandwich` and the animated `discard` illustration. Use a named kind when a screen needs a specific image:

```html
<app-food-doodle kind="roast" />
```

For a recipe without a photo, import `FoodPlaceholderComponent` and give it a stable identifier:

```html
<app-food-placeholder [seed]="recipe.id" />
```

Its parent supplies the dimensions. It selects one of the eleven food doodles and seven background tokens: beige, blue, green, accent (lavender), clay, butter and sage. The identifier is hashed with separate salts for the drawing and color, so sorting, filtering and reopening do not shuffle the artwork. No recipe fields or database writes are needed. Changing either selection array can change existing pairings.

The drawings are decorative and hidden from assistive technology; the surrounding recipe link or control supplies its accessible name. The existing bowl steam and discard animations remain separate from static placeholders.

Verified with a production build, desktop carousel inspection and a 390×844 mobile edit form. No packages or automated tests added.
