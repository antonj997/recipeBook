# Recipe import and review

## Public recipe sites

There is no recipe-site or image-host whitelist. Import public HTTPS recipe pages that expose Schema.org Recipe JSON-LD. Pages requiring login, JavaScript-only extraction or bot-protection challenges may not work; the importer does not bypass access controls.

The server checks DNS and pins the actual connection to a validated public IP while verifying TLS for the original domain. Each of up to three redirects repeats that check. Local, private, reserved and metadata addresses are blocked. Downloads have a total ten-second deadline, 16 KiB header limit, 2 MiB HTML limit and 20 MiB photo limit. Only uncompressed HTML and JPEG/PNG/WebP downloads are accepted. Unexpected content encodings fail safely.

Foreign pages receive a fixed GET request without account tokens, cookies, API keys or a referrer. HTML is parsed as data, never executed. Recipe trees, fields and row counts are bounded. Cloud requests still require a verified signed-in user and existing per-account quotas; local requests require loopback Host/Origin checks and a local quota.

## Imported data

Import title, description, ingredients, instructions, servings, total time, photos and nutrition per portion (kcal, protein, carbs and fat). Energy given in kJ converts to kcal; a value of 10 000 or more per portion is read as small calories and divided by 1000 (654897 → 655 kcal), also for recipes imported before this rule. Do not collect author, rating, difficulty, yield, separate preparation/cooking times or cooking tips. Explicit substitutions can join the description. ICA “För alla” and “Klimatanpassa” advice is ignored. Existing descriptions containing unlabelled advice are not rewritten automatically because it cannot be separated safely from user text.

Imported categories match existing collection names after trimming and ignoring case. Unmatched categories never create collections. Keywords, cuisine and dietary labels are ignored. Categories are created manually in the app.

## Unsaved review

New/imported recipes first open the same view used for saved recipes. The floating actions approve, cancel or edit. Editing a new recipe returns to review; only looks good! writes it to Dexie. Editing an existing saved recipe uses Save Changes.

Drafts are held in memory with a best-effort session-storage copy in the current tab. Very large images may exceed that quota but remain usable in memory. Cancel, home and browser back trigger the shared native discard dialog; settings is hidden. Refresh/tab closing uses the browser's unsaved-changes warning. Leaving the importer aborts extraction and prevents delayed navigation.

## Images, groups and compatibility

Uploaded/imported photos share compression and validation. Independent JPEG copies keep photos offline; failed step downloads retain their original HTTPS links and show an offline warning. Step downloads run two at a time. Photos always pass through the authenticated cloud importer or the same-origin local importer. Signatures and dimensions are checked before decoding: at most 8192 pixels per side and 16 million pixels total. At most 12 photos download automatically per recipe, including its main image. Additional step-photo links remain available for individual loading. Animated WebP and uncommon JPEG frame formats may require a manually supplied photo.

Ingredient/instruction text remains in string arrays with aligned group/photo metadata. Each group editor owns its drag state, rejects cross-editor drops and supports keyboard movement controls on desktop. Group selection supports several items at once. Blank rows are pruned before review/save; empty ingredient/instruction arrays are valid. Legacy step titles fold into instruction text. Legacy quantity/rating/difficulty/tip fields are omitted when edited/exported. Backup imports validate all data before a Dexie transaction and remain compatible with older backups.

## Hosting

The Node importer runs locally with `npm run dev`; restart it after server changes. GitHub Pages serves browser assets and uses the authenticated Supabase importer for hosted links. Publishing Pages does not deploy Edge Functions: deploy the importer separately with its pinned dependencies and preserve JWT verification. Recipes and photos are stored independently in account storage and its device cache; signed-out manual recipes remain local until transferred at sign-in.

Successful link imports show the cooking animation for at least three seconds, or until extraction/photos finish. It fills mobile screens with a random palette color. Errors are shown immediately. Reduced motion keeps a static illustration and readable status.

HTML is preflighted with a streaming parser before constructing one reusable DOM (maximum 128 nesting levels and 20,000 elements). The same parser semantics apply to text fragments. Both source recipe data and the extracted draft are bounded to 32 nesting levels, 10,000 values, 32,000 characters per field and 256 KiB of total string characters. This also prevents repeated group names from amplifying the JSON response.
