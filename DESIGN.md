---
name: Recipebook
description: A personal recipe collection with a quiet, readable interface.
colors:
  canvas: "#f0eee6"
  surface: "#faf9f5"
  ink: "#141413"
  muted: "#5e5d57"
  border: "#ceccc2"
  control-border: "#85847d"
  action: "#141413"
  accent: "#cbcbdc"
  beige: "#e3dacc"
  green: "#7d8d5f"
  blue: "#bbd0cb"
  danger: "#923f35"
  sage: "#c8cdb8"
  clay: "#d7b7a5"
  butter: "#e9dfb7"
  rose: "#e5c8c2"
  sky: "#c9d6e0"
  peach: "#edd0b9"
  mint: "#cfdbcc"
typography:
  display:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "clamp(2.35rem, 5vw, 4rem)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  recipe-title:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "1.55rem"
    fontWeight: 400
    lineHeight: 1.17
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    lineHeight: 1.55
  button:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "6px"
  surface: "14px"
  overlay: "8px"
spacing:
  page-gutter: "clamp(20px, 4vw, 48px)"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "13px 14px"
  navigation:
    textColor: "{colors.ink}"
    padding: "22px var(--page-gutter)"
  recipe-card:
    textColor: "{colors.ink}"
    width: "clamp(240px, 27vw, 340px)"
  food-doodle:
    textColor: "{colors.ink}"
    width: "160px"
---

# Recipebook design guide

Use the owner's Anthropic references: off-white surfaces, near-black text, thin rules, generous space and simple food line drawings. Keep labels short and factual. Body and controls use Arial/Helvetica; recipe titles use Georgia. No external font or animation package is needed.

## Layout and controls

The header and pages share a centered 1360px maximum width and `--page-gutter`. Forms use an 800px maximum. Mobile pages start with 20px top padding. Search and Add recipe share a row; focusing search condenses Add to its icon. Search fields share the green underline. Empty libraries show centered Create recipe, Import recipe and Import cookbook actions instead of the toolbar.

Primary controls are dark, secondary controls outlined, destructive controls use `--color-danger`. Keyboard focus hugs each element with a 2px outline; touch input suppresses the ring without affecting keyboard navigation. Use the shared SVG checkbox everywhere. Recipe step boxes show their number until checked; completion draws a restrained line over the text while keeping its reading position. Completed instruction rows always collapse.

## Recipe cards and carousel

Cards have a flush 4:3 photo over a padded color block within a 16px radius. Photo cards use a stable recipe-based choice of blue, clay, sage, lavender, beige or washed yellow. Missing-photo cards share the exact stable background choice with their food drawing. Card metadata shows total time when available. Titles never gain an underline on hover.

Desktop cards are 240–340px wide with 24px gaps. Titles use at most two visible lines and a full-name tooltip. Compact text areas contain categories and cooking time without reserving space for tags. Mobile cards are 78vw with 18px gaps and centered snapping. The homepage shelf fits the available portrait screen height with compact spacing, a shorter image, two-line titles and compact category labels. Keep 44px control targets and safe bottom space; allow overflow on unusually short screens or enlarged text rather than clipping content. Preserve native horizontal scrolling, mandatory snap and `scroll-snap-stop: always`. Edge masks soften clipped neighbors; blur/displacement are optional enhancements that never intercept input. Desktop arrow and keyboard navigation move by card; mobile uses swiping and the scrub indicator. One library-view button shows the icon for the destination view, Cards or List. Compact centered dots use fixed hit targets; only the inner marks expand with carousel position, hover and focus. Dragging across the strip scrubs the cards. Every dot represents one recipe, including the final desktop cards. Large collections show a sliding window of consecutive dots with smaller edge marks and a quiet position count. Dragging one dot-width moves one recipe; holding near an edge gradually speeds up browsing. Only nearby dots are rendered. Preserve taps, keyboard navigation and reduced motion.

## Motion

