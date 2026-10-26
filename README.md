# Recipebook

A personal recipe app for collecting recipes and cooking from them on your phone or computer. Built with Angular, Dexie and Supabase.

[Open Recipebook](https://antonj997.github.io/recipeBook/)

## Features

- Create recipes, import public HTTPS recipe links, and review imports before saving. Link import works with sites that expose structured recipe data and allow server requests.
- Create categories, assign several recipes at once, and filter or search your cookbook.
- Browse a recipe shelf or compact list, with your search, category and place remembered.
- Group ingredients and instructions, choose default servings, and undo removed editor rows.
- Scale explicit ingredient quantities for 2, 4, 6, 8 or 10 servings without changing the saved recipe. Written or ambiguous quantities are left unchanged.
- Cook from ingredient and instruction tabs with remembered step progress and a keep-screen-on toggle where supported. Completed steps always collapse.
- Use step timers up to 60 minutes with a looping minute ruler, swipe momentum, elapsed-time markers, direct MM:SS entry and optional background push alerts.
- Choose a recipe color shared by its header, card and list marker.
- Hold or right-click recipes to change categories, edit or delete; undo accidental deletion.
- Paste ingredient and instruction lists into the editor to split them into rows.
- Store photos, cooking time and available nutrition information.
- Keep a private shopping list: add your own items or select scaled recipe ingredients, check items off, and undo deletions. Clear matching quantities combine for display while their individual recipe sources remain saved. Small recipe-color dots beside items match a recipe-name legend beneath the entry field.
- Shopping items automatically group into departments based on ICA’s online categories. A compact Swedish and English product-name catalogue works offline; unrecognized items remain under Övrigt. A general shopping order starts with fruit/vegetables and bread, continues through fresh food, dairy and pantry, and keeps frozen goods late. Store layouts differ; this is not an exact store map. Ice cream groups with frozen goods.
- Sign in with email and password for a private cookbook and shopping list across devices.
- Use saved recipes offline and install the app as a PWA.
- Export and restore backups including photos and shopping items; older recipe-only backups remain supported.

## Getting started

Use Node.js 24 or newer and npm.

```sh
npm ci
npm run dev
```

The development command starts Angular and the local recipe importer. To run only Angular, use `npm start`. The local address is printed when the server starts.

For cloud accounts and hosted link import, provide `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as environment variables. See [.env.example](.env.example) and [backend setup](SUPABASE.md). Without cloud configuration, the app stores recipes in the browser and link import uses the local server.

## Accounts and storage

Each signed-in account has a private cloud cookbook and offline cache. Recipes, categories and shopping items created while signed out stay on the device. After signing in, choose to add them to the account or delete them. Adding first saves the account copy and queued cloud changes, then removes unchanged guest records. There is no separate-cookbook option.

Passwords require at least eight characters, without character-composition rules. Email confirmation and password recovery use Supabase. Its default email sender only supports project team addresses and has a low sending limit; configure custom SMTP before offering accounts to friends outside the project team.

Signing out attempts to synchronize first and keeps queued changes on the device. Browser storage can be cleared by the browser or device owner, so keep exported backups. Offline copies are not encrypted; use a trusted browser profile. See [security and privacy](SECURITY.md) for storage limitations.

## Shopping product catalogue

Department suggestions combine local rules with an offline index of product names and synonyms derived from the [Open Food Facts taxonomy](https://openfoodfacts.github.io/search-a-licious/users/explain-taxonomies/), supplemented with reviewed Swedish grocery names from [Livsmedelsverkets Livsmedelsdatabas, version 2026-07-01](https://dataportal.livsmedelsverket.se/livsmedel/swagger/index.html) and Swedish cheese names. This is a dictionary of product types, not ICA’s live inventory. Unrecognized or ambiguous products remain in Övrigt. Brand names alone do not determine a department.

The shopping page loads the catalogue with its own code; no product searches or shopping-list contents go to a third party. Names such as Prästost, Grevé and international cheese varieties are matched locally. Explicit storage and product-form rules retain priority. The source dump is not shipped with the app. The PWA may cache the shopping-page code in the background for offline use.

The committed snapshot lives in `src/app/core/data/shopping-products.json`. Its source date, hash and licences are recorded inside it. Refresh it manually with Node.js 24 or newer:

```sh
npm run catalog:update
npm run catalog:test
npm run catalog:benchmark
npm test -- --watch=false
```

The update command downloads the public taxonomy once. It validates its size, resolves category ancestry, excludes conflicting aliases and removes names already handled correctly by the rules. Review changes before committing: category ancestry is not always the same as supermarket placement. Add verified local names to `scripts/shopping-catalog/local-aliases.json`. The reviewed Swedish supplement in `swedish-aliases.json` preserves food IDs, original names and source provenance. It is maintained explicitly; refreshing Open Food Facts retains it. Shop-department assignments and shortened/plural names are our adaptations. The Swedish source is under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); nutritional values are not imported. To regenerate an archived download, pass `--source=/absolute/path/categories.full.json --date=YYYY-MM-DD` after `npm run catalog:update --`.

The generator caps the compressed dictionary at 64 KiB. The desktop benchmark checks index initialization and 1,000 mixed lookups against a 10 ms budget each; it is a development check, not a phone benchmark. Compare the production build before release to keep this data out of the initial application bundle. No build or app startup automatically downloads updated taxonomy data.

Contains information from Open Food Facts, made available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); individual contents are under [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/). The derived dictionary, including local additions, is available under ODbL 1.0. See the [data and licence notice](public/data/shopping-products-notice.txt) and [download the derived database](https://antonj997.github.io/recipeBook/data/shopping-products.json). This applies to the public dictionary; private recipes and shopping items are not part of it.

## Build and deployment

```sh
npm run build
npm run build -- --configuration production,pages --base-href /recipeBook/
```

The `Publish Recipebook` GitHub Actions workflow deploys `main` to GitHub Pages. Configure Pages to use GitHub Actions and set the two Supabase repository variables described in [SUPABASE.md](SUPABASE.md). Pages serves the frontend; Supabase handles authentication, cloud storage and hosted imports and scheduled timer alerts. The Pages build uses hash routing.

## Project structure

- `src/app/features`: recipe browsing, categories, shopping list, cooking view, editor, importer and settings.
- `src/app/shared`: reusable controls, illustrations and animations.
- `src/app/core`: storage, account synchronization, photos and recipe models.
- `server`: local recipe importer.
- `supabase`: database migrations, Auth configuration and hosted importer.

[DESIGN.md](DESIGN.md) describes the visual language. [IMPORTING.md](IMPORTING.md) explains supported import data. Credentials, generated builds, local configuration and review artifacts are excluded from Git.
