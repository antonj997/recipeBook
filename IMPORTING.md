# Recipe import and review

## Imported data

Import title, description, ingredients, instructions, servings, total time, photos and nutrition per portion (kcal, protein, carbs and fat). Do not collect author, rating, difficulty, yield, separate preparation/cooking times or cooking tips. Explicit substitutions can join the description. ICA “För alla” and “Klimatanpassa” advice is ignored. Existing descriptions containing unlabelled advice are not rewritten automatically because it cannot be separated safely from user text.

Imported categories match existing collection names after trimming and ignoring case. Unmatched categories never create collections. Cuisine/dietary labels become tags only if recognized in the app's catalog. Imported keyword tags belong to the recipe and do not expand that catalog.

## Unsaved review

New/imported recipes first open the same view used for saved recipes. The floating actions approve, cancel or edit. Editing a new recipe returns to review; only looks good! writes it to Dexie. Editing an existing saved recipe uses Save Changes.

Drafts are held in memory with a best-effort session-storage copy in the current tab. Very large images may exceed that quota but remain usable in memory. Cancel, home and browser back trigger the shared native discard dialog; settings is hidden. Refresh/tab closing uses the browser's unsaved-changes warning. Leaving the importer aborts extraction and prevents delayed navigation.

## Images, groups and compatibility

Uploaded/imported photos share compression and validation. Independent JPEG copies keep photos offline; failed step downloads retain their original HTTPS links and show an offline warning. Step downloads run two at a time. Image formats/size limits are checked before decoding.

Ingredient/instruction text remains in string arrays with aligned group/photo metadata. Each group editor owns its drag state, rejects cross-editor drops and supports keyboard movement controls on desktop. Group selection supports several items at once. Blank rows are pruned before review/save; empty ingredient/instruction arrays are valid. Legacy step titles fold into instruction text. Legacy quantity/rating/difficulty/tip fields are omitted when edited/exported. Backup imports validate all data before a Dexie transaction and remain compatible with older backups.

## Hosting

The Node importer runs locally; restart it after server changes. GitHub Pages publishes only browser assets and cannot run link extraction. Its build offers manual recipe creation and cookbook import instead. Dexie remains the only database; records are local to each browser and origin. Export/import a cookbook to transfer recipes between local and published apps.

Successful link imports show the cooking animation for at least three seconds, or until extraction/photos finish. It fills mobile screens with a random palette color. Errors are shown immediately. Reduced motion keeps a static illustration and readable status.
