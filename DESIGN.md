---
name: Recipebook
description: A personal recipe collection with a quiet, readable interface.
colors:
  canvas: '#f0eee6'
  surface: '#faf9f5'
  ink: '#141413'
  muted: '#5e5d57'
  border: '#ceccc2'
  control-border: '#85847d'
  action: '#141413'
  accent: '#cbcbdc'
  beige: '#e3dacc'
  green: '#7d8d5f'
  blue: '#bbd0cb'
  danger: '#923f35'
  sage: '#c8cdb8'
  clay: '#d7b7a5'
  butter: '#e9dfb7'
  rose: '#e5c8c2'
  sky: '#c9d6e0'
  peach: '#edd0b9'
  mint: '#cfdbcc'
  recipe-beige: '#EDE2D2'
  recipe-butter: '#F4E7BC'
  recipe-clay: '#F4DDC4'
  recipe-peach: '#F5DCD5'
  recipe-rose: '#EEDCE2'
  recipe-accent: '#E4DEED'
  recipe-sage: '#DCE4D5'
  recipe-green: '#E4E8C9'
  recipe-mint: '#D6E8DF'
  recipe-blue: '#D5E3E9'
typography:
  display:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: 'clamp(2.35rem, 5vw, 4rem)'
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: '-0.04em'
  headline:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '1.45rem'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '-0.025em'
  recipe-title:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: '1.55rem'
    fontWeight: 400
    lineHeight: 1.17
    letterSpacing: '-0.02em'
  body:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '16px'
    lineHeight: 1.55
  button:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '0.9rem'
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: '6px'
  surface: '14px'
  overlay: '8px'
spacing:
  page-gutter: 'clamp(20px, 4vw, 48px)'
components:
  button-primary:
    backgroundColor: '{colors.action}'
    textColor: '{colors.surface}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '11px 18px'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '11px 18px'
  button-danger:
    backgroundColor: 'transparent'
    textColor: '{colors.danger}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '11px 18px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '13px 14px'
  navigation:
    textColor: '{colors.ink}'
    padding: '22px var(--page-gutter)'
  recipe-card:
    textColor: '{colors.ink}'
    width: 'clamp(240px, 27vw, 340px)'
  food-doodle:
    textColor: '{colors.ink}'
    width: '160px'
---

# Recipebook design guide

Use the owner's Anthropic references: off-white surfaces, near-black text, thin rules, generous space and simple food line drawings. Keep labels short and factual. Body and controls use Arial/Helvetica; recipe titles use Georgia. No external font or animation package is needed.

## Recipe palette

Recipe backgrounds use ten light, low-saturation colors inspired by ingredients and quiet kitchen surfaces. Keep these fills separate from the darker green used for search underlines and switches. The same recipe token fills its card, page, tabs, list strip and missing-photo artwork.

| Color     | Hex       |
| --------- | --------- |
| Oat       | `#EDE2D2` |
| Butter    | `#F4E7BC` |
| Apricot   | `#F4DDC4` |
| Peach     | `#F5DCD5` |
| Rhubarb   | `#EEDCE2` |
| Lavender  | `#E4DEED` |
| Sage      | `#DCE4D5` |
| Pistachio | `#E4E8C9` |
| Mint      | `#D6E8DF` |
| Duck egg  | `#D5E3E9` |

All ten provide at least 14:1 contrast with near-black text and 5:1 with secondary text. Color-picker swatches have a thin readable border. Existing Sky selections map visually to Duck egg while their saved IDs remain valid. Automatic chooses stably from all ten colors.

