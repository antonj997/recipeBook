# Recipebook

A personal recipe app for collecting recipes and cooking from them on your phone or computer. Built with Angular, Dexie and Supabase.

[Open Recipebook](https://antonj997.github.io/recipeBook/)

## Features

- Create recipes, import supported recipe links, and review imports before saving.
- Create categories, assign several recipes at once, and filter or search your cookbook.
- Browse a recipe shelf or compact list, with your search, category and place remembered.
- Group ingredients and instructions, adjust servings, and undo removed editor rows.
- Use a compact cooking view with remembered step progress and a keep-screen-on toggle where supported.
- Store photos, cooking time and available nutrition information.
- Sign in with email and password for a private cookbook across devices.
- Use saved recipes offline and install the app as a PWA.
- Export and restore cookbook backups, including photos.

## Getting started

Use Node.js 24 or newer and npm.

```sh
npm ci
npm run dev
```

The development command starts Angular and the local recipe importer. To run only Angular, use `npm start`. The local address is printed when the server starts.

For cloud accounts and hosted link import, provide `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as environment variables. See [.env.example](.env.example) and [backend setup](SUPABASE.md). Without cloud configuration, the app stores recipes in the browser and link import uses the local server.

## Accounts and storage

Each signed-in account has its own cloud cookbook and offline cache. Recipes created while signed out belong to the device cookbook. **Settings → Copy to my account** copies those recipes after signing in without deleting the original copy.

Passwords require at least eight characters, without character-composition rules. Email confirmation and password recovery use Supabase. Its default email sender only supports project team addresses and has a low sending limit; configure custom SMTP before offering accounts to friends outside the project team.

Signing out attempts to synchronize first and keeps queued changes on the device. Browser storage can be cleared by the browser or device owner, so keep exported backups. Offline copies are not encrypted; use a trusted browser profile. See [security and privacy](SECURITY.md) for storage limitations.

## Build and deployment

```sh
npm run build
npm run build -- --configuration production,pages --base-href /recipeBook/
```

The `Publish Recipebook` GitHub Actions workflow deploys `main` to GitHub Pages. Configure Pages to use GitHub Actions and set the two Supabase repository variables described in [SUPABASE.md](SUPABASE.md). Pages serves the frontend; Supabase handles authentication, cloud storage and hosted imports. The Pages build uses hash routing.

## Project structure

- `src/app/features`: recipe browsing, categories, cooking view, editor, importer and settings.
- `src/app/shared`: reusable controls, illustrations and animations.
- `src/app/core`: storage, account synchronization, photos and recipe models.
- `server`: local recipe importer.
- `supabase`: database migrations, Auth configuration and hosted importer.

[DESIGN.md](DESIGN.md) describes the visual language. [IMPORTING.md](IMPORTING.md) explains supported import data. Credentials, generated builds, local configuration and review artifacts are excluded from Git.
