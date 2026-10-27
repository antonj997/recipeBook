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
  timer-progress: '#ad571b'
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

Recipe backgrounds use ten light, low-saturation colors inspired by ingredients and quiet kitchen surfaces. Keep these fills separate from the darker green used for search underlines and switches. The same recipe token fills its card, page, tabs, list photo-edge strip and missing-photo artwork.

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

The app icon uses the supplied Final version SVG artwork without changing its path geometry: a flat R/book silhouette with a rounded upper page and a curved lower page. Use the cream mark on off-black for installed icons, the black mark beside the wordmark, and an adaptive black/cream SVG favicon. All color variants share identical vector geometry. Standard PWA, maskable and Apple touch exports center the mark at 66% of the tile width. Fingerprinted URLs prevent an earlier logo from being reused after an update. Never replace this artwork with a font glyph.

## Layout and controls

The header and pages share a centered 1360px maximum width and `--page-gutter`. Home search fills the available space up to Add recipe. On large recipe screens, the photo/summary bounds and the floating reading surface share the same outer edges. Nutrition spans the full inner width of both reading columns. Forms use an 800px maximum. Mobile pages start with 20px top padding. Search and Add recipe share a row; focusing search condenses Add to its icon. Search fields share the green underline. Empty libraries show centered Create recipe, Import recipe and Import cookbook actions instead of the toolbar.

Primary controls are dark, secondary controls outlined, destructive controls use `--color-danger`. Keyboard focus hugs each element with a 2px outline; touch input suppresses the ring without affecting keyboard navigation. Use the shared SVG checkbox everywhere. Recipe step boxes show their number until checked; completion draws a restrained line over the text while keeping its reading position. Completed instruction rows always collapse.

## Recipe cards and carousel

Cards have a flush 4:3 photo over a padded color block within a 16px radius and a fine outline tinted from the recipe color. Photo cards use a stable recipe-based choice from the ten recipe colors. Missing-photo cards share the exact stable background choice with their food drawing. Card metadata shows total time when available. Titles never gain an underline on hover.

Desktop cards are 240–340px wide with 24px gaps. Titles wrap fully and take priority over descriptions. Compact cards measure the title, categories and footer to keep them visible even on short screens. Descriptions fill the remaining clipped space and fade at its lower edge, with no fixed three-line reservation. Compact text areas contain categories and a bottom row with cooking time left and available energy in kcal per portion right. Mobile cards are 78vw with 18px gaps. Below 88rem, center the carousel snap points in portrait and landscape, with enough leading and trailing space to center the first and last items. Larger desktop shelves retain leading-edge snapping. The homepage shelf distributes the available portrait screen height into breathing room above the heading, card content and carousel indicator; retain a shorter image, complete titles and compact category labels. Reduce this spacing on short screens. When narrowing back into portrait, restore its document scroll to the top after layout and a short browser settling pass; retain the selected recipe or add tile while remeasuring snap positions. Height-only keyboard changes and list view keep their normal scrolling. Cancel deferred resets on navigation. Keep 44px control targets and safe bottom space; allow overflow on unusually short screens or enlarged text rather than clipping content. Preserve native horizontal scrolling, mandatory snap and `scroll-snap-stop: always`. Edge masks soften clipped neighbors; blur/displacement are optional enhancements that never intercept input. Desktop arrow and keyboard navigation move by card; mobile uses swiping and the scrub indicator. One library-view button shows the icon for the destination view, Cards or List. Compact centered dots use fixed hit targets; only the inner marks expand with carousel position, hover and focus. Dragging across the strip scrubs the cards. Every dot represents one recipe, including the final desktop cards. Append a transparent dotted-outline Add recipe tile to the shelf and a matching row to list view. They open the same native add menu anchored to the pressed control, with Write a recipe and Import from a link. Keep them outside recipe counts and indicator stops; arrow and rail-keyboard navigation can reach the tile. Large collections show a sliding window of consecutive dots with smaller edge marks and a quiet position count. Dragging one dot-width moves one recipe; holding near an edge gradually speeds up browsing. Only nearby dots are rendered. Preserve taps, keyboard navigation and reduced motion.