The direction adapts [Nikon's guidance to keep food backgrounds quiet](https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/tips-for-making-tempting-food-photos), [Benjamin Moore's warm and soft kitchen palette](https://www.benjaminmoore.com/en-us/paint-colors/kitchen), and [Pantone's gentle peach reference](https://www.pantone.com/na/en-us/color-of-the-year/2024). These hex colors were chosen for Recipebook and checked against [WCAG's text contrast criteria](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

The app icon uses a direct vector trace of the supplied two-part R/book silhouette: a narrow left binding, a broad rounded upper page and a sweeping lower page with clear negative space. Keep it flat and monochrome. Use the cream mark on off-black for installed app icons, the black mark beside the header wordmark, and an adaptive black/cream SVG favicon. The white, cream and black marks share identical vector geometry. Standard PWA, maskable and Apple touch exports use the same silhouette. Keep the reference’s original spacing in the app tile. Fingerprinted asset URLs prevent an earlier logo from being reused after an update. Never replace this artwork with a font glyph.

## Layout and controls

The header and pages share a centered 1360px maximum width and `--page-gutter`. Home search fills the available space up to Add recipe. On large recipe screens, the photo/summary bounds and the floating reading surface share the same outer edges. Nutrition spans the full inner width of both reading columns. Forms use an 800px maximum. Mobile pages start with 20px top padding. Search and Add recipe share a row; focusing search condenses Add to its icon. Search fields share the green underline. Empty libraries show centered Create recipe, Import recipe and Import cookbook actions instead of the toolbar.

Primary controls are dark, secondary controls outlined, destructive controls use `--color-danger`. Keyboard focus hugs each element with a 2px outline; touch input suppresses the ring without affecting keyboard navigation. Use the shared SVG checkbox everywhere. Recipe step boxes show their number until checked; completion draws a restrained line over the text while keeping its reading position. Completed instruction rows always collapse.

## Recipe cards and carousel

Cards have a flush 4:3 photo over a padded color block within a 16px radius and a fine outline tinted from the recipe color. Photo cards use a stable recipe-based choice from the ten recipe colors. Missing-photo cards share the exact stable background choice with their food drawing. Card metadata shows total time when available. Titles never gain an underline on hover.

Desktop cards are 240–340px wide with 24px gaps. Titles wrap fully and take priority over descriptions. Compact cards measure the title, categories and footer to keep them visible even on short screens. Descriptions fill the remaining clipped space and fade at its lower edge, with no fixed three-line reservation. Compact text areas contain categories and a bottom row with cooking time left and available energy in kcal per portion right. Mobile cards are 78vw with 18px gaps. Below 88rem, center the carousel snap points in portrait and landscape, with enough leading and trailing space to center the first and last items. Larger desktop shelves retain leading-edge snapping. The homepage shelf distributes the available portrait screen height into breathing room above the heading, card content and carousel indicator; retain a shorter image, complete titles and compact category labels. Reduce this spacing on short screens. When narrowing back into portrait, restore its document scroll to the top after layout and a short browser settling pass; retain the selected recipe or add tile while remeasuring snap positions. Height-only keyboard changes and list view keep their normal scrolling. Cancel deferred resets on navigation. Keep 44px control targets and safe bottom space; allow overflow on unusually short screens or enlarged text rather than clipping content. Preserve native horizontal scrolling, mandatory snap and `scroll-snap-stop: always`. Edge masks soften clipped neighbors; blur/displacement are optional enhancements that never intercept input. Desktop arrow and keyboard navigation move by card; mobile uses swiping and the scrub indicator. One library-view button shows the icon for the destination view, Cards or List. Compact centered dots use fixed hit targets; only the inner marks expand with carousel position, hover and focus. Dragging across the strip scrubs the cards. Every dot represents one recipe, including the final desktop cards. Append a transparent dotted-outline Add recipe tile to the shelf and a matching row to list view. They open the same native add menu anchored to the pressed control, with Write a recipe and Import from a link. Keep them outside recipe counts and indicator stops; arrow and rail-keyboard navigation can reach the tile. Large collections show a sliding window of consecutive dots with smaller edge marks and a quiet position count. Dragging one dot-width moves one recipe; holding near an edge gradually speeds up browsing. Only nearby dots are rendered. Preserve taps, keyboard navigation and reduced motion.

## Motion

Page navigation uses one shared-recipe expansion. The old lower-right page curl and its mode selector are removed from the running app; the original implementation is preserved in the local page-curl archive and Git history.

Expand connects only the selected recipe’s surface, photo, title, categories and cooking time between the shelf/list and recipe overview. The recipe colour opens from the selected card while the surrounding homepage stays stationary. The list colour first fills its row from right to left over 160ms, then expands over 430ms. Shared geometry moves over 430ms with a decelerating curve. Reverse it into the restored card/row when returning, retaining the exact library and carousel positions. Missing-photo recipes connect their surface and title.

Keep the captured source photo visible until the destination photo has decoded and had a paint frame. Pause only running native transition animations during that short preparation, with bounded waiting and cancellation cleanup. Use one flat recipe-color backing for card and list returns, and keep the extracted parent snapshot recipe-colored so independently named sections cannot expose white gaps. This backing exists only during navigation; the resting recipe layout remains unchanged.

Keep navigation, descriptions, reading content and controls in separate native layers. The outgoing description fades within 65ms. On entry the secondary layers wait until the geometry has landed, then fade over 160ms; the reading surface and tabs arrive together over 180ms from 18px below. Incoming controls remain inert until visible. On return, immediately hide recipe-only content. One transition-part directive owns that temporary interaction state; the screen-awake component only handles its toggle and browser lock.

Visible title words use native shared geometry where supported, retaining a whole-title fallback for older browsers. Preserve fractional measurements, original font proportions, clipping and corner radii throughout the flight. Never apply an image radius that disappears at landing. Do not name clipped words or duplicate snapshot names. Batch the source geometry measurements and each title’s word bounds before their temporary-style writes. Keep the shared header steady; other routes retain a quiet 260ms scale/fade arrival.

One controller owns each navigation’s names, geometry and listeners. A skipped transition still updates the route: retain its styles until the browser’s finished promise settles. Replacement navigation takes ownership atomically, and callbacks from the previous transition cannot clear its successor. Pointer or keyboard input skips native snapshots; skipping retains transition state until the browser finishes its route update. Native hit-testing can keep that first click targeted at the document even after the skip. A small input helper recovers only trusted primary clicks within the two persistent header links, reusing their existing RouterLink guards. It leaves normal, keyboard, modified, hidden and unrelated clicks untouched. Resize, hidden-document and account changes can skip it safely. Resolve local recipe data before capture; never delay navigation for network sync or imports. Native back gestures, unsupported browsers and reduced motion retain normal navigation. Never clone recipe DOM or send snapshots to another service.

The wordmark is upright medium-weight sans-serif and stays still on hover. The settings icon tilts slightly, with no hover fill. Card links keep a stable hit area while their inner surfaces follow the mouse with frame-based smoothing, up to six degrees vertically and eight horizontally. Coalesce pointer events, stop rendering when settled and ease back to neutral on leave. Touch scrolling stays steady. Carousel arrows and the Shelf/List toggle have no border boxes; the library-view button swaps its destination icon. Desktop puts navigation arrows before the view toggle. Hover feedback uses quiet icon-stroke, text-weight, opacity or border emphasis, never lifting controls, moving labels or changing a box fill. Search uses only its green underline. List rows keep their title and geometry still; an extra inner border fades in on hover. Recipe cards and list rows keep full opacity on press, thicken their tinted border inward without shifting content, and scale to 98.5% over 140ms. The shelf surface scales independently of its desktop tilt, retaining a stable link hit area. Reduced motion keeps the thicker border without scaling. Controls use a slightly heavier icon stroke, quiet text emphasis and pressed opacity, with no lift or shrink. The view toggle and menu options follow the same rule. Shared frosted popover menus replace platform-native category and servings dropdowns, with keyboard navigation, type-ahead, outside dismissal and an opaque fallback. The category trigger uses an underline for keyboard focus. Restrict hover effects to devices that support hover, with pointer tilt limited to a fine pointer.

Import feedback shows a stirring pot, independently rising steam and a recipe-sheet check. Import feedback follows the actual request, with a short readiness check before review opens and a visible Cancel control. On mobile the illustration fills the viewport with one randomly chosen muted palette color. No falling ingredients. The shared paper-and-bin illustration rests during confirmation, then animates only after deletion succeeds. A six-second Undo toast restores the original recipe in its original account, including its photo, groups and categories.

Reduced motion removes transitions, continuous loops and tilt, and makes carousel scrolling immediate. Feedback and completed states remain visible.

## Recipe review and overlays

Unsaved recipes reuse the saved recipe view. A compact floating action bar provides looks good!, cancel and edit. Approval alone saves to Dexie. Hide settings during review and editing. A shared native dialog protects discard and navigation; native browser warnings protect refresh and tab closing. Only floating controls, menus, dialogs and feedback use restrained shadows.

## Browsing, editing and cooking

Keep search and category selection, the Shelf/List view and reading position on the device, scoped to each account or device cookbook. Categories are managed from the library and chosen or created in the editor. Holding a recipe or right-clicking opens a frosted action menu for category changes, editing or deletion; Shift+F10 gives keyboard access. Menus restore trigger focus on dismissal. Settings contains Account, Backups and App only. Switching between Shelf and List keeps the page in place; returning from a recipe restores the exact homepage scroll offset, with the existing selected carousel card kept separately. List recipes are horizontal cards with the recipe color and the same tinted outline as carousel cards: a flush image on the left, a title of at most three visible lines on the colored surface, and cooking time aligned to the last visible title baseline. All recipe rows are 128px tall; show the complete title in its tooltip and accessible link text. Search-to-heading spacing is shared by both library views.

Manual recipes open the editor first. Name, optional photo, default servings, ingredients and instructions come before optional details. Use growing text areas, a sticky action bar, minus controls on the left and draggable handles on the right, with keyboard arrow reordering and a compact Undo action for removed rows. Add sits after each group’s rows. Ingredient Enter adds the next row; instruction Enter keeps a newline in the current step. Pasted line-separated bullet or numbered lists create rows in either editor. Confirm navigation only when edits exist or work is still saving.

Recipe colors use an allowlisted palette. A chosen color is saved with the recipe and shared by its header, card, missing-photo doodle and horizontal list card. Automatic retains the existing stable recipe-based choice. The picker offers the ten light recipe colors listed above. Recipe pages always keep the photo and details at the top; the mobile layout puts the photo before the title. Category labels and the clock/time share their styles with recipe cards. The recipe color fills the overview area across the screen; the app header starts off-white. The wordmark/settings header stays sticky and includes the device safe-area padding within its own surface, with no extra white strip. Recipe tabs stick directly below the measured header height. Observe header resizing so enlarged text, orientation and safe-area changes never cause overlap. At the top, the header is opaque white. After scrolling 80px it compacts to a 45px control row plus the actual safe-area inset, with no vertical padding and 44px tap targets. Animate top/bottom padding and wordmark scale together over 420ms with a gentle ease-in-out curve; the solid off-white fill fades to the active recipe color over 420ms with ease-in timing. Keep the 1px divider visible while scrolled, tinted from 86% recipe color and 14% ink so it is slightly darker than the header. The same opaque surface covers the header and its safe area together. Synchronize the browser theme color with the fade in a bounded frame loop; other pages retain off-white. Keep the header free of backdrop blur or transparency. Expand again within 8px of the top so shrinking document height cannot make it flicker. Observe the full border box, including animated padding, and measure its height at subpixel precision so tabs follow its edge. Reduced motion removes the transitions while keeping the compact state and browser theme synchronized. The operating system controls the native status-bar treatment, which requires an iPhone check. On mobile, everything below the browser-style tabs remains white, including recipe details, bottom spacing and draft padding. Recipe backgrounds and the app header span the viewport; apply horizontal safe-area insets to the content and controls rather than narrowing the whole shell. Below 40rem, keep the sticky browser-style tabs and a single panel. From 40rem, hide the tabs and show Ingredients and Instructions as labelled columns, with more space for the instructions and a fine vertical divider. Preserve the selected compact tab, servings and progress across size changes. Through tablet widths the white reading surface is full width. From 88rem, center a 75rem white reading window with recipe-colored side gutters; align its introduction and header controls to the same measure. Choose these breakpoints for readable content, without detecting device models. The unselected browser-style tab and the area above and beside the tabs use the exact recipe detail color. The active white tab has 10px upper corners and concave 12px joins that flare outward into the white reading surface. Keep compact 44px targets. Use near-black tab labels so every recipe color remains readable. The white active tab slides with a restrained stretch over 280ms, starting from its current visible shape if interrupted. The sticky tab bar is opaque in the recipe color, with a fine bottom rule and a short white-to-transparent fade beneath it so scrolling text recedes gently; only the active tab and reading content beneath it remain white. Reading text remains at a readable 75ch maximum width. Recipe photos have a tinted 1px outline, 14px top corners and barely rounded 3px bottom corners. Upper recipe outlines, category frames and tab borders use a darker tint of that recipe color, with a rule beneath the inactive tab and a gap beneath the moving active tab and its concave joins. Start the lower fade beyond the border so the rule remains visible. Recipe options at the top right use the shared frosted menu with pencil and trash icons for Edit and Delete, including the existing confirmation and Undo. Keep screen on is a classic sliding toggle with an 8px track radius and a 5px thumb radius. Respect reduced motion. Switching compact tabs changes the visible section without restoring a separate reading offset. On compact screens the tabs label each panel without repeated Ingredients or Instructions headings. In the two-column layout, show section headings and expose both panels as labelled regions. Keep ingredient servings in a compact row and instruction progress beside a small Reset action that clears only checked steps. Keep named ingredient groups and instruction sections. Completed steps always collapse to one line. Ingredients and Instructions use the page’s normal scroll flow; neither section has its own scrolling container or saved scroll position. A servings picker scales explicit ingredient quantities from the original saved amounts, without changing the recipe. Recipe and editor serving pickers share a cream surface, thin control border, sans-serif labels and the existing downward chevron. They support pressing and dragging through the open menu: highlight and preview the portion count, commit on release over a number, and cancel on release outside. Tapping and keyboard selection remain available. Other dropdowns retain their existing behavior. Cards show up to three manually created category labels within a compact metadata area. Mobile section controls stay reachable. Remember checked steps, the selected section and servings locally. Reset clears instruction progress without editing the recipe or changing servings. Ignore outdated progress after steps change.

## Maintainability

Reuse semantic global colors and existing shared icons/components. Keep recipes, images, collections and offline storage intact. Avoid slogans, dense raised panels and decorative copy. Navigation must work independently of animation and glass effects.

## Recipe page scrolling

The recipe overview, cooking sections and nutrition use normal page scrolling. Ingredients and Instructions have natural content height, with no nested scrollbars, viewport-height limits or saved section offsets. On mobile, only the selected panel participates in layout; the inactive panel stays mounted with display none, inert and aria-hidden. On wide screens both columns are visible and move together with the page. Preserve the sticky browser-tab treatment, keyboard tab navigation, cooking state, safe gutters and reduced-motion behavior.

The word-layer styling follows the browser’s [view-transition-class](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/view-transition-class) support, with a feature-tested fallback. No recipe text or photos are cloned or sent to another service.

## Launch screen

At application startup, an opaque off-white surface covers the viewport with the existing black logo centered at 88px wide. Render this cover and its essential styles directly in the HTML so it is present before JavaScript, account initialization or lazy routes. Wait for the first stable route, page loading states, fonts and visible photo decoding, then fade out in 180ms. Do not add a minimum wait or reload the cover on ordinary page navigation. Keep the app inert until the cover has left, restore accessible focus, and respect reduced motion. Offscreen lazy images stay lazy; failed or stalled optional assets cannot block the cookbook forever. Provide a quiet delayed Reload link and a clear startup-failure state. Use no additional animation package.
