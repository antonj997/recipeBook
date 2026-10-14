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
  recipe-beige: "#EDE2D2"
  recipe-butter: "#F4E7BC"
  recipe-clay: "#F4DDC4"
  recipe-peach: "#F5DCD5"
  recipe-rose: "#EEDCE2"
  recipe-accent: "#E4DEED"
  recipe-sage: "#DCE4D5"
  recipe-green: "#E4E8C9"
  recipe-mint: "#D6E8DF"
  recipe-blue: "#D5E3E9"
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

## Recipe palette

Recipe backgrounds use ten light, low-saturation colors inspired by ingredients and quiet kitchen surfaces. Keep these fills separate from the darker green used for search underlines and switches. The same recipe token fills its card, page, tabs, list strip and missing-photo artwork.

| Color | Hex |
| --- | --- |
| Oat | `#EDE2D2` |
| Butter | `#F4E7BC` |
| Apricot | `#F4DDC4` |
| Peach | `#F5DCD5` |
| Rhubarb | `#EEDCE2` |
| Lavender | `#E4DEED` |
| Sage | `#DCE4D5` |
| Pistachio | `#E4E8C9` |
| Mint | `#D6E8DF` |
| Duck egg | `#D5E3E9` |

All ten provide at least 14:1 contrast with near-black text and 5:1 with secondary text. Color-picker swatches have a thin readable border. Existing Sky selections map visually to Duck egg while their saved IDs remain valid. Automatic chooses stably from all ten colors.