List view uses flat 6rem-high rows separated by the same thin rules as category and settings lists. Keep a 4.5rem square thumbnail with 8px corners, a two-line serif title, and one fixed metadata line for cooking time and up to three category names. A recipe-color strip extends 12px from behind the thumbnail with 8px right corners; it starts the row-fill opening animation. Enclose photo and strip together in one 1px recipe-tinted border matching the cards, without changing image size or crop. Titles show an ellipsis only when they overflow the two reserved lines. Measure the natural title after rendering, text changes, font readiness and resizing; keep fitting text in normal block layout. Enable the native clamp only for real overflow to avoid Safari’s false ellipsis with animated inline-block words. Long category text truncates in that line; missing metadata never changes row height or alignment. Rows have no color fill or enclosing border. Hover and press strengthen the combined image-and-strip border and divider without moving the row. The Add recipe row shares the same grid and height, with a small dotted thumbnail placeholder instead of a full-width box. Preserve the quick menu and all shared navigation parts, including category labels.

## Motion

Page navigation uses one shared-recipe expansion. The old lower-right page curl and its mode selector are removed from the running app; the original implementation is preserved in the local page-curl archive and Git history.

Expand connects only the selected recipe’s surface, photo, title, categories and cooking time between the shelf/list and recipe overview. The recipe colour opens from the selected card while the surrounding homepage stays stationary. The list colour first grows from its photo-edge strip to fill the selected row over 100ms, then expands over 430ms. Shared geometry moves over 430ms with a decelerating curve. Reverse it into the restored card/row when returning, retaining the exact library and carousel positions. Missing-photo recipes connect their surface and title.