The wordmark is upright medium-weight sans-serif and stays still on hover. The settings icon tilts slightly, with no hover fill. Card links keep a stable hit area while their inner surfaces follow the mouse with frame-based smoothing, up to six degrees vertically and eight horizontally. Coalesce pointer events, stop rendering when settled and ease back to neutral on leave. Touch scrolling stays steady. Carousel arrows and the Shelf/List toggle have no border boxes; the library-view button swaps its destination icon. Desktop puts navigation arrows before the view toggle. Hover feedback uses quiet icon/text movement, opacity or border emphasis, never changing a box fill. Search uses only its green underline. List rows gently shift the title and chevron. Shared frosted popover menus replace platform-native category and servings dropdowns, with keyboard navigation, type-ahead, outside dismissal and an opaque fallback. The category trigger uses an underline for keyboard focus. Restrict hover effects to devices that support hover, with pointer tilt limited to a fine pointer.

Import feedback shows a stirring pot, independently rising steam and a recipe-sheet check. Import feedback follows the actual request, with a short readiness check before review opens and a visible Cancel control. On mobile the illustration fills the viewport with one randomly chosen muted palette color. No falling ingredients. The shared paper-and-bin illustration rests during confirmation, then animates only after deletion succeeds. A six-second Undo toast restores the original recipe in its original account, including its photo, groups and categories.

Reduced motion removes transitions, continuous loops and tilt, and makes carousel scrolling immediate. Feedback and completed states remain visible.

## Recipe review and overlays

Unsaved recipes reuse the saved recipe view. A compact floating action bar provides looks good!, cancel and edit. Approval alone saves to Dexie. Hide settings during review and editing. A shared native dialog protects discard and navigation; native browser warnings protect refresh and tab closing. Only floating controls, menus, dialogs and feedback use restrained shadows.

## Browsing, editing and cooking

Keep search and category selection, the Shelf/List view and reading position on the device, scoped to each account or device cookbook. Categories are managed from the library and chosen or created in the editor. Holding a recipe or right-clicking opens a frosted action menu for category changes, editing or deletion; Shift+F10 gives keyboard access. Menus restore trigger focus on dismissal. Settings contains Account, Backups and App only. Switching between Shelf and List keeps the page in place; returning from a recipe can restore the remembered list row.

Manual recipes open the editor first. Name, optional photo, default servings, ingredients and instructions come before optional details. Use growing text areas, a sticky action bar, minus controls on the left and draggable handles on the right, with keyboard arrow reordering and a compact Undo action for removed rows. Add sits after each group’s rows. Ingredient Enter adds the next row; instruction Enter keeps a newline in the current step. Pasted line-separated bullet or numbered lists create rows in either editor. Confirm navigation only when edits exist or work is still saving.

Recipe colors use an allowlisted palette. A chosen color is saved with the recipe and shared by its header, card, missing-photo doodle and slim list color strip. Automatic retains the existing stable recipe-based choice. The picker adds Rose, Sky, Peach and Mint alongside the original muted colors. Recipe pages always keep the photo and details at the top; the mobile layout puts the photo before the title. Category labels and the clock/time share their styles with recipe cards. The recipe color fills the overview area across the screen; the app header stays white. On mobile, everything below the browser-style tabs remains white, including recipe details, bottom spacing and draft padding. Desktop uses a floating white reading window surrounded by the recipe color. The active tab has rounded upper corners and rolls smoothly between sections with a brief stretch, starting from its current visible shape if interrupted. The sticky tab bar is opaque white with a fine bottom rule and short fade to separate it from scrolling text. Reading text remains at a readable 75ch maximum width. Recipe options at the top right use the shared frosted menu for Edit and Delete, including the existing confirmation and Undo. Keep screen on is a classic sliding toggle with an 8px track radius and a 5px thumb radius. Respect reduced motion. Switching tabs leaves the scroll position alone. A small Reset action beside Instructions clears only checked steps. Completed steps always collapse to one line. A servings picker scales explicit ingredient quantities from the original saved amounts, without changing the recipe. Recipe and editor serving pickers share a cream surface, thin control border, sans-serif labels and the existing downward chevron. Cards show up to three manually created category labels within a compact metadata area. Mobile section controls stay reachable. Remember checked steps, the selected section and servings locally. Reset clears instruction progress without editing the recipe or changing servings. Ignore outdated progress after steps change.

## Maintainability

Reuse semantic global colors and existing shared icons/components. Keep recipes, images, collections and offline storage intact. Avoid slogans, dense raised panels and decorative copy. Navigation must work independently of animation and glass effects.