The direction adapts [Nikon's guidance to keep food backgrounds quiet](https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/tips-for-making-tempting-food-photos), [Benjamin Moore's warm and soft kitchen palette](https://www.benjaminmoore.com/en-us/paint-colors/kitchen), and [Pantone's gentle peach reference](https://www.pantone.com/na/en-us/color-of-the-year/2024). These hex colors were chosen for Recipebook and checked against [WCAG's text contrast criteria](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Layout and controls

The header and pages share a centered 1360px maximum width and `--page-gutter`. Forms use an 800px maximum. Mobile pages start with 20px top padding. Search and Add recipe share a row; focusing search condenses Add to its icon. Search fields share the green underline. Empty libraries show centered Create recipe, Import recipe and Import cookbook actions instead of the toolbar.

Primary controls are dark, secondary controls outlined, destructive controls use `--color-danger`. Keyboard focus hugs each element with a 2px outline; touch input suppresses the ring without affecting keyboard navigation. Use the shared SVG checkbox everywhere. Recipe step boxes show their number until checked; completion draws a restrained line over the text while keeping its reading position. Completed instruction rows always collapse.

## Recipe cards and carousel

Cards have a flush 4:3 photo over a padded color block within a 16px radius. Photo cards use a stable recipe-based choice from the ten recipe colors. Missing-photo cards share the exact stable background choice with their food drawing. Card metadata shows total time when available. Titles never gain an underline on hover.

Desktop cards are 240–340px wide with 24px gaps. Titles use at most two visible lines and a full-name tooltip. Compact text areas contain categories and cooking time without reserving space for tags. Mobile cards are 78vw with 18px gaps. Below 88rem, center the carousel snap points in portrait and landscape, with enough leading and trailing space to center the first and last items. Larger desktop shelves retain leading-edge snapping. The homepage shelf fits the available portrait screen height with compact spacing, a shorter image, two-line titles and compact category labels. When narrowing back into portrait, restore its document scroll to the top after layout and a short browser settling pass; retain the selected recipe or add tile while remeasuring snap positions. Height-only keyboard changes and list view keep their normal scrolling. Cancel deferred resets on navigation. Keep 44px control targets and safe bottom space; allow overflow on unusually short screens or enlarged text rather than clipping content. Preserve native horizontal scrolling, mandatory snap and `scroll-snap-stop: always`. Edge masks soften clipped neighbors; blur/displacement are optional enhancements that never intercept input. Desktop arrow and keyboard navigation move by card; mobile uses swiping and the scrub indicator. One library-view button shows the icon for the destination view, Cards or List. Compact centered dots use fixed hit targets; only the inner marks expand with carousel position, hover and focus. Dragging across the strip scrubs the cards. Every dot represents one recipe, including the final desktop cards. Append a transparent dotted-outline Add recipe tile to the shelf and a matching row to list view. They open the same native add menu anchored to the pressed control, with Write a recipe and Import from a link. Keep them outside recipe counts and indicator stops; arrow and rail-keyboard navigation can reach the tile. Large collections show a sliding window of consecutive dots with smaller edge marks and a quiet position count. Dragging one dot-width moves one recipe; holding near an edge gradually speeds up browsing. Only nearby dots are rendered. Preserve taps, keyboard navigation and reduced motion.

## Motion

Page navigation uses a 550ms lower-right corner curl with a gentle lift, quicker middle and soft landing. The crease travels diagonally across the sheet. Preserve the outgoing native snapshot, including its cards, controls, text and photos, until the crease lifts it away; a complementary mask reveals the destination behind it. The cream underside and cast shadow follow the same geometry. Keep native transition images free of SVG reference filters, which can suppress captured content in browsers. Keep the destination opaque and stationary underneath, with the header on a separate steady layer. Use a bounded animation-frame loop after snapshots are ready; remove all temporary geometry, listeners and frames when completed, interrupted, resized, hidden or switching accounts. Reverse the curl for returning navigation. Pointer or keyboard input can finish a turn immediately. Skip first load, same-page URL changes and reduced-motion navigation. Browsers without View Transitions and native back gestures retain normal navigation. Never clone recipe DOM, capture content with a third-party screenshot service or intercept scrolling. Tabs and menus keep their existing motion.

The wordmark is upright medium-weight sans-serif and stays still on hover. The settings icon tilts slightly, with no hover fill. Card links keep a stable hit area while their inner surfaces follow the mouse with frame-based smoothing, up to six degrees vertically and eight horizontally. Coalesce pointer events, stop rendering when settled and ease back to neutral on leave. Touch scrolling stays steady. Carousel arrows and the Shelf/List toggle have no border boxes; the library-view button swaps its destination icon. Desktop puts navigation arrows before the view toggle. Hover feedback uses quiet icon/text movement, opacity or border emphasis, never changing a box fill. Search uses only its green underline. List rows gently shift the title and chevron. Shared frosted popover menus replace platform-native category and servings dropdowns, with keyboard navigation, type-ahead, outside dismissal and an opaque fallback. The category trigger uses an underline for keyboard focus. Restrict hover effects to devices that support hover, with pointer tilt limited to a fine pointer.

Import feedback shows a stirring pot, independently rising steam and a recipe-sheet check. Import feedback follows the actual request, with a short readiness check before review opens and a visible Cancel control. On mobile the illustration fills the viewport with one randomly chosen muted palette color. No falling ingredients. The shared paper-and-bin illustration rests during confirmation, then animates only after deletion succeeds. A six-second Undo toast restores the original recipe in its original account, including its photo, groups and categories.

Reduced motion removes transitions, continuous loops and tilt, and makes carousel scrolling immediate. Feedback and completed states remain visible.

## Recipe review and overlays

Unsaved recipes reuse the saved recipe view. A compact floating action bar provides looks good!, cancel and edit. Approval alone saves to Dexie. Hide settings during review and editing. A shared native dialog protects discard and navigation; native browser warnings protect refresh and tab closing. Only floating controls, menus, dialogs and feedback use restrained shadows.

## Browsing, editing and cooking

Keep search and category selection, the Shelf/List view and reading position on the device, scoped to each account or device cookbook. Categories are managed from the library and chosen or created in the editor. Holding a recipe or right-clicking opens a frosted action menu for category changes, editing or deletion; Shift+F10 gives keyboard access. Menus restore trigger focus on dismissal. Settings contains Account, Backups and App only. Switching between Shelf and List keeps the page in place; returning from a recipe can restore the remembered list row.

Manual recipes open the editor first. Name, optional photo, default servings, ingredients and instructions come before optional details. Use growing text areas, a sticky action bar, minus controls on the left and draggable handles on the right, with keyboard arrow reordering and a compact Undo action for removed rows. Add sits after each group’s rows. Ingredient Enter adds the next row; instruction Enter keeps a newline in the current step. Pasted line-separated bullet or numbered lists create rows in either editor. Confirm navigation only when edits exist or work is still saving.

Recipe colors use an allowlisted palette. A chosen color is saved with the recipe and shared by its header, card, missing-photo doodle and slim list color strip. Automatic retains the existing stable recipe-based choice. The picker offers the ten light recipe colors listed above. Recipe pages always keep the photo and details at the top; the mobile layout puts the photo before the title. Category labels and the clock/time share their styles with recipe cards. The recipe color fills the overview area across the screen; the app header starts off-white. The wordmark/settings header stays sticky and includes the device safe-area padding within its own surface, with no extra white strip. Recipe tabs stick directly below the measured header height. Observe header resizing so enlarged text, orientation and safe-area changes never cause overlap. At the top, the header is opaque white. After scrolling 80px it compacts to a 45px control row plus the actual safe-area inset, with no vertical padding and 44px tap targets. Animate top/bottom padding and wordmark scale together over 420ms with a gentle ease-in-out curve; the solid off-white fill fades to the active recipe color over 420ms with ease-in timing. Keep the 1px divider visible while scrolled, tinted from 86% recipe color and 14% ink so it is slightly darker than the header. The same opaque surface covers the header and its safe area together. Synchronize the browser theme color with the fade in a bounded frame loop; other pages retain off-white. Keep the header free of backdrop blur or transparency. Expand again within 8px of the top so shrinking document height cannot make it flicker. Observe the full border box, including animated padding, and measure its height at subpixel precision so tabs follow its edge. Reduced motion removes the transitions while keeping the compact state and browser theme synchronized. The operating system controls the native status-bar treatment, which requires an iPhone check. On mobile, everything below the browser-style tabs remains white, including recipe details, bottom spacing and draft padding. Recipe backgrounds and the app header span the viewport; apply horizontal safe-area insets to the content and controls rather than narrowing the whole shell. Below 40rem, keep the sticky browser-style tabs and a single panel. From 40rem, hide the tabs and show Ingredients and Instructions as labelled columns, with more space for the instructions and a fine vertical divider. Preserve the selected compact tab, servings and progress across size changes. Through tablet widths the white reading surface is full width. From 88rem, center a 75rem white reading window with recipe-colored side gutters; align its introduction and header controls to the same measure. Choose these breakpoints for readable content, without detecting device models. The unselected browser-style tab and the area above and beside the tabs use the exact recipe detail color. The active white tab has 10px upper corners and concave 12px joins that flare outward into the white reading surface. Keep compact 44px targets. Use near-black tab labels so every recipe color remains readable. The white active tab slides with a restrained stretch over 280ms, starting from its current visible shape if interrupted. The sticky tab bar is opaque in the recipe color, with a fine bottom rule and a short white-to-transparent fade beneath it so scrolling text recedes gently; only the active tab and reading content beneath it remain white. Reading text remains at a readable 75ch maximum width. Recipe options at the top right use the shared frosted menu for Edit and Delete, including the existing confirmation and Undo. Keep screen on is a classic sliding toggle with an 8px track radius and a 5px thumb radius. Respect reduced motion. Switching tabs leaves the scroll position alone. On compact screens the tabs label each panel without repeated Ingredients or Instructions headings. In the two-column layout, show section headings and expose both panels as labelled regions. Keep ingredient servings in a compact row and instruction progress beside a small Reset action that clears only checked steps. Keep named ingredient groups and instruction sections. Completed steps always collapse to one line. A servings picker scales explicit ingredient quantities from the original saved amounts, without changing the recipe. Recipe and editor serving pickers share a cream surface, thin control border, sans-serif labels and the existing downward chevron. They support pressing and dragging through the open menu: highlight and preview the portion count, commit on release over a number, and cancel on release outside. Tapping and keyboard selection remain available. Other dropdowns retain their existing behavior. Cards show up to three manually created category labels within a compact metadata area. Mobile section controls stay reachable. Remember checked steps, the selected section and servings locally. Reset clears instruction progress without editing the recipe or changing servings. Ignore outdated progress after steps change.

## Maintainability

Reuse semantic global colors and existing shared icons/components. Keep recipes, images, collections and offline storage intact. Avoid slogans, dense raised panels and decorative copy. Navigation must work independently of animation and glass effects.