Keep the captured source photo opaque throughout the flight. Decode every selected destination photo, including cache hits, and allow two animation frames for an intervening rendering opportunity (not a hardware-presentation guarantee). Pause snapshot pseudo-element animations declaratively with CSS during that preparation, with a two-second bound and cancellation cleanup. Never call getAnimations() during route teardown: Mobile Safari has a documented hard crash when sorting animations with removed DOM owners (https://github.com/react/react/issues/35336). Only the owning transition may clear its preparation state; delayed callbacks cannot resume a replacement. Retain the source underneath while the decoded destination crop blends in over 80ms near landing; never switch display or snapshot ownership mid-flight. Touch cards do not create an unused desktop perspective layer. Use one flat recipe-color backing for card and list returns, and keep the extracted parent snapshot recipe-colored so independently named sections cannot expose white gaps. This backing exists only during navigation; the resting recipe layout remains unchanged.

Keep navigation, descriptions, reading content and controls out of the native snapshot layer tree. The outgoing card description fades within 65ms. On entry these live elements wait until the shared geometry has landed, then fade over 160ms; the reading surface and tabs arrive together over 180ms from 14px below. Metadata absent from the source row uses the same live reveal; shared metadata still travels with the title and photo. Incoming controls remain inert during the flight. On return, immediately hide recipe-only content. One transition-part directive owns that temporary interaction state; the screen-awake component only handles its toggle. One wake lock service serves that toggle and focus mode, which keeps the screen on while open and takes the lock again when the page returns from the background.

Visible title words use native shared geometry where supported, retaining a whole-title fallback for older browsers. Preserve fractional measurements, original font proportions, clipping and corner radii throughout the flight. Never apply an image radius that disappears at landing. Do not name clipped words or duplicate snapshot names. Batch the source geometry measurements and each title’s word bounds before their temporary-style writes. Keep the shared header steady; other routes retain a quiet 260ms scale/fade arrival.

One controller owns each navigation’s names, geometry and listeners. A skipped transition still updates the route: retain its styles until the browser’s finished promise settles. Replacement navigation takes ownership atomically, and callbacks from the previous transition cannot clear its successor. A simple press leaves navigation motion intact. Deliberate scroll/wheel gestures, native pointer cancellation and navigation keys skip snapshots; skipping retains snapshot styles until the browser finishes its route update. Preserve interrupted Tab intent and apply focus in normal document order after cleanup. Native hit-testing can keep that first click targeted at the document even after the skip. A small input helper recovers only trusted primary clicks within stationary header links or the visible Back link, reusing their existing RouterLink guards. It leaves normal, keyboard, modified, hidden and unrelated clicks untouched. Resize, hidden-document and account changes can skip it safely. Resolve local recipe data before capture; never delay navigation for network sync or imports. Native back gestures, unsupported browsers and reduced motion retain normal navigation. Never clone recipe DOM or send snapshots to another service.

Use the shared motion tokens in `src/styles/_motion.scss` for navigation and control feedback. The typed navigation lifecycle separates capture, photo preparation, opening/closing and cancellation; old callbacks cannot restart cancelled motion. List fill, shared travel, title blending and photo landing derive from one timeline. Tab geometry reads its duration and easing from the same token source. Photos live once per device in an image table keyed by the SHA-256 of their bytes, with an 800px copy for cards, rows and pickers; route resolvers create their object URLs before the transition captures anything, and account changes revoke them. Retain a small in-memory photo working set: at most three successfully decoded photos of at most 1.44M pixels each, with no persistence. Warm on pointer/focus intent and coalesce nearby carousel preparation over 100ms so rapid scrubbing does not start a decode for every crossed card. Account changes and application teardown clear both scheduled work and retained references. This bounds retained references, not the browser's instantaneous decoder/GPU allocation.

Motion references: [Apple continuous, interruptible animation](https://developer.apple.com/videos/play/wwdc2023/10158/), [Apple zoom navigation](https://developer.apple.com/videos/play/wwdc2025/284/), [Klarna purpose and restraint](https://brand.klarna.com/motion), and [browser animation performance](https://web.dev/articles/animations-guide). Apply those principles to the existing recipe expansion rather than adding decorative effects or another animation engine.

The wordmark is upright medium-weight sans-serif and stays still on hover. The settings icon tilts slightly, with no hover fill. Card links keep a stable hit area while their inner surfaces follow the mouse with frame-based smoothing, up to six degrees vertically and eight horizontally. Coalesce pointer events, stop rendering when settled and ease back to neutral on leave. Touch scrolling stays steady. Carousel arrows and the Shelf/List toggle have no border boxes; the library-view button swaps its destination icon. Desktop puts navigation arrows before the view toggle. Hover feedback uses quiet icon-stroke, text-weight, opacity or border emphasis, never lifting controls, moving labels or changing a box fill. Search uses only its green underline. List rows keep their title and geometry still; an extra inner border fades in on hover. Recipe cards keep full opacity on press, thicken their tinted border inward without shifting content, and scale to 98.5% over 140ms. Flat list rows keep their position and reinforce only the thumbnail outline. The shelf surface scales independently of its desktop tilt, retaining a stable link hit area. Reduced motion keeps the thicker border without scaling. Controls use a slightly heavier icon stroke, quiet text emphasis and pressed opacity, with no lift or shrink. The view toggle and menu options follow the same rule. Shared frosted popover menus replace platform-native category and servings dropdowns, with keyboard navigation, type-ahead, outside dismissal and an opaque fallback. The category trigger uses an underline for keyboard focus. Restrict hover effects to devices that support hover, with pointer tilt limited to a fine pointer.

Import feedback shows a stirring pot, independently rising steam and a recipe-sheet check. Import feedback follows the actual request, with a short readiness check before review opens and a visible Cancel control. On mobile the illustration fills the viewport with one randomly chosen muted palette color. No falling ingredients. The shared paper-and-bin illustration rests during confirmation, then animates only after deletion succeeds. A six-second Undo toast restores the original recipe in its original account, including its photo, groups and categories.

Reduced motion removes transitions, continuous loops and tilt, and makes carousel scrolling immediate. Feedback and completed states remain visible.

## Recipe review and overlays

Unsaved recipes reuse the saved recipe view. A compact floating action bar provides looks good!, cancel and edit. Approval alone saves to Dexie. Hide settings during review and editing. A shared native dialog protects discard and navigation and also asks the backup-restore and sign-out questions with their own title and button words; native browser warnings protect refresh and tab closing. The installed app offers Shopping list, Import a recipe and Write a recipe as icon shortcuts where the platform supports them. Only floating controls, menus, dialogs and feedback use restrained shadows.

## Browsing, editing and cooking

Keep search and category selection, the Shelf/List view and reading position on the device, scoped to each account or device cookbook. Categories are managed from the library and chosen or created in the editor. Holding a recipe or right-clicking opens a frosted action menu for category changes, editing or deletion; Shift+F10 gives keyboard access. Menus restore trigger focus on dismissal. Settings contains Account, Backups and App only. Switching between Shelf and List keeps the page in place; returning from a recipe restores the exact homepage scroll offset, with the existing selected carousel card kept separately. List rows follow the flat row layout described under Recipe cards and carousel; show the complete title in its tooltip and accessible link text. Search-to-heading spacing is shared by both library views.

Manual recipes open the editor first. Name, optional photo, default servings, ingredients and instructions come before optional details. Use growing text areas, a sticky action bar, minus controls on the left and draggable handles on the right, with keyboard arrow reordering and a compact Undo action for removed rows. Add sits after each group’s rows. Ingredient Enter adds the next row; instruction Enter keeps a newline in the current step. Pasted line-separated bullet or numbered lists create rows in either editor. Confirm navigation only when edits exist or work is still saving.

Recipe colors use an allowlisted palette. A chosen color is saved with the recipe and shared by its header, card, missing-photo doodle and horizontal list card. Automatic retains the existing stable recipe-based choice. The picker offers the ten light recipe colors listed above. Recipe pages always keep the photo and details at the top; the mobile layout puts the photo before the title. Category labels and the clock/time share their styles with recipe cards. The recipe page shows the cooking time before the category labels, in the same order as list rows, so the two never cross during the shared transition. The recipe color fills the overview area across the screen; the app header starts off-white. The wordmark/settings header stays sticky and includes the device safe-area padding within its own surface, with no extra white strip. Recipe tabs stick directly below the measured header height. Observe header resizing so enlarged text, orientation and safe-area changes never cause overlap. At the top, the header is opaque white. After scrolling 80px it compacts to a 45px control row plus the actual safe-area inset, with no vertical padding and 44px tap targets. Animate top/bottom padding and wordmark scale together over 420ms with a gentle ease-in-out curve; the solid off-white fill fades to the active recipe color over 420ms with ease-in timing. Keep the 1px divider visible while scrolled, tinted from 86% recipe color and 14% ink so it is slightly darker than the header. The same opaque surface covers the header and its safe area together. Synchronize the browser theme color with the fade in a bounded frame loop; other pages retain off-white. Keep the header free of backdrop blur or transparency. Expand again within 8px of the top so shrinking document height cannot make it flicker. Observe the full border box, including animated padding, and measure its height at subpixel precision so tabs follow its edge. Reduced motion removes the transitions while keeping the compact state and browser theme synchronized. The operating system controls the native status-bar treatment, which requires an iPhone check. On mobile, everything below the browser-style tabs remains white, including recipe details, bottom spacing and draft padding. Recipe backgrounds and the app header span the viewport; apply horizontal safe-area insets to the content and controls rather than narrowing the whole shell. Below 40rem, keep the sticky browser-style tabs and a single panel. From 40rem, hide the tabs and show Ingredients and Instructions as labelled columns, with more space for the instructions and a fine vertical divider. Preserve the selected compact tab, servings and progress across size changes. Through tablet widths the white reading surface is full width. From 88rem, center a 75rem white reading window with recipe-colored side gutters; align its introduction and header controls to the same measure. Choose these breakpoints for readable content, without detecting device models. The unselected browser-style tab and the area above and beside the tabs use the exact recipe detail color. The active white tab has 10px upper corners and concave 12px joins that flare outward into the white reading surface. Keep compact 44px targets. Use near-black tab labels so every recipe color remains readable. The white active tab slides with a restrained stretch over 280ms, starting from its current visible shape if interrupted. The sticky tab bar is opaque in the recipe color, with a fine bottom rule and a short white-to-transparent fade beneath it so scrolling text recedes gently; only the active tab and reading content beneath it remain white. Reading text remains at a readable 75ch maximum width. Recipe photos have a tinted 1px outline, 14px top corners and barely rounded 3px bottom corners. Upper recipe outlines, category frames and tab borders use a darker tint of that recipe color, with a rule beneath the inactive tab and a gap beneath the moving active tab and its concave joins. Start the lower fade beyond the border so the rule remains visible. Recipe options at the top right use the shared frosted menu with pencil and trash icons for Edit and Delete, including the existing confirmation and Undo. Keep screen on is a classic sliding toggle with an 8px track radius and a 5px thumb radius. Respect reduced motion. Switching compact tabs changes the visible section without restoring a separate reading offset. On compact screens the tabs label each panel without repeated Ingredients or Instructions headings. In the two-column layout, show section headings and expose both panels as labelled regions. Keep ingredient servings in a compact row and instruction progress beside a small Reset action that clears checked steps and this recipe's timer progress. Keep named ingredient groups and instruction sections. Completed steps always collapse to one line. Checking a step pauses its running clock and keeps the time left; unchecking shows that clock paused. Once a step is checked, the first unchecked step gets a thin recipe-tone edge and `aria-current="step"`; the page scrolls to it only when it starts behind the header and tabs or near the bottom edge, instantly under Reduce Motion. Ingredients and Instructions use the page’s normal scroll flow; neither section has its own scrolling container or saved scroll position. A servings picker scales explicit ingredient quantities from the original saved amounts, without changing the recipe. Recipe and editor serving pickers share a cream surface, thin control border, sans-serif labels and the existing downward chevron. They support pressing and dragging through the open menu: highlight and preview the portion count, commit on release over a number, and cancel on release outside. Tapping and keyboard selection remain available. Other dropdowns retain their existing behavior. Cards show up to three manually created category labels within a compact metadata area. Mobile section controls stay reachable. Remember checked steps, the selected section and servings locally. Reset clears checked steps and timer progress without editing the recipe or changing servings. Ignore outdated progress after steps change.

## Maintainability

Reuse semantic global colors and existing shared icons/components. Keep recipes, images, collections and offline storage intact. Avoid slogans, dense raised panels and decorative copy. Navigation must work independently of animation and glass effects.

## Recipe page scrolling

The recipe overview, cooking sections and nutrition use normal page scrolling. Ingredients and Instructions have natural content height, with no nested scrollbars, viewport-height limits or saved section offsets. On mobile, only the selected panel participates in layout; the inactive panel stays mounted with display none, inert and aria-hidden. On wide screens both columns are visible and move together with the page. Preserve the sticky browser-tab treatment, keyboard tab navigation, cooking state, safe gutters and reduced-motion behavior.

The word-layer styling follows the browser’s [view-transition-class](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/view-transition-class) support, with a feature-tested fallback. No recipe text or photos are cloned or sent to another service.

## Launch screen

At application startup, an opaque off-white surface covers the viewport with the existing black logo centered at 88px wide. Render this cover and its essential styles directly in the HTML so it is present before JavaScript, account initialization or lazy routes. Wait for the first stable route, page loading states, fonts and visible photo decoding, then fade out in 180ms. Do not add a minimum wait or reload the cover on ordinary page navigation. Keep the app inert until the cover has left, restore accessible focus, and respect reduced motion. Offscreen lazy images stay lazy; failed or stalled optional assets cannot block the cookbook forever. Provide a quiet delayed Reload link and a clear startup-failure state. Use no additional animation package.

A temporary device-only Settings → App → Timer ruler switch compares two exclusive gesture modes. Swipe momentum is the default: the scale follows the drag and coast direction beneath a fixed center marker, which selects the value even at zero or sixty. Touch-down arrests motion without moving the scale or marker. Taps only stop the scale and never pick a new time, including when it is already stationary. Manual dragging and flywheel coasting run without edge auto-scroll or hold activation. With the switch off, Edge hold keeps thumb selection and edge-driven scrolling but never starts a coast on release. Mode changes cancel the current gesture and carried speed immediately; remember the choice locally without changing recipe or account data. Keep desktop mouse and keyboard controls available in either mode. The following motion details apply only to their selected mode.

Recipe steps can have one compact timer beneath their text. Display tabular MM:SS with a sixty-minute limit centered in a control row containing Minus, one Start/Stop button, the time readout, Reset and Plus. Keep 44px targets and no lift. The same button changes label and action to Stop while actively counting down or up, and back to Start when paused or reset; retain its node to preserve keyboard focus. Align the full control with the step checkbox and instruction gutter, spanning the reading width up to 30rem.

Before starting, show the minute picker in its 8px rounded outline. One tick represents one minute; the scale loops inclusively from zero through sixty and back to zero, with a small label every fifth minute. Zero is selectable and disables Start. Swipe momentum keeps a fixed center marker: the scale follows the drag and coast direction beneath it. Taps only arrest motion and leave the chosen time unchanged, including typed partial minutes; never jump to a tick under the finger. Edge hold retains thumb-following selection and its tap selection. In that mode, the middle sixty percent rests while either outer twenty percent scrolls with quadratic acceleration up to twenty-four minute ticks per second. Release stops Edge hold immediately. Keep the two modes exclusive and preserve the temporary device-only Settings switch.

A quick touch swipe uses velocity and exponential friction, following native flywheel patterns. Cap one impulse at thirty-two minute ticks per second; repeated fast same-direction swipes within 300ms carry residual speed up to forty-eight ticks per second. Use a 700ms friction constant, settle to whole minutes below 0.65 ticks per second, and stop within 3.2 seconds. Touch-down arrests visible motion; taps, reversals, slow drags and long holds discard carried speed. Reduced motion skips coasting. One gesture frame owner stops on external controls, cancellation, page scroll, backgrounding, step/account change, resize or destruction. Capture touch movement and block page scrolling only until release. Desktop mouse dragging follows the chosen mode without hold acceleration or inertia; focused wheel, arrow keys and Page Up/Down remain available.

Once started, replace the scrolling picker with a fixed 16px-high progress strip showing the entire duration at once. Use many uniform 2px-by-8px ticks, distributed across the available width at roughly six-pixel spacing and bounded to 12–80 nodes. Each tick represents an equal fraction of the total duration, so long timers fit without horizontal scrolling or per-second labels. Begin with all ticks orange (the timer-progress token); turn them near-black from right to left as remaining time decreases. Keep the outer edges fully visible, with no fade, marker, digits or border. Tighten the gap above the active/paused timer and the gap between controls and strip. The main readout remains MM:SS and turns red when overdue; all progress ticks are black after expiry. Use the existing app clock and brief color transitions, with no extra frame loop or start sweep. Pausing freezes this same strip; Reset restores the outlined minute picker. Keep the edit ruler compact: a 44px outline and touch target, no gap below its control row, and a top margin only 4px lower than the active timer. Connect Start and Reset with a reversible 240ms CSS morph. Use one persistent pool of 12–80 tick nodes: visible edit ticks spread into evenly distributed countdown slots while additional ticks unfold from their nearest edit tick and fade into the gaps. Labels and the selection marker fade out; major ticks shorten and the frame dissolves. Reset brings the same ticks back to the minute scale. Keep the tick pool stable across rapid reversals; countdown updates only recolor it, without moving its positions. Expose only the current control surface to accessibility and input. Animate the top margin with the same easing, keeping controls at 44px minimum. Reduced motion switches presentations immediately. No new timers, frame loops or animation dependency.

Minus and Plus change remaining time by one minute, including during a running countdown, without pausing or clearing elapsed progress. Keep zero and sixty minutes as bounds, and block adjustment while expiry validation is pending or an overdue timer is active. Preserve elapsed progress when adjusting a paused duration. The active and paused progress strip stays read-only. Direct numeric entry selects all on focus, uses the mobile numeric keyboard, and treats the final two digits as seconds: 0100 is one minute and 6000 is sixty minutes. Accept MM:SS pasted times and values from 00:00 to 60:00; retain longer raw timings in recipe metadata and backups until timing is explicitly edited. Stop pauses countdown and overdue count-up without clearing time, cancels sound and scheduled alerts, and resumes from the same value. Reset explicitly clears progress. The instructions-header Reset clears checked steps and all timer progress for this recipe together, restores saved timer presets, stops ruler movement and alarms, and cancels scheduled reminders. Enable it whenever either checked steps or changed timer state needs resetting; keep other recipes’ clocks and the selected servings/tab unchanged. Auto-reset unattended active overdue timers after one hour; paused values remain frozen in device storage. Timer definitions sync with recipes; running clocks stay account-scoped on this device.

An expired timer turns red and counts upward. Remove completion labels and clock icons from the control. A visible app may play a short repeating chime for up to 30 seconds after the original deadline, stopping on reset, completion or backgrounding. Unattended active overdue timers reset one hour after their deadline; explicitly paused values remain frozen. Completed steps hide and cancel their timer. Existing English and Swedish cooking intervals are inferred; ranges use the lower bound for an early check. Temperatures, storage advice and relative preparation offsets do not create timers. The editor can change a timer or explicitly remove an inferred one. Definitions travel with recipe metadata and backups; active timers stay on this device, isolated per account. Keep absolute deadlines and one app clock, restore after navigation/reload, and invalidate removed or changed steps after sync.

Optional background alerts require sign-in and explicit browser permission. Send the initial alert and at most one reminder one minute after the deadline. Best-effort server presence suppresses a phase while this device has a visible app tab; do not silently drop pushes inside the service worker. Recipes show no alert panel: the first timer start of a signed-in account on a capable device shows one toast with Enable, never for guests; controls stay in Settings. Explain unsupported devices, pending changes and offline cancellation. On iPhone/iPad alerts require the installed Home Screen app. Operating-system and network scheduling prevent an exact-alarm guarantee.

Unavailable recipes use a continuous cookbook canvas beneath the header, with a centered empty bowl, serif heading, the original loading/error explanation and a Back to recipes action. Keep this recovery state responsive without changing account or loading behavior.

Timer completion toasts name the step and actual elapsed timer duration, for example “Step 4 timer finished · 5 min elapsed”. Offer a “View step” action that opens the recipe, selects Instructions on narrow screens, and scrolls/focuses the step after page motion completes. Keep the destination below the header and sticky-tab fade. Never navigate automatically or mark the step complete. Validate account and step identity before revealing. Reuse the toast action component; actions supply their own pending, success and failure copy so recipe-delete Undo keeps its existing feedback. Action toasts use the available width up to 560px. Keep icon, message, action and 44px dismiss control in one row on wider screens. At 600px and below, keep a compact single row: message, action and dismiss. Omit the redundant success icon on action toasts, tighten horizontal gaps and use 6px vertical padding so the message can wrap naturally without adding a separate action row. Preserve 44px targets and allow long text to wrap without overflow.


## Shopping list

One private list belongs to the active device or account. Reach it from the basket beside Settings and from the recipe's ingredient tools. The header retains its existing height. Use flat rows on the canvas with thin rules, rounded-square checkboxes, wrapped readable item names, and small source dots after each name. A compact wrapping legend directly beneath manual entry pairs the same recipe colors with recipe-name links; omit serving counts from the presentation. Keep manual entry at the top; Enter retains focus, and pasted lines preserve numeric quantities. Checked items stay visible at the bottom of the continuous list, without a separate heading, disclosure or repeated departments. The footer offers Clear checked alongside Clear list. Hold item text for 500 ms to edit in place; movement or scrolling cancels the hold. A normal tap still checks the item, and releasing a hold never checks it. Support F2 and context-menu editing from the checkbox. Use a minus icon for removal with an accessible Delete name; deletion and clearing use the shared Undo toast. Clearing unchecked entries requires one confirmation, never nested dialogs.

The shared recipe picker is a near-full-height mobile sheet and a centered desktop dialog. Keep its header/footer stable while the ingredient body scrolls. Default to no ingredients selected, preserve their original section labels and indices, and scale from the original amounts for each serving selection. Repeated recipe additions require an explicit inline Add again confirmation. On success, use one View list toast action. Closing or changing accounts prevents stale feedback and restores focus to the trigger.

Matching scalar quantities combine only in the view; original contributions and recipe title/serving snapshots remain separate records. Unknown, approximate, worded-range or incompatible-unit amounts stay separate. Recipe edits/deletion never change already saved shopping entries. Keep shopping checkmarks independent of cooking steps and timers. Native list navigation uses the normal page transition; no decorative recipe expansion, hover lift or animation dependency. Respect reduced motion, 44px targets and safe-area space.

Shopping rows form one continuous flat list. Department headings are quiet, muted 12px captions resting on the existing row separator and aligned with item text. Keep them out of document flow so product spacing is identical within and across departments. Preserve semantic headings and group labels, full checkbox hit areas, and rem-based row padding for enlarged text. Keep thin row rules and 44px targets. The compact top toolbar holds Back, the page title and From recipe on one row; full-width item entry sits immediately below. Show only populated departments; preserve entry order inside each. Keep checked rows ungrouped after all unchecked departments. Classification is derived locally from item text, never from recipe source titles; edits reclassify immediately. No stored classification, network lookup, AI service or migration is needed. Unknown or mixed-department entries stay under Övrigt, keeping all original text and contributions.

Department names follow [ICA’s online assortment](https://handla.ica.se/) (checked 2026-10-25), using the explicit [Mejeri, ost & ägg](https://handla.ica.se/kategori/256) heading. ICA’s [shopping-list documentation](https://www.ica.se/appar-och-tjanster/inkopslistan/) distinguishes category sorting from selected-store sorting; do not promise a universal aisle order or an ICA integration. This app uses broad category labels, not live ICA product data. Preserve product-form clues such as frozen, canned and powdered ingredients and avoid substring collisions.


The shopping route also loads a compact, indexed dictionary of Swedish/English product types and synonyms from Open Food Facts, with verified Swedish additions. Keep lookup offline, exclude conflicting aliases, and retain explicit product-form/storage rules. Never infer from a brand alone. The dictionary is not a live ICA inventory; disclose its source and data licence in Settings, with a public download of the derived data. Preserve the initial app bundle and the catalogue performance budgets when updating it.

The reviewed Swedish supplement references Livsmedelsverkets Livsmedelsdatabas (CC BY 4.0), preserving original food names and IDs alongside shortened/plural grocery aliases. Include common Swedish foods such as blodpudding, gräddfil, prästost and hushållsost. Keep the existing general catalogue and explicit storage rules; no nutrition values or runtime database requests are needed.

Use a general shopping circuit: fruit/vegetables, bread, fresh meat/fish/vegetarian and ready meals, dairy, pantry/drinks, household departments, snacks and frozen goods near the end. Exact customer circuits differ by store; never imply an official universal aisle map. Ice cream and sorbet belong with frozen goods; candy/snacks remain separate. The offline name catalogue and Swedish supplement remain intact.

Shopping source dots use recipeBackground exactly, including selected colors and the photo-based default. Deduplicate display by recipe ID while retaining all durable contributions and serving snapshots. Legend entries remain stable when items are checked, and manual items have no source decoration. Source names remain available through tooltips and checkbox descriptions; missing recipes retain saved names and deterministic ID colors without broken navigation. Reuse the guarded recipe query and retain title/color metadata only.

Recipe shopping pickers begin with no ingredients selected, both from a recipe and from the list. Keep Select all available; changing servings preserves the explicit selection and choosing a recipe clears it.

Recipe import offers a quiet Search with Google link using the existing link icon and external-link behavior, followed by one sentence explaining copy-and-paste. Do not embed arbitrary websites or read the clipboard automatically.

Mobile cooking focus is an edge-to-edge landscape reading surface with a 32px off-white toolbar containing only a close icon. Keep its touch target at 44px and the recipe title available as the dialog’s accessible name; no visible title or colored header band. Ingredients and instructions scroll independently, with shared cooking state and no shopping action or contextual alert setup. Keep servings on the left and the shopping action on the right in normal reading. Focus uses compact servings stepper buttons; ordinary reading retains its existing menu. Use a rotated landscape canvas on portrait-only browsers without claiming to lock the phone orientation.

The header uses the supplied monogram rotated 90 degrees counter-clockwise, with the book binding along the bottom. Installed app icons and favicons retain the upright R. Loading marks tip from R to book once over 520ms, with a small anticipation, an accelerating fall and a hard stop on contact, with no rebound; use the shared native animation helper, run concurrently with startup, bound its completion and show a static book for Reduce Motion.
