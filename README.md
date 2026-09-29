# Recipebook

A personal Angular recipe collection. Recipes, photos and collections are stored locally in Dexie (IndexedDB). No account or remote database is used.

## Run locally

Use Node.js 24 and install dependencies with `npm install`, then run `npm run dev`. This starts Angular and the Node recipe importer. If Windows reports a certificate error during link import, run the importer with `node --use-system-ca server/index.mjs` and Angular with `npm start -- --proxy-config src/proxy.conf.json`.

Link imports are reviewed before saving. Drafts remain in the current browser tab until approved or discarded. Uploaded and downloaded photos are compressed for offline storage. Cookbook backup import/export is available in Settings.

## Build and publish

Run `npm run build` for the normal production build. Run `npm run build -- --configuration production,pages --base-href /recipeBook/` for GitHub Pages. The Pages build uses hash routing so opening or refreshing recipe links works without server rewrites.

The `Publish Recipebook` workflow builds and deploys `main` to GitHub Pages. Set the repository's Pages source to GitHub Actions. Only compiled browser assets are published.

GitHub Pages is static hosting: link import requires the local Node server and is unavailable on the published site. Manual recipe creation and cookbook import work there. Dexie data belongs to its browser and origin: to move local recipes to the published app, export a cookbook locally and import it on the published site. Keep backups before clearing browser data.

## Project structure

- `src/app/features`: recipe list, saved/unsaved recipe view, editor, importer and settings.
- `src/app/shared/components`: icons, food drawings, carousel and confirmation dialog.
- `src/app/core`: Dexie database, recipe metadata, photos, draft and feedback services.
- `server`: local link extraction and normalization; never a database.

`DESIGN.md` documents the visual style and `IMPORTING.md` documents import behavior. Local tool configuration, credentials, logs and generated previews are ignored by Git.
